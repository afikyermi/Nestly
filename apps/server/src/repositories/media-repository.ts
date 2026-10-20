// Images, profile photos and Stories (I5; migration 20261021500000). Runs inside the caller's identity transaction and nowhere else. Which
// image rows the caller reads, attaches, decides or deletes is the database's (media_assets_* policies): nothing here narrows rows for
// permission. An id in a `where` names the row to act on; `auth.uid()` names the caller's own photo row, never a permission filter. The
// owner of an image is never selected (it is not readable by a client).

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { MediaKind, MediaState, StoryAudience } from '@nestly/shared';
import type { IdentityTx } from '../db/identity-transaction.js';

const STATUSES = ['pending', 'passed', 'queued', 'approved', 'rejected', 'suspected'] as const;
export type MediaStatus = (typeof STATUSES)[number];

/** What a reader is shown: checked images are ready; the uploader's unchecked ones pending; a refused one (rejected or suspected alike) rejected. */
export function stateOf(status: MediaStatus): MediaState {
  if (status === 'passed' || status === 'approved') return 'ready';
  if (status === 'pending' || status === 'queued') return 'pending';
  return 'rejected';
}

const imageRow = z.object({
  id: z.guid(),
  status: z.enum(STATUSES),
  width: z.number().int(),
  height: z.number().int(),
});
export type ImageRow = z.infer<typeof imageRow>;

/** The caller's upload, always pending: the database sets the id, the owner and the status. */
export async function insertImage(
  tx: IdentityTx,
  input: { kind: MediaKind; mime: string; width: number; height: number; byteSize: number },
): Promise<ImageRow> {
  const rows = await tx.execute(sql`
    insert into nestly.media_assets (kind, mime, width, height, byte_size)
    values (${input.kind}, ${input.mime}, ${input.width}, ${input.height}, ${input.byteSize})
    returning id, status, width, height`);
  const [row] = z.array(imageRow).length(1).parse(rows);
  if (row === undefined) throw new Error('media: the insert returned no row');
  return row;
}

/** Attaches one of the caller's unattached post images at a position; false when the database did not (not theirs, not a post image, taken). */
export async function attachImage(tx: IdentityTx, imageId: string, postId: string, position: number): Promise<boolean> {
  const rows = await tx.execute(sql`
    update nestly.media_assets set post_id = ${postId}::uuid, position = ${position}
    where id = ${imageId}::uuid and post_id is null
    returning id`);
  return z.array(z.object({ id: z.guid() })).parse(rows).length === 1;
}

const postImageRow = imageRow.extend({ postId: z.guid(), position: z.number().int() });
export type PostImageRow = z.infer<typeof postImageRow>;

/** The images of these posts the caller may read, in order. */
export async function readImagesOfPosts(tx: IdentityTx, postIds: readonly string[]): Promise<PostImageRow[]> {
  if (postIds.length === 0) return [];
  const rows = await tx.execute(sql`
    select m.id, m.status, m.width, m.height, m.post_id as "postId", m.position
    from nestly.media_assets m
    where m.post_id = any(${sql.param([...postIds])}::uuid[])
    order by m.post_id, m.position`);
  return z.array(postImageRow).parse(rows);
}

/** One image the caller may read, or none. */
export async function readImage(tx: IdentityTx, id: string): Promise<ImageRow | undefined> {
  const rows = await tx.execute(sql`select id, status, width, height from nestly.media_assets where id = ${id}::uuid`);
  return z.array(imageRow).max(1).parse(rows)[0];
}

// ---- profile photos ------------------------------------------------------------------------------------------------------------

const photoRow = imageRow.extend({ userId: z.guid() });
export type PhotoRow = z.infer<typeof photoRow>;

/** The current photos of these accounts that the caller may see, with their image. */
export async function readProfilePhotos(tx: IdentityTx, userIds: readonly string[]): Promise<PhotoRow[]> {
  if (userIds.length === 0) return [];
  const rows = await tx.execute(sql`
    select m.id, m.status, m.width, m.height, pp.user_id as "userId"
    from nestly.profile_photos pp join nestly.media_assets m on m.id = pp.media_id
    where pp.user_id = any(${sql.param([...userIds])}::uuid[])`);
  return z.array(photoRow).parse(rows);
}

/** Sets the caller's photo to one of their profile images; the previous image's id (its row is deleted by the database), or null. */
export async function setOwnProfilePhoto(tx: IdentityTx, mediaId: string): Promise<{ previous: string | null }> {
  const current = z
    .array(z.object({ mediaId: z.guid() }))
    .max(1)
    .parse(await tx.execute(sql`select media_id as "mediaId" from nestly.profile_photos where user_id = (select auth.uid())`));
  const previous = current[0]?.mediaId ?? null;
  if (previous === null) {
    await tx.execute(sql`insert into nestly.profile_photos (media_id) values (${mediaId}::uuid)`);
  } else {
    await tx.execute(sql`update nestly.profile_photos set media_id = ${mediaId}::uuid where user_id = (select auth.uid())`);
  }
  return { previous: previous === mediaId ? null : previous };
}

