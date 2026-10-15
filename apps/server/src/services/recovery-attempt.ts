// One guarded attempt to prove two recovery answers (I1 F1.6; FR-AUTH-003, AC-092, NFR-SEC-001), shared by the signed-out
// reset and the signed-in change. It runs inside a transaction its caller opened and does, in this order:
//   1. SET LOCAL ROLE app_recovery and declare the handle and IP hash;
//   2. create the two throttle rows when missing, then lock the handle row and the IP row (always in that order);
//   3. read the declared handle's answers row (zero or one);
//   4. when either subject is locked: append the "limited" event and stop, no counter changes;
//   5. otherwise compute exactly two scrypt hashes and compare them in constant time. A missing row, or a stored pair that
//      is not the submitted pair, is run against a fixed dummy salt, so every failure costs the same two computations;
//   6. on a mismatch: count one failure on the handle and the IP, append the "failed" event.
// The caller then commits (every outcome but a thrown error commits: the counters and the audit are the point).
// Nothing is logged here, and nothing but hashes, counts and kinds is ever written.

import {
  RECOVERY_LIMITS,
  type RecoveryAnswersInput,
  type RecoveryEventKind,
  type RecoveryQuestionId,
} from '@nestly/shared';
import { assumeRecoveryRole, type RecoverySubjects } from '../db/recovery-transaction.js';
import type { IdentityTx } from '../db/identity-transaction.js';
import {
  DEFAULT_SCRYPT_PARAMS,
  HASH_BYTES,
  SALT_BYTES,
  hashAnswer,
  sameHash,
  type ScryptFn,
} from '../recovery/hashing.js';
import type { RecoveryKeys } from '../recovery/pepper.js';
import {
  ensureThrottleRows,
  insertEvent,
  lockThrottle,
  readDeclaredAnswers,
  recordFailure,
  type ThrottleLimits,
} from '../repositories/recovery-repository.js';

export interface AttemptContext {
  readonly keys: RecoveryKeys;
  readonly subjects: RecoverySubjects;
  readonly scrypt: ScryptFn;
}

export interface AttemptKinds {
  readonly failed: RecoveryEventKind;
  readonly limited: RecoveryEventKind;
}

export type AttemptResult =
  | { readonly kind: 'limited'; readonly retryAfterSeconds: number }
  | { readonly kind: 'mismatch' }
  | { readonly kind: 'match'; readonly userId: string };

const HANDLE_LIMITS: ThrottleLimits = {
  short: {
    failures: RECOVERY_LIMITS.handle.shortFailures,
    windowSeconds: RECOVERY_LIMITS.handle.shortWindowSeconds,
    lockSeconds: RECOVERY_LIMITS.handle.shortLockSeconds,
  },
  long: {
    failures: RECOVERY_LIMITS.handle.longFailures,
    windowSeconds: RECOVERY_LIMITS.handle.longWindowSeconds,
    lockSeconds: RECOVERY_LIMITS.handle.longLockSeconds,
  },
};

const IP_LIMITS: ThrottleLimits = {
  short: {
    failures: RECOVERY_LIMITS.ip.shortFailures,
    windowSeconds: RECOVERY_LIMITS.ip.shortWindowSeconds,
    lockSeconds: RECOVERY_LIMITS.ip.shortLockSeconds,
  },
  long: null,
};

// What an attempt is hashed against when there is nothing to compare with.
const DUMMY_SALT = Buffer.alloc(SALT_BYTES, 0x5a);
const DUMMY_HASH = Buffer.alloc(HASH_BYTES);

interface Entry {
  readonly question: RecoveryQuestionId;
  readonly answer: string;
}

/** The submitted pair in canonical order (the smaller question id first), as the table stores it. */
export function canonicalPair(entries: RecoveryAnswersInput): readonly [Entry, Entry] {
  const [first, second] = [...entries].sort((a, b) => (a.question < b.question ? -1 : 1));
  if (first === undefined || second === undefined) throw new Error('recovery answers are not a pair');
  return [first, second];
}

type StoredAnswers = NonNullable<Awaited<ReturnType<typeof readDeclaredAnswers>>>;

async function answersMatch(
  context: AttemptContext,
  stored: StoredAnswers | undefined,
  submitted: RecoveryAnswersInput,
): Promise<boolean> {
  const [first, second] = canonicalPair(submitted);
  const real =
    stored !== undefined && stored.question1 === first.question && stored.question2 === second.question ? stored : undefined;
  const params = real === undefined ? DEFAULT_SCRYPT_PARAMS : { logN: real.scryptLogN, r: real.scryptR, p: real.scryptP };
  const { keys, scrypt } = context;
  const [hashFirst, hashSecond] = await Promise.all([
    hashAnswer(scrypt, keys, first.question, first.answer, real?.answerSalt1 ?? DUMMY_SALT, params),
    hashAnswer(scrypt, keys, second.question, second.answer, real?.answerSalt2 ?? DUMMY_SALT, params),
  ]);
  const firstOk = sameHash(hashFirst, real?.answerHash1 ?? DUMMY_HASH);
  const secondOk = sameHash(hashSecond, real?.answerHash2 ?? DUMMY_HASH);
  return real !== undefined && firstOk && secondOk;
}

export async function guardedAttempt(
  tx: IdentityTx,
  context: AttemptContext,
  submitted: RecoveryAnswersInput,
  kinds: AttemptKinds,
): Promise<AttemptResult> {
  const { subjects } = context;
  await assumeRecoveryRole(tx, subjects);
  await ensureThrottleRows(tx, subjects);
  const handleState = await lockThrottle(tx, 'handle');
  const ipState = await lockThrottle(tx, 'ip');
  const stored = await readDeclaredAnswers(tx);
  const userId = stored?.userId ?? null;
  const event = { userId, handleHash: subjects.handle, ipHash: subjects.ip };

  if (handleState.locked || ipState.locked) {
    await insertEvent(tx, { kind: kinds.limited, ...event });
    const waits = [handleState, ipState].filter((state) => state.locked).map((state) => state.retryAfterSeconds);
    return { kind: 'limited', retryAfterSeconds: Math.max(...waits) };
  }

  if (!(await answersMatch(context, stored, submitted)) || stored === undefined) {
    await recordFailure(tx, 'handle', HANDLE_LIMITS);
    await recordFailure(tx, 'ip', IP_LIMITS);
    await insertEvent(tx, { kind: kinds.failed, ...event });
    return { kind: 'mismatch' };
  }
  return { kind: 'match', userId: stored.userId };
}
