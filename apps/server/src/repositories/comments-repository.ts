// Comments and replies (I3 F3.3 b1; FR-FEED-003; schema.md, schema-b.md). Runs inside the caller's identity transaction and nowhere else.
// Permission is the database's: comments_select_viewer decides who reads a comment (a held, hidden or suspended commenter's, or a reply under
// a held parent, is simply absent), comments_insert_commenter and comments_insert_prepare who may comment or reply, and delete_comment who
// removes one. An id in a `where` below names the row, a key and never a filter for permission. SELECT is column-level: every statement
// lists its columns. `author_id` is read only to know whether the answer carries an `author` and `isMine`; it never leaves this layer, and
// the real author of an anonymous post has none (NULL) to leak. The name is regular_names' as the caller's policy shows it, else null.

import { dbTimestamp } from '@nestly/shared';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

/** The response timestamp (milliseconds, like every other answer) and the cursor's (microseconds, the database's own text). */
const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);
const isoUs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`);

const commentRow = z.object({
  id: z.guid(),
  parentId: z.guid().nullable(),
  body: z.string(),
  createdAt: z.string(),
  cursorAt: dbTimestamp,
  byAuthor: z.boolean(),
  isMine: z.boolean(),
  hasAuthor: z.boolean(),
  authorName: z.string().nullable(),
});

export type CommentRow = z.infer<typeof commentRow>;

/** The columns of one comment as the caller may read it. `isMine` is display only: the commenter, or the real author of an anonymous post. */
const selectComments: SQL = sql`
    select c.id, c.parent_id as "parentId", c.body,
           to_char(c.created_at at time zone 'UTC', ${isoMs}) as "createdAt",
           to_char(c.created_at at time zone 'UTC', ${isoUs}) as "cursorAt",
           c.is_by_post_author as "byAuthor",
           case when c.author_id is null
                then exists (select 1 from nestly.post_authors pa where pa.post_id = c.post_id and pa.author_id = (select auth.uid()))
                else c.author_id = (select auth.uid()) end as "isMine",
           c.author_id is not null as "hasAuthor",
           n.full_name as "authorName"
    from nestly.comments c
    left join nestly.regular_names n on n.user_id = c.author_id`;

/** Inserts the caller's comment; the author, "המחבר" and status are the database's. Returns the new id. */
export async function insertComment(tx: IdentityTx, values: { postId: string; parentId: string | null; body: string }): Promise<string[]> {
  const rows = await tx.execute(
    sql`insert into nestly.comments (post_id, parent_id, body) values (${values.postId}::uuid, ${values.parentId}::uuid, ${values.body}) returning id`,
  );
  return z.array(z.object({ id: z.guid() })).parse(rows).map((row) => row.id);
}

/** The comment by id, when the caller may read it (RLS). */
export async function readComment(tx: IdentityTx, id: string): Promise<CommentRow[]> {
  return z.array(commentRow).parse(await tx.execute(sql`${selectComments} where c.id = ${id}::uuid`));
}

/** The readable top-level comment `parentId` of the post `postId`: none for an unknown, unreadable, other-post or reply row. */
export async function readTopLevelComment(tx: IdentityTx, postId: string, parentId: string): Promise<string[]> {
  const rows = await tx.execute(
    sql`select c.id from nestly.comments c where c.id = ${parentId}::uuid and c.post_id = ${postId}::uuid and c.parent_id is null`,
  );
  return z.array(z.object({ id: z.guid() })).parse(rows).map((row) => row.id);
}

/** One page of the readable top-level comments of a post, oldest first: at most `limit` rows after the cursor `(created_at, id)`. */
export async function readTopLevelPage(
  tx: IdentityTx,
  postId: string,
  after: { createdAt: string; id: string } | null,
  limit: number,
): Promise<CommentRow[]> {
  const keyset =
    after === null ? sql`true` : sql`(c.created_at, c.id) > (${after.createdAt}::timestamptz, ${after.id}::uuid)`;
  return z
    .array(commentRow)
    .parse(
      await tx.execute(
        sql`${selectComments} where c.post_id = ${postId}::uuid and c.parent_id is null and ${keyset} order by c.created_at asc, c.id asc limit ${limit}`,
      ),
    );
}

/** Every readable reply of the given top-level comments, oldest first, with the id of the parent. */
export async function readReplies(tx: IdentityTx, parentIds: readonly string[]): Promise<CommentRow[]> {
  if (parentIds.length === 0) return [];
  const ids = sql.join(
    parentIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  return z
    .array(commentRow.extend({ parentId: z.guid() }))
    .parse(await tx.execute(sql`${selectComments} where c.parent_id in (${ids}) order by c.created_at asc, c.id asc`));
}

/** delete_comment(uuid) deletes the caller's comment, or holds it when it has an open report. Returns the row count: 1, or 0 for not theirs. */
export async function deleteComment(tx: IdentityTx, id: string): Promise<number> {
  const rows = await tx.execute(sql`select nestly.delete_comment(${id}::uuid) as deleted`);
  const [row] = rows;
  const deleted: unknown = row === undefined ? undefined : Reflect.get(row, 'deleted');
  return typeof deleted === 'number' ? deleted : 0;
}
