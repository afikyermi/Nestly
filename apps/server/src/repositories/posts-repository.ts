// Text posts (I3 F3.1a; FR-FEED-002; schema.md, schema-b.md). Runs inside the caller's identity transaction and nowhere else. Permission is
// the database's: posts_select_viewer decides who reads a post, posts_update_author and posts_delete_author who changes or removes it, and
// the FKs to regular_profiles decide who may post at all. An id in a `where` below names the row, a key and never a filter for permission.
// SELECT is column-level: every query lists its columns, and nothing here reads or returns `*`.

import type { PostAudience, PostWrite } from '@nestly/shared';
import { eq, sql } from 'drizzle-orm';
import type { IdentityTx } from '../db/identity-transaction.js';
import { posts, postsInsert, postsUpdate } from '../db/schema.js';

export type PostRow = typeof posts.$inferSelect;

const postColumns = {
  id: posts.id,
  authorId: posts.authorId,
  audience: posts.audience,
  body: posts.body,
  stageTag: posts.stageTag,
  createdAt: posts.createdAt,
};

/** Inserts the caller's post; the author, anonymity and status are the database's. */
export async function insertPost(tx: IdentityTx, values: { body: string; audience: PostAudience; stageTag: PostRow['stageTag'] }): Promise<PostRow[]> {
  return tx.insert(postsInsert).values(values).returning(postColumns);
}

/** The post, when the caller may read it (RLS): none for a missing, hidden, deleted, held or not-eligible one, all alike. */
export async function readPost(tx: IdentityTx, id: string): Promise<PostRow[]> {
  return tx.select(postColumns).from(posts).where(eq(posts.id, id));
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
