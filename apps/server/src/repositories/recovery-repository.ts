// The recovery rows (I1 F1.6; schema.md "Authorization" and "How the server uses it"). Every function runs inside a
// transaction its caller opened and nowhere else; which role is current (authenticated or app_recovery) is the caller's
// choice, noted on each function. Permission is the database's: no statement here filters rows for it. The lookups carry
// no `where` on the account or the handle on purpose, because the policies already return the declared handle's row and
// nothing else (a listing or a dump is not possible for either role).
//
// Throttle counters and locks use the database clock and take the limits as parameters, one statement per subject.
// recovery_events has no SELECT for anyone, so nothing here ever reads it back or asks it for RETURNING.

import { isNull, lt, or, sql } from 'drizzle-orm';
import type { RecoveryEventKind, RecoveryQuestionId, RecoveryThrottleSubject } from '@nestly/shared';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import {
  recoveryAnswers,
  recoveryAnswersInsert,
  recoveryAnswersRelease,
  recoveryAnswersUpdate,
  recoveryEventsInsert,
  recoveryThrottlesInsert,
} from '../db/schema.js';

/** The hashes and salts of a pair of answers, plus the parameters they were made with. */
export interface AnswerHashes {
  readonly question1: RecoveryQuestionId;
  readonly question2: RecoveryQuestionId;
  readonly answerHash1: Buffer;
  readonly answerSalt1: Buffer;
  readonly answerHash2: Buffer;
  readonly answerSalt2: Buffer;
  readonly scryptLogN: number;
  readonly scryptR: number;
  readonly scryptP: number;
}

export interface ThrottleWindow {
  readonly failures: number;
  readonly windowSeconds: number;
  readonly lockSeconds: number;
}

/** What one subject may fail before it is locked. `long` is the handle's 24-hour window; an IP has none. */
export interface ThrottleLimits {
  readonly short: ThrottleWindow;
  readonly long: ThrottleWindow | null;
}

export interface ThrottleState {
  readonly locked: boolean;
  /** NFR-SEC-010: the handle is locked for good (the 9th failure); only a release by the Admin lifts it. */
  readonly permanent: boolean;
  /** Seconds until the lock ends; meaningful only while `locked`. */
  readonly retryAfterSeconds: number;
  /** Whether a limited event was already written for this very lock (limited_noted_until = locked_until). */
  readonly noted: boolean;
}

/** What the caller's own answers row says about its handle. NULL: released, no email finds the row. */
export interface OwnClaim {
  readonly emailHandle: Buffer | null;
  readonly handleClaimedAt: Date | null;
}

export interface RecoveryEvent {
  readonly kind: RecoveryEventKind;
  readonly userId: string | null;
  readonly handleHash: Buffer;
  readonly ipHash: Buffer;
}

const throttleStateRows = z.array(z.object({ locked: z.boolean(), permanent: z.boolean(), retry_after: z.number().int(), noted: z.boolean() }));

/** The lock ladder of a handle (NFR-SEC-010): the failure counts that lock it, for how long, and the count that locks it for good. */
export interface LadderLimits {
  readonly steps: ReadonlyArray<{ readonly failures: number; readonly lockSeconds: number }>;
  readonly permanentAt: number;
}

// --- as authenticated ---------------------------------------------------------------------------------------------------

/**
 * The caller's own handle and claim time, or undefined when they have no answers (or are not an active account: the
 * select-own policy hides the row). Only the granted columns are selectable. Never has a `where`: RLS returns the own row.
 */
export async function readOwnClaim(tx: IdentityTx): Promise<OwnClaim | undefined> {
  const rows = await tx
    .select({ emailHandle: recoveryAnswers.emailHandle, handleClaimedAt: recoveryAnswers.handleClaimedAt })
    .from(recoveryAnswers)
    .limit(2);
  if (rows.length > 1) throw new Error('more than one own recovery_answers row');
  return rows[0];
}

/**
 * The first save. A second one for the same account is a unique violation on recovery_answers_pkey; a handle held by a
 * claim that is not older than `claimedAt` is one on recovery_answers_email_handle_key.
 */
export async function insertOwnAnswers(tx: IdentityTx, emailHandle: Buffer, claimedAt: Date, hashes: AnswerHashes): Promise<void> {
  await tx.insert(recoveryAnswersInsert).values({ emailHandle, handleClaimedAt: claimedAt, ...hashes });
}

/** Replaces both answers of the caller's own row. The handle is moved only by claimOwnHandle. */
export async function replaceOwnAnswers(tx: IdentityTx, hashes: AnswerHashes): Promise<void> {
  await tx.update(recoveryAnswersUpdate).set(hashes);
}

