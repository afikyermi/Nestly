// The server password set of F2.0 (I2 part a; FR-AUTH-003, FR-AUTH-005, spec c7, c10, c11; AR-1). The browser never sets a
// password (D2): these three paths are the only ones, each acting on the JWT subject only, the password set through
// auth-admin.ts and audited in recovery_events. The password is never logged, stored or returned.
//
// Each set holds the user's password-state lock (db/password-lock.ts, Gate 2 A4) from a re-read of the guard through its Auth
// password set, then commits: a set admitted before an S-01 clear lands before the clear's cancel, never after it. F1.6's
// "no transaction open across an Auth call" yields here for that one call. A held lock is 503 (PasswordStateBusy).
//
//   forced (c7)   any non-stale session after a takeover clear (guard must_set, re-read under the lock; A6), active account: the
//                 row lock, the password set, the row marked done (trigger) and password_set_forced, in one transaction.
//   change (c10)  two current answers under the recovery limits (the question change's own-handle path and counters) in a
//                 transaction that commits; then, under the lock, the guard and the answers row re-read and the password
//                 set; then the outcome row.
// The admin set ends every session of the user, the caller's included (Gate 2 A6, DR-E): there is no separate sign-out, and
// after a 200 the client signs in again with the new password. No token is returned.
//   first (c11)   an Auth user with no account row (the F1.8 completion), re-read under the lock: the password set, a
//                 takeover clear's row (c9) marked done and first_password_set, in one transaction. Refused for an account
//                 row, so it cannot bypass c10.

import type { RecoveryAnswersInput, RecoveryEventKind } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, rereadGuard, SessionRefused, type IdentityTx } from '../db/identity-transaction.js';
import { lockPasswordState } from '../db/password-lock.js';
import { assumeAuthenticatedRole, assumeRecoveryRole, type RecoverySubjects } from '../db/recovery-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import type { RecoveryDependencies } from '../recovery/dependencies.js';
import { emailHandle, ipHash } from '../recovery/hashing.js';
import type { RecoveryKeys } from '../recovery/pepper.js';
import { readOwnStatuses } from '../repositories/account-state-repository.js';
import { lockOwnLinkCheck, markPasswordSet } from '../repositories/identity-link-repository.js';
import { insertEvent, readOwnClaim } from '../repositories/recovery-repository.js';
import { accountExists } from '../repositories/registration-repository.js';
import { guardedAttempt } from './recovery-attempt.js';
import { isHandleHeld, ownHandleFor, type HandleClaim } from './recovery-questions-service.js';

/** What the request brings beyond its identity. */
export interface PasswordClient {
  /** The text the IP hash covers (client-ip.ts). */
  readonly addressKey: string;
}

export type ForcedResult = { readonly kind: 'set' } | { readonly kind: 'not_required' } | { readonly kind: 'unavailable' };

export type FirstResult = { readonly kind: 'set' } | { readonly kind: 'has_account' } | { readonly kind: 'unavailable' };

export type ChangeResult =
  | { readonly kind: 'changed' }
  | { readonly kind: 'not_set' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'limited'; readonly retryAfterSeconds: number; readonly dayLock: boolean }
  | { readonly kind: 'unavailable' };

/** One fixed line when the change's outcome row could not be written. It carries no id, hash or address. */
export type OutcomeLogger = (message: string) => void;

/** Auth did not confirm the password: thrown inside a transaction so nothing of it commits. */
class PasswordNotSet extends Error {
  constructor() {
    super('the password was not confirmed as set');
    this.name = 'PasswordNotSet';
  }
}

function subjectsFor(keys: RecoveryKeys, email: string, addressKey: string): RecoverySubjects {
  return { handle: emailHandle(keys, email), ip: ipHash(keys, addressKey) };
}

async function audit(tx: IdentityTx, subjects: RecoverySubjects, kind: RecoveryEventKind, userId: string | null): Promise<void> {
  await assumeRecoveryRole(tx, subjects);
  await insertEvent(tx, { kind, userId, handleHash: subjects.handle, ipHash: subjects.ip });
  await assumeAuthenticatedRole(tx);
}

/** c7. `not_required` (409) unless the caller is the clearing session of an active account that has not set it yet. */
export async function setForcedPassword(
  database: Database,
  deps: RecoveryDependencies,
  keys: RecoveryKeys,
  identity: Identity,
  email: string,
  client: PasswordClient,
  password: string,
): Promise<ForcedResult> {
  const subjects = subjectsFor(keys, email, client.addressKey);
  try {
    return await inIdentityTransaction(database, identity, async (tx): Promise<ForcedResult> => {
      await lockPasswordState(tx, identity.userId);
      if ((await rereadGuard(tx)) !== 'must_set') return { kind: 'not_required' };
      const [status] = await readOwnStatuses(tx);
      if (status !== 'active') return { kind: 'not_required' }; // c9: an Auth user with no account row sets it through c11
      const own = await lockOwnLinkCheck(tx);
      if (own === undefined || !own.cleared || own.passwordSet) return { kind: 'not_required' };
      if ((await deps.authAccount.setPassword({ userId: identity.userId, password })) !== 'set') throw new PasswordNotSet();
      if (!(await markPasswordSet(tx))) return { kind: 'not_required' };
      await audit(tx, subjects, 'password_set_forced', identity.userId);
      return { kind: 'set' };
    });
  } catch (error) {
    if (error instanceof PasswordNotSet) return { kind: 'unavailable' };
    throw error;
  }
}

