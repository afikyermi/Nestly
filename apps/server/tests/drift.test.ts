import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { afterAll, describe, expect, it } from 'vitest';
import { compareColumns, drizzleColumns, normalizeType, parseCatalog, type ColumnShape } from '../scripts/drift.js';

// I1 F1.1 part b, spec criterion 20: "CI fails when the Drizzle schema names a column that is missing from the migrated
// database, or that differs from it in type or nullability."
// Criterion 10 (the columns equal the lists approved in schema.md) is asserted on the real Drizzle schema through the
// command CI runs, against a catalog built from schema.md's lists -- not from the schema file.

const TZ = 'timestamp with time zone';
const col = (table: string, column: string, type: string, notNull: boolean, schema = 'nestly'): ColumnShape => ({
  schema,
  table,
  column,
  type,
  notNull,
});

// schema.md, "nestly.users" and "nestly.regular_profiles": name, type, nullability.
const APPROVED: ColumnShape[] = [
  col('users', 'id', 'uuid', true),
  col('users', 'account_type', 'text', true),
  col('users', 'status', 'text', true),
  col('users', 'created_at', TZ, true),
  col('regular_profiles', 'user_id', 'uuid', true),
  col('regular_profiles', 'account_type', 'text', true),
  col('regular_profiles', 'full_name', 'text', true),
  col('regular_profiles', 'gender', 'text', false),
  col('regular_profiles', 'created_at', TZ, true),
  // F2.3a (.work/profile-privacy/schema.md "Change"): the three privacy settings, NOT NULL with a default.
  col('regular_profiles', 'profile_visibility', 'text', true),
  col('regular_profiles', 'is_empty_journey_sentence_shown', 'boolean', true),
  col('regular_profiles', 'is_child_birthday_shared', 'boolean', true),
];

