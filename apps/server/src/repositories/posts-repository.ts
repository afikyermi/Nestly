// Text posts (I3 F3.1a, F3.4; FR-FEED-002, FR-FEED-005; schema.md, schema-b.md). Runs inside the caller's identity transaction and nowhere
// else. Permission is the database's: posts_select_viewer decides who reads a post, posts_update_author and posts_delete_author who changes or
// removes it, and the FKs to regular_profiles decide who may post at all. An id in a `where` below names the row, a key and never a filter for
// permission. SELECT is column-level: every query lists its columns, and nothing here reads or returns `*`. The real author of an anonymous
// post is read in one place only: the post page's `isMine` (data-model rule 20; the A&D amendment of F3.4), a flag that never leaves as an id.

import { JOURNEY_STAGES, POST_AUDIENCES, type PostAudience, type PostWrite } from '@nestly/shared';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { posts, postsInsert, postsUpdate } from '../db/schema.js';

export type PostRow = typeof posts.$inferSelect;
/** The readability gate's row: what it read before F3.4, unchanged. */
export type ReadablePostRow = Omit<PostRow, 'isAnonymous'>;

const readableColumns = {
  id: posts.id,
  authorId: posts.authorId,
  audience: posts.audience,
  body: posts.body,
  stageTag: posts.stageTag,
  createdAt: posts.createdAt,
};

const postColumns = { ...readableColumns, isAnonymous: posts.isAnonymous };

/** The response timestamp, in milliseconds like every other answer. */
const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);

const postDetailRow = z.object({
  id: z.guid(),
  audience: z.enum(POST_AUDIENCES),
  body: z.string().nullable(),
  stageTag: z.enum(JOURNEY_STAGES).nullable(),
  createdAt: z.iso.datetime(),
  isAnonymous: z.boolean(),
  isMine: z.boolean(),
});

export type PostDetailRow = z.infer<typeof postDetailRow>;

/** Inserts the caller's post; the author and status are the database's (an anonymous post's author goes to post_authors by trigger). */
export async function insertPost(
  tx: IdentityTx,
  values: { body: string; audience: PostAudience; stageTag: PostRow['stageTag']; isAnonymous: boolean },
): Promise<PostRow[]> {
  return tx.insert(postsInsert).values(values).returning(postColumns);
}

/** The post, when the caller may read it (RLS): none for a missing, hidden, deleted, held or not-eligible one, all alike. The gate of comments and likes. */
export async function readPost(tx: IdentityTx, id: string): Promise<ReadablePostRow[]> {
  return tx.select(readableColumns).from(posts).where(eq(posts.id, id));
}

/**
 * Whether the post is anonymous, when the caller may read it (RLS): read by PATCH only, to name the database's refusal of a friends-only
 * audience on an anonymous post (F3.4 c6). Not a permission and not the author: the update's own policy still decides who edits.
 */
export async function readPostAnonymity(tx: IdentityTx, id: string): Promise<{ isAnonymous: boolean }[]> {
  return tx.select({ isAnonymous: posts.isAnonymous }).from(posts).where(eq(posts.id, id));
}

/**
 * The post page's read (GET /posts/:id only): the post when the caller may read it, and `isMine`, display only. For an anonymous post
 * `isMine` is whether the caller's own post_authors row exists (RLS shows a caller only their own); for a named one, whether the caller is
 * its author. One expression for both, so they cannot disagree.
 */
export async function readPostDetail(tx: IdentityTx, id: string): Promise<PostDetailRow[]> {
  const rows = await tx.execute(sql`
    select p.id, p.audience, p.body, p.stage_tag as "stageTag",
           to_char(p.created_at at time zone 'UTC', ${isoMs}) as "createdAt",
           p.is_anonymous as "isAnonymous",
           case when p.author_id is null
                then exists (select 1 from nestly.post_authors pa where pa.post_id = p.id and pa.author_id = (select auth.uid()))
                else p.author_id = (select auth.uid()) end as "isMine"
    from nestly.posts p
    where p.id = ${id}::uuid`);
  return z.array(postDetailRow).parse(rows);
}

/** Updates the named columns of the caller's own post. Empty when the row is not the caller's or not readable: the same as missing. */
export async function updatePost(tx: IdentityTx, id: string, changes: PostWrite): Promise<PostRow[]> {
  return tx.update(postsUpdate).set(changes).where(eq(postsUpdate.id, id)).returning(postColumns);
}

/** delete_post(uuid) deletes the caller's post, or holds it when it has an open report. Returns the row count: 1, or 0 for not theirs. */
export async function deletePost(tx: IdentityTx, id: string): Promise<number> {
  const rows = await tx.execute(sql`select nestly.delete_post(${id}::uuid) as deleted`);
  const [row] = rows;
  const deleted: unknown = row === undefined ? undefined : Reflect.get(row, 'deleted');
  return typeof deleted === 'number' ? deleted : 0;
}
