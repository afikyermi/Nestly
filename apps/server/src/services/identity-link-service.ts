// The S-01 identity link check and the takeover clear (I2 F2.0 part a; FR-AUTH-005, spec c1-c6, c9; schema.md "Detection
// read", "Concurrency"). Called by the authentication hook for a request from a Google (oauth) session, before the route
// runs. A password session never needs it: its guard is never `unchecked`, and a pending or stale one is refused by every
// identity transaction (SessionRefused).
//
//   unchecked  the caller's own Auth identities are read with its own token (no admin operation, no DEFINER); an email
//              identity older than the google one is `affected`. `unaffected` is written once and is permanent.
//   affected   the clear, in this order, each step safe to repeat:
//                tx 1   the verdict `affected` (= pending) and the caller's recovery answers deleted, in one transaction;
//                tx 2   the user's password-state lock (A4) and the own row lock (both NOWAIT: a concurrent runner gets 503 at
//                       once), the answers deleted again (A5), the password cancelled, every
//                       other session signed out with the caller's token, the row marked cleared by the clearing session
//                       (trigger), and one takeover_cleared audit row; committed only when every step succeeded.
//   pending    a request from any Google session resumes tx 2; a failure leaves it pending, so every session keeps getting
//              503 and nothing reports success before the clear is done (c3, c4).
//
// Both transactions take the per-user password-state lock first (db/password-lock.ts), so a password set or an answers store
// admitted before the clear completes before it, never after (A4).
// The pepper (for the audit row's hashes) and the Auth key are required before any step. Nothing is logged here but fixed
// words and SQLSTATEs: never a token, an email, an id or a password.

import type { IdentityLinkVerdict } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inLinkCheckTransaction, type SessionGuard } from '../db/identity-transaction.js';
import { lockPasswordState } from '../db/password-lock.js';
import { assumeAuthenticatedRole, assumeRecoveryRole } from '../db/recovery-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import type { SignInIdentity } from '../recovery/auth-admin.js';
import type { RecoveryDependencies } from '../recovery/dependencies.js';
import { emailHandle, ipHash } from '../recovery/hashing.js';
import { deleteOwnAnswers, insertLinkCheck, lockOwnLinkCheck, markCleared } from '../repositories/identity-link-repository.js';
import { insertEvent } from '../repositories/recovery-repository.js';
import { accountExists } from '../repositories/registration-repository.js';

/** What the request brings beyond its identity. The token is the caller's own bearer token; it is never stored or logged. */
export interface LinkCheckRequest {
  readonly accessToken: string;
  /** The token's email claim: the audit row's handle. */
  readonly email: string | null;
  /** The text the IP hash covers (client-ip.ts), and the address for Auth. */
  readonly addressKey: string;
  readonly address: string | undefined;
  /** One fixed line and a SQLSTATE when a step fails; never anything of the request. */
  readonly onFailure: (step: string, sqlstate: string | undefined) => void;
}

/** `proceed`: the route may run. `unauthenticated`: a stale token (401). `unavailable`: 503, nothing reported as done. */
export type LinkCheckOutcome = 'proceed' | 'unauthenticated' | 'unavailable';

/** A step of the clear that Auth did not confirm: thrown inside tx 2 so it rolls back and stays pending. */
class ClearStepFailed extends Error {
  constructor(readonly step: 'cancel' | 'sign_out') {
    super(`takeover clear: ${step} not confirmed`);
    this.name = 'ClearStepFailed';
  }
}

const PRIMARY_KEY_VIOLATION = { code: '23505', constraint: 'identity_link_checks_pkey' } as const;

/**
 * c1: affected when an email identity was created before the google identity (someone registered the email with a password
 * first). An email-only user, a Google-first user (no email identity, or one created after the google one) and a user with
 * no google identity are unaffected. `app_metadata.providers` is never read.
 */
export function linkVerdict(identities: readonly SignInIdentity[]): IdentityLinkVerdict {
  const earliest = (provider: string): number | undefined => {
    const times = identities.filter((identity) => identity.provider === provider).map((identity) => identity.createdAt.getTime());
    return times.length === 0 ? undefined : Math.min(...times);
  };
  const email = earliest('email');
  const google = earliest('google');
  return email !== undefined && google !== undefined && email < google ? 'affected' : 'unaffected';
}

function isOwnRowConflict(error: unknown): boolean {
  const fault = readDatabaseFault(error);
  return fault?.code === PRIMARY_KEY_VIOLATION.code && fault.constraint === PRIMARY_KEY_VIOLATION.constraint;
}

