import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COLD_START_MS } from '../helpers/identity-fixtures.js';

// I2 F2.3a criterion 6 (.work/profile-privacy/spec.md; schema.md "Backfill", "Rollback", "pgTAP ... pre-existing rows: a tests/db
// test seeding the five between down and up"):
//   - accounts that existed BEFORE the migration (with children, pregnant only, planning only, none, suspended) read open, sentence
//     shown, birthday on after it; the count of Regular accounts lacking any of the three is 0;
//   - the rollback removes the settings and leaves profiles, journeys and children unchanged;
//   - the rollback refuses while any row holds a non-default setting (a re-apply would silently reopen a Restricted profile).
// It runs the down script and re-applies the migration, so it needs the schema owner: OWNER_DATABASE_URL (app_owner), and
// DATABASE_URL (app_server) for the tests.* observers. Without OWNER_DATABASE_URL it is skipped: CI's db job must pass it for this
// test to run there. Rows are read through tests.fx_privacy* (setup/50_privacy_fixtures.sql), which RLS does not filter and which
// work while the columns are absent. Derived from spec.md and schema.md; file names from interface.md.

const T = { timeout: COLD_START_MS };
const VERSION = '20261017120000';
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const UP = `${REPO}supabase/migrations/${VERSION}_profile_privacy.sql`;
const DOWN = `${REPO}supabase/rollback/${VERSION}_profile_privacy.down.sql`;
const ALL_THREE = 'is_child_birthday_shared,is_empty_journey_sentence_shown,profile_visibility';
const B = 'b0000000-0000-4000-8000-0000000000b2';
const S = '50000000-0000-4000-8000-000000000051';
const OWNER_URL = process.env.OWNER_DATABASE_URL;

let owner: ReturnType<typeof postgres>;
let side: ReturnType<typeof postgres>;
let history: { version: string; name: string | null; statements: string[] | null } | undefined;

