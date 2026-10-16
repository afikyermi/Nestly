// The identity link check and the clear's own-row writes (I2 F2.0 part a; schema.md "Change", "Concurrency"). Every function
// runs as `authenticated` inside a transaction its caller opened. Permission is the database's: the policies return the
// caller's own row and nothing else, and the trigger (identity_link_checks_transition) decides which moves are allowed, so no
// statement here names the user, and none filters rows for permission. The two `where` clauses only make a move idempotent.

import { and, isNotNull, isNull, sql } from 'drizzle-orm';
import { IDENTITY_LINK_VERDICTS, type IdentityLinkVerdict } from '@nestly/shared';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { identityLinkChecksInsert, identityLinkChecksUpdate, recoveryAnswers } from '../db/schema.js';

/** The caller's own row under its row lock. */
export interface LockedLinkCheck {
  readonly verdict: IdentityLinkVerdict;
  readonly cleared: boolean;
  readonly passwordSet: boolean;
}

const lockedRows = z.array(z.object({ verdict: z.enum(IDENTITY_LINK_VERDICTS), cleared: z.boolean(), password_set: z.boolean() }));

/** Writes the caller's verdict, once (a second one is a unique violation on identity_link_checks_pkey). */
export async function insertLinkCheck(tx: IdentityTx, verdict: IdentityLinkVerdict, sessionId: string): Promise<void> {
  await tx.insert(identityLinkChecksInsert).values({ verdict, checkedSessionId: sessionId });
}

/**
 * Locks the caller's own row for the rest of the transaction, without waiting: a concurrent holder is SQLSTATE 55P03, which the
 * caller answers 503 at once (its retry finds the outcome). Undefined when the caller has no row.
 */
export async function lockOwnLinkCheck(tx: IdentityTx): Promise<LockedLinkCheck | undefined> {
  const result = await tx.execute(sql`
    select verdict, cleared_at is not null as cleared, password_set_at is not null as password_set
    from nestly.identity_link_checks
    for update nowait`);
  const rows = lockedRows.parse(result);
  if (rows.length > 1) throw new Error('more than one own identity_link_checks row');
  const row = rows[0];
  return row === undefined ? undefined : { verdict: row.verdict, cleared: row.cleared, passwordSet: row.password_set };
}

/**
 * D1: deletes the caller's own recovery answers while its own row is pending (policy recovery_answers_delete_clear). NO
 * `where` and NO `returning`, on purpose: either would apply the SELECT policy, which hides the row while pending.
 */
export async function deleteOwnAnswers(tx: IdentityTx): Promise<void> {
  await tx.delete(recoveryAnswers);
}

/**
 * The clear (pending to cleared). The trigger stamps clock_timestamp() (Gate 2 A1: after the sign-out of the other sessions) and
 * the caller's session; the value sent here is only a trigger. True when this call made the move.
 */
export async function markCleared(tx: IdentityTx): Promise<boolean> {
  const rows = await tx
    .update(identityLinkChecksUpdate)
    .set({ clearedAt: sql`now()` })
    .where(isNull(identityLinkChecksUpdate.clearedAt))
    .returning({ clearedAt: identityLinkChecksUpdate.clearedAt });
  return rows.length > 0;
}

/**
 * The password set after a clear (cleared to done). The trigger allows it for the clearing session, or for a caller with no
 * users row (c11), and stamps now(). True when this call made the move; false when there was nothing to mark.
 */
export async function markPasswordSet(tx: IdentityTx): Promise<boolean> {
  const rows = await tx
    .update(identityLinkChecksUpdate)
    .set({ passwordSetAt: sql`now()` })
    .where(and(isNotNull(identityLinkChecksUpdate.clearedAt), isNull(identityLinkChecksUpdate.passwordSetAt)))
    .returning({ passwordSetAt: identityLinkChecksUpdate.passwordSetAt });
  return rows.length > 0;
}