// F1.4 part a (schema.md, three new tables): what the migrated database really holds, `legal_consents.accepted_at`
// included. The Drizzle schema deliberately omits accepted_at (the INSERT policy forces the database's clock), so the
// catalog may hold a column Drizzle does not name. This is the catalog the command test feeds to `db:drift`.
const APPROVED_F14: ColumnShape[] = [
  col('journey_contexts', 'id', 'uuid', true),
  col('journey_contexts', 'user_id', 'uuid', true),
  col('journey_contexts', 'stage', 'text', true),
  col('journey_contexts', 'due_date', 'date', false),
  col('journey_contexts', 'created_at', TZ, true),
  col('children', 'id', 'uuid', true),
  col('children', 'user_id', 'uuid', true),
  col('children', 'slot', 'smallint', true),
  col('children', 'name', 'text', true),
  col('children', 'sex', 'text', true),
  col('children', 'birth_date', 'date', true),
  col('children', 'created_at', TZ, true),
  col('legal_consents', 'id', 'uuid', true),
  col('legal_consents', 'user_id', 'uuid', true),
  col('legal_consents', 'terms_version', 'text', true),
  col('legal_consents', 'privacy_version', 'text', true),
  col('legal_consents', 'has_declared_18_plus', 'boolean', true),
  col('legal_consents', 'has_declared_qualification', 'boolean', true), // I11 follow-ups (a Professional's qualification declaration)
  col('legal_consents', 'accepted_at', TZ, true),
];
// F1.6 part a (schema.md, three new tables): what the migrated database really holds. The Drizzle schema may name fewer
// columns (a write model names only the granted ones), never a column the database lacks.
const APPROVED_F16: ColumnShape[] = [
  col('recovery_answers', 'user_id', 'uuid', true),
  col('recovery_answers', 'email_handle', 'bytea', false),
  col('recovery_answers', 'handle_claimed_at', TZ, false),
  col('recovery_answers', 'question_1', 'text', true),
  col('recovery_answers', 'question_2', 'text', true),
  col('recovery_answers', 'answer_hash_1', 'bytea', true),
  col('recovery_answers', 'answer_salt_1', 'bytea', true),
  col('recovery_answers', 'answer_hash_2', 'bytea', true),
  col('recovery_answers', 'answer_salt_2', 'bytea', true),
  col('recovery_answers', 'scrypt_log_n', 'smallint', true),
  col('recovery_answers', 'scrypt_r', 'smallint', true),
  col('recovery_answers', 'scrypt_p', 'smallint', true),
  col('recovery_answers', 'created_at', TZ, true),
  col('recovery_throttles', 'subject_kind', 'text', true),
  col('recovery_throttles', 'subject_hash', 'bytea', true),
  col('recovery_throttles', 'short_window_started_at', TZ, false),
  col('recovery_throttles', 'short_failures', 'smallint', true),
  col('recovery_throttles', 'long_window_started_at', TZ, false),
  col('recovery_throttles', 'long_failures', 'smallint', true),
  col('recovery_throttles', 'locked_until', TZ, false),
  col('recovery_throttles', 'limited_noted_until', TZ, false),
  col('recovery_events', 'id', 'uuid', true),
  col('recovery_events', 'kind', 'text', true),
  col('recovery_events', 'user_id', 'uuid', false),
  col('recovery_events', 'handle_hash', 'bytea', true),
  col('recovery_events', 'ip_hash', 'bytea', true),
  col('recovery_events', 'occurred_at', TZ, true),
];
// F2.0 part a (schema.md, identity_link_checks): what the migrated database holds.
const APPROVED_F20: ColumnShape[] = [
  col('identity_link_checks', 'user_id', 'uuid', true),
  col('identity_link_checks', 'verdict', 'text', true),
  col('identity_link_checks', 'checked_at', TZ, true),
  col('identity_link_checks', 'checked_session_id', 'uuid', true),
  col('identity_link_checks', 'cleared_at', TZ, false),
  col('identity_link_checks', 'clearing_session_id', 'uuid', false),
  col('identity_link_checks', 'password_set_at', TZ, false),
];
// F2.4a (schema.md "Migration", spec c12): what the migrated database holds. 11 + 2 columns.
const APPROVED_F24A: ColumnShape[] = [
  col('friendships', 'id', 'uuid', true),
  col('friendships', 'requester_id', 'uuid', true),
  col('friendships', 'addressee_id', 'uuid', true),
  col('friendships', 'status', 'text', true),
  col('friendships', 'requester_status', 'text', true),
  col('friendships', 'addressee_status', 'text', true),
  col('friendships', 'requested_at', TZ, true),
  col('friendships', 'responded_at', TZ, false),
  col('friendships', 'cancelled_at', TZ, false),
  col('friendships', 'removed_at', TZ, false),
  col('friendships', 'created_at', TZ, true),
  col('regular_names', 'user_id', 'uuid', true),
  col('regular_names', 'full_name', 'text', true),
];
// F2.4c1 (schema.md "Migration"): the profile-open limit's Configuration, the per-account open times and the Security events.
// 4 + 3 + 4 columns; opened_at is a timestamptz array (PostgreSQL's own spelling, format_type()).
const APPROVED_F24C1: ColumnShape[] = [
  col('security_limits', 'limit_key', 'text', true),
  col('security_limits', 'max_count', 'integer', true),
  col('security_limits', 'window_seconds', 'integer', true),
  col('security_limits', 'updated_at', TZ, true),
  col('profile_open_counts', 'user_id', 'uuid', true),
  col('profile_open_counts', 'opened_at', `${TZ}[]`, true),
  col('profile_open_counts', 'is_refusal_recorded', 'boolean', true),
  col('security_events', 'id', 'uuid', true),
  col('security_events', 'kind', 'text', true),
  col('security_events', 'user_id', 'uuid', true),
  col('security_events', 'occurred_at', TZ, true),
];
// F3.1a (schema.md, posts): the columns Drizzle declares.
const APPROVED_F31A: ColumnShape[] = [
  col('posts', 'id', 'uuid', true),
  col('posts', 'author_id', 'uuid', false), col('posts', 'audience', 'text', true),
  col('posts', 'body', 'text', false), col('posts', 'stage_tag', 'text', false),
  col('posts', 'created_at', TZ, true),
  col('posts', 'is_anonymous', 'boolean', true), col('posts', 'group_id', 'uuid', false),
  // I11 (OP-038): the help-request marking, written by a Regular's post.
  col('posts', 'is_help_request', 'boolean', true),
];
// I7 (migration 20261020400000): notifications, preferences, People Search counts and the Intent Signal, as Drizzle declares them.
const APPROVED_I7: ColumnShape[] = [
  col('notifications', 'id', 'uuid', true), col('notifications', 'recipient_id', 'uuid', true), col('notifications', 'type', 'text', true),
  col('notifications', 'actor_id', 'uuid', false), col('notifications', 'target_kind', 'text', true), col('notifications', 'target_id', 'uuid', true),
  col('notifications', 'subject_id', 'uuid', true), col('notifications', 'is_critical', 'boolean', true), col('notifications', 'created_at', TZ, true),
  col('notifications', 'read_at', TZ, false),
  col('notification_preferences', 'user_id', 'uuid', true), col('notification_preferences', 'category', 'text', true),
  col('notification_preferences', 'is_in_app_enabled', 'boolean', true), col('notification_preferences', 'is_push_enabled', 'boolean', true),
  col('friend_content_notification_preferences', 'user_id', 'uuid', true), col('friend_content_notification_preferences', 'friend_id', 'uuid', true),
  col('friend_content_notification_preferences', 'is_enabled', 'boolean', true),
  col('people_search_counts', 'user_id', 'uuid', true), col('people_search_counts', 'searched_at', `${TZ}[]`, true),
  col('people_search_counts', 'is_refusal_recorded', 'boolean', true),
  col('search_intents', 'id', 'uuid', true), col('search_intents', 'user_id', 'uuid', true), col('search_intents', 'topic', 'text', true),
  col('search_intents', 'created_at', TZ, true),
];
// I6 (migration 20261020100000): trackers, cycle and status guides, the columns Drizzle declares.
const APPROVED_I6: ColumnShape[] = [
  col('tracker_events', 'id', 'uuid', true), col('tracker_events', 'user_id', 'uuid', true), col('tracker_events', 'child_id', 'uuid', true),
  col('tracker_events', 'kind', 'text', true), col('tracker_events', 'occurred_at', TZ, true), col('tracker_events', 'ended_at', TZ, false),
  col('tracker_events', 'amount_ml', 'smallint', false), col('tracker_events', 'choice', 'text', false), col('tracker_events', 'name', 'text', false),
  col('tracker_events', 'dosage', 'text', false), col('tracker_events', 'weight_kg', 'numeric(5,2)', false),
  col('tracker_events', 'height_cm', 'numeric(4,1)', false), col('tracker_events', 'head_cm', 'numeric(4,1)', false),
  col('tracker_events', 'note', 'text', false), col('tracker_events', 'created_at', TZ, true),
  col('cycle_entries', 'id', 'uuid', true), col('cycle_entries', 'user_id', 'uuid', true), col('cycle_entries', 'start_date', 'date', true),
  col('cycle_entries', 'cycle_length_days', 'smallint', true), col('cycle_entries', 'created_at', TZ, true),
  col('status_guides', 'id', 'uuid', true), col('status_guides', 'stage_kind', 'text', true), col('status_guides', 'range_from', 'smallint', false),
  col('status_guides', 'range_to', 'smallint', false), col('status_guides', 'title', 'text', true), col('status_guides', 'body', 'text', true),
  col('status_guides', 'source', 'text', true), col('status_guides', 'source_checked_on', 'date', false), col('status_guides', 'status', 'text', true),
  col('status_guides', 'published_at', TZ, false), col('status_guides', 'created_at', TZ, true),
];
// I12 (migration 20261022600000): the Marketplace listings and Sponsored Products, as Drizzle declares them.
const APPROVED_I12: ColumnShape[] = [
  col('marketplace_listings', 'id', 'uuid', true), col('marketplace_listings', 'owner_id', 'uuid', true), col('marketplace_listings', 'owner_account_type', 'text', true),
  col('marketplace_listings', 'owner_status', 'text', true), col('marketplace_listings', 'title', 'text', true), col('marketplace_listings', 'category', 'text', true),
  col('marketplace_listings', 'item_condition', 'text', true), col('marketplace_listings', 'price', 'integer', false), col('marketplace_listings', 'city', 'text', true),
  col('marketplace_listings', 'status', 'text', true), col('marketplace_listings', 'sold_at', TZ, false), col('marketplace_listings', 'is_hidden', 'boolean', true),
  col('marketplace_listings', 'hidden_at', TZ, false), col('marketplace_listings', 'hidden_by', 'uuid', false), col('marketplace_listings', 'expires_at', TZ, true),
  col('marketplace_listings', 'created_at', TZ, true), col('marketplace_listings', 'updated_at', TZ, true),
  col('sponsored_products', 'id', 'uuid', true), col('sponsored_products', 'sponsor_name', 'text', true), col('sponsored_products', 'title', 'text', true),
  col('sponsored_products', 'description', 'text', false), col('sponsored_products', 'category', 'text', true), col('sponsored_products', 'link_url', 'text', false),
  col('sponsored_products', 'status', 'text', true), col('sponsored_products', 'created_by', 'uuid', false), col('sponsored_products', 'published_at', TZ, false),
  col('sponsored_products', 'created_at', TZ, true), col('sponsored_products', 'updated_at', TZ, true),
];
const APPROVED_ALL: ColumnShape[] = [...APPROVED, ...APPROVED_F14, ...APPROVED_F16, ...APPROVED_F20, ...APPROVED_F24A, ...APPROVED_F24C1, ...APPROVED_F31A, ...APPROVED_I6, ...APPROVED_I7, ...APPROVED_I12];
const APPROVED_BEFORE_F16: ColumnShape[] = [...APPROVED, ...APPROVED_F14];

