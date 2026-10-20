// Blocking a user (FR-REL-002; migration 20261021200000). Runs inside the caller's identity transaction and nowhere else. Who may block, whose
// block is lifted and what a block hides are the database's (user_blocks policies, the restrictive hiding policies, the trigger that ends the
// Friendship). No statement carries the caller's id as a value: blocker_id defaults to auth.uid() and is never granted.

import type { BlockedAccount } from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);

/** Blocks the account; a repeat reaches the primary key and inserts nothing (idempotent). A refusal propagates with its SQLSTATE. */
export async function insertBlock(tx: IdentityTx, blockedId: string): Promise<void> {
  await tx.execute(sql`insert into nestly.user_blocks (blocked_id) values (${blockedId}::uuid) on conflict do nothing`);
}

/** Lifts the caller's block of the account; the delete policy lets only the blocker remove its row. Zero rows is fine (idempotent). */
export async function deleteBlock(tx: IdentityTx, blockedId: string): Promise<void> {
  await tx.execute(sql`delete from nestly.user_blocks where blocked_id = ${blockedId}::uuid`);
}

/**
 * The accounts the caller blocked, newest first, with the name when the account has one (regular_names_select_blocker). Both parties read a
 * block row; `blocker_id = auth.uid()` picks the list of the caller's own blocks, not a permission.
 */
export async function readBlocked(tx: IdentityTx): Promise<BlockedAccount[]> {
  return z
    .array(z.object({ userId: z.guid(), fullName: z.string().nullable(), blockedAt: z.string() }))
    .parse(
      await tx.execute(sql`
        select b.blocked_id as "userId", n.full_name as "fullName", to_char(b.created_at at time zone 'UTC', ${isoMs}) as "blockedAt"
        from nestly.user_blocks b left join nestly.regular_names n on n.user_id = b.blocked_id
        where b.blocker_id = (select auth.uid())
        order by b.created_at desc, b.blocked_id
        limit 500`),
    );
}
