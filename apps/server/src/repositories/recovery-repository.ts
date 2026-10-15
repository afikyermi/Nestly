// The recovery rows (I1 F1.6; schema.md "Authorization" and "How the server uses it"). Every function runs inside a
// transaction its caller opened and nowhere else; which role is current (authenticated or app_recovery) is the caller's
// choice, noted on each function. Permission is the database's: no statement here filters rows for it. The lookups carry
// no `where` on the account or the handle on purpose, because the policies already return the declared handle's row and
// nothing else (a listing or a dump is not possible for either role).
//
// Throttle counters and locks use the database clock and take the limits as parameters, one statement per subject.
// recovery_events has no SELECT for anyone, so nothing here ever reads it back or asks it for RETURNING.

import { sql } from 'drizzle-orm';
import type { RecoveryEventKind, RecoveryQuestionId, RecoveryThrottleSubject } from '@nestly/shared';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import type { RecoverySubjects } from '../db/recovery-transaction.js';
import {
  recoveryAnswers,
  recoveryAnswersInsert,
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
  /** Seconds until the lock ends; meaningful only while `locked`. */
  readonly retryAfterSeconds: number;
}

export interface RecoveryEvent {
  readonly kind: RecoveryEventKind;
  readonly userId: string | null;
  readonly handleHash: Buffer;
  readonly ipHash: Buffer;
}

const throttleStateRows = z.array(z.object({ locked: z.boolean(), retry_after: z.number().int() }));

// --- as authenticated ---------------------------------------------------------------------------------------------------

/** The caller's own handle, or undefined when they have no answers. Only the three granted columns are selectable. */
export async function readOwnHandle(tx: IdentityTx): Promise<Buffer | undefined> {
  const rows = await tx.select({ emailHandle: recoveryAnswers.emailHandle }).from(recoveryAnswers).limit(2);
  if (rows.length > 1) throw new Error('more than one own recovery_answers row');
  return rows[0]?.emailHandle;
}

/** Whether the caller has saved answers (GET /api/me). Reads the key column only. */
export async function hasOwnAnswers(tx: IdentityTx): Promise<boolean> {
  const rows = await tx.select({ userId: recoveryAnswers.userId }).from(recoveryAnswers).limit(1);
  return rows.length > 0;
}

/** The first save. A second one for the same account is a unique violation on recovery_answers_pkey. */
export async function insertOwnAnswers(tx: IdentityTx, emailHandle: Buffer, hashes: AnswerHashes): Promise<void> {
  await tx.insert(recoveryAnswersInsert).values({ emailHandle, ...hashes });
}

/** Replaces both answers of the caller's own row. email_handle is not granted for UPDATE and never changes. */
export async function replaceOwnAnswers(tx: IdentityTx, hashes: AnswerHashes): Promise<void> {
  await tx.update(recoveryAnswersUpdate).set(hashes);
}

// --- as app_recovery -----------------------------------------------------------------------------------------------------

/** The answers row of the declared handle: zero or one. More than one means the policy is wrong. */
export async function readDeclaredAnswers(tx: IdentityTx) {
  const rows = await tx.select().from(recoveryAnswers).limit(2);
  if (rows.length > 1) throw new Error('more than one recovery_answers row for one handle');
  return rows[0];
}

/** Creates the two throttle rows when missing, handle first and IP second. */
export async function ensureThrottleRows(tx: IdentityTx, subjects: RecoverySubjects): Promise<void> {
  await tx
    .insert(recoveryThrottlesInsert)
    .values({ subjectKind: 'handle', subjectHash: subjects.handle })
    .onConflictDoNothing();
  await tx.insert(recoveryThrottlesInsert).values({ subjectKind: 'ip', subjectHash: subjects.ip }).onConflictDoNothing();
}

/**
 * Locks the declared subject's row for the rest of the transaction and says whether it is locked now (database clock).
 * Callers lock the handle row first and the IP row second, always: one order rules out deadlocks, and the row lock
 * serialises concurrent attempts so the limits hold under concurrency.
 */
export async function lockThrottle(tx: IdentityTx, kind: RecoveryThrottleSubject): Promise<ThrottleState> {
  const result = await tx.execute(sql`
    select (locked_until is not null and locked_until > now()) as locked,
           greatest(1, ceil(extract(epoch from (locked_until - now()))))::integer as retry_after
    from nestly.recovery_throttles
    where subject_kind = ${kind}
    for update`);
  const [row, ...others] = throttleStateRows.parse(result);
  if (row === undefined || others.length > 0) throw new Error('recovery_throttles row missing or duplicated for a declared subject');
  return { locked: row.locked, retryAfterSeconds: row.retry_after };
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

/** Appends one audit row. The policy forces `userId` to the account of the declared handle (or none). */
export async function insertEvent(tx: IdentityTx, event: RecoveryEvent): Promise<void> {
  await tx.insert(recoveryEventsInsert).values(event);
}