/**
 * Moves the caller's own row to a handle claimed by a token issued at `claimedAt`, when the row's own claim is older (or
 * the row was released). True when the row moved. A handle still held by another row is a unique violation on
 * recovery_answers_email_handle_key (the caller releases an older holder first, with releaseDeclaredHandle).
 */
export async function claimOwnHandle(tx: IdentityTx, emailHandle: Buffer, claimedAt: Date): Promise<boolean> {
  const rows = await tx
    .update(recoveryAnswersUpdate)
    .set({ emailHandle, handleClaimedAt: claimedAt })
    .where(or(isNull(recoveryAnswersUpdate.handleClaimedAt), lt(recoveryAnswersUpdate.handleClaimedAt, claimedAt)))
    .returning({ emailHandle: recoveryAnswersUpdate.emailHandle });
  return rows.length > 0;
}

// --- as app_recovery -----------------------------------------------------------------------------------------------------

/** The answers row of the declared handle: zero or one. More than one means the policy is wrong. */
export async function readDeclaredAnswers(tx: IdentityTx) {
  const rows = await tx.select().from(recoveryAnswers).limit(2);
  if (rows.length > 1) throw new Error('more than one recovery_answers row for one handle');
  return rows[0];
}

/**
 * The row of the declared handle when another account holds it under a claim OLDER than the declared one, else undefined.
 * `FOR UPDATE` makes RLS apply the release policy's USING as well, so the row comes back exactly when a release is
 * allowed. No `where`, on purpose: the policies return that row and nothing else.
 */
export async function readReleasableHolder(tx: IdentityTx): Promise<{ readonly userId: string } | undefined> {
  const rows = await tx.select({ userId: recoveryAnswers.userId }).from(recoveryAnswers).for('update').limit(2);
  if (rows.length > 1) throw new Error('more than one releasable recovery_answers row for one handle');
  return rows[0];
}

/**
 * Releases the declared handle (sets it and its claim time to NULL). NO `where` and NO `returning`, on purpose: either
 * would make Postgres check the new NULL row against the SELECT policy, which hides it, and fail. The release policy's
 * USING limits the statement to the one releasable row. Append the `handle_released` event BEFORE this: the event
 * policy binds user_id to the declared handle's row, which no longer exists afterwards.
 */
export async function releaseDeclaredHandle(tx: IdentityTx): Promise<void> {
  await tx.update(recoveryAnswersRelease).set({ emailHandle: null, handleClaimedAt: null });
}

/** Creates the throttle row of one declared subject when missing. */
export async function ensureThrottleRow(tx: IdentityTx, kind: RecoveryThrottleSubject, subjectHash: Buffer): Promise<void> {
  await tx.insert(recoveryThrottlesInsert).values({ subjectKind: kind, subjectHash }).onConflictDoNothing();
}

/**
 * Locks the declared subject's row for the rest of the transaction and says whether it is locked now (database clock).
 * Callers lock the IP row first and the handle row second, always (guardedAttempt is the only caller): one order rules
 * out deadlocks, and the row lock serialises concurrent attempts so the limits hold under concurrency.
 */
export async function lockThrottle(tx: IdentityTx, kind: RecoveryThrottleSubject): Promise<ThrottleState> {
  const result = await tx.execute(sql`
    select (is_locked_permanently or (locked_until is not null and locked_until > now())) as locked,
           is_locked_permanently as permanent,
           (case when is_locked_permanently or locked_until is null or locked_until = 'infinity'::timestamptz or locked_until <= now() then 1
                 else greatest(1, ceil(extract(epoch from (locked_until - now())))) end)::integer as retry_after,
           (limited_noted_until is not null and limited_noted_until = locked_until) as noted
    from nestly.recovery_throttles
    where subject_kind = ${kind}
    for update`);
  const [row, ...others] = throttleStateRows.parse(result);
  if (row === undefined || others.length > 0) throw new Error('recovery_throttles row missing or duplicated for a declared subject');
  return { locked: row.locked, permanent: row.permanent, retryAfterSeconds: row.retry_after, noted: row.noted };
}

/** Records that the limited event of the declared subject's current lock has been written (one per subject per lock). */
export async function markLimitedNoted(tx: IdentityTx, kind: RecoveryThrottleSubject): Promise<void> {
  await tx.execute(sql`
    update nestly.recovery_throttles
    set limited_noted_until = locked_until
    where subject_kind = ${kind}`);
}

/**
 * Counts one failure on the declared subject and locks it when a limit is reached, in one statement with the database
 * clock. A window starts at the first failure after the previous one expired and does not slide; reaching a limit sets
 * locked_until to the later of its current value and now() plus the lock. An IP has no 24-hour window: its long columns
 * stay NULL and 0 (the table's checks).
 */