function readGuard(database: Database, identity: Identity): Promise<SessionGuard> {
  return inLinkCheckTransaction(database, identity, (_tx, guard) => Promise.resolve(guard));
}

/** Writes the verdict while the guard still says unchecked; for `affected` also deletes the answers (tx 1). */
async function recordVerdict(database: Database, identity: Identity, sessionId: string, verdict: IdentityLinkVerdict): Promise<void> {
  await inLinkCheckTransaction(database, identity, async (tx, guard) => {
    if (guard !== 'unchecked') return;
    if (verdict === 'affected') await lockPasswordState(tx, identity.userId); // A4: no set or answers store in flight
    await insertLinkCheck(tx, verdict, sessionId);
    if (verdict === 'affected') await deleteOwnAnswers(tx);
  });
}

/** tx 2. True when this call completed the clear; false when another runner already had (the caller re-reads the guard). */
async function completeClear(
  database: Database,
  deps: RecoveryDependencies,
  identity: Identity,
  request: LinkCheckRequest & { readonly email: string },
): Promise<boolean> {
  const keys = deps.keys();
  if (keys === undefined) throw new Error('the pepper is missing');
  const subjects = { handle: emailHandle(keys, request.email), ip: ipHash(keys, request.addressKey) };
  return inLinkCheckTransaction(database, identity, async (tx) => {
    await lockPasswordState(tx, identity.userId); // A4: first, before the row lock
    const own = await lockOwnLinkCheck(tx);
    if (own === undefined || own.verdict !== 'affected' || own.cleared) return false;
    await deleteOwnAnswers(tx); // A5: answers stored after tx 1 began (still pending, so the policy allows it)
    if ((await deps.authAccount.cancelPassword({ userId: identity.userId })) !== 'set') throw new ClearStepFailed('cancel');
    const signedOut = await deps.authAccount.signOutOthers({ accessToken: request.accessToken, clientIp: request.address });
    if (signedOut !== 'done') throw new ClearStepFailed('sign_out');
    if (!(await markCleared(tx))) return false;
    // c9: an Auth user with no account row is audited with no user (the FK needs a users row).
    const userId = (await accountExists(tx)) ? identity.userId : null;
    await assumeRecoveryRole(tx, subjects);
    await insertEvent(tx, { kind: 'takeover_cleared', userId, handleHash: subjects.handle, ipHash: subjects.ip });
    await assumeAuthenticatedRole(tx);
    return true;
  });
}

/** One pass over the guard. `again` when the state moved under a concurrent request and the guard must be read anew. */
async function step(
  database: Database,
  deps: RecoveryDependencies,
  identity: Identity,
  request: LinkCheckRequest,
): Promise<LinkCheckOutcome | 'again'> {
  const guard = await readGuard(database, identity);
  if (guard === 'ok' || guard === 'must_set') return 'proceed';
  if (guard === 'stale') return 'unauthenticated';
  if (guard === 'unauthenticated' || identity.sessionId === undefined) return 'unavailable';
  // Everything below may write: the pepper, the Auth key and the email claim come first (c3).
  const { email } = request;
  if (deps.keys() === undefined || !deps.authAccount.isConfigured() || email === null) return 'unavailable';

  if (guard === 'unchecked') {
    const read = await deps.authAccount.readIdentities({ accessToken: request.accessToken, clientIp: request.address });
    if (read.kind !== 'ok') {
      request.onFailure('identities read', undefined);
      return 'unavailable';
    }
    const verdict = linkVerdict(read.identities);
    try {
      await recordVerdict(database, identity, identity.sessionId, verdict);
    } catch (error) {
      if (isOwnRowConflict(error)) return 'again'; // a concurrent request of the same user wrote first
      throw error;
    }
    if (verdict === 'unaffected') return 'again';
  }
  return (await completeClear(database, deps, identity, { ...request, email })) ? 'proceed' : 'again';
}

/**
 * The gate of a request from an oauth session. Never throws: a database or Auth failure is `unavailable`, and the next
 * request from a Google session resumes where this one stopped.
 */
export async function checkIdentityLink(
  database: Database,
  deps: RecoveryDependencies,
  identity: Identity,
  request: LinkCheckRequest,
): Promise<LinkCheckOutcome> {
  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const outcome = await step(database, deps, identity, request);
      if (outcome !== 'again') return outcome;
    }
    return 'unavailable';
  } catch (error) {
    if (error instanceof ClearStepFailed) request.onFailure(`takeover clear ${error.step}`, undefined);
    else request.onFailure('identity link check', readDatabaseFault(error)?.code);
    return 'unavailable';
  }
}
