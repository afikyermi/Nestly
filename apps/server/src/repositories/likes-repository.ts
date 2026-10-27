// Likes and the displayed counts (I3 F3.3 b2; FR-FEED-001; I3-algorithm.md -> "Display statement and like-state statement"; schema-b.md). Runs
// inside the caller's identity transaction and nowhere else. Which likes and comments the caller reads is the database's (reactions_select_reader,
// comments_select_viewer): nothing here narrows rows for permission, and a count is a count of what the policies show. Four kinds of statement,
// kept apart on purpose:
//   - the displayed counts (`likeCount`, `commentCount`): count(*) of the visible rows, grouped by target. No predicate on status, liker_status,
//     is_by_author, created_at; no identity column. They are not the ranking's `n` and never feed it.
//   - the like-state (`likedByMe`): the only statement here that reads reaction_owners, exactly `select target_id from reaction_owners where
//     target_id = any(ids)`. No user_id predicate: the policy returns the caller's own rows only, and an app copy would be a permission filter.
//   - the write: one like per person and target (the database's UNIQUE, caught here as "already liked"), and removing the caller's own (the
//     delete policy names whose).
// SELECT is column-level: every statement lists its columns. Nothing here reads post_authors, and no response ever carries a user id.

import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { camelColumns } from './plan-cached.js';
import { readDatabaseFault } from '../lib/pg-error.js';

export type LikeTarget = 'post' | 'comment';

/** The constraint of F3.3 criterion 10: one like per (person, target). A second one is the same like, not an error. */
const ONE_LIKE_CONSTRAINT = 'reaction_owners_user_id_target_id_key';

const uuidArray = (ids: readonly string[]): SQL => sql`${sql.param([...ids])}::uuid[]`;

const likeCountRows = z.array(z.object({ targetId: z.guid(), likeCount: z.number().int().nonnegative() }));
const commentCountRows = z.array(z.object({ targetId: z.guid(), commentCount: z.number().int().nonnegative() }));

/** How many likes each of the given posts or comments shows the caller (none for a target it cannot read: the row is simply absent, 0). */
export async function readLikeCounts(tx: IdentityTx, target: LikeTarget, ids: readonly string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows =
    target === 'post'
      ? await tx.execute(
          sql`select r.post_id as "targetId", count(*)::int as "likeCount" from nestly.reactions r where r.post_id = any(${uuidArray(ids)}) group by r.post_id`,
        )
      : await tx.execute(
          sql`select r.comment_id as "targetId", count(*)::int as "likeCount" from nestly.reactions r where r.comment_id = any(${uuidArray(ids)}) group by r.comment_id`,
        );
  return new Map(likeCountRows.parse(rows).map((row) => [row.targetId, row.likeCount]));
}

/**
 * How many comments each of the given posts shows the caller: top-level comments, and replies whose parent row the caller can read too (the
 * thread renders no other reply). The parent test reads `comments` under the same policy; it is not a copy of one.
 */
export async function readCommentCounts(tx: IdentityTx, postIds: readonly string[]): Promise<Map<string, number>> {
  if (postIds.length === 0) return new Map();
  const rows = await tx.execute(sql`
    select c.post_id as "targetId", count(*)::int as "commentCount"
    from nestly.comments c
    where c.post_id = any(${uuidArray(postIds)})
      and (c.parent_id is null or exists (select 1 from nestly.comments p where p.id = c.parent_id))
    group by c.post_id`);
  return new Map(commentCountRows.parse(rows).map((row) => [row.targetId, row.commentCount]));
}

const postCountRows = z.array(z.object({ targetId: z.guid(), likeCount: z.number().int().nonnegative(), commentCount: z.number().int().nonnegative() }));

/**
 * readLikeCounts('post') and readCommentCounts in one statement (performance plan ט'1): per given post, the same two counts as correlated
 * sub-selects with the same predicates, so the same numbers (a post the caller cannot read counts 0 in both, as an absent row did). Still a
 * count statement only: no status, no time, no identity, no like-state.
 */
export async function readPostCounts(tx: IdentityTx, postIds: readonly string[]): Promise<Map<string, { likeCount: number; commentCount: number }>> {
  if (postIds.length === 0) return new Map();
  // the statement as the plan-cached invoker function nestly.read_post_counts (migration 20261027400000)
  const rows = await tx.execute(sql`select ${camelColumns('target_id', 'like_count', 'comment_count')} from nestly.read_post_counts(${uuidArray(postIds)})`);
  return new Map(postCountRows.parse(rows).map(({ targetId, likeCount, commentCount }) => [targetId, { likeCount, commentCount }]));
}

/** The like-state statement: which of the given targets the caller has liked. The policy returns the caller's own rows only. */
export async function readLikedTargetIds(tx: IdentityTx, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  // `select target_id from reaction_owners where target_id = any(ids)` as the plan-cached invoker function (migration 20261027400000)
  const rows = await tx.execute(sql`select target_id from nestly.read_liked_target_ids(${uuidArray(ids)})`);
  return new Set(
    z
      .array(z.object({ target_id: z.guid() }))
      .parse(rows)
      .map((row) => row.target_id),
  );
}

/** The post, when the caller may read it (RLS). */
export async function readReadablePost(tx: IdentityTx, id: string): Promise<string[]> {
  const rows = await tx.execute(sql`select p.id from nestly.posts p where p.id = ${id}::uuid`);
  return z
    .array(z.object({ id: z.guid() }))
    .parse(rows)
    .map((row) => row.id);
}

/** The comment, when the caller may read it (RLS). */
export async function readReadableComment(tx: IdentityTx, id: string): Promise<string[]> {
  const rows = await tx.execute(sql`select c.id from nestly.comments c where c.id = ${id}::uuid`);
  return z
    .array(z.object({ id: z.guid() }))
    .parse(rows)
    .map((row) => row.id);
}

/**
 * Likes the target for the caller. A repeat is the same like: the database's one-like key refuses it (23505), the savepoint takes only that
 * statement back, and this returns normally. Any other refusal propagates.
 */
export async function insertLike(tx: IdentityTx, target: LikeTarget, id: string): Promise<void> {
  try {
    await tx.transaction(async (savepoint) => {
      await savepoint.execute(
        target === 'post'
          ? sql`insert into nestly.reactions (post_id) values (${id}::uuid)`
          : sql`insert into nestly.reactions (comment_id) values (${id}::uuid)`,
      );
    });
  } catch (error) {
    const fault = readDatabaseFault(error);
    if (fault?.code === '23505' && fault.constraint === ONE_LIKE_CONSTRAINT) return;
    throw error;
  }
}

/** Removes the caller's like on the target; the delete policy lets a person delete their own like only. Zero rows is fine (idempotent). */
export async function deleteLike(tx: IdentityTx, id: string): Promise<void> {
  await tx.execute(sql`delete from nestly.reactions where target_id = ${id}::uuid`);
}