async function one(query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> {
  const rows = await query;
  return String(rows[0]?.v);
}
const privacyOf = (id: string) => one(side`select tests.fx_privacy(${id}::uuid) as v`);
const columns = () => one(side`select tests.fx_privacy_columns() as v`);
const base = () => one(side`select tests.fx_privacy_base() as v`);
// profiles_only: the db suite commits users rows with no profile (recovery fixtures), which have no settings to backfill.
const lacking = () => one(side`select tests.fx_privacy_lacking(true)::text as v`);
const historyRows = () => one(owner`select count(*)::text as v from supabase_migrations.schema_migrations where version = ${VERSION}`);
const putDirect = async (id: string, v: string, s: boolean, b: boolean): Promise<void> => {
  await side`select tests.fx_privacy_put(${id}::uuid, ${v}, ${s}, ${b})`;
};

/** Runs the down script as app_owner; returns the error message, or null when it succeeded. */
async function runDown(): Promise<string | null> {
  try {
    await owner.unsafe(readFileSync(DOWN, 'utf8')).simple();
    return null;
  } catch (error) {
    await owner.unsafe('rollback').simple().catch(() => undefined);
    return error instanceof Error ? error.message : String(error);
  }
}
/** Re-applies the migration as app_owner and puts back the history row the CLI wrote (the down script deletes it). */
async function runUp(): Promise<void> {
  await owner.unsafe(readFileSync(UP, 'utf8')).simple();
  if (history !== undefined) {
    await owner`insert into supabase_migrations.schema_migrations (version, name, statements)
                values (${history.version}, ${history.name}, ${history.statements === null ? null : owner.array(history.statements)})`;
  }
}

async function freshRegular(status: 'active' | 'suspended', name: string): Promise<string> {
  const [row] = await side`select tests.fx_new_auth_user()::text as id`;
  const id = String(row?.id);
  await side`select tests.fx_insert_user(${id}::uuid, 'regular', ${status})`;
  await side`select tests.fx_insert_profile(${id}::uuid, ${name}, null)`;
  return id;
}

describe.skipIf(OWNER_URL === undefined || OWNER_URL === '')('[F2.3a c6 OP-021] the backfill of existing accounts, and the guarded rollback', () => {
  beforeAll(async () => {
    owner = postgres(String(OWNER_URL), { max: 1, prepare: false, onnotice: () => undefined });
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL is not set: the observers run as app_server through it');
    side = postgres(dbUrl, { max: 1, prepare: false, onnotice: () => undefined });
    const [who] = await owner`select current_user::text as u`;
    expect(who?.u, 'the down script runs as the schema owner').toBe('app_owner');
    const [newest] = await owner`select max(version) as v from supabase_migrations.schema_migrations`;
    expect(newest?.v, `this test rolls back ${VERSION}: it must be the newest applied migration`).toBe(VERSION);
    const [h] = await owner`select version, name, statements from supabase_migrations.schema_migrations where version = ${VERSION}`;
    const statements: unknown = h?.statements;
    history = h === undefined ? undefined : {
      version: String(h.version),
      name: typeof h.name === 'string' ? h.name : null,
      statements: Array.isArray(statements) ? statements.map(String) : null,
    };
    expect(history, 'the history row of the migration exists before the test').toBeDefined();
    expect(await columns()).toBe(ALL_THREE);
  }, COLD_START_MS);

  afterAll(async () => {
    // Leave the database as the suite found it: the columns present and the history row back, whatever failed above.
    if (owner !== undefined && side !== undefined && (await columns()) === '') await runUp();
    await owner?.end({ timeout: 5 });
    await side?.end({ timeout: 5 });
  });

  it.each([
    ['B restricted', B, 'restricted', true, true, 'restricted/true/true'],
    ['B sentence hidden', B, 'open', false, true, 'open/false/true'],
    ['B birthday off', B, 'open', true, false, 'open/true/false'],
    ['the suspended account S restricted (status does not hide a row from the guard)', S, 'restricted', true, true, 'restricted/true/true'],
  ] as const)('[F2.3a c6 schema "Rollback"] %s: the down script refuses and changes nothing', T, async (_label, id, v, s, b, want) => {
    await putDirect(id, v, s, b);
    try {
      const before = await base();
      const error = await runDown();
      expect(error, 'the down script must refuse while a non-default setting exists').not.toBeNull();
      expect(await columns()).toBe(ALL_THREE);
      expect(await privacyOf(id)).toBe(want);
      expect(await historyRows()).toBe('1');
      expect(await base()).toBe(before);
    } finally {
      await putDirect(id, 'open', true, true);
    }
  });

  it('[F2.3a c6] all defaults: down removes the three settings and leaves users, profiles, journeys and children unchanged; '
    + 'accounts created while it is down read the defaults once it is applied again', T, async () => {
    const before = await base();
    expect(await runDown()).toBeNull();
    expect(await columns()).toBe('');
    expect(await historyRows()).toBe('0');
    expect(await privacyOf(B)).toBe('∅/∅/∅');
    expect(await base(), 'profiles, journeys and children are byte-for-byte what they were').toBe(before);

    // the five kinds of account of c6, written while the settings do not exist
    const withChildren = await freshRegular('active', 'With Children');
    await side`select tests.fx_insert_journey(${withChildren}::uuid, 'has_child')`;
    await side`select tests.fx_insert_child(${withChildren}::uuid, 1, 'נועה', 'girl', date '2023-05-04')`;
    await side`select tests.fx_insert_child(${withChildren}::uuid, 2, 'איתי', 'boy', date '2025-01-10')`;
    const pregnantOnly = await freshRegular('active', 'Pregnant Only');
    await side`select tests.fx_insert_journey(${pregnantOnly}::uuid, 'pregnant', date '2027-03-01')`;
    const planningOnly = await freshRegular('active', 'Planning Only');
    await side`select tests.fx_insert_journey(${planningOnly}::uuid, 'planning')`;
    const none = await freshRegular('active', 'No Journey');
    const suspended = await freshRegular('suspended', 'Suspended Before');
    await side`select tests.fx_insert_journey(${suspended}::uuid, 'planning')`;
    const seeded = await base();

    await runUp();
    expect(await columns()).toBe(ALL_THREE);
    expect(await historyRows()).toBe('1');
    for (const [label, id] of [['with children', withChildren], ['pregnant only', pregnantOnly], ['planning only', planningOnly],
      ['none', none], ['suspended', suspended], ['fixture B', B], ['fixture S (suspended)', S]] as const) {
      expect(await privacyOf(id), `${label}: open, sentence shown, birthday on`).toBe('open/true/true');
    }
    expect(await lacking(), 'Regular profiles lacking any of the three').toBe('0');
    expect(await base(), 'applying the migration rewrites no profile, journey or child').toBe(seeded);
  });
});
