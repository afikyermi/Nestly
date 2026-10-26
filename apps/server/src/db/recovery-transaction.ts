// The recovery role inside a transaction (data-model "Approved exceptions", part (b); F1.6 schema.md "Authorization").
//
// app_server holds `app_recovery` WITH INHERIT FALSE, SET TRUE: until a transaction does SET LOCAL ROLE it reads nothing.
// The transaction then declares which email handle and which IP hash it acts for, with two transaction-local settings;
// the policies of the three recovery tables match those declarations and nothing else, so the role sees one answers row
// and two throttle rows at most. Both settings and the role end with the transaction. A statement runs as the role current
// at that moment, so a signed-in transaction may switch between `authenticated` and `app_recovery`.

import { sql } from 'drizzle-orm';
import type { Database } from './client.js';
import type { IdentityTx } from './identity-transaction.js';
import { timeTransaction } from '../lib/server-timing.js';

/**
 * The two keyed hashes a recovery transaction declares. Never an email or an address. `claimedAt` is the `iat` of the
 * token making a handle claim (store, re-key): it lets the release policy tell an older holder from a newer one, and is
 * left undeclared (NULL, nothing releasable) everywhere else.
 */
export interface RecoverySubjects {
  readonly handle: Buffer;
  readonly ip: Buffer;
  readonly claimedAt?: Date | undefined;
}

/** SET LOCAL ROLE app_recovery and declare the subjects. Fails closed: an undeclared subject matches no row. */
export async function assumeRecoveryRole(tx: IdentityTx, subjects: RecoverySubjects): Promise<void> {
  await tx.execute(sql`set local role app_recovery`);
  await tx.execute(
    sql`select set_config('nestly.recovery_handle', ${subjects.handle.toString('hex')}, true),
               set_config('nestly.recovery_ip', ${subjects.ip.toString('hex')}, true),
               set_config('nestly.recovery_claimed_at', ${subjects.claimedAt?.toISOString() ?? ''}, true)`,
  );
}

/** Back to the signed-in identity inside an identity transaction (its claims are still set). */
export async function assumeAuthenticatedRole(tx: IdentityTx): Promise<void> {
  await tx.execute(sql`set local role authenticated`);
}

/** A signed-out recovery transaction. Nothing outside the declared subjects is visible to it. */
export function inRecoveryTransaction<T>(
  database: Database,
  subjects: RecoverySubjects,
  work: (tx: IdentityTx) => Promise<T>,
): Promise<T> {
  // Timed like an identity transaction (lib/server-timing.ts): it holds the instance's one connection too.
  const timer = timeTransaction(database.clock);
  return database.db
    .transaction(async (tx) => {
      timer.began();
      try {
        await assumeRecoveryRole(tx, subjects);
        timer.entered();
        return await work(tx);
      } finally {
        timer.settled();
      }
    })
    .finally(() => timer.freed());
}
