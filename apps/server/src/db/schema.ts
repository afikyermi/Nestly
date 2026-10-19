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
  FRIENDSHIP_STATUSES,
  IDENTITY_LINK_VERDICTS,
  JOURNEY_STAGES,
  PARENT_GENDERS,
  POST_AUDIENCES,
  PROFILE_VISIBILITIES,
  RECOVERY_EVENT_KINDS,
  RECOVERY_QUESTION_IDS,
  RECOVERY_THROTTLE_SUBJECTS,
  SECURITY_EVENT_KINDS,
  SECURITY_LIMIT_KEYS,
  type AccountType,
} from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { boolean, customType, date, integer, pgSchema, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  // The owner's privacy settings (FR-PRIV-001, BR-037; migration 20261017120000). Defaults are the database's (Afik's).
  profileVisibility: text('profile_visibility', { enum: PROFILE_VISIBILITIES }).notNull().default('open'),
  isEmptyJourneySentenceShown: boolean('is_empty_journey_sentence_shown').notNull().default(true),
  isChildBirthdayShared: boolean('is_child_birthday_shared').notNull().default(true),
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

/** UPDATE target only. Names exactly the columns granted UPDATE to authenticated (migration 20261017100000). Nullable like the column (drift check). */
export const regularProfilesUpdate = nestly.table('regular_profiles', {
  fullName: text('full_name').notNull(),
  gender: text('gender', { enum: PARENT_GENDERS }),
});

/** UPDATE target only. Names exactly the privacy columns granted UPDATE to authenticated (migration 20261017120000). */
export const regularProfilesPrivacyUpdate = nestly.table('regular_profiles', {
  profileVisibility: text('profile_visibility', { enum: PROFILE_VISIBILITIES }).notNull(),
  isEmptyJourneySentenceShown: boolean('is_empty_journey_sentence_shown').notNull(),
  isChildBirthdayShared: boolean('is_child_birthday_shared').notNull(),
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

/** UPDATE target only. name, sex, birth_date are the columns granted UPDATE to authenticated (migration 20261017110000). id is for WHERE only: it has no UPDATE grant (42501). */
export const childrenUpdate = nestly.table('children', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  sex: text('sex', { enum: CHILD_SEXES }).notNull(),
  birthDate: date('birth_date', { mode: 'string' }).notNull(),
});

/** UPDATE target only. due_date is granted UPDATE (migration 20261017140000), on a pregnant row only (policy). id is for WHERE only (42501). */
export const journeyContextsUpdate = nestly.table('journey_contexts', {
  id: uuid('id').primaryKey(),
  dueDate: date('due_date', { mode: 'string' }),
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

/** UPDATE target only. Names exactly the columns granted UPDATE to authenticated; the trigger stamps both (cleared_at clock_timestamp(), Gate 2 A1; password_set_at now()). */
export const identityLinkChecksUpdate = nestly.table('identity_link_checks', {
  clearedAt: timestamp('cleared_at', { withTimezone: true }),
  passwordSetAt: timestamp('password_set_at', { withTimezone: true }),
});

// Friends (I2 F2.4a; migration 20261017160000; schema.md "Drizzle"). Rows are visible to a party while the other party is active (RLS).

/** SRS Friendship / Friend Request (§13, FR-REL-001): a request and the Friendship it becomes. Cancel is `cancelledAt`, not a status (DR-4 A). */
export const friendships = nestly.table('friendships', {
  id: uuid('id').primaryKey().defaultRandom(),
  requesterId: uuid('requester_id').notNull().default(sql`auth.uid()`),
  addresseeId: uuid('addressee_id').notNull(),
  status: text('status', { enum: FRIENDSHIP_STATUSES }).notNull().default('pending'),
  requesterStatus: text('requester_status', { enum: ACCOUNT_STATUSES }).notNull().default('active'),
  addresseeStatus: text('addressee_status', { enum: ACCOUNT_STATUSES }).notNull().default('active'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  removedAt: timestamp('removed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** INSERT target only. Names exactly the column granted INSERT to authenticated (migration 20261017160000): the requester is the caller's, set by the database. */
export const friendshipsInsert = nestly.table('friendships', {
  addresseeId: uuid('addressee_id').notNull(),
});

/** UPDATE target only. status and cancelled_at are the columns granted UPDATE (the trigger decides each move); the party ids are for WHERE only (42501 if set). */
export const friendshipsUpdate = nestly.table('friendships', {
  requesterId: uuid('requester_id').notNull(),
  addresseeId: uuid('addressee_id').notNull(),
  status: text('status', { enum: FRIENDSHIP_STATUSES }).notNull(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
});

/** DR-6 A: the full name of a Regular profile, readable by its owner and the other party of a live pair. Read only. */
export const regularNames = nestly.table('regular_names', {
  userId: uuid('user_id').primaryKey().default(sql`auth.uid()`),
  fullName: text('full_name').notNull(),
});

// The profile-open limit (I2 F2.4c1; migration 20261017170000; schema.md "Drizzle"). Drift only: no write model, never queried here. No runtime
// role holds a privilege on any of the three; only profile_view (a SECURITY DEFINER) reads and writes them, for the caller's own rows.

/** NFR-SEC-006 / BR-025 Configuration: the stored threshold and window, seeded 100 per 3600 s. A change is a migration (DR-C A). */
export const securityLimits = nestly.table('security_limits', {
  limitKey: text('limit_key', { enum: SECURITY_LIMIT_KEYS }).primaryKey(),
  maxCount: integer('max_count').notNull(),
  windowSeconds: integer('window_seconds').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Per account, the instants of the opens still inside the window, and whether the current stretch of refusals was recorded. */
export const profileOpenCounts = nestly.table('profile_open_counts', {
  userId: uuid('user_id').primaryKey(),
  openedAt: timestamp('opened_at', { withTimezone: true }).array().notNull().default(sql`'{}'`),
  isRefusalRecorded: boolean('is_refusal_recorded').notNull().default(false),
});

/** NFR-SEC-006 (5): a Security event, one per stretch of refused opens. Insert only, by profile_view. */
export const securityEvents = nestly.table('security_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: SECURITY_EVENT_KINDS }).notNull(),
  userId: uuid('user_id').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

// Posts (I3 F3.1a, F3.4; migrations 20261018100000, 20261018200000; schema.md, schema-b.md). SELECT is column-level (held_xact is never granted),
// so a query names its columns. Only the columns F3.1 and F3.4 read or write are declared (the drift check compares Drizzle to the database).

/** SRS Post (§13, FR-FEED-002): a text post as its author and an eligible viewer read it (RLS). `body` is null only for a share. */
export const posts = nestly.table('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id'),
  audience: text('audience', { enum: POST_AUDIENCES }).notNull(),
  body: text('body'),
  stageTag: text('stage_tag', { enum: JOURNEY_STAGES }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** FR-FEED-005: set at insert only (no UPDATE grant); an anonymous post has no author_id and is never friends-only. */
  isAnonymous: boolean('is_anonymous').notNull().default(false),
});

/** INSERT target only. Names the columns F3.1 and F3.4 insert, all granted INSERT to authenticated; the author is the caller's, set by the database. */
export const postsInsert = nestly.table('posts', {
  isAnonymous: boolean('is_anonymous').notNull().default(false),
  audience: text('audience', { enum: POST_AUDIENCES }).notNull(),
  body: text('body'),
  stageTag: text('stage_tag', { enum: JOURNEY_STAGES }),
});

/** UPDATE target only. audience, body and stage_tag are the columns granted UPDATE for a post's text; id is for WHERE only (42501 if set). */
export const postsUpdate = nestly.table('posts', {
  id: uuid('id').primaryKey(),
  audience: text('audience', { enum: POST_AUDIENCES }).notNull(),
  body: text('body'),
  stageTag: text('stage_tag', { enum: JOURNEY_STAGES }),
});
