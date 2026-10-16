// Saving and changing the recovery answers while signed in (I1 F1.6; FR-AUTH-003, AC-092; schema.md "How the server
// uses it", Store and Change, and "CRITIC findings 1-2"). The caller is authenticated and the body is validated. Each path
// runs ONE identity transaction, so a failure after the first statement leaves nothing. The audit row is appended as
// `app_recovery` in the same transaction; the user's own rows are written as `authenticated`. The hashes and salts are
// never read back by the user.
//
// The email handle follows the account's CURRENT Auth email, and the later claim wins (ordered by the token's `iat`):
//   - store releases another account's handle when that claim is older (event handle_released), then saves; a holder that
//     is not older is a unique violation on the handle key, answered 503 (the caller's token is stale);
//   - change and GET /api/me re-key the caller's own row to its token's email when the token is newer (handle_rekeyed).
// Hashing the new pair costs two scrypt computations, so it happens only after the cheap checks: a store for an account
// that already has answers, and a change whose current answers did not match, never pay for it.

import { RECOVERY_SCRYPT, type RecoveryAnswersInput } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import { assumeAuthenticatedRole, assumeRecoveryRole, type RecoverySubjects } from '../db/recovery-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import type { RecoveryDependencies } from '../recovery/dependencies.js';
import { emailHandle, hashAnswer, ipHash, newSaltPair } from '../recovery/hashing.js';
import type { RecoveryKeys } from '../recovery/pepper.js';
import {
  claimOwnHandle,
  insertEvent,
  insertOwnAnswers,
  readOwnClaim,
  readReleasableHolder,
  releaseDeclaredHandle,
  replaceOwnAnswers,
  type AnswerHashes,
  type OwnClaim,
} from '../repositories/recovery-repository.js';
import { canonicalPair, guardedAttempt } from './recovery-attempt.js';

export interface QuestionsClient {
  /** The text the IP hash covers (client-ip.ts). */
  readonly addressKey: string;
}

/** What the verified token says about the email: the claim and when it was issued (`iat`, whole seconds). */
export interface HandleClaim {
  readonly email: string;
  readonly issuedAt: number;
}

export type StoreResult =
  | { readonly kind: 'created' }
  | { readonly kind: 'already_set' }
  /** Another account holds this email under a claim that is not older: the caller's token is stale. */
  | { readonly kind: 'handle_held' };

export type ChangeResult =
  | { readonly kind: 'changed' }
  | { readonly kind: 'not_set' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'limited'; readonly retryAfterSeconds: number }
  /** The own handle is stale or released and could not be re-keyed (the caller's token is stale, or the email is held). */
  | { readonly kind: 'unavailable' };

/** The primary key of recovery_answers: the one signal that this account already saved answers. */
const ANSWERS_PRIMARY_KEY = 'recovery_answers_pkey';
/** The unique key on the handle: a violation means another account holds it under a claim that is not older. */
const ANSWERS_HANDLE_KEY = 'recovery_answers_email_handle_key';
const UNIQUE_VIOLATION = '23505';

/** Both answers salted and hashed, in the canonical pair order the table stores. */
async function hashNewAnswers(
  deps: RecoveryDependencies,
  keys: RecoveryKeys,
  answers: RecoveryAnswersInput,
): Promise<AnswerHashes> {
  const [first, second] = canonicalPair(answers);
  const [saltFirst, saltSecond] = newSaltPair();
  const params = RECOVERY_SCRYPT;
  const [hashFirst, hashSecond] = await Promise.all([
    hashAnswer(deps.scrypt, keys, first.question, first.answer, saltFirst, params),
    hashAnswer(deps.scrypt, keys, second.question, second.answer, saltSecond, params),
  ]);
  return {
    question1: first.question,
    question2: second.question,
    answerHash1: hashFirst,
    answerSalt1: saltFirst,
    answerHash2: hashSecond,
    answerSalt2: saltSecond,
    scryptLogN: params.logN,
    scryptR: params.r,
    scryptP: params.p,
  };
}

/** A re-key or store that lost the handle to another account's claim that is not older. */
export function isHandleHeld(error: unknown): boolean {
  const fault = readDatabaseFault(error);
  return fault?.code === UNIQUE_VIOLATION && fault.constraint === ANSWERS_HANDLE_KEY;
}

/**
 * Whether the own row should move to the token's handle: it is not there already, and the token is newer than the row's
 * own claim (or the row was released). An older token never takes a handle back (no ping-pong between two sessions).
 */
export function needsRekey(own: OwnClaim, tokenHandle: Buffer, issuedAt: number): boolean {
  if (own.emailHandle !== null && own.emailHandle.equals(tokenHandle)) return false;
  return own.handleClaimedAt === null || own.handleClaimedAt.getTime() < issuedAt * 1000;
}

/**
 * Releases the declared handle when another account holds it under an older claim. As `app_recovery`; the event comes
 * first because its policy binds user_id to the declared handle's row, which the release removes. Nothing happens when no
 * row is releasable (nobody holds it, or the holder's claim is not older).
 */
async function releaseOlderHolder(tx: IdentityTx, subjects: RecoverySubjects): Promise<void> {
  await assumeRecoveryRole(tx, subjects);
  const holder = await readReleasableHolder(tx);
  if (holder === undefined) return;
  await insertEvent(tx, { kind: 'handle_released', userId: holder.userId, handleHash: subjects.handle, ipHash: subjects.ip });
  await releaseDeclaredHandle(tx);
}