const without = (rows: ColumnShape[], table: string, column: string): ColumnShape[] =>
  rows.filter((r) => !(r.table === table && r.column === column));
const changed = (rows: ColumnShape[], table: string, column: string, patch: Partial<ColumnShape>): ColumnShape[] =>
  rows.map((r) => (r.table === table && r.column === column ? { ...r, ...patch } : r));
const mentions = (problems: string[], table: string, column: string): boolean =>
  problems.some((p) => p.includes(table) && new RegExp(`\\b${column}\\b`).test(p));

// A Drizzle schema declared in the test, shaped like the approved lists.
const nestly = pgSchema('nestly');
const users = nestly.table('users', {
  id: uuid('id').primaryKey(),
  accountType: text('account_type').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
const regularProfiles = nestly.table('regular_profiles', {
  userId: uuid('user_id').primaryKey(),
  accountType: text('account_type').notNull(),
  fullName: text('full_name').notNull(),
  gender: text('gender'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

describe('[F1.1-b c20] compareColumns: the Drizzle schema against the migrated database', () => {
  it('reports nothing when every Drizzle column exists with the same type and nullability', () => {
    expect(compareColumns(APPROVED, APPROVED)).toEqual([]);
  });

  it('reports a Drizzle column that is missing from the database, and names it', () => {
    const problems = compareColumns(APPROVED, without(APPROVED, 'users', 'status'));
    expect(problems.length).toBeGreaterThan(0);
    expect(mentions(problems, 'users', 'status')).toBe(true);
  });

  it('reports each column of a table that is missing from the database altogether', () => {
    const database = APPROVED.filter((r) => r.table !== 'regular_profiles');
    const problems = compareColumns(APPROVED, database);
    for (const column of ['user_id', 'account_type', 'full_name', 'gender', 'created_at']) {
      expect(mentions(problems, 'regular_profiles', column), `column ${column} not reported`).toBe(true);
    }
  });

  it('reports every column when the database catalog is empty (a migration that did not run)', () => {
    const problems = compareColumns(APPROVED, []);
    expect(problems.length).toBeGreaterThanOrEqual(APPROVED.length);
  });

  it('reports a column that exists only in another schema (public.users does not satisfy nestly.users)', () => {
    const database = APPROVED.map((r) => ({ ...r, schema: 'public' }));
    const problems = compareColumns(APPROVED, database);
    expect(problems.length).toBeGreaterThanOrEqual(APPROVED.length);
  });

  it('reports a type mismatch and names the column', () => {
    const problems = compareColumns(APPROVED, changed(APPROVED, 'users', 'id', { type: 'text' }));
    expect(problems.length).toBeGreaterThan(0);
    expect(mentions(problems, 'users', 'id')).toBe(true);
  });

  it('reports a timestamp without time zone where the database has timestamp with time zone, and the other way round', () => {
    const naive = compareColumns(changed(APPROVED, 'users', 'created_at', { type: 'timestamp' }), APPROVED);
    expect(mentions(naive, 'users', 'created_at')).toBe(true);
    const tzDrizzle = compareColumns(APPROVED, changed(APPROVED, 'users', 'created_at', { type: 'timestamp without time zone' }));
    expect(mentions(tzDrizzle, 'users', 'created_at')).toBe(true);
  });

  it('reports a nullability mismatch in both directions and names the column', () => {
    const drizzleStricter = compareColumns(changed(APPROVED, 'regular_profiles', 'gender', { notNull: true }), APPROVED);
    expect(mentions(drizzleStricter, 'regular_profiles', 'gender')).toBe(true);
    const databaseLooser = compareColumns(APPROVED, changed(APPROVED, 'users', 'status', { notNull: false }));
    expect(mentions(databaseLooser, 'users', 'status')).toBe(true);
    const drizzleLooser = compareColumns(changed(APPROVED, 'users', 'status', { notNull: false }), APPROVED);
    expect(mentions(drizzleLooser, 'users', 'status')).toBe(true);
  });

  it('reports every mismatch, not just the first', () => {
    let database = without(APPROVED, 'users', 'status');
    database = changed(database, 'users', 'id', { type: 'text' });
    database = changed(database, 'regular_profiles', 'gender', { notNull: true });
    const problems = compareColumns(APPROVED, database);
    expect(mentions(problems, 'users', 'status')).toBe(true);
    expect(mentions(problems, 'users', 'id')).toBe(true);
    expect(mentions(problems, 'regular_profiles', 'gender')).toBe(true);
  });

  it('does not pass vacuously: a Drizzle schema that names no column is itself a problem', () => {
    expect(compareColumns([], APPROVED).length).toBeGreaterThan(0);
    expect(compareColumns([], []).length).toBeGreaterThan(0);
  });

  it('compares types by their meaning, not their spelling (case, spacing, varchar/character varying)', () => {
    const db = [col('t', 'a', 'uuid', true), col('t', 'b', 'character varying(60)', true), col('t', 'c', 'numeric(10,2)', true)];
    const drizzle = [col('t', 'a', 'UUID', true), col('t', 'b', 'varchar(60)', true), col('t', 'c', 'numeric(10, 2)', true)];
    expect(compareColumns(drizzle, db)).toEqual([]);
  });

  it('still reports different lengths, a bounded type against an unbounded one, and different types', () => {
    const db = [col('t', 'b', 'character varying(61)', true), col('t', 'c', 'character varying(60)', true), col('t', 'd', 'varchar', true)];
    const drizzle = [col('t', 'b', 'varchar(60)', true), col('t', 'c', 'varchar', true), col('t', 'd', 'text', true)];
    const problems = compareColumns(drizzle, db);
    for (const column of ['b', 'c', 'd']) expect(mentions(problems, 't', column), `column ${column}`).toBe(true);
  });

  it('normalizeType gives one spelling to one type and different spellings to different types', () => {
    expect(normalizeType(' VARCHAR (60) ')).toBe(normalizeType('character varying(60)'));
    expect(normalizeType('timestamp')).toBe(normalizeType('timestamp without time zone'));
    expect(normalizeType('timestamp')).not.toBe(normalizeType('timestamp with time zone'));
    expect(normalizeType('uuid')).not.toBe(normalizeType('text'));
  });
});

describe('[F1.1-b c20] drizzleColumns: reading the Drizzle side', () => {
  it('reads schema, table, column, type and nullability of every table the module exports, and ignores the rest', () => {
    const shapes = drizzleColumns({ users, regularProfiles, notATable: 42, alsoNot: { name: 'x' }, nothing: undefined });
    expect(shapes).toHaveLength(9);
    expect(shapes.every((s) => s.schema === 'nestly')).toBe(true);
    const find = (table: string, column: string): ColumnShape | undefined => shapes.find((s) => s.table === table && s.column === column);
    expect(find('users', 'account_type')).toMatchObject({ type: 'text', notNull: true });
    expect(find('users', 'id')).toMatchObject({ type: 'uuid', notNull: true });
    expect(find('regular_profiles', 'gender')).toMatchObject({ type: 'text', notNull: false });
    expect(find('regular_profiles', 'created_at')?.type).toBe(TZ);
  });

  it('matches the approved lists when the declared schema is right (the end-to-end happy path)', () => {
    expect(compareColumns(drizzleColumns({ users, regularProfiles }), APPROVED)).toEqual([]);
  });

  it('fails end to end when the database is missing a column, has another type, or another nullability', () => {
    const declared = drizzleColumns({ users, regularProfiles });
    expect(compareColumns(declared, without(APPROVED, 'users', 'created_at')).length).toBeGreaterThan(0);
    expect(compareColumns(declared, changed(APPROVED, 'users', 'status', { type: 'integer' })).length).toBeGreaterThan(0);
    expect(compareColumns(declared, changed(APPROVED, 'regular_profiles', 'full_name', { notNull: false })).length).toBeGreaterThan(0);
  });

  it('fails end to end when the Drizzle schema names a column the database does not have', () => {
    const extra = nestly.table('users', {
      id: uuid('id').primaryKey(),
      accountType: text('account_type').notNull(),
      status: text('status').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      passwordHash: text('password_hash').notNull(),
    });
    const problems = compareColumns(drizzleColumns({ users: extra, regularProfiles }), APPROVED);
    expect(mentions(problems, 'users', 'password_hash')).toBe(true);
  });
});

describe('[F1.1-b c20] parseCatalog: a malformed catalog must not pass', () => {
  it('reads what catalog-columns.sql prints', () => {
    expect(parseCatalog(JSON.stringify(APPROVED))).toEqual(APPROVED);
    expect(parseCatalog('[]')).toEqual([]);
  });

  const firstEntry = APPROVED.slice(0, 1).map((r) => JSON.stringify(r)).join(',');

  it.each([
    ['not JSON', 'this is not json'],
    ['an empty string', ''],
    ['a truncated array', '[{"schema":"nestly","table":"users"'],
    ['a JSON object, not an array', '{"schema":"nestly"}'],
    ['JSON null', 'null'],
    ['a string', '"[]"'],
    ['an array holding a string', '["nestly.users.id"]'],
    ['an array holding null', '[null]'],
    ['an entry without notNull', '[{"schema":"nestly","table":"users","column":"id","type":"uuid"}]'],
    ['an entry without type', '[{"schema":"nestly","table":"users","column":"id","notNull":true}]'],
    ['an entry without schema', '[{"table":"users","column":"id","type":"uuid","notNull":true}]'],
    ['notNull as the string "true"', '[{"schema":"nestly","table":"users","column":"id","type":"uuid","notNull":"true"}]'],
    ['notNull as 1', '[{"schema":"nestly","table":"users","column":"id","type":"uuid","notNull":1}]'],
    ['type as a number', '[{"schema":"nestly","table":"users","column":"id","type":7,"notNull":true}]'],
    ['one bad entry among good ones', `[${firstEntry},{"schema":"nestly"}]`],
  ])('throws on %s', (_label, input) => {
    expect(() => parseCatalog(input)).toThrow();
  });
});

// The command CI runs: `npm run db:drift -w @nestly/server -- <catalog.json>` -> tsx scripts/db-drift.ts <catalog.json>.
// It compares the real Drizzle schema in apps/server with the catalog file.
describe('[F1.1-b c10 c20] the db:drift command against the real Drizzle schema', () => {
  const serverDir = fileURLToPath(new URL('..', import.meta.url));
  const workDir = mkdtempSync(join(tmpdir(), 'nestly-drift-'));
  afterAll(() => rmSync(workDir, { recursive: true, force: true }));

  let counter = 0;
  function drift(catalog: string | null): { status: number | null; output: string; error: Error | undefined } {
    const args = ['--import', 'tsx', 'scripts/db-drift.ts'];
    if (catalog !== null) {
      counter += 1;
      const file = join(workDir, `catalog-${counter}.json`);
      writeFileSync(file, catalog);
      args.push(file);
    }
    const result = spawnSync(process.execPath, args, { cwd: serverDir, encoding: 'utf8', timeout: 90_000 });
    return { status: result.status, output: `${result.stdout}${result.stderr}`, error: result.error };
  }

  const TIMEOUT = 120_000;

  it('exits 0 when the database has exactly the columns of schema.md (criterion 10: the Drizzle schema equals the approved lists)', { timeout: TIMEOUT }, () => {
    const result = drift(JSON.stringify(APPROVED_ALL));
    expect(result.error).toBeUndefined();
    expect(result.output).not.toMatch(/Cannot find|ERR_MODULE_NOT_FOUND/);
    expect(result.status, result.output).toBe(0);
  });

  it.each([
    ['a column missing from the database', without(APPROVED_ALL, 'users', 'status')],
    ['a whole table missing', APPROVED_ALL.filter((r) => r.table !== 'regular_profiles')],
    ['a type that differs', changed(APPROVED_ALL, 'users', 'id', { type: 'text' })],
    ['a timestamp without time zone', changed(APPROVED_ALL, 'regular_profiles', 'created_at', { type: 'timestamp without time zone' })],
    ['a nullable column in the database where Drizzle says not null', changed(APPROVED_ALL, 'users', 'account_type', { notNull: false })],
    ['a not null column in the database where Drizzle says nullable', changed(APPROVED_ALL, 'regular_profiles', 'gender', { notNull: true })],
    ['an empty catalog', []],
    ['posts.stage_tag missing from the database (F3.1a)', without(APPROVED_ALL, 'posts', 'stage_tag')],
    // [F1.4-a c14] the three new tables are in the Drizzle schema and checked
    ['the catalog of F1.1 alone (the three F1.4 tables missing from the database)', APPROVED],
    ['journey_contexts missing from the database', APPROVED_ALL.filter((r) => r.table !== 'journey_contexts')],
    ['children missing from the database', APPROVED_ALL.filter((r) => r.table !== 'children')],
    ['legal_consents missing from the database', APPROVED_ALL.filter((r) => r.table !== 'legal_consents')],
    ['children.birth_date missing', without(APPROVED_ALL, 'children', 'birth_date')],
    ['children.slot of another type', changed(APPROVED_ALL, 'children', 'slot', { type: 'integer' })],
    ['journey_contexts.due_date not null in the database', changed(APPROVED_ALL, 'journey_contexts', 'due_date', { notNull: true })],
    ['journey_contexts.due_date a timestamp', changed(APPROVED_ALL, 'journey_contexts', 'due_date', { type: TZ })],
    ['legal_consents.has_declared_18_plus of another type', changed(APPROVED_ALL, 'legal_consents', 'has_declared_18_plus', { type: 'text' })],
    ['legal_consents.terms_version nullable in the database', changed(APPROVED_ALL, 'legal_consents', 'terms_version', { notNull: false })],
    // [F1.6-a] the three recovery tables are in the Drizzle schema and checked
    ['the catalog of F1.1 and F1.4 alone (the three F1.6 tables missing from the database)', APPROVED_BEFORE_F16],
    ['recovery_answers missing from the database', APPROVED_ALL.filter((r) => r.table !== 'recovery_answers')],
    ['recovery_throttles missing from the database', APPROVED_ALL.filter((r) => r.table !== 'recovery_throttles')],
    ['recovery_events missing from the database', APPROVED_ALL.filter((r) => r.table !== 'recovery_events')],
    ['recovery_answers.answer_hash_1 missing', without(APPROVED_ALL, 'recovery_answers', 'answer_hash_1')],
    ['recovery_answers.email_handle of another type', changed(APPROVED_ALL, 'recovery_answers', 'email_handle', { type: 'text' })],
    ['recovery_answers.scrypt_log_n of another type', changed(APPROVED_ALL, 'recovery_answers', 'scrypt_log_n', { type: 'integer' })],
    ['recovery_answers.handle_claimed_at missing', without(APPROVED_ALL, 'recovery_answers', 'handle_claimed_at')],
    ['recovery_answers.email_handle not null in the database', changed(APPROVED_ALL, 'recovery_answers', 'email_handle', { notNull: true })],
    ['recovery_throttles.limited_noted_until missing', without(APPROVED_ALL, 'recovery_throttles', 'limited_noted_until')],
    ['recovery_answers.question_2 nullable in the database', changed(APPROVED_ALL, 'recovery_answers', 'question_2', { notNull: false })],
    ['recovery_throttles.locked_until not null in the database', changed(APPROVED_ALL, 'recovery_throttles', 'locked_until', { notNull: true })],
    ['recovery_throttles.subject_hash of another type', changed(APPROVED_ALL, 'recovery_throttles', 'subject_hash', { type: 'text' })],
    ['recovery_events.user_id not null in the database', changed(APPROVED_ALL, 'recovery_events', 'user_id', { notNull: true })],
    ['recovery_events.ip_hash missing', without(APPROVED_ALL, 'recovery_events', 'ip_hash')],
    ['security_events missing from the database', APPROVED_ALL.filter((r) => r.table !== 'security_events')],
    ['security_limits missing from the database', APPROVED_ALL.filter((r) => r.table !== 'security_limits')],
    ['profile_open_counts.opened_at not an array in the database', changed(APPROVED_ALL, 'profile_open_counts', 'opened_at', { type: TZ })],
  ])('exits non-zero for %s', { timeout: TIMEOUT }, (_label, rows) => {
    const result = drift(JSON.stringify(rows));
    expect(result.error).toBeUndefined();
    expect(result.status, result.output).not.toBe(0);
    expect(result.status).not.toBeNull();
  });

  it.each([
    ['a file that is not JSON', 'this is not json'],
    ['an empty file', ''],
    ['a JSON object, not an array', '{}'],
    ['an entry of the wrong shape', '[{"schema":"nestly"}]'],
  ])('exits non-zero for %s (a malformed catalog does not pass)', { timeout: TIMEOUT }, (_label, content) => {
    const result = drift(content);
    expect(result.status).not.toBe(0);
    expect(result.status).not.toBeNull();
  });

  it('[F1.6-a] the Drizzle schema exports the three recovery tables and the five write models named in interface.md', async () => {
    const schema = await import('../src/db/schema.js');
    const names = Object.keys(schema);
    for (const name of [
      'recoveryAnswers',
      'recoveryThrottles',
      'recoveryEvents',
      'recoveryAnswersInsert',
      'recoveryAnswersUpdate',
      'recoveryThrottlesInsert',
      'recoveryThrottlesUpdate',
      'recoveryEventsInsert',
    ]) {
      expect(names, name).toContain(name);
    }
  });

  it('exits non-zero when it is given no catalog file at all', { timeout: TIMEOUT }, () => {
    const result = drift(null);
    expect(result.status).not.toBe(0);
    expect(result.status).not.toBeNull();
  });
});
