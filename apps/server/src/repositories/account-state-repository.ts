// The caller's own account status (I1 F1.5 part a; schema.md "GET /api/me"). Runs inside the caller's identity
// transaction and nowhere else. Reads `users.status` and nothing else. No `where` and no id: RLS returns the caller's own
// row or nothing (users_select_own, any status), and permission is the database's.

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
