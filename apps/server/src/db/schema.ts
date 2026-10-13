// The Drizzle schema of the product schema `nestly` — typing only (I1 F1.1 part b, schema.md "Conventions": Drizzle).
//
// The DDL source of truth is the SQL in supabase/migrations/. drizzle-kit never generates or pushes a migration from
// this file. Policies, functions, grants and CHECK constraints live only in SQL. This file mirrors each column's name,
// type and nullability, and CI fails when it drifts from the migrated database (criterion 20,
// apps/server/scripts/db-drift.ts). Defaults are declared only so insert types leave them optional: the database
// sets every id from auth.uid() (platform rule 12), never the client.

import { ACCOUNT_STATUSES, ACCOUNT_TYPES, PARENT_GENDERS, type AccountType } from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
