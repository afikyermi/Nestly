// The per-user password-state lock (F2.0 Gate 2 A4; CRITIC round 1, bug 1). One transaction-scoped advisory lock per Auth
// user serialises everything that changes who can sign in to that user: the S-01 clear (its two transactions), the server
// password sets (forced c7, change c10, first c11, the F1.6 reset — each held from its re-read through its Auth password set)
// and the answers store and change. A set admitted before a clear therefore lands before the clear's cancel, never after.
//
// The key is built here and nowhere else. Try-lock only (NOWAIT): a held lock throws PasswordStateBusy, answered 503 and
// retried by the client, so no request waits while holding a pooled connection. Transaction-scoped: it ends with the
// transaction, pooler-safe, and needs no grant (PUBLIC EXECUTE), so it works as `authenticated` and as `app_recovery`.
// Take it first, before any row lock.

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from './identity-transaction.js';

/** Another request of the same user holds the lock: nothing was done; the caller answers 503 `unavailable`. */
export class PasswordStateBusy extends Error {
  constructor() {
    super('the password state of this user is locked by another request');
    this.name = 'PasswordStateBusy';
  }
}

const lockRows = z.array(z.object({ locked: z.boolean() })).length(1);

/** Takes the user's password-state lock for the rest of the transaction, or throws PasswordStateBusy. */
export async function lockPasswordState(tx: IdentityTx, userId: string): Promise<void> {
  const result = await tx.execute(
    sql`select pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('nestly.password_state:' || ${userId}, 0)) as locked`,
  );
  const [row] = lockRows.parse(result);
  if (row?.locked !== true) throw new PasswordStateBusy();
}