/** Removes the caller's photo and its image row; the image id that was removed, or null when there was none. */
export async function removeOwnProfilePhoto(tx: IdentityTx): Promise<string | null> {
  const rows = z
    .array(z.object({ mediaId: z.guid() }))
    .max(1)
    .parse(await tx.execute(sql`delete from nestly.profile_photos where user_id = (select auth.uid()) returning media_id as "mediaId"`));
  const mediaId = rows[0]?.mediaId ?? null;
  if (mediaId !== null) await tx.execute(sql`delete from nestly.media_assets where id = ${mediaId}::uuid`);
  return mediaId;
}

// ---- Stories -------------------------------------------------------------------------------------------------------------------

/** A Story of the caller's image; the database counts the 10 in 24 hours (NS021) and checks the image. */
export async function insertStory(tx: IdentityTx, input: { mediaId: string; caption: string | null; audience: StoryAudience }): Promise<string> {
  const rows = await tx.execute(sql`
    insert into nestly.stories (media_id, caption, audience) values (${input.mediaId}::uuid, ${input.caption}, ${input.audience})
    returning id`);
  const [row] = z.array(z.object({ id: z.guid() })).length(1).parse(rows);
  if (row === undefined) throw new Error('stories: the insert returned no row');
  return row.id;
}

const storyRow = z.object({
  id: z.guid(),
  authorId: z.guid(),
  caption: z.string().nullable(),
  audience: z.enum(['everyone', 'friends']),
  createdAt: z.string(),
  expiresAt: z.string(),
  isMine: z.boolean(),
  mediaId: z.guid(),
  status: z.enum(STATUSES),
  width: z.number().int(),
  height: z.number().int(),
});
export type StoryRow = z.infer<typeof storyRow>;

const iso = (column: ReturnType<typeof sql.raw>) => sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** The live Stories the caller may see (stories_select_viewer), with their image, newest first per author. */
export async function readLiveStories(tx: IdentityTx): Promise<StoryRow[]> {
  const rows = await tx.execute(sql`
    select s.id, s.author_id as "authorId", s.caption, s.audience, ${iso(sql.raw('s.created_at'))} as "createdAt",
           ${iso(sql.raw('s.expires_at'))} as "expiresAt", s.author_id = (select auth.uid()) as "isMine",
           m.id as "mediaId", m.status, m.width, m.height
    from nestly.stories s join nestly.media_assets m on m.id = s.media_id
    order by s.created_at desc, s.id desc
    limit 500`);
  return z.array(storyRow).parse(rows);
}

/** How many Stories the caller published in the last 24 hours (the 10 limit is the database's; this is for the screen). */
export async function countOwnStoriesToday(tx: IdentityTx): Promise<number> {
  const rows = await tx.execute(sql`
    select count(*)::int as n from nestly.stories
    where author_id = (select auth.uid()) and created_at > now() - interval '24 hours'`);
  return z.array(z.object({ n: z.number().int() })).length(1).parse(rows)[0]?.n ?? 0;
}

// ---- the approval queue (CONTENT_MODERATE) -------------------------------------------------------------------------------------

const queueRow = z.object({
  id: z.guid(),
  kind: z.enum(['post', 'profile', 'story']),
  queueReason: z.enum(['blocked', 'unsure', 'error']),
  scores: z.record(z.string(), z.number()).nullable(),
  createdAt: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});
export type QueueRow = z.infer<typeof queueRow>;

/** Whether the caller holds CONTENT_MODERATE now (the database's has_permission: the Admin, or a Moderator with the key and a valid session). It only picks the answer (403 or the list): the rows are the policy's. */
export async function canModerateContent(tx: IdentityTx): Promise<boolean> {
  const rows = await tx.execute(sql`select coalesce(nestly.has_permission('CONTENT_MODERATE'), false) as ok`);
  return z.array(z.object({ ok: z.boolean() })).length(1).parse(rows)[0]?.ok ?? false;
}

/** The queued images the caller may decide (media_assets_select_staff), oldest first. */
export async function readQueue(tx: IdentityTx, limit: number): Promise<QueueRow[]> {
  const rows = await tx.execute(sql`
    select id, kind, queue_reason as "queueReason", scores, ${iso(sql.raw('created_at'))} as "createdAt", width, height
    from nestly.media_assets
    where status = 'queued'
    order by created_at asc, id asc
    limit ${limit}`);
  return z.array(queueRow).parse(rows);
}

/** A staff decision on a queued image; false when the database did not apply it (not queued, not permitted, gone). */
export async function decideImage(tx: IdentityTx, id: string, decision: 'approved' | 'rejected' | 'suspected', isChild: boolean): Promise<boolean> {
  const rows = await tx.execute(sql`
    update nestly.media_assets set status = ${decision}, is_child = ${isChild}
    where id = ${id}::uuid and status = 'queued'
    returning id`);
  return z.array(z.object({ id: z.guid() })).parse(rows).length === 1;
}
