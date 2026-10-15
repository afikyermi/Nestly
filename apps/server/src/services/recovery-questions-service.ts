// Saving and changing the recovery answers while signed in (I1 F1.6; FR-AUTH-003, AC-092; schema.md "How the server
// uses it", Store and Change). The caller is authenticated and the body is validated. Both paths hash the new answers
// first (outside any transaction), then run ONE identity transaction, so a failure after the first statement leaves
// nothing. The audit row is appended as `app_recovery` in the same transaction; the user's own rows are written as
// `authenticated`. The hashes and salts are never read back by the user.

import { RECOVERY_SCRYPT, type RecoveryAnswersInput } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import { assumeAuthenticatedRole, assumeRecoveryRole } from '../db/recovery-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import type { RecoveryDependencies } from '../recovery/dependencies.js';
import { emailHandle, hashAnswer, ipHash, newSaltPair } from '../recovery/hashing.js';
import type { RecoveryKeys } from '../recovery/pepper.js';
import {
  insertEvent,
  insertOwnAnswers,
  readOwnHandle,
  replaceOwnAnswers,
  type AnswerHashes,
} from '../repositories/recovery-repository.js';
import { canonicalPair, guardedAttempt } from './recovery-attempt.js';

export interface QuestionsClient {
  /** The text the IP hash covers (client-ip.ts). */
  readonly addressKey: string;
}

export type StoreResult = { readonly kind: 'created' } | { readonly kind: 'already_set' };

export type ChangeResult =
  | { readonly kind: 'changed' }
  | { readonly kind: 'not_set' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'limited'; readonly retryAfterSeconds: number };

/** The primary key of recovery_answers: the one signal that this account already saved answers. */
const ANSWERS_PRIMARY_KEY = 'recovery_answers_pkey';
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

/**
 * The first save. `email` is the verified token's email claim: it becomes the lookup handle and is not kept. A second save
 * for the same account is `already_set` and changes nothing. Any other failure throws and leaves no row.
 */
export async function storeRecoveryAnswers(
  database: Database,
  deps: RecoveryDependencies,
  keys: RecoveryKeys,
  identity: Identity,
  email: string,
  client: QuestionsClient,
  answers: RecoveryAnswersInput,
): Promise<StoreResult> {
  const subjects = { handle: emailHandle(keys, email), ip: ipHash(keys, client.addressKey) };
  const hashes = await hashNewAnswers(deps, keys, answers);
  try {
    await inIdentityTransaction(database, identity, async (tx) => {
      await insertOwnAnswers(tx, subjects.handle, hashes);
      await assumeRecoveryRole(tx, subjects);
      await insertEvent(tx, {
        kind: 'answers_saved',
        userId: identity.userId,
        handleHash: subjects.handle,
        ipHash: subjects.ip,
      });
    });
    return { kind: 'created' };
  } catch (error) {
    const fault = readDatabaseFault(error);
    if (fault?.code === UNIQUE_VIOLATION && fault.constraint === ANSWERS_PRIMARY_KEY) return { kind: 'already_set' };
    throw error;
  }
}

/**
 * Replaces both answers after the current two are proved, under the same limits as a reset. The account's own handle is
 * read first, so the limits and the audit count the same subject a reset of this account would. A wrong or limited
 * attempt commits its counters and audit row and changes nothing else.
 */
export async function changeRecoveryAnswers(
  database: Database,
  deps: RecoveryDependencies,
  keys: RecoveryKeys,
  identity: Identity,
  client: QuestionsClient,
  current: RecoveryAnswersInput,
  next: RecoveryAnswersInput,
): Promise<ChangeResult> {
  const hashes = await hashNewAnswers(deps, keys, next);
  const ip = ipHash(keys, client.addressKey);
  return inIdentityTransaction(database, identity, async (tx): Promise<ChangeResult> => {
    const handle = await readOwnHandle(tx);
    if (handle === undefined) return { kind: 'not_set' };
    const subjects = { handle, ip };
    const attempt = await guardedAttempt(
      tx,
      { keys, subjects, scrypt: deps.scrypt },
      current,
      { failed: 'change_failed', limited: 'change_limited' },
    );
    if (attempt.kind === 'limited') return { kind: 'limited', retryAfterSeconds: attempt.retryAfterSeconds };
    if (attempt.kind === 'mismatch') return { kind: 'invalid' };

    await assumeAuthenticatedRole(tx);
    await replaceOwnAnswers(tx, hashes);
    await assumeRecoveryRole(tx, subjects);
    await insertEvent(tx, { kind: 'answers_changed', userId: attempt.userId, handleHash: handle, ipHash: ip });
    return { kind: 'changed' };
  });
}
