// Blocking a user (FR-REL-002; migration 20261021200000). Runs inside the caller's identity transaction and nowhere else. Who may block, whose
// block is lifted and what a block hides are the database's (user_blocks policies, the restrictive hiding policies, the trigger that ends the
// Friendship). No statement carries the caller's id as a value: blocker_id defaults to auth.uid() and is never granted.

import type { BlockedAccount } from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';

const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);

/**
 * Blocks the account. The composite foreign keys accept only an active Regular or Professional account, so the type is tried as Regular
 * and then as Professional, each in a savepoint (23503 for both: no such account, or not one that can be blocked). A block already in
 * force is the same answer (idempotent). Any other refusal propagates with its SQLSTATE (42501 the caller may not, NS021 the daily limit).
 */
export async function insertBlock(tx: IdentityTx, blockedId: string): Promise<void> {
  const inForce = await tx.execute(sql`select 1 from nestly.user_blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = ${blockedId}::uuid and b.lifted_at is null`);
  if (inForce.length > 0) return;
  try {
    await tx.transaction(async (savepoint) => {
      await savepoint.execute(sql`insert into nestly.user_blocks (blocked_id, blocked_account_type) values (${blockedId}::uuid, 'regular')`);
    });
  } catch (error) {
    if (readDatabaseFault(error)?.code !== '23503') throw error;
    await tx.execute(sql`insert into nestly.user_blocks (blocked_id, blocked_account_type) values (${blockedId}::uuid, 'professional')`);
  }
}

/** Lifts the caller's block in force of the account (the database sets the time); only the blocker can. Zero rows is fine (idempotent). */
export async function deleteBlock(tx: IdentityTx, blockedId: string): Promise<void> {
  await tx.execute(sql`update nestly.user_blocks set lifted_at = now() where blocked_id = ${blockedId}::uuid and lifted_at is null`);
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
        where b.blocker_id = (select auth.uid()) and b.lifted_at is null
        order by b.created_at desc, b.blocked_id
        limit 500`),
    );
}
