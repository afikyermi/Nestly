// Shares (I3 F3.5; FR-FEED-006, BR-064-066; i3-rest-schema S-share). Runs inside the caller's identity transaction and nowhere else. Who may
// share what is the database's: posts_insert_prepare refuses every unshareable original with one code (NS002) and a caller who is not an
// active Regular account with 42501, reading the original under the caller's RLS; posts_insert_author and the FKs stay the authority. An id
// below names a row, never a filter for permission. The share columns are not in the Drizzle schema (the drift check holds the approved
// list), so both statements are SQL with bound values, and each names its columns.

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { PostAudience } from '@nestly/shared';
import type { IdentityTx } from '../db/identity-transaction.js';

const sharedPostRow = z.object({ sharedPostId: z.guid().nullable() });
const insertedRow = z.object({ id: z.guid() });

/**
 * BR-066: what the post at `id` shares, when the caller may read it (RLS): its `shared_post_id`, null for a post that is not a share; no row
 * for one the caller cannot read. The only read besides the insert; it decides nothing (the trigger reads the original again).
 */
export async function readSharedPostId(tx: IdentityTx, id: string): Promise<{ sharedPostId: string | null }[]> {
  const rows = await tx.execute(sql`select p.shared_post_id as "sharedPostId" from nestly.posts p where p.id = ${id}::uuid`);
  return z.array(sharedPostRow).parse(rows);
}

/** Inserts the caller's share of `sharedPostId` (author, is_share and the refusals are the database's). Returns the new id. */
export async function insertShare(
  tx: IdentityTx,
  values: { text: string | null; audience: PostAudience; sharedPostId: string },
): Promise<{ id: string }[]> {
  const rows = await tx.execute(sql`
    insert into nestly.posts (audience, body, shared_post_id)
    values (${values.audience}, ${values.text}, ${values.sharedPostId}::uuid)
    returning id`);
  return z.array(insertedRow).parse(rows);
}
