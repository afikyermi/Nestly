// One guarded attempt to prove two recovery answers (I1 F1.6; FR-AUTH-003, AC-092, NFR-SEC-001), shared by the signed-out
// reset and the signed-in change. It runs inside a transaction its caller opened and does, in this order:
//   1. SET LOCAL ROLE app_recovery and declare the handle and IP hash;
//   2. create and lock the IP throttle row FIRST (the one lock order of every path: IP, then handle);
//   3. IP locked: write the one "limited" event of this lock when none is noted yet, and stop. No handle row is created
//      or locked, so a locked IP can never grow the database with the emails it submits (CRITIC finding 2);
//   4. otherwise create and lock the handle row; handle locked: the same, with the handle's marker;
//   5. read the declared handle's answers row (zero or one), after both locks so a concurrent change is seen;
//   6. compute exactly two scrypt hashes and compare them in constant time. A missing row, or a stored pair that is not
//      the submitted pair, is run against a fixed dummy salt, so every failure costs the same two computations;
//   7. on a mismatch: count one failure on the IP and the handle, append the "failed" event.
// The caller then commits (every outcome but a thrown error commits: the counters and the audit are the point).
// Nothing is logged here, and nothing but hashes, counts and kinds is ever written.

import {
  RECOVERY_LIMITS,
  type RecoveryAnswersInput,
  type RecoveryEventKind,
  type RecoveryQuestionId,
  type RecoveryThrottleSubject,
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
  ensureThrottleRow,
  insertEvent,
  lockThrottle,
  markLimitedNoted,
  readDeclaredAnswers,
  recordFailure,
  type RecoveryEvent,
  type ThrottleLimits,
  type ThrottleState,
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

/**
 * A locked subject: the first attempt of this lock writes the one limited event, later ones write nothing in any table.
 * `limited_noted_until` holds the locked_until value the event was written for, and it cannot move during a lock.
 */
async function limited(
  tx: IdentityTx,
  kinds: AttemptKinds,
  event: Omit<RecoveryEvent, 'kind'>,
  subject: RecoveryThrottleSubject,
  state: ThrottleState,
): Promise<AttemptResult> {
  if (!state.noted) {
    await markLimitedNoted(tx, subject);
    await insertEvent(tx, { kind: kinds.limited, ...event });
  }
  return { kind: 'limited', retryAfterSeconds: state.retryAfterSeconds };
}

export async function guardedAttempt(
  tx: IdentityTx,
  context: AttemptContext,
  submitted: RecoveryAnswersInput,
  kinds: AttemptKinds,
): Promise<AttemptResult> {
  const { subjects } = context;
  await assumeRecoveryRole(tx, subjects);

  await ensureThrottleRow(tx, 'ip', subjects.ip);
  const ipState = await lockThrottle(tx, 'ip');
  if (ipState.locked) {
    // The event policy binds user_id to the declared handle's row, so it is read even though no handle row is touched.
    const known = await readDeclaredAnswers(tx);
    return limited(tx, kinds, { userId: known?.userId ?? null, handleHash: subjects.handle, ipHash: subjects.ip }, 'ip', ipState);
  }

  await ensureThrottleRow(tx, 'handle', subjects.handle);
  const handleState = await lockThrottle(tx, 'handle');
  const stored = await readDeclaredAnswers(tx);
  const event = { userId: stored?.userId ?? null, handleHash: subjects.handle, ipHash: subjects.ip };
  if (handleState.locked) return limited(tx, kinds, event, 'handle', handleState);

  if (!(await answersMatch(context, stored, submitted)) || stored === undefined) {
    await recordFailure(tx, 'ip', IP_LIMITS);
    await recordFailure(tx, 'handle', HANDLE_LIMITS);
    await insertEvent(tx, { kind: kinds.failed, ...event });
    return { kind: 'mismatch' };
  }
  return { kind: 'match', userId: stored.userId };
}
