// Images, profile photos and Stories (I5; migration 20261021500000). Runs inside the caller's identity transaction and nowhere else. Which
// image rows the caller reads, attaches, decides or deletes is the database's (media_assets_* policies): nothing here narrows rows for
// permission. An id in a `where` names the row to act on; `auth.uid()` names the caller's own photo row, never a permission filter. The
// owner of an image is never selected (it is not readable by a client).

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { MEDIA_KINDS, type MediaKind, type MediaState, type StoryAudience } from '@nestly/shared';
import type { IdentityTx } from '../db/identity-transaction.js';
import { camelColumns } from './plan-cached.js';

const STATUSES = ['pending', 'passed', 'queued', 'approved', 'rejected'] as const;
export type MediaStatus = (typeof STATUSES)[number];

/** What a reader is shown: checked images are ready; the uploader's unchecked ones pending; a refused one rejected (a suspicion reads the same: the database never tells). */
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
  // the statement (ordered by post, then position) as the plan-cached invoker function nestly.read_post_images (migration 20261027400000)
  const rows = await tx.execute(sql`select ${camelColumns('id', 'status', 'width', 'height', 'post_id')}, image_position as position from nestly.read_post_images(${sql.param([...postIds])}::uuid[])`);
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

async function imageRowGone(tx: IdentityTx, id: string): Promise<boolean> {
  const rows = await tx.execute(sql`select 1 as one from nestly.media_assets where id = ${id}::uuid`);
  return rows.length === 0;
}

/** Sets the caller's photo to one of their profile images. `previous` is the replaced image's id when the database deleted its row (BR-077),
 *  so its file may go too; null when there was none or its row stays (a queued or rejected image is kept for staff and the purge). */
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
  if (previous === null || previous === mediaId) return { previous: null };
  return { previous: (await imageRowGone(tx, previous)) ? previous : null };
}

/** Removes the caller's photo and, where the database allows it, its image row. The image id whose row was deleted (its file may go), or
 *  null (no photo, or the row stays: a queued or rejected image). */
export async function removeOwnProfilePhoto(tx: IdentityTx): Promise<string | null> {
  const rows = z
    .array(z.object({ mediaId: z.guid() }))
    .max(1)
    .parse(await tx.execute(sql`delete from nestly.profile_photos where user_id = (select auth.uid()) returning media_id as "mediaId"`));
  const mediaId = rows[0]?.mediaId ?? null;
  if (mediaId === null) return null;
  const deleted = await tx.execute(sql`delete from nestly.media_assets where id = ${mediaId}::uuid returning id`);
  return deleted.length === 1 ? mediaId : null;
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
  kind: z.enum(MEDIA_KINDS),
  queueReason: z.enum(['blocked', 'unsure', 'error', 'hash_match']),
  scores: z.record(z.string(), z.number()).nullable(),
  isChild: z.boolean(),
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

/** The queued images the caller may decide (media_assets_select_staff), with their staff-only review (media_reviews_select_staff), oldest first. */
export async function readQueue(tx: IdentityTx, limit: number): Promise<QueueRow[]> {
  const rows = await tx.execute(sql`
    select m.id, m.kind, r.queue_reason as "queueReason", r.scores, r.is_child as "isChild", ${iso(sql.raw('m.created_at'))} as "createdAt",
           m.width, m.height
    from nestly.media_assets m join nestly.media_reviews r on r.media_id = m.id
    -- I14 completion B (Afik 21.10.2026): an upload that matched the block list is a queue item until staff decide the match (it stays
    -- rejected and held for its uploader, M6)
    where m.status = 'queued' or (m.status = 'rejected' and r.queue_reason = 'hash_match' and r.match_decision is null)
    order by m.created_at asc, m.id asc
    limit ${limit}`);
  return z.array(queueRow).parse(rows);
}

/** A staff decision on a block-list match, once (CONTENT_MODERATE; the database records who and when, audits it, and on not_abuse takes the
 *  matched hashes off the list). False when nothing was decided (no undecided match, not permitted, or gone). */
export async function decideMatch(tx: IdentityTx, id: string, decision: 'confirmed' | 'not_abuse'): Promise<boolean> {
  const rows = await tx.execute(sql`
    update nestly.media_reviews set match_decision = ${decision}
    where media_id = ${id}::uuid and queue_reason = 'hash_match' and match_decision is null
    returning media_id as id`);
  return returnedId.parse(rows).length === 1;
}

const returnedId = z.array(z.object({ id: z.guid() }));

/** Thrown inside the identity transaction when a decision's status move did not apply, so the marks written before it roll back too. */
export class DecisionNotApplied extends Error {
  constructor() {
    super('media: the decision did not apply');
  }
}

/** A staff decision on a queued image: the marks first (the child mark; a suspicion, which forces a held rejection), then the status. False
 *  when there is no review to mark; throws DecisionNotApplied when the status did not move (not queued any more, not permitted, gone), so
 *  the caller's transaction drops the marks with it. */
export async function decideImage(tx: IdentityTx, id: string, decision: 'approved' | 'rejected' | 'suspected', isChild: boolean): Promise<boolean> {
  const suspected = decision === 'suspected';
  const marked = await tx.execute(sql`
    update nestly.media_reviews set is_child = ${isChild || suspected}, is_suspected = (is_suspected or ${suspected})
    where media_id = ${id}::uuid
    returning media_id as id`);
  if (returnedId.parse(marked).length !== 1) return false;
  const rows = await tx.execute(sql`
    update nestly.media_assets set status = ${suspected ? 'rejected' : decision}
    where id = ${id}::uuid and status = 'queued'
    returning id`);
  if (returnedId.parse(rows).length !== 1) throw new DecisionNotApplied();
  return true;
}

/** Whether the caller may remove a checked image after a report (CONTENT_MODERATE and REPORTS_VIEW now). Picks the answer only. */
export async function canRemoveCheckedImage(tx: IdentityTx): Promise<boolean> {
  const rows = await tx.execute(sql`
    select coalesce(nestly.has_permission('CONTENT_MODERATE') and nestly.has_permission('REPORTS_VIEW'), false) as ok`);
  return z.array(z.object({ ok: z.boolean() })).length(1).parse(rows)[0]?.ok ?? false;
}

/** Removes an image that had passed (or was approved), after a report: rejected, or rejected and held as a suspicion of child abuse (M6).
 *  The database requires a report on its post or uploader, or the suspicion (media_assets_update_guard). False when the suspicion could not
 *  be marked; throws DecisionNotApplied when the status did not move, so a suspicion written first rolls back with it. */
export async function removeCheckedImage(tx: IdentityTx, id: string, suspected: boolean): Promise<boolean> {
  if (suspected) {
    const marked = await tx.execute(sql`
      insert into nestly.media_reviews (media_id, is_child, is_suspected) values (${id}::uuid, true, true)
      on conflict (media_id) do update set is_child = true, is_suspected = true
      returning media_id as id`);
    if (returnedId.parse(marked).length !== 1) return false;
    // the suspicion itself rejects and holds the image in the same statement (media_reviews_suspicion_reject): confirm, never update again
    const held = await tx.execute(sql`select id from nestly.media_assets where id = ${id}::uuid and status = 'rejected'`);
    if (returnedId.parse(held).length !== 1) throw new DecisionNotApplied();
    return true;
  }
  const rows = await tx.execute(sql`
    update nestly.media_assets set status = 'rejected'
    where id = ${id}::uuid and status in ('passed', 'approved')
    returning id`);
  if (returnedId.parse(rows).length !== 1) throw new DecisionNotApplied();
  return true;
}