/** c11. `has_account` (403) for a caller with an account row: the change after two answers (c10) is the only way there. */
export async function setFirstPassword(
  database: Database,
  deps: RecoveryDependencies,
  keys: RecoveryKeys,
  identity: Identity,
  email: string,
  client: PasswordClient,
  password: string,
): Promise<FirstResult> {
  const subjects = subjectsFor(keys, email, client.addressKey);
  try {
    return await inIdentityTransaction(database, identity, async (tx): Promise<FirstResult> => {
      await lockPasswordState(tx, identity.userId);
      refuseUnlessProceeding(await rereadGuard(tx));
      if (await accountExists(tx)) return { kind: 'has_account' };
      if ((await deps.authAccount.setPassword({ userId: identity.userId, password })) !== 'set') throw new PasswordNotSet();
      await markPasswordSet(tx); // c9: an unregistered user's clear is done once its first password is set (no row: no move)
      await audit(tx, subjects, 'first_password_set', null);
      return { kind: 'set' };
    });
  } catch (error) {
    if (error instanceof PasswordNotSet) return { kind: 'unavailable' };
    throw error;
  }
}

/** A guard re-read under the lock that a concurrent clear moved to pending or stale: refused like at the start (503 / 401). */
function refuseUnlessProceeding(guard: Awaited<ReturnType<typeof rereadGuard>>): void {
  if (guard !== 'ok' && guard !== 'must_set') throw new SessionRefused(guard);
}

type Verified = { readonly kind: 'verified'; readonly userId: string; readonly subjects: RecoverySubjects } | ChangeResult;

/** c10. The attempt is counted and audited like the question change; Auth is called only after both answers matched. */
export async function changePassword(
  database: Database,
  deps: RecoveryDependencies,
  keys: RecoveryKeys,
  identity: Identity,
  request: { readonly claim: HandleClaim | undefined; readonly client: PasswordClient },
  current: RecoveryAnswersInput,
  password: string,
  logOutcomeNotRecorded: OutcomeLogger,
): Promise<ChangeResult> {
  const ip = ipHash(keys, request.client.addressKey);
  let first: Verified;
  try {
    first = await inIdentityTransaction(database, identity, async (tx): Promise<Verified> => {
      const handle = await ownHandleFor(tx, keys, identity, request.claim, ip);
      if (handle === 'not_set' || handle === 'unavailable') return { kind: handle };
      const subjects = { handle, ip };
      const attempt = await guardedAttempt(tx, { keys, subjects, scrypt: deps.scrypt }, current, {
        failed: 'password_change_failed',
        limited: 'password_change_limited',
      });
      if (attempt.kind === 'limited') return { kind: 'limited', retryAfterSeconds: attempt.retryAfterSeconds, dayLock: attempt.dayLock };
      if (attempt.kind === 'mismatch') return { kind: 'invalid' };
      return { kind: 'verified', userId: attempt.userId, subjects };
    });
  } catch (error) {
    if (isHandleHeld(error)) return { kind: 'unavailable' };
    throw error;
  }
  if (first.kind !== 'verified') return first;

  // Under the lock: the guard and the verified answers row again (a clear in between deleted it: ERR-042, nothing set), then
  // the set, which also ends every session (A6). A retry after a failed set sets again.
  const verified = first;
  const set = await inIdentityTransaction(database, identity, async (tx) => {
    await lockPasswordState(tx, identity.userId);
    refuseUnlessProceeding(await rereadGuard(tx));
    if ((await readOwnClaim(tx))?.emailHandle?.equals(verified.subjects.handle) !== true) return 'gone' as const;
    return deps.authAccount.setPassword({ userId: identity.userId, password });
  });
  if (set === 'gone') return { kind: 'invalid' };
  const completed = set === 'set';
  try {
    await inIdentityTransaction(database, identity, (tx) =>
      audit(tx, verified.subjects, completed ? 'password_changed' : 'password_change_auth_failed', verified.userId),
    );
  } catch {
    logOutcomeNotRecorded('password change: the outcome row was not written');
  }
  return completed ? { kind: 'changed' } : { kind: 'unavailable' };
}
