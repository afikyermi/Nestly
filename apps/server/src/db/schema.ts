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
  JOURNEY_STAGES,
  PARENT_GENDERS,
  type AccountType,
} from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { boolean, date, pgSchema, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const nestly = pgSchema('nestly');

// A profile belongs to a Regular account only (regular_profiles_account_type_check, BR-016).
const REGULAR = 'regular' satisfies AccountType;

/** SRS User (§13): the account, and the anchor to auth.users. Read own row only, while active (RLS). */
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
