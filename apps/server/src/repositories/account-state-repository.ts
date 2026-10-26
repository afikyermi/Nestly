// The caller's own account status (I1 F1.5 part a; schema.md "GET /api/me"). Runs inside the caller's identity
// transaction and nowhere else. Reads `users.status` and nothing else. No `where` and no id: RLS returns the caller's own
// row or nothing (users_select_own, any status), and permission is the database's.

import { ACCOUNT_STATUSES, ACCOUNT_TYPES, type AccountStatus, type AccountType } from '@nestly/shared';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '../db/schema.js';
import type { IdentityTx } from '../db/identity-transaction.js';

/** The statuses of the rows the caller can see: one for an account, none for an Auth user with no account. */
export async function readOwnStatuses(tx: IdentityTx) {
  // limit 2: more than one row is a fault the service must see, not a row to ignore.
  const rows = await tx.select({ status: users.status }).from(users).limit(2);
  return rows.map((row) => row.status);
}

/** The status and account type of the rows the caller can see (users_select_own, any status): one, or none when unregistered. */
export async function readOwnAccounts(tx: IdentityTx) {
  // limit 2: more than one row is a fault the service must see, not a row to ignore.
  return tx.select({ status: users.status, accountType: users.accountType }).from(users).limit(2);
}

/**
 * readOwnAccounts as one column of a larger statement (performance plan ט'1: a feed page reads it with its clock and configuration in one
 * round trip): the same rows under the same policy, the same limit 2, as a json array of { status, accountType }. Read back with ownAccountsOf.
 */
export const OWN_ACCOUNTS_COLUMN: SQL = sql`(select coalesce(json_agg(json_build_object('status', o.status, 'accountType', o.account_type)), '[]'::json)
       from (select status, account_type from nestly.users limit 2) as o)`;

const ownAccountsValue = z.array(z.object({ status: z.enum(ACCOUNT_STATUSES), accountType: z.enum(ACCOUNT_TYPES) })).max(2);

/** The value of OWN_ACCOUNTS_COLUMN, checked: the rows readOwnAccounts would return. */
export function ownAccountsOf(value: unknown): { status: AccountStatus; accountType: AccountType }[] {
  return ownAccountsValue.parse(value);
}

/**
 * A suspension whose end time has passed ends when the account next asks for its state (FR-MOD-002): the policy users_update_own_expired_suspension
 * lets the account return itself to active, and only then. True when it did. No `where` on the id: RLS shows the caller its own row alone.
 */
export async function liftOwnExpiredSuspension(tx: IdentityTx): Promise<boolean> {
  const rows = await tx.execute(sql`update nestly.users set status = 'active' where status = 'suspended' and suspended_until is not null and suspended_until <= now() returning id`);
  return rows.length > 0;
}