export async function recordFailure(tx: IdentityTx, kind: RecoveryThrottleSubject, limits: ThrottleLimits): Promise<void> {
  const { short, long } = limits;
  const hasLong = long !== null;
  const longWindow = long?.windowSeconds ?? 0;
  const longLimit = long?.failures ?? 0;
  const longLock = long?.lockSeconds ?? 0;
  await tx.execute(sql`
    with cur as (
      select s.subject_kind, s.subject_hash,
             (s.short_window_started_at is null
              or s.short_window_started_at + make_interval(secs => ${short.windowSeconds}::integer) <= now()) as short_fresh,
             (${hasLong}::boolean and (s.long_window_started_at is null
              or s.long_window_started_at + make_interval(secs => ${longWindow}::integer) <= now())) as long_fresh,
             s.short_failures, s.long_failures
      from nestly.recovery_throttles s
      where s.subject_kind = ${kind}
    ), nxt as (
      select c.subject_kind, c.subject_hash, c.short_fresh, c.long_fresh,
             (case when c.short_fresh then 1 else c.short_failures + 1 end) as short_next,
             (case when not ${hasLong}::boolean then 0 when c.long_fresh then 1 else c.long_failures + 1 end) as long_next
      from cur c
    )
    update nestly.recovery_throttles t
    set short_window_started_at = case when n.short_fresh then now() else t.short_window_started_at end,
        short_failures = n.short_next,
        long_window_started_at = case when n.long_fresh then now() else t.long_window_started_at end,
        long_failures = n.long_next,
        locked_until = case
          when n.short_next >= ${short.failures}::integer or (${hasLong}::boolean and n.long_next >= ${longLimit}::integer)
          then greatest(t.locked_until, now() + make_interval(secs => greatest(
                 case when n.short_next >= ${short.failures}::integer then ${short.lockSeconds}::integer else 0 end,
                 case when ${hasLong}::boolean and n.long_next >= ${longLimit}::integer then ${longLock}::integer else 0 end)))
          else t.locked_until end
    from nxt n
    where t.subject_kind = n.subject_kind and t.subject_hash = n.subject_hash`);
}

/**
 * FR-ADMIN-013, AC-126: a release by the Admin later than the declared handle's ladder start restarts the ladder from zero and lifts its
 * lock (the release gives no access: the attempt is then checked as usual). app_recovery sees only the declared handle's account's
 * releases (recovery_lock_releases_select_recovery), so no `where` names an account. Runs after the handle row is locked.
 */
export async function applyRelease(tx: IdentityTx): Promise<void> {
  await tx.execute(sql`
    update nestly.recovery_throttles t
    set ladder_failures = 0, is_locked_permanently = false, locked_until = null, limited_noted_until = null, ladder_started_at = r.latest
    from (select max(released_at) as latest from nestly.recovery_lock_releases) r
    where t.subject_kind = 'handle' and r.latest is not null and r.latest > coalesce(t.ladder_started_at, '-infinity'::timestamptz)`);
}

/**
 * NFR-SEC-010: counts one failure on the declared handle's ladder, in one statement with the database clock. Reaching a step locks the
 * handle for that step's time (the later of the current lock and now() plus it); reaching `permanentAt` locks it for good.
 */
export async function recordHandleFailure(tx: IdentityTx, ladder: LadderLimits): Promise<void> {
  const next = sql`(t.ladder_failures + 1)`;
  const steps = sql.join(
    ladder.steps.map((step) => sql`when ${next} = ${step.failures}::integer then greatest(t.locked_until, now() + make_interval(secs => ${step.lockSeconds}::integer))`),
    sql` `,
  );
  await tx.execute(sql`
    update nestly.recovery_throttles t
    set ladder_failures = least(${next}, 32767),
        is_locked_permanently = t.is_locked_permanently or ${next} >= ${ladder.permanentAt}::integer,
        locked_until = case when ${next} >= ${ladder.permanentAt}::integer then 'infinity'::timestamptz ${steps} else t.locked_until end
    where t.subject_kind = 'handle'`);
}

/** A success (AC-113): the declared handle's ladder restarts from zero. */
export async function recordHandleSuccess(tx: IdentityTx): Promise<void> {
  await tx.execute(sql`
    update nestly.recovery_throttles
    set ladder_failures = 0, ladder_started_at = now()
    where subject_kind = 'handle'`);
}

/** Appends one audit row. The policy forces `userId` to the account of the declared handle (or none). */
export async function insertEvent(tx: IdentityTx, event: RecoveryEvent): Promise<void> {
  await tx.insert(recoveryEventsInsert).values(event);
}