/**
 * Moves the caller's own row to the declared handle (the caller checked needsRekey): an older holder is released first,
 * then the own row is updated as `authenticated` (its claim must still be older), then `handle_rekeyed` is appended.
 * Throws a unique violation on the handle key when the holder is not older. Leaves the transaction as `authenticated`.
 */
export async function rekeyOwnHandle(
  tx: IdentityTx,
  userId: string,
  subjects: RecoverySubjects & { readonly claimedAt: Date },
): Promise<void> {
  await releaseOlderHolder(tx, subjects);
  await assumeAuthenticatedRole(tx);
  const moved = await claimOwnHandle(tx, subjects.handle, subjects.claimedAt);
  if (!moved) return;
  await assumeRecoveryRole(tx, subjects);
  await insertEvent(tx, { kind: 'handle_rekeyed', userId, handleHash: subjects.handle, ipHash: subjects.ip });
  await assumeAuthenticatedRole(tx);
}

/**
 * The first save. `claim.email` is the verified token's email claim: it becomes the lookup handle and is not kept. A second
 * save for the same account is `already_set` and changes nothing (and costs no hashing). Any other failure throws and
 * leaves no row.
 */
export async function storeRecoveryAnswers(
  database: Database,
  deps: RecoveryDependencies,
  keys: RecoveryKeys,
  identity: Identity,
  claim: HandleClaim,
  client: QuestionsClient,
  answers: RecoveryAnswersInput,
): Promise<StoreResult> {
  const claimedAt = new Date(claim.issuedAt * 1000);
  const subjects = { handle: emailHandle(keys, claim.email), ip: ipHash(keys, client.addressKey), claimedAt };
  try {
    return await inIdentityTransaction(database, identity, async (tx): Promise<StoreResult> => {
      if ((await readOwnClaim(tx)) !== undefined) return { kind: 'already_set' };
      const hashes = await hashNewAnswers(deps, keys, answers);
      await releaseOlderHolder(tx, subjects);
      await assumeAuthenticatedRole(tx);
      await insertOwnAnswers(tx, subjects.handle, claimedAt, hashes);
      await assumeRecoveryRole(tx, subjects);
      await insertEvent(tx, {
        kind: 'answers_saved',
        userId: identity.userId,
        handleHash: subjects.handle,
        ipHash: subjects.ip,
      });
      return { kind: 'created' };
    });
  } catch (error) {
    const fault = readDatabaseFault(error);
    if (fault?.code === UNIQUE_VIOLATION && fault.constraint === ANSWERS_PRIMARY_KEY) return { kind: 'already_set' };
    if (isHandleHeld(error)) return { kind: 'handle_held' };
    throw error;
  }
}

/**
 * The caller's own email handle, as a reset of this account would declare it: read first, and re-keyed to the token's email
 * when stale (the token is newer). `not_set`: no visible answers row. `unavailable`: released and not re-keyable (the caller's
 * token is stale, or the email is held). Shared by the question change and the password change (F2.0 c10).
 */
export async function ownHandleFor(
  tx: IdentityTx,
  keys: RecoveryKeys,
  identity: Identity,
  claim: HandleClaim | undefined,
  ip: Buffer,
): Promise<Buffer | 'not_set' | 'unavailable'> {
  let own = await readOwnClaim(tx);
  if (own === undefined) return 'not_set';
  if (claim !== undefined) {
    const tokenHandle = emailHandle(keys, claim.email);
    if (needsRekey(own, tokenHandle, claim.issuedAt)) {
      await rekeyOwnHandle(tx, identity.userId, { handle: tokenHandle, ip, claimedAt: new Date(claim.issuedAt * 1000) });
      own = await readOwnClaim(tx);
    }
  }
  return own?.emailHandle ?? 'unavailable';
}

/**
 * Replaces both answers after the current two are proved, under the same limits as a reset. The account's own handle is
 * read first (and re-keyed to the token's email when stale), so the limits and the audit count the same subject a reset of
 * this account would. A wrong or limited attempt commits its counters and audit row and changes nothing else; the new
 * pair is hashed only after the current one matched. `claim` is absent when the token carries no email or issue time:
 * the own handle is then used as it is.
 */
export async function changeRecoveryAnswers(
  database: Database,
  deps: RecoveryDependencies,
  keys: RecoveryKeys,
  identity: Identity,
  claim: HandleClaim | undefined,
  client: QuestionsClient,
  current: RecoveryAnswersInput,
  next: RecoveryAnswersInput,
): Promise<ChangeResult> {
  const ip = ipHash(keys, client.addressKey);
  try {
    return await inIdentityTransaction(database, identity, async (tx): Promise<ChangeResult> => {
      const handle = await ownHandleFor(tx, keys, identity, claim, ip);
      if (handle === 'not_set' || handle === 'unavailable') return { kind: handle };
      const subjects = { handle, ip };
      const attempt = await guardedAttempt(
        tx,
        { keys, subjects, scrypt: deps.scrypt },
        current,
        { failed: 'change_failed', limited: 'change_limited' },
      );
      if (attempt.kind === 'limited') return { kind: 'limited', retryAfterSeconds: attempt.retryAfterSeconds };
      if (attempt.kind === 'mismatch') return { kind: 'invalid' };

      const hashes = await hashNewAnswers(deps, keys, next);
      await assumeAuthenticatedRole(tx);
      await replaceOwnAnswers(tx, hashes);
      await assumeRecoveryRole(tx, subjects);
      await insertEvent(tx, { kind: 'answers_changed', userId: attempt.userId, handleHash: subjects.handle, ipHash: ip });
      return { kind: 'changed' };
    });
  } catch (error) {
    if (isHandleHeld(error)) return { kind: 'unavailable' };
    throw error;
  }
}
