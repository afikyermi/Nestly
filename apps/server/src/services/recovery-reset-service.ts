// The signed-out password reset (I1 F1.6; FR-AUTH-003, AC-092; schema.md "How the server uses it", "Consistency between
// Auth and the counters/audit"). The caller has validated the body and checked that the pepper and the Auth key exist.
//
//   transaction 1  (guest role app_recovery): throttles locked, answers verified, counters and audit written, and for a
//                  verified attempt a `reset_verified` row. It COMMITS before Auth is called, so a password is never set
//                  without a committed audit row, and no transaction is open across an HTTP call.
//   Auth           the four calls of auth-admin.ts (read the account's current email, set the password, then end every
//                  session), inside a recovery transaction that holds the user's password-state lock and re-reads the
//                  verified answers row first (Gate 2 A4; the one Auth call F1.6's rule lets a transaction span). A current email that is not the request's sets nothing: the same `invalid` as a wrong answer.
//   transaction 2  the one outcome row: reset_completed, reset_admin_failed, reset_revoke_failed or reset_email_mismatch. If
//                  it fails, the audit ends at reset_verified and one fixed line is logged; the answer still follows Auth's
//                  outcome.
//
// Every failure before Auth is the same `invalid` result, whatever the reason (unknown email, no answers, a wrong answer,
// another pair of questions, a right answer in the wrong question). Nothing but fixed words is returned or logged.

import type { RecoveryAnswersInput, RecoveryEventKind } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { lockPasswordState } from '../db/password-lock.js';
import { inRecoveryTransaction } from '../db/recovery-transaction.js';
import type { RecoveryDependencies } from '../recovery/dependencies.js';
import { emailHandle, ipHash } from '../recovery/hashing.js';
import type { RecoveryKeys } from '../recovery/pepper.js';
import { insertEvent, readDeclaredAnswers } from '../repositories/recovery-repository.js';
import { guardedAttempt } from './recovery-attempt.js';

export interface ResetRequest {
  readonly email: string;
  readonly answers: RecoveryAnswersInput;
  readonly password: string;
}

export interface ResetClient {
  /** The text the IP hash covers (client-ip.ts). */
  readonly addressKey: string;
  /** The address for Auth, when `request.ip` was one. */
  readonly address: string | undefined;
}

export type ResetResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'limited'; readonly retryAfterSeconds: number; readonly dayLock: boolean }
  | { readonly kind: 'unavailable' };

/** One fixed line when the outcome row could not be written. It carries no id, hash or address. */
export type OutcomeLogger = (message: string) => void;

const OUTCOME_KIND = {
  completed: 'reset_completed',
  admin_failed: 'reset_admin_failed',
  revoke_failed: 'reset_revoke_failed',
  email_mismatch: 'reset_email_mismatch',
} as const satisfies Record<string, RecoveryEventKind>;

type Verified =
  | { readonly kind: 'verified'; readonly userId: string }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'limited'; readonly retryAfterSeconds: number; readonly dayLock: boolean };

export async function redeemReset(
  database: Database,
  deps: RecoveryDependencies,
  keys: RecoveryKeys,
  client: ResetClient,
  request: ResetRequest,
  logOutcomeNotRecorded: OutcomeLogger,
): Promise<ResetResult> {
  const subjects = { handle: emailHandle(keys, request.email), ip: ipHash(keys, client.addressKey) };
  const context = { keys, subjects, scrypt: deps.scrypt };
  const eventBase = { handleHash: subjects.handle, ipHash: subjects.ip };

  const first = await inRecoveryTransaction<Verified>(database, subjects, async (tx) => {
    const attempt = await guardedAttempt(tx, context, request.answers, { failed: 'reset_failed', limited: 'reset_limited' });
    if (attempt.kind === 'limited') return { kind: 'limited', retryAfterSeconds: attempt.retryAfterSeconds, dayLock: attempt.dayLock };
    if (attempt.kind === 'mismatch') return { kind: 'invalid' };
    await insertEvent(tx, { kind: 'reset_verified', userId: attempt.userId, ...eventBase });
    return { kind: 'verified', userId: attempt.userId };
  });
  if (first.kind !== 'verified') return first;

  // Gate 2 A4: under the user's password-state lock (a held lock is 503, PasswordStateBusy) the verified answers row is read
  // again — an S-01 clear in between deleted it, and then nothing is set (the same `invalid` as a wrong answer) — and the Auth
  // calls run before the lock is released, so a reset admitted before a clear lands before the clear's cancel.
  const outcome = await inRecoveryTransaction(database, subjects, async (tx) => {
    await lockPasswordState(tx, first.userId);
    if ((await readDeclaredAnswers(tx))?.userId !== first.userId) return 'gone' as const;
    return deps.authAdmin.resetPassword({ userId: first.userId, email: request.email, password: request.password, clientIp: client.address });
  });
  if (outcome === 'gone') return { kind: 'invalid' };

  try {
    await inRecoveryTransaction(database, subjects, (tx) =>
      insertEvent(tx, { kind: OUTCOME_KIND[outcome], userId: first.userId, ...eventBase }),
    );
  } catch {
    logOutcomeNotRecorded('recovery reset: the outcome row was not written');
  }
  if (outcome === 'completed') return { kind: 'ok' };
  // A stale handle found this account: it is answered like any other failure to prove the request and adds no failure; the right
  // answers already reset the account's ladder (AC-113: a correct attempt resets the count).
  return outcome === 'email_mismatch' ? { kind: 'invalid' } : { kind: 'unavailable' };
}
