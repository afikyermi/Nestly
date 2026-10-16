// The server password set of F2.0 (I2 part a; FR-AUTH-003, FR-AUTH-005, spec c7, c10, c11; AR-1). The browser never sets a
// password (D2): these three paths are the only ones, each acting on the JWT subject only, the password set through
// auth-admin.ts and audited in recovery_events. The password is never logged, stored or returned.
//
//   forced (c7)   the session that completed a takeover clear (guard must_set), active account: the row lock (NOWAIT, the
//                 clear's lock), the password set, the row marked done (trigger) and password_set_forced, in one transaction.
//   change (c10)  two current answers under the recovery limits (the question change's own-handle path and counters), then
//                 the password set and every other session signed out with the caller's token, then the outcome row. As in
//                 the reset, the attempt commits before Auth is called, and no transaction is open across the Auth calls.
//   first (c11)   an Auth user with no account row (the F1.8 completion): the password set, then a takeover clear's row (c9)
//                 marked done and first_password_set. Refused for an account row, so it cannot bypass c10.

import type { RecoveryAnswersInput, RecoveryEventKind } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import { assumeAuthenticatedRole, assumeRecoveryRole, type RecoverySubjects } from '../db/recovery-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import type { RecoveryDependencies } from '../recovery/dependencies.js';
import { emailHandle, ipHash } from '../recovery/hashing.js';
import type { RecoveryKeys } from '../recovery/pepper.js';
import { readOwnStatuses } from '../repositories/account-state-repository.js';
import { lockOwnLinkCheck, markPasswordSet } from '../repositories/identity-link-repository.js';
import { insertEvent } from '../repositories/recovery-repository.js';
import { accountExists } from '../repositories/registration-repository.js';
import { guardedAttempt } from './recovery-attempt.js';
import { isHandleHeld, ownHandleFor, type HandleClaim } from './recovery-questions-service.js';

/** What the request brings beyond its identity. */
export interface PasswordClient {
  /** The text the IP hash covers (client-ip.ts), and the address for Auth. */
  readonly addressKey: string;
  readonly address: string | undefined;
}

export type ForcedResult = { readonly kind: 'set' } | { readonly kind: 'not_required' } | { readonly kind: 'unavailable' };

export type FirstResult = { readonly kind: 'set' } | { readonly kind: 'has_account' } | { readonly kind: 'unavailable' };

export type ChangeResult =
  | { readonly kind: 'changed' }
  | { readonly kind: 'not_set' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'limited'; readonly retryAfterSeconds: number }
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
    return await inIdentityTransaction(database, identity, async (tx, guard): Promise<ForcedResult> => {
      if (guard !== 'must_set') return { kind: 'not_required' };
      const [status] = await readOwnStatuses(tx);
      if (status !== 'active') return { kind: 'not_required' }; // c9: an Auth user with no account row sets it through c11
      const own = await lockOwnLinkCheck(tx); // the guard was read before the lock: a concurrent set may have finished
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
  if (await inIdentityTransaction(database, identity, accountExists)) return { kind: 'has_account' };
  if ((await deps.authAccount.setPassword({ userId: identity.userId, password })) !== 'set') return { kind: 'unavailable' };
  const subjects = subjectsFor(keys, email, client.addressKey);
  // A failure here throws (503): the client retries, and Auth's same_password makes the retry a success.
  return inIdentityTransaction(database, identity, async (tx): Promise<FirstResult> => {
    if (await accountExists(tx)) return { kind: 'has_account' };
    await markPasswordSet(tx); // c9: an unregistered user's clear is done once its first password is set (no row: no move)
    await audit(tx, subjects, 'first_password_set', null);
    return { kind: 'set' };
  });
}

type Verified = { readonly kind: 'verified'; readonly userId: string; readonly subjects: RecoverySubjects } | ChangeResult;

/** c10. The attempt is counted and audited like the question change; Auth is called only after both answers matched. */
export async function changePassword(
  database: Database,
  deps: RecoveryDependencies,
  keys: RecoveryKeys,
  identity: Identity,
  request: { readonly claim: HandleClaim | undefined; readonly accessToken: string; readonly client: PasswordClient },
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
      if (attempt.kind === 'limited') return { kind: 'limited', retryAfterSeconds: attempt.retryAfterSeconds };
      if (attempt.kind === 'mismatch') return { kind: 'invalid' };
      return { kind: 'verified', userId: attempt.userId, subjects };
    });
  } catch (error) {
    if (isHandleHeld(error)) return { kind: 'unavailable' };
    throw error;
  }
  if (first.kind !== 'verified') return first;

  // Set, then sign the other sessions out. A retry after either failure sets the same password again and signs out again.
  const set = await deps.authAccount.setPassword({ userId: identity.userId, password });
  const signedOut =
    set === 'set' ? await deps.authAccount.signOutOthers({ accessToken: request.accessToken, clientIp: request.client.address }) : 'failed';
  const completed = signedOut === 'done';
  try {
    await inIdentityTransaction(database, identity, (tx) =>
      audit(tx, first.subjects, completed ? 'password_changed' : 'password_change_auth_failed', first.userId),
    );
  } catch {
    logOutcomeNotRecorded('password change: the outcome row was not written');
  }
  return completed ? { kind: 'changed' } : { kind: 'unavailable' };
}
