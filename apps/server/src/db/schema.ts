// The Drizzle schema of the product schema `nestly` — typing only (I1 F1.1 part b, schema.md "Conventions": Drizzle).
//
// The DDL source of truth is the SQL in supabase/migrations/. drizzle-kit never generates or pushes a migration from
// this file. Policies, functions, grants and CHECK constraints live only in SQL. This file mirrors each column's name,
// type and nullability, and CI fails when it drifts from the migrated database (criterion 20,
// apps/server/scripts/db-drift.ts). Defaults are declared only so insert types leave them optional: the database
// sets every id from auth.uid() (platform rule 12), never the client.

import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  CHILD_SEXES,
  IDENTITY_LINK_VERDICTS,
  JOURNEY_STAGES,
  PARENT_GENDERS,
  RECOVERY_EVENT_KINDS,
  RECOVERY_QUESTION_IDS,
  RECOVERY_THROTTLE_SUBJECTS,
  type AccountType,
} from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { boolean, customType, date, pgSchema, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const nestly = pgSchema('nestly');

/** bytea, as a Node Buffer both ways (postgres-js sends and returns Buffer for type 17). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

// A profile belongs to a Regular account only (regular_profiles_account_type_check, BR-016).
const REGULAR = 'regular' satisfies AccountType;

/** SRS User (§13): the account, and the anchor to auth.users. Read own row only, in any status (RLS; F1.5 DR-1 A). */
export const users = nestly.table('users', {
  id: uuid('id').primaryKey().default(sql`auth.uid()`),
  accountType: text('account_type', { enum: ACCOUNT_TYPES }).notNull(),
  status: text('status', { enum: ACCOUNT_STATUSES }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** SRS RegularProfile (§13): the parent's own registration fields, 1:1 with a regular account. */
export const regularProfiles = nestly.table('regular_profiles', {
  userId: uuid('user_id').primaryKey().default(sql`auth.uid()`),
  accountType: text('account_type', { enum: [REGULAR] }).notNull().default(REGULAR),
  fullName: text('full_name').notNull(),
  gender: text('gender', { enum: PARENT_GENDERS }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** SRS JourneyContext (§13): one row per stage the parent ticked (VAL-039). Owner reads and creates only (RLS). */
export const journeyContexts = nestly.table('journey_contexts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().default(sql`auth.uid()`),
  stage: text('stage', { enum: JOURNEY_STAGES }).notNull(),
  dueDate: date('due_date', { mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** SRS Child (§13): minors' data, exactly name, sex and birth date plus `slot` (position 1-10, VAL-040). */
export const children = nestly.table('children', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().default(sql`auth.uid()`),
  slot: smallint('slot').notNull(),
  name: text('name').notNull(),
  sex: text('sex', { enum: CHILD_SEXES }).notNull(),
  birthDate: date('birth_date', { mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// accepted_at is deliberately absent: the database stamps it (default now()), and the insert policy refuses any value
// the server sends (accepted_at = now()). Not selectable through this schema until a reader needs it.
/** SRS LegalConsent (§13, FR-REG-004, BR-068): one row per acceptance event, append-only. */
export const legalConsents = nestly.table('legal_consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().default(sql`auth.uid()`),
  termsVersion: text('terms_version').notNull(),
  privacyVersion: text('privacy_version').notNull(),
  hasDeclared18Plus: boolean('has_declared_18_plus').notNull(),
});

// Write models. INSERT target only. Names exactly the columns granted INSERT (migration 20261014200000 §6); Drizzle
// names every column of the object it inserts into, and naming an ungranted column is 42501. Part b's repository
// inserts only through these. The read-side objects above stay for SELECT.

/** INSERT target only. Names exactly the columns granted INSERT (migration 20261014200000 §6). */
export const usersInsert = nestly.table('users', {
  accountType: text('account_type', { enum: ACCOUNT_TYPES }).notNull(),
  status: text('status', { enum: ACCOUNT_STATUSES }).notNull(),
});

/** INSERT target only. Names exactly the columns granted INSERT (migration 20261014200000 §6). */
export const regularProfilesInsert = nestly.table('regular_profiles', {
  fullName: text('full_name').notNull(),
  gender: text('gender', { enum: PARENT_GENDERS }),
});

/** INSERT target only. Names exactly the columns granted INSERT (migration 20261014200000 §6). */
export const journeyContextsInsert = nestly.table('journey_contexts', {
  stage: text('stage', { enum: JOURNEY_STAGES }).notNull(),
  dueDate: date('due_date', { mode: 'string' }),
});

/** INSERT target only. Names exactly the columns granted INSERT (migration 20261014200000 §6). */
export const childrenInsert = nestly.table('children', {
  slot: smallint('slot').notNull(),
  name: text('name').notNull(),
  sex: text('sex', { enum: CHILD_SEXES }).notNull(),
  birthDate: date('birth_date', { mode: 'string' }).notNull(),
});

/** INSERT target only. Names exactly the columns granted INSERT (migration 20261014200000 §6). */
export const legalConsentsInsert = nestly.table('legal_consents', {
  termsVersion: text('terms_version').notNull(),
  privacyVersion: text('privacy_version').notNull(),
  hasDeclared18Plus: boolean('has_declared_18_plus').notNull(),
});

// Password recovery (I1 F1.6; schema.md). The hashes and salts are selectable through this schema only by app_recovery
// (the recovery repository); `authenticated` is granted three columns of recovery_answers and nothing else.

/** FR-AUTH-003: the chosen pair of questions with salted scrypt hashes of the answers, and the email handle. One per account. */
export const recoveryAnswers = nestly.table('recovery_answers', {
  userId: uuid('user_id').primaryKey().default(sql`auth.uid()`),
  emailHandle: bytea('email_handle'),
  handleClaimedAt: timestamp('handle_claimed_at', { withTimezone: true }),
  question1: text('question_1', { enum: RECOVERY_QUESTION_IDS }).notNull(),
  question2: text('question_2', { enum: RECOVERY_QUESTION_IDS }).notNull(),
  answerHash1: bytea('answer_hash_1').notNull(),
  answerSalt1: bytea('answer_salt_1').notNull(),
  answerHash2: bytea('answer_hash_2').notNull(),
  answerSalt2: bytea('answer_salt_2').notNull(),
  scryptLogN: smallint('scrypt_log_n').notNull(),
  scryptR: smallint('scrypt_r').notNull(),
  scryptP: smallint('scrypt_p').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** NFR-SEC-001: failure counters and lock state per email handle or IP hash. Read and written by app_recovery only. */
export const recoveryThrottles = nestly.table('recovery_throttles', {
  subjectKind: text('subject_kind', { enum: RECOVERY_THROTTLE_SUBJECTS }).notNull(),
  subjectHash: bytea('subject_hash').notNull(),
  shortWindowStartedAt: timestamp('short_window_started_at', { withTimezone: true }),
  shortFailures: smallint('short_failures').notNull().default(0),
  longWindowStartedAt: timestamp('long_window_started_at', { withTimezone: true }),
  longFailures: smallint('long_failures').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  limitedNotedUntil: timestamp('limited_noted_until', { withTimezone: true }),
});

/** FR-ADMIN-005: the recovery audit, append-only. No runtime role can read it, so there is no read model. */
export const recoveryEvents = nestly.table('recovery_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: RECOVERY_EVENT_KINDS }).notNull(),
  userId: uuid('user_id'),
  handleHash: bytea('handle_hash').notNull(),
  ipHash: bytea('ip_hash').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

/** INSERT target only. Names exactly the columns granted INSERT to authenticated (migration 20261015200000 §6). */
export const recoveryAnswersInsert = nestly.table('recovery_answers', {
  emailHandle: bytea('email_handle'),
  handleClaimedAt: timestamp('handle_claimed_at', { withTimezone: true }),
  question1: text('question_1', { enum: RECOVERY_QUESTION_IDS }).notNull(),
  question2: text('question_2', { enum: RECOVERY_QUESTION_IDS }).notNull(),
  answerHash1: bytea('answer_hash_1').notNull(),
  answerSalt1: bytea('answer_salt_1').notNull(),
  answerHash2: bytea('answer_hash_2').notNull(),
  answerSalt2: bytea('answer_salt_2').notNull(),
  scryptLogN: smallint('scrypt_log_n').notNull(),
  scryptR: smallint('scrypt_r').notNull(),
  scryptP: smallint('scrypt_p').notNull(),
});

/** UPDATE target only. Names exactly the columns granted UPDATE to authenticated: the same as INSERT. Nullable like the column (the drift check compares every declaration). */
export const recoveryAnswersUpdate = nestly.table('recovery_answers', {
  emailHandle: bytea('email_handle'),
  handleClaimedAt: timestamp('handle_claimed_at', { withTimezone: true }),
  question1: text('question_1', { enum: RECOVERY_QUESTION_IDS }).notNull(),
  question2: text('question_2', { enum: RECOVERY_QUESTION_IDS }).notNull(),
  answerHash1: bytea('answer_hash_1').notNull(),
  answerSalt1: bytea('answer_salt_1').notNull(),
  answerHash2: bytea('answer_hash_2').notNull(),
  answerSalt2: bytea('answer_salt_2').notNull(),
  scryptLogN: smallint('scrypt_log_n').notNull(),
  scryptR: smallint('scrypt_r').notNull(),
  scryptP: smallint('scrypt_p').notNull(),
});

/**
 * UPDATE target only. Names exactly the columns granted UPDATE to app_recovery on recovery_answers: it can release a
 * handle (both NULL) and nothing else (policy recovery_answers_release_recovery).
 */
export const recoveryAnswersRelease = nestly.table('recovery_answers', {
  emailHandle: bytea('email_handle'),
  handleClaimedAt: timestamp('handle_claimed_at', { withTimezone: true }),
});

/** INSERT target only. Names exactly the columns granted INSERT to app_recovery. */
export const recoveryThrottlesInsert = nestly.table('recovery_throttles', {
  subjectKind: text('subject_kind', { enum: RECOVERY_THROTTLE_SUBJECTS }).notNull(),
  subjectHash: bytea('subject_hash').notNull(),
});

/** UPDATE target only. Names exactly the columns granted UPDATE to app_recovery. */
export const recoveryThrottlesUpdate = nestly.table('recovery_throttles', {
  shortWindowStartedAt: timestamp('short_window_started_at', { withTimezone: true }),
  shortFailures: smallint('short_failures').notNull(),
  longWindowStartedAt: timestamp('long_window_started_at', { withTimezone: true }),
  longFailures: smallint('long_failures').notNull(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  limitedNotedUntil: timestamp('limited_noted_until', { withTimezone: true }),
});

/** INSERT target only. Names exactly the columns granted INSERT to app_recovery. No SELECT exists, so never RETURNING. */
export const recoveryEventsInsert = nestly.table('recovery_events', {
  kind: text('kind', { enum: RECOVERY_EVENT_KINDS }).notNull(),
  userId: uuid('user_id'),
  handleHash: bytea('handle_hash').notNull(),
  ipHash: bytea('ip_hash').notNull(),
});

// Account takeover close (I2 F2.0 part a; schema.md). One row per Auth user; the moves are the trigger's
// (identity_link_checks_transition), the session guard reads it (nestly.session_guard()).

/** FR-AUTH-005 (S-01): the identity link verdict of one Auth user and the state of its clear. No FK (c9). */
export const identityLinkChecks = nestly.table('identity_link_checks', {
  userId: uuid('user_id').primaryKey().default(sql`auth.uid()`),
  verdict: text('verdict', { enum: IDENTITY_LINK_VERDICTS }).notNull(),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  checkedSessionId: uuid('checked_session_id').notNull(),
  clearedAt: timestamp('cleared_at', { withTimezone: true }),
  clearingSessionId: uuid('clearing_session_id'),
  passwordSetAt: timestamp('password_set_at', { withTimezone: true }),
});

/** INSERT target only. Names exactly the columns granted INSERT to authenticated (migration 20261016100000 §6). */
export const identityLinkChecksInsert = nestly.table('identity_link_checks', {
  verdict: text('verdict', { enum: IDENTITY_LINK_VERDICTS }).notNull(),
  checkedSessionId: uuid('checked_session_id').notNull(),
});

/** UPDATE target only. Names exactly the columns granted UPDATE to authenticated; the trigger stamps both with now(). */
export const identityLinkChecksUpdate = nestly.table('identity_link_checks', {
  clearedAt: timestamp('cleared_at', { withTimezone: true }),
  passwordSetAt: timestamp('password_set_at', { withTimezone: true }),
});
