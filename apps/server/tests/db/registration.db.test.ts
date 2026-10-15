import { createRegistrationStep1Schema, CONSENT_PRIVACY_VERSION, CONSENT_TERMS_VERSION } from '@nestly/shared';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { readDatabaseFault } from '../../src/lib/pg-error.js';
import { createRegistration, hasAccount } from '../../src/services/registration-service.js';
import { ACCOUNT_A, COLD_START_MS } from '../helpers/identity-fixtures.js';

// I1 F1.4 part b, first slice: spec criterion 10 (atomicity, through the real service and repository), criterion 9 (versions
// come from the shared constants), and the repeat-safe / already_registered promise (criterion 14 "one account per Auth
// user"; interface "already_registered iff 23505 on users_pkey"). Runs in the CI `db` job only (npm run test:db), as
// app_server, after pgTAP, against the disposable database with the fixtures of supabase/tests/setup/ loaded.
// Derived from spec.md and interface.md "part b, first slice", not from the source.
//
// Each test registers a FRESH Auth user (tests.fx_new_auth_user(): the runtime role cannot delete rows, and they commit), so
// no test depends on another's rows. The counts are read through the fixture observers, which RLS does not filter:
//   tests.fx_counts(id)  'users/profiles/journeys/children/consents'
// Route, Auth client and web are not built in this slice: nothing here calls them.

const T = { timeout: COLD_START_MS };
const TODAY = '2026-06-15';
const schema = createRegistrationStep1Schema(TODAY);
const parts = (iso: string) => {
  const [year = '', month = '', day = ''] = iso.split('-');
  return { day, month, year };
};
const empty = { day: '', month: '', year: '' };

/** A parsed (typed) step 1, built through the real schema so the test cannot invent the service's input shape. */
function step1(over: Record<string, unknown> = {}) {
  return schema.parse({
    stages: ['pregnant', 'has_child'],
    fullName: 'דנה כהן',
    parentGender: 'woman',
    dueDate: parts('2026-12-01'),
    children: [
      { name: 'נועה', sex: 'girl', birthDate: parts('2024-02-29') },
      { name: 'אלי', sex: 'boy', birthDate: parts('2022-01-15') },
    ],
    ...over,
  });
}

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
}

let database: Database;
let side: ReturnType<typeof postgres>;

