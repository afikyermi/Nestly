// A viewer's own hides (I3 F3.9; FR-ALG-009 — the Hide action only; Afik 8א). Runs inside the caller's identity transaction and nowhere
// else. The only module that names post_hides (F3.2 c2, F3.9 c6): no feed module imports it, and nothing here reads a hide back for any
// purpose — the feed and post reads drop a hidden post through RLS (posts_select_viewer), never through the server.
// Who may hide what is the database's: the own-row policies and post_hides_insert_guard (caller gate 42501, unreadable or unknown NS004, own
// post NS003). No statement carries a user id: user_id defaults to auth.uid() and is never granted, and the delete policy names whose row.

import { sql } from 'drizzle-orm';
import type { IdentityTx } from '../db/identity-transaction.js';

/**
 * Hides the post for the caller. A repeat reaches the primary key (the guard lets an already-hidden post through) and inserts nothing, so the
 * call is idempotent. A refusal propagates with its SQLSTATE.
 */
export async function insertHide(tx: IdentityTx, postId: string): Promise<void> {
  await tx.execute(sql`insert into nestly.post_hides (post_id) values (${postId}::uuid) on conflict do nothing`);
}

/** Removes the caller's hide of the post; the delete policy lets a person delete their own row only. Zero rows is fine (idempotent). */
export async function deleteHide(tx: IdentityTx, postId: string): Promise<void> {
  await tx.execute(sql`delete from nestly.post_hides where post_id = ${postId}::uuid`);
}