async function freshUser(): Promise<string> {
  const [row] = await side`select tests.fx_new_auth_user()::text as id`;
  const id: unknown = row?.id;
  if (typeof id !== 'string') throw new Error('tests.fx_new_auth_user returned no id: is supabase/tests/setup/20_registration_fixtures.sql loaded?');
  return id;
}
async function counts(id: string): Promise<string> {
  const [row] = await side`select tests.fx_counts(${id}::uuid) as c`;
  return String(row?.c);
}
async function one(query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> {
  const rows = await query;
  return String(rows[0]?.v);
}
const journeys = (id: string) => one(side`select tests.fx_journeys(${id}::uuid) as v`);
const childrenOf = (id: string) => one(side`select tests.fx_children(${id}::uuid) as v`);
const consentOf = (id: string) => one(side`select tests.fx_consent(${id}::uuid) as v`);
/** 'terms/privacy/declared' only. The 4th field of fx_consent (accepted_at = now()) is true only inside the inserting transaction. */
async function consentVersions(id: string): Promise<string> {
  return (await consentOf(id)).split('/').slice(0, 3).join('/');
}
async function clock(): Promise<number> {
  const [row] = await side`select (extract(epoch from clock_timestamp()) * 1000)::float8 as ms`;
  const ms: unknown = row?.ms;
  if (typeof ms !== 'number') throw new Error('clock_timestamp did not return a number');
  return ms;
}
async function consentTime(id: string): Promise<number> {
  const [row] = await side`select (extract(epoch from tests.fx_consent_at(${id}::uuid)) * 1000)::float8 as ms`;
  const ms: unknown = row?.ms;
  if (typeof ms !== 'number') throw new Error('the consent has no accepted_at');
  return ms;
}
const profileOf = (id: string) => one(side`select tests.fx_profile(${id}::uuid) as v`);
const userOf = (id: string) => one(side`select tests.fx_user(${id}::uuid) as v`);

beforeAll(async () => {
  database = createDatabase(url());
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
}, COLD_START_MS);

afterEach(() => {
  vi.doUnmock('@nestly/shared');
  vi.resetModules();
});

afterAll(async () => {
  await database.close();
  await side.end({ timeout: 5 });
});

/** The error a call rejects with; a call that does not reject is a test failure. */
async function failureOf(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to reject, but it resolved');
}
/** The database fault (SQLSTATE and constraint name) behind an error; an error that is not a database fault fails the test. */
function faultOf(error: unknown): { code: string; constraint: string | undefined } {
  const fault = readDatabaseFault(error);
  if (!fault) throw new Error('the failure is not a database fault: the statement did not reach the database');
  return fault;
}

/** The service as it behaves when the shared consent constants have other values (criterion 9; criterion 10's forced failure). */
async function serviceWithVersions(terms: string, privacy: string): Promise<typeof import('../../src/services/registration-service.js')> {
  vi.resetModules();
  vi.doMock('@nestly/shared', async (original) => ({
    ...(await original<typeof import('@nestly/shared')>()),
    CONSENT_TERMS_VERSION: terms,
    CONSENT_PRIVACY_VERSION: privacy,
  }));
  return import('../../src/services/registration-service.js');
}

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.4-b c8 c10] a registration is written whole, under the new user\'s own identity', () => {
  it('[F1.4-b c8] pregnant + has_child with two children: 1 user, 1 profile, 2 journeys, 2 children, 1 consent', T, async () => {
    const id = await freshUser();
    expect(await counts(id)).toBe('0/0/0/0/0');
    expect(await hasAccount(database, { userId: id })).toBe(false);

    const outcome = await createRegistration(database, { userId: id }, step1());
    expect(outcome).toEqual({ kind: 'created' });

    expect(await counts(id)).toBe('1/1/2/2/1');
    expect(await userOf(id)).toBe('regular/active');
    expect(await profileOf(id)).toBe('דנה כהן/woman');
    expect(await journeys(id)).toBe('has_child:null ; pregnant:2026-12-01');
    expect(await childrenOf(id)).toBe('1:נועה:girl:2024-02-29 ; 2:אלי:boy:2022-01-15');
    expect(await hasAccount(database, { userId: id })).toBe(true);
  });

  it('[F1.4-b c8] children are stored in slot order, 1..n, in the order they were entered', T, async () => {
    const id = await freshUser();
    const kids = Array.from({ length: 10 }, (_, i) => ({ name: `ילד ${i + 1}`, sex: 'unknown', birthDate: parts('2023-05-05') }));
    await createRegistration(database, { userId: id }, step1({ stages: ['has_child'], dueDate: empty, children: kids }));
    const stored = await childrenOf(id);
    expect(stored.split(' ; ').map((s) => s.split(':').slice(0, 2).join(':'))).toEqual(kids.map((k, i) => `${i + 1}:${k.name}`));
    expect(await counts(id)).toBe('1/1/1/10/1');
  });

  it('[F1.4-b c8] only planning: one journey, no due date, no children', T, async () => {
    const id = await freshUser();
    await createRegistration(database, { userId: id }, step1({ stages: ['planning'], dueDate: empty, children: [], parentGender: undefined }));
    expect(await counts(id)).toBe('1/1/1/0/1');
    expect(await journeys(id)).toBe('planning:null');
    expect(await profileOf(id)).toBe('דנה כהן/-');
  });

  it('[F1.4-b c8] pregnant with the due date left empty stores null', T, async () => {
    const id = await freshUser();
    await createRegistration(database, { userId: id }, step1({ stages: ['pregnant'], dueDate: empty, children: [] }));
    expect(await journeys(id)).toBe('pregnant:null');
  });

  it('[F1.4-b c8] the due date belongs to the pregnant journey only: has_child next to it carries none', T, async () => {
    const id = await freshUser();
    await createRegistration(database, { userId: id }, step1());
    expect(await journeys(id)).toBe('has_child:null ; pregnant:2026-12-01');
  });

  it('[F1.4-b c8] a due date filled in while pregnant is NOT ticked is not stored (planning + has_child)', T, async () => {
    const id = await freshUser();
    await createRegistration(database, { userId: id }, step1({ stages: ['planning', 'has_child'], dueDate: parts('2026-12-01') }));
    expect(await journeys(id)).toBe('has_child:null ; planning:null');
  });

  it('[F1.4-b c8] the consent holds the declaration true and a time within 5 s of the request (the database\'s clock: pgTAP 21/23 prove a named accepted_at is refused)', T, async () => {
    const id = await freshUser();
    const before = await clock();
    await createRegistration(database, { userId: id }, step1());
    const after = await clock();
    expect(await consentVersions(id)).toBe(`${CONSENT_TERMS_VERSION}/${CONSENT_PRIVACY_VERSION}/true`);
    const at = await consentTime(id);
    expect(at, 'accepted_at is not before the request').toBeGreaterThanOrEqual(before - 5000);
    expect(at, 'accepted_at is not after the response').toBeLessThanOrEqual(after + 5000);
    expect(at - before, 'accepted_at within 5 s of the request').toBeLessThan(5000);
  });

  it('[F1.4-b c8] hostile text in the names is stored as data', T, async () => {
    const id = await freshUser();
    const evil = "Robert'); drop table nestly.children;--";
    await createRegistration(database, { userId: id }, step1({ fullName: evil, children: [{ name: evil.slice(0, 40), sex: 'boy', birthDate: parts('2024-02-29') }], stages: ['has_child'], dueDate: empty }));
    expect(await profileOf(id)).toBe(`${evil}/woman`);
    expect(await counts(id)).toBe('1/1/1/1/1');
  });

  it('[F1.4-b c8] two registrations for two identities do not touch each other', T, async () => {
    const x = await freshUser();
    const y = await freshUser();
    await createRegistration(database, { userId: x }, step1());
    expect(await counts(y)).toBe('0/0/0/0/0');
    expect(await hasAccount(database, { userId: y })).toBe(false);
    await createRegistration(database, { userId: y }, step1({ stages: ['planning'], dueDate: empty, children: [] }));
    expect(await counts(x)).toBe('1/1/2/2/1');
    expect(await counts(y)).toBe('1/1/1/0/1');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.4-b c9] the consent versions come from the shared constants, not from the caller', () => {
  it('[F1.4-b c9] the stored versions equal CONSENT_TERMS_VERSION and CONSENT_PRIVACY_VERSION', T, async () => {
    const id = await freshUser();
    await createRegistration(database, { userId: id }, step1());
    expect(await consentVersions(id)).toBe(`${CONSENT_TERMS_VERSION}/${CONSENT_PRIVACY_VERSION}/true`);
  });

  it('[F1.4-b c9] changing the constants changes what the next registration stores, with no other edit', T, async () => {
    const service = await serviceWithVersions('terms-test-9', 'privacy-test-9');
    const id = await freshUser();
    expect(await service.createRegistration(database, { userId: id }, step1())).toEqual({ kind: 'created' });
    expect(await consentVersions(id)).toBe('terms-test-9/privacy-test-9/true');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.4-b c10] atomicity: forcing the LAST insert (the consent) to fail leaves no row in any of the five tables', () => {
  it('[F1.4-b c10] an empty terms version fails the consent insert: the call rejects, nothing is stored, not "already registered"', T, async () => {
    const service = await serviceWithVersions('', CONSENT_PRIVACY_VERSION);
    const id = await freshUser();
    const fault = faultOf(await failureOf(service.createRegistration(database, { userId: id }, step1())));
    // it is the CONSENT insert that failed (check violation on the terms version), not an earlier statement
    expect(fault).toEqual({ code: '23514', constraint: 'legal_consents_terms_version_check' });
    // users, profile, 2 journeys and 2 children were inserted before the consent: all rolled back.
    expect(await counts(id)).toBe('0/0/0/0/0');
    expect(await hasAccount(database, { userId: id })).toBe(false);
  });

  it('[F1.4-b c10] the same for an empty privacy version, and for a 65-character version', T, async () => {
    for (const [terms, privacy, constraint] of [
      [CONSENT_TERMS_VERSION, '', 'legal_consents_privacy_version_check'],
      ['v'.repeat(65), CONSENT_PRIVACY_VERSION, 'legal_consents_terms_version_check'],
      [CONSENT_TERMS_VERSION, 'v'.repeat(65), 'legal_consents_privacy_version_check'],
    ] as const) {
      const service = await serviceWithVersions(terms, privacy);
      const id = await freshUser();
      const fault = faultOf(await failureOf(service.createRegistration(database, { userId: id }, step1())));
      expect(fault, `terms ${terms.length} / privacy ${privacy.length}`).toEqual({ code: '23514', constraint });
      expect(await counts(id), `terms ${terms.length} / privacy ${privacy.length}`).toBe('0/0/0/0/0');
    }
  });

  it('[F1.4-b c10] after the forced failure the same identity can register: a retry starts from nothing', T, async () => {
    const broken = await serviceWithVersions('', '');
    const id = await freshUser();
    const fault = faultOf(await failureOf(broken.createRegistration(database, { userId: id }, step1())));
    expect(fault.code).toBe('23514');
    expect(['legal_consents_terms_version_check', 'legal_consents_privacy_version_check']).toContain(fault.constraint);
    expect(await counts(id)).toBe('0/0/0/0/0');
    vi.doUnmock('@nestly/shared');
    vi.resetModules();
    expect(await createRegistration(database, { userId: id }, step1())).toEqual({ kind: 'created' });
    expect(await counts(id)).toBe('1/1/2/2/1');
  });

  it('[F1.4-b c10 c14] an 11th child handed straight to the service (past the schema) is refused by the database and leaves nothing', T, async () => {
    const id = await freshUser();
    const kids = Array.from({ length: 11 }, (_, i) => ({ name: `ילד ${i + 1}`, sex: 'boy', birthDate: parts('2023-05-05') }));
    const base = step1({ stages: ['has_child'], dueDate: empty });
    const eleven = { ...base, children: kids.map((k) => ({ name: k.name, sex: 'boy' as const, birthDate: '2023-05-05' })) };
    const fault = faultOf(await failureOf(createRegistration(database, { userId: id }, eleven)));
    expect(fault).toEqual({ code: '23514', constraint: 'children_slot_check' });
    expect(await counts(id)).toBe('0/0/0/0/0');
  });

  it('[F1.4-b c10] the same stage twice in the input (past the schema) is refused by the database (one journey per stage) and leaves nothing', T, async () => {
    const id = await freshUser();
    const base = step1({ stages: ['has_child'], dueDate: empty, children: [{ name: 'א', sex: 'boy', birthDate: parts('2023-05-05') }] });
    const dup = { ...base, stages: ['has_child' as const, 'has_child' as const] };
    const fault = faultOf(await failureOf(createRegistration(database, { userId: id }, dup)));
    expect(fault).toEqual({ code: '23505', constraint: 'journey_contexts_user_id_stage_key' });
    expect(await counts(id)).toBe('0/0/0/0/0');
  });

  it('[F1.4-b c10] an Auth id that does not exist cannot register: the call rejects, nothing is written', T, async () => {
    const ghost = '99999999-9999-4999-8999-999999999998';
    expect(faultOf(await failureOf(createRegistration(database, { userId: ghost }, step1()))).code).toBe('23503'); // users -> auth.users
    expect(await counts(ghost)).toBe('0/0/0/0/0');
  });

  it('[F1.4-b c10] a failure does not leak the previous identity: the next registration on the same connection is clean', T, async () => {
    const broken = await serviceWithVersions('', '');
    const a = await freshUser();
    const b = await freshUser();
    expect(faultOf(await failureOf(broken.createRegistration(database, { userId: a }, step1()))).code).toBe('23514');
    vi.doUnmock('@nestly/shared');
    vi.resetModules();
    await createRegistration(database, { userId: b }, step1());
    expect(await counts(a)).toBe('0/0/0/0/0');
    expect(await counts(b)).toBe('1/1/2/2/1');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.4-b c10 c14] a repeated creation is safe: already_registered, no row changed', () => {
  it('[F1.4-b c10] a second createRegistration for the same user returns already_registered and changes nothing', T, async () => {
    const id = await freshUser();
    expect(await createRegistration(database, { userId: id }, step1())).toEqual({ kind: 'created' });
    const before = [await counts(id), await journeys(id), await childrenOf(id), await consentOf(id), await profileOf(id)];

    expect(await createRegistration(database, { userId: id }, step1())).toEqual({ kind: 'already_registered' });

    expect([await counts(id), await journeys(id), await childrenOf(id), await consentOf(id), await profileOf(id)]).toEqual(before);
  });

  it('[F1.4-b c10] a repeat with DIFFERENT data does not overwrite or add anything', T, async () => {
    const id = await freshUser();
    await createRegistration(database, { userId: id }, step1());
    const before = [await counts(id), await journeys(id), await childrenOf(id), await consentOf(id), await profileOf(id)];
    const other = step1({ stages: ['planning'], fullName: 'Someone Else', parentGender: 'man', dueDate: empty, children: [] });
    expect(await createRegistration(database, { userId: id }, other)).toEqual({ kind: 'already_registered' });
    expect([await counts(id), await journeys(id), await childrenOf(id), await consentOf(id), await profileOf(id)]).toEqual(before);
    expect(await profileOf(id)).toBe('דנה כהן/woman');
  });

  it('[F1.4-b c10] a third and a fourth attempt still return already_registered', T, async () => {
    const id = await freshUser();
    await createRegistration(database, { userId: id }, step1());
    for (let i = 0; i < 3; i += 1) {
      expect(await createRegistration(database, { userId: id }, step1())).toEqual({ kind: 'already_registered' });
    }
    expect(await counts(id)).toBe('1/1/2/2/1');
  });

  it('[F1.4-b c10] two simultaneous creations for one identity: exactly one created, one already_registered, one account', T, async () => {
    const id = await freshUser();
    const outcomes = await Promise.all([
      createRegistration(database, { userId: id }, step1()),
      createRegistration(database, { userId: id }, step1()),
    ]);
    expect(outcomes.map((o) => o.kind).sort()).toEqual(['already_registered', 'created']);
    expect(await counts(id)).toBe('1/1/2/2/1');
  });

  it('[F1.4-b c10] five simultaneous creations: one created, four already_registered, one account', T, async () => {
    const id = await freshUser();
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => createRegistration(database, { userId: id }, step1())));
    expect(outcomes.filter((o) => o.kind === 'created')).toHaveLength(1);
    expect(outcomes.filter((o) => o.kind === 'already_registered')).toHaveLength(4);
    expect(await counts(id)).toBe('1/1/2/2/1');
  });

  it('[F1.4-b c14] an existing account (fixture a) is already_registered and its rows are unchanged', T, async () => {
    const before = [await counts(ACCOUNT_A), await journeys(ACCOUNT_A), await childrenOf(ACCOUNT_A), await consentOf(ACCOUNT_A)];
    expect(await hasAccount(database, { userId: ACCOUNT_A })).toBe(true);
    expect(await createRegistration(database, { userId: ACCOUNT_A }, step1())).toEqual({ kind: 'already_registered' });
    expect([await counts(ACCOUNT_A), await journeys(ACCOUNT_A), await childrenOf(ACCOUNT_A), await consentOf(ACCOUNT_A)]).toEqual(before);
    expect(before[0]).toBe('1/1/2/2/1');
  });

  it('[F1.4-b c14 rule 15] a SUSPENDED account is already_registered too (its row exists though it cannot see it), and changes nothing', T, async () => {
    const suspended = '50000000-0000-4000-8000-000000000051';
    const before = await counts(suspended);
    expect(before).toBe('1/1/0/0/0');
    expect(await hasAccount(database, { userId: suspended })).toBe(false);
    expect(await createRegistration(database, { userId: suspended }, step1())).toEqual({ kind: 'already_registered' });
    expect(await counts(suspended)).toBe(before);
  });

  it('[F1.4-b c14] a PROFESSIONAL account (fixture p: users row, no profile) is already_registered and gains no profile', T, async () => {
    const pro = 'd0000000-0000-4000-8000-0000000000d4';
    expect(await counts(pro)).toBe('1/0/0/0/0');
    expect(await createRegistration(database, { userId: pro }, step1())).toEqual({ kind: 'already_registered' });
    expect(await counts(pro)).toBe('1/0/0/0/0');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.4-b c14] hasAccount reads only the caller\'s own row', () => {
  it('[F1.4-b c14] false for an Auth user with no account (c) and for an id that does not exist at all', T, async () => {
    expect(await hasAccount(database, { userId: 'c0000000-0000-4000-8000-0000000000c3' })).toBe(false);
    expect(await hasAccount(database, { userId: '99999999-9999-4999-8999-999999999997' })).toBe(false);
  });
  it('[F1.4-b c14] true for active accounts a and b, false for suspended s and banned x', T, async () => {
    expect(await hasAccount(database, { userId: ACCOUNT_A })).toBe(true);
    expect(await hasAccount(database, { userId: 'b0000000-0000-4000-8000-0000000000b2' })).toBe(true);
    expect(await hasAccount(database, { userId: '50000000-0000-4000-8000-000000000051' })).toBe(false);
    expect(await hasAccount(database, { userId: 'e0000000-0000-4000-8000-0000000000e5' })).toBe(false);
  });
});
