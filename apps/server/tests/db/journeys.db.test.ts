import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { ACCOUNT_A, ACCOUNT_B, AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { holdingAfterWork } from '../helpers/hold-transaction.js';
import { CLOCK_NOW, EMPTY_DATE, buildRegisterApp, captureLog, child, jsonOf, parts, post, validBody } from '../helpers/register-app.js';

// I2 F2.2b1, POST /api/journeys (add a pregnancy) and PUT /api/journeys/:id (edit its due date) against the real database (CI `db`
// job, as app_server, fixtures of supabase/tests/setup/):
//   a: active, journeys pregnant (2027-03-01) + has_child, children Noa, Eli   b: active, journey planning, child Tali
//   s: suspended   x: banned   c: an Auth user, no users row
// Spec criteria (.work/journeys-children/spec.md): 14 (the due-date edit: VAL-044 on the server's own date, the registration reason,
// partial, cleared -> null, a planning or has_child id -> 404), 15 (add a pregnancy, JOURNEY_STAGES order, 409 stage_conflict, two
// concurrent POSTs -> one row), 18 / 24 for these two routes (B's id, unknown, non-uuid -> 404; stopped -> 403; unregistered -> 404),
// 11 (the logs). Derived from spec.md and schema.md (F2.2b, "Server db tests"). Route names from interface.md.
// The server clock is CLOCK_NOW = 2026-06-15T10:00Z: the server's date and an Israeli device's date are both 15.06.2026.
// The server's window (spec.md, ORCHESTRATOR's c14 ruling of 17.10.2026): UTC today-30 .. UTC today+1+300, every date an Israeli
// device can hold. So 2026-05-16 (-30), 2027-04-11 (+300) and 2027-04-12 (+301) are accepted; 2026-05-15 (-31) and 2027-04-13
// (+302) are refused. The web keeps -30 / +300 on the device's date (e2e/journeys-pregnancy.spec.ts).
// A's pregnancy is only edited (and put back); every POST runs on a FRESH registered user. The b2 routes: journeys-remove.db.test.ts.

const T = { timeout: COLD_START_MS };
const S = '50000000-0000-4000-8000-000000000051';
const X = 'e0000000-0000-4000-8000-0000000000e5';
const C = 'c0000000-0000-4000-8000-0000000000c3';
const A_JOURNEYS = 'has_child:null ; pregnant:2027-03-01';
const B_JOURNEYS = 'planning:null';
const MINUS_30 = '2026-05-16';
const PLUS_300 = '2027-04-11';
const MINUS_31 = '2026-05-15';
const PLUS_301 = '2027-04-12';
const PLUS_302 = '2027-04-13';

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let log: ReturnType<typeof captureLog>;
const toClose: Array<{ app: App; database: Database }> = [];

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
}
const env = () => ({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() });

/** One app on its own Database: a Database holds one connection, so two apps are two real connections. */
async function start(database: Database = createDatabase(url())): Promise<App> {
  log = captureLog();
  const app = await buildRegisterApp(env(), { database, clock: () => CLOCK_NOW, logStream: log.stream });
  toClose.push({ app, database });
  return app;
}

const bearerFor = async (sub: string): Promise<string> => `Bearer ${await token({ key, sub })}`;
async function one(query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> {
  const rows = await query;
  return String(rows[0]?.v);
}
const journeysOf = (id: string) => one(side`select tests.fx_journeys(${id}::uuid) as v`);
const countsOf = (id: string) => one(side`select tests.fx_counts(${id}::uuid) as v`);
const stateHash = () => one(side`select tests.fx_state() as v`);
const setStatus = async (who: string, status: 'active' | 'suspended' | 'banned'): Promise<void> => {
  await side`select tests.set_status(tests.fx_id_checked(${who}), ${status})`;
};
async function freshUser(): Promise<string> {
  const [row] = await side`select tests.fx_new_auth_user()::text as id`;
  const id: unknown = row?.id;
  if (typeof id !== 'string') throw new Error('tests.fx_new_auth_user returned no id: is 20_registration_fixtures.sql loaded?');
  return id;
}
/** A fresh, registered, active user: has_child with one child (neither planning nor pregnant), or planning only. */
async function registered(app: App, stage: 'has_child' | 'planning'): Promise<{ id: string; header: string }> {
  const id = await freshUser();
  const header = await bearerFor(id);
  const body = stage === 'planning'
    ? validBody({ stages: ['planning'], dueDate: EMPTY_DATE, children: [] })
    : validBody({ stages: ['has_child'], dueDate: EMPTY_DATE, children: [child({ name: 'ילד', sex: 'boy', birthDate: parts('2020-01-01') })] });
  const res = await post(app, header, body);
  if (res.statusCode !== 201) throw new Error(`could not register a fresh user: ${res.statusCode} ${res.body}`);
  return { id, header };
}

const send = (app: App, method: 'POST' | 'PUT', path: string, header: string | null, payload: unknown) =>
  app.inject({
    method,
    url: path,
    headers: { 'content-type': 'application/json', ...(header === null ? {} : { authorization: header }) },
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
const GET = (app: App, header: string) => app.inject({ method: 'GET', url: '/api/journeys', headers: { authorization: header } });
const ADD = (app: App, header: string | null, payload: unknown) => send(app, 'POST', '/api/journeys', header, payload);
const EDIT = (app: App, header: string | null, id: string, payload: unknown) => send(app, 'PUT', `/api/journeys/${id}`, header, payload);
const due = (iso: string | null) => ({ dueDate: iso === null ? EMPTY_DATE : parts(iso) });
const ok = (status: number): boolean => status === 200 || status === 201;

/** The journeys of an OwnJourneys answer as [stage, dueDate], in the order sent. */
function journeysIn(body: string): Array<[unknown, unknown]> {
  const parsed = jsonOf(body);
  expect(Array.isArray(parsed.journeys), body).toBe(true);
  const list: unknown[] = Array.isArray(parsed.journeys) ? parsed.journeys : [];
  return list.map((j: unknown) => {
    const r = typeof j === 'object' && j !== null ? jsonOf(JSON.stringify(j)) : {};
    return [r.stage, typeof r.dueDate === 'string' ? r.dueDate.slice(0, 10) : r.dueDate];
  });
}
/** The id of the caller's journey of one stage, read from its own GET. */
async function journeyId(app: App, header: string, stage: string): Promise<string> {
  const parsed = jsonOf((await GET(app, header)).body);
  const list: unknown[] = Array.isArray(parsed.journeys) ? parsed.journeys : [];
  for (const j of list) {
    const r = typeof j === 'object' && j !== null ? jsonOf(JSON.stringify(j)) : {};
    if (r.stage === stage && typeof r.id === 'string') return r.id;
  }
  throw new Error(`no ${stage} journey in GET`);
}

beforeAll(async () => {
  key = await newKey('journeys-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  await setStatus('a', 'active');
}, COLD_START_MS);

afterEach(async () => {
  await setStatus('a', 'active');
  // Tests edit A's due date: put it back through the API itself, then close.
  if ((await journeysOf(ACCOUNT_A)) !== A_JOURNEYS) {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const res = await EDIT(app, header, await journeyId(app, header, 'pregnant'), due('2027-03-01'));
    if (!ok(res.statusCode)) throw new Error(`could not restore A's due date: ${res.statusCode} ${res.body}`);
  }
  for (const { app, database } of toClose.splice(0)) {
    await app.close();
    await database.close();
  }
});

afterAll(async () => {
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c14 VAL-044 DR-5] PUT /api/journeys/:id edits the due date of the caller\'s own pregnancy', () => {
  it('[F2.2b c14] A edits its due date: 200 with the full answer, stored, GET shows it; has_child untouched', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const id = await journeyId(app, header, 'pregnant');
    const res = await EDIT(app, header, id, { dueDate: { day: '2', month: '1', year: '2027' } });
    expect(res.statusCode, res.body).toBe(200);
    expect(journeysIn(res.body)).toEqual([['pregnant', '2027-01-02'], ['has_child', null]]);
    expect(await journeysOf(ACCOUNT_A)).toBe('has_child:null ; pregnant:2027-01-02');
    expect(journeysIn((await GET(app, header)).body)).toEqual([['pregnant', '2027-01-02'], ['has_child', null]]);
    expect(await journeyId(app, header, 'pregnant')).toBe(id);
  });

  it('[F2.2b c14] all three fields cleared -> saved as null; GET answers dueDate null', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const res = await EDIT(app, header, await journeyId(app, header, 'pregnant'), due(null));
    expect(res.statusCode, res.body).toBe(200);
    expect(await journeysOf(ACCOUNT_A)).toBe('has_child:null ; pregnant:null');
    expect(journeysIn((await GET(app, header)).body)).toEqual([['pregnant', null], ['has_child', null]]);
  });

  it.each([['today-30', MINUS_30], ['today+300', PLUS_300], ['today+301 (the next UTC day\'s +300)', PLUS_301]])('[F2.2b c14 VAL-044] %s on the server\'s UTC date (%s) is accepted and stored', T, async (_label, iso) => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const res = await EDIT(app, header, await journeyId(app, header, 'pregnant'), due(iso));
    expect(res.statusCode, res.body).toBe(200);
    expect(await journeysOf(ACCOUNT_A)).toBe(`has_child:null ; pregnant:${iso}`);
  });

  const REFUSED: Array<[string, string, Record<string, unknown>]> = [
    ['today-31', 'due_date_out_of_range', due(MINUS_31)],
    ['today+302', 'due_date_out_of_range', due(PLUS_302)],
    ['a year ago', 'due_date_out_of_range', due('2025-06-15')],
    ['two years ahead', 'due_date_out_of_range', due('2028-06-15')],
    ['the day missing', 'due_date_partial', { dueDate: { day: '', month: '1', year: '2027' } }],
    ['the month missing', 'due_date_partial', { dueDate: { day: '2', month: '', year: '2027' } }],
    ['only the year', 'due_date_partial', { dueDate: { day: '', month: '', year: '2027' } }],
    ['31.02.2027 (does not exist)', 'due_date_invalid', { dueDate: { day: '31', month: '2', year: '2027' } }],
    ['letters in the date', 'due_date_invalid', { dueDate: { day: 'aa', month: '1', year: '2027' } }],
    ['a hostile string in the year', 'due_date_invalid', { dueDate: { day: '1', month: '1', year: "2027'); drop table nestly.journey_contexts;--" } }],
  ];
  it.each(REFUSED)('[F2.2b c14 VAL-044] PUT with %s -> 400 {error:"invalid", reason:%j}, nothing changes', T, async (_label, reason, body) => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const id = await journeyId(app, header, 'pregnant');
    const before = await stateHash();
    const res = await EDIT(app, header, id, body);
    expect(res.statusCode, res.body).toBe(400);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid', reason });
    expect(await stateHash()).toBe(before);
    expect(await journeysOf(ACCOUNT_A)).toBe(A_JOURNEYS);
  });

  it('[F2.2b c14 DR-5] PUT on A\'s own has_child id -> 404 {error:"not_found"}, nothing changes', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const before = await stateHash();
    const res = await EDIT(app, header, await journeyId(app, header, 'has_child'), due('2027-01-02'));
    expect(res.statusCode, res.body).toBe(404);
    expect(jsonOf(res.body)).toEqual({ error: 'not_found' });
    expect(await stateHash()).toBe(before);
  });

  it('[F2.2b c14 DR-5] PUT on B\'s own planning id by B -> 404 {error:"not_found"}, still planning with no date', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_B);
    const before = await stateHash();
    for (const body of [due('2027-01-02'), due(null)]) {
      const res = await EDIT(app, header, await journeyId(app, header, 'planning'), body);
      expect(res.statusCode, res.body).toBe(404);
      expect(jsonOf(res.body)).toEqual({ error: 'not_found' });
    }
    expect(await journeysOf(ACCOUNT_B)).toBe(B_JOURNEYS);
    expect(await stateHash()).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c15 VAL-039 AC-089] POST /api/journeys adds a pregnancy when there is neither planning nor pregnant', () => {
  it('[F2.2b c15] has_child only: 201 with pregnant before has_child (JOURNEY_STAGES order), stored, and GET agrees', T, async () => {
    const app = await start();
    const u = await registered(app, 'has_child');
    const res = await ADD(app, u.header, due('2027-01-02'));
    expect(res.statusCode, res.body).toBe(201);
    expect(journeysIn(res.body)).toEqual([['pregnant', '2027-01-02'], ['has_child', null]]);
    expect(await journeysOf(u.id)).toBe('has_child:null ; pregnant:2027-01-02');
    expect(journeysIn((await GET(app, u.header)).body)).toEqual([['pregnant', '2027-01-02'], ['has_child', null]]);
    expect((await countsOf(u.id)).split('/')[3], 'the child is untouched').toBe('1');
  });

  it('[F2.2b c15 c14] an empty date is allowed: the pregnancy is stored with no due date', T, async () => {
    const app = await start();
    const u = await registered(app, 'has_child');
    expect((await ADD(app, u.header, due(null))).statusCode).toBe(201);
    expect(await journeysOf(u.id)).toBe('has_child:null ; pregnant:null');
  });

  it('[F2.2b c15 c14 VAL-044] POST takes the same date rules: today-30 accepted; today-31, today+302, partial -> 400 with the registration reason, no row', T, async () => {
    const app = await start();
    for (const [body, reason] of [[due(MINUS_31), 'due_date_out_of_range'], [due(PLUS_302), 'due_date_out_of_range'], [{ dueDate: { day: '1', month: '', year: '' } }, 'due_date_partial']] as const) {
      const u = await registered(app, 'has_child');
      const res = await ADD(app, u.header, body);
      expect(res.statusCode, res.body).toBe(400);
      expect(jsonOf(res.body)).toEqual({ error: 'invalid', reason });
      expect(await journeysOf(u.id)).toBe('has_child:null');
    }
    const u = await registered(app, 'has_child');
    expect((await ADD(app, u.header, due(MINUS_30))).statusCode).toBe(201);
    expect(await journeysOf(u.id)).toBe(`has_child:null ; pregnant:${MINUS_30}`);
  });

  it('[F2.2b c15] with a pregnancy present POST -> 409 {error:"stage_conflict"}, no second row, the due date unchanged', T, async () => {
    const app = await start();
    const u = await registered(app, 'has_child');
    expect((await ADD(app, u.header, due('2027-01-02'))).statusCode).toBe(201);
    for (const body of [due('2027-02-02'), due(null)]) {
      const res = await ADD(app, u.header, body);
      expect(res.statusCode, res.body).toBe(409);
      expect(jsonOf(res.body)).toEqual({ error: 'stage_conflict' });
    }
    expect(await journeysOf(u.id)).toBe('has_child:null ; pregnant:2027-01-02');
    const before = await stateHash();
    const res = await ADD(app, await bearerFor(ACCOUNT_A), due('2027-01-02'));
    expect(res.statusCode, res.body).toBe(409);
    expect(jsonOf(res.body)).toEqual({ error: 'stage_conflict' });
    expect(await journeysOf(ACCOUNT_A)).toBe(A_JOURNEYS);
    expect(await stateHash()).toBe(before);
  });

  it('[F2.2b c15 c23 VAL-039] planning present and no confirmation: POST -> 409 {error:"stage_conflict"}, planning kept, no pregnancy', T, async () => {
    const app = await start();
    const u = await registered(app, 'planning');
    const res = await ADD(app, u.header, due('2027-01-02'));
    expect(res.statusCode, res.body).toBe(409);
    expect(jsonOf(res.body)).toEqual({ error: 'stage_conflict' });
    expect(await journeysOf(u.id)).toBe('planning:null');
  });

  const FORBIDDEN: Array<[string, unknown]> = [['userId', ACCOUNT_B], ['user_id', ACCOUNT_B], ['stage', 'planning'], ['id', '11111111-1111-4111-8111-111111111111']];
  it.each(FORBIDDEN)('[F2.2b c15 c14 c18 rule 12] POST and PUT carrying %s -> 400, no row changes (A\'s and B\'s included)', T, async (name, value) => {
    const app = await start();
    const u = await registered(app, 'has_child');
    const header = await bearerFor(ACCOUNT_A);
    const id = await journeyId(app, header, 'pregnant');
    const before = await stateHash();
    const body = { ...due('2027-01-02'), [name]: value };
    expect((await ADD(app, u.header, body)).statusCode).toBe(400);
    expect((await EDIT(app, header, id, body)).statusCode).toBe(400);
    expect(await stateHash()).toBe(before);
    expect(await journeysOf(u.id)).toBe('has_child:null');
    expect(await journeysOf(ACCOUNT_A)).toBe(A_JOURNEYS);
    expect(await journeysOf(ACCOUNT_B)).toBe(B_JOURNEYS);
  });

  it.each([['an empty object', {}], ['a date as a string', { dueDate: '2027-01-02' }], ['null', null], ['an array', [due('2027-01-02')]], ['a number in a part', { dueDate: { day: 2, month: 1, year: 2027 } }], ['not JSON', '{"dueDate":']])(
    '[F2.2b c15 c14 S2] POST and PUT with %s -> 4xx, nothing written', T, async (_label, body) => {
      const app = await start();
      const u = await registered(app, 'has_child');
      const header = await bearerFor(ACCOUNT_A);
      const id = await journeyId(app, header, 'pregnant');
      const before = await stateHash();
      for (const res of [await ADD(app, u.header, body), await EDIT(app, header, id, body)]) {
        expect(res.statusCode, res.body).toBeGreaterThanOrEqual(400);
        expect(res.statusCode, res.body).toBeLessThan(500);
      }
      expect(await stateHash()).toBe(before);
    });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c15 schema "Server db tests"] two concurrent "add pregnancy" POSTs -> exactly one pregnant row', () => {
  it('[F2.2b c15] 20 rounds, the first transaction held open after its insert: one 201, one 409 stage_conflict, one pregnant row', { timeout: COLD_START_MS * 4 }, async () => {
    for (let round = 1; round <= 20; round += 1) {
      const setupApp = await start();
      const u = await registered(setupApp, 'has_child');
      const holder = holdingAfterWork(createDatabase(url()));
      const first = await start(holder.database);
      const second = await start();
      holder.arm();
      const p1 = ADD(first, u.header, due('2027-01-01'));
      const reachedOrDone = await Promise.race([holder.reached.then(() => 'held'), p1.then(() => 'done')]);
      expect(reachedOrDone, `round ${round}: the first POST never opened a transaction to hold`).toBe('held');
      const p2 = ADD(second, u.header, due('2027-02-02'));
      await new Promise((resolve) => setTimeout(resolve, 150));
      holder.release();
      const [r1, r2] = await Promise.all([p1, p2]);
      const statuses = [r1.statusCode, r2.statusCode].sort();
      expect(statuses, `round ${round}: ${r1.body} | ${r2.body}`).toEqual([201, 409]);
      expect(jsonOf(r2.statusCode === 409 ? r2.body : r1.body)).toEqual({ error: 'stage_conflict' });
      const journeys = await journeysOf(u.id);
      expect(journeys.split(' ; ').filter((j) => j.startsWith('pregnant:')), `round ${round}: ${journeys}`).toHaveLength(1);
      expect(['has_child:null ; pregnant:2027-01-01', 'has_child:null ; pregnant:2027-02-02']).toContain(journeys);
      for (const { app, database } of toClose.splice(0)) {
        await app.close();
        await database.close();
      }
    }
  });

  it('[F2.2b c15] 5 rounds of two POSTs at once on two connections, with no hold: exactly one pregnant row each time', T, async () => {
    for (let round = 1; round <= 5; round += 1) {
      const setupApp = await start();
      const u = await registered(setupApp, 'has_child');
      const [one, two] = [await start(), await start()];
      const [r1, r2] = await Promise.all([ADD(one, u.header, due('2027-01-01')), ADD(two, u.header, due(null))]);
      expect([r1.statusCode, r2.statusCode].sort(), `round ${round}: ${r1.body} | ${r2.body}`).toEqual([201, 409]);
      expect((await journeysOf(u.id)).split(' ; ').filter((j) => j.startsWith('pregnant:'))).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c18 A1 NFR-PRIV-005] another account\'s journey, a guessed id, a non-uuid', () => {
  it('[F2.2b c18] A PUTs B\'s planning id -> 404 {error:"not_found"}, B unchanged; B PUTs A\'s pregnancy id -> 404, A unchanged', T, async () => {
    const app = await start();
    const a = await bearerFor(ACCOUNT_A);
    const b = await bearerFor(ACCOUNT_B);
    const before = await stateHash();
    const theirs = await EDIT(app, a, await journeyId(app, b, 'planning'), due('2027-01-02'));
    expect(theirs.statusCode, theirs.body).toBe(404);
    expect(jsonOf(theirs.body)).toEqual({ error: 'not_found' });
    const mine = await EDIT(app, b, await journeyId(app, a, 'pregnant'), due('2027-01-02'));
    expect(mine.statusCode, mine.body).toBe(404);
    expect(jsonOf(mine.body)).toEqual({ error: 'not_found' });
    expect(await journeysOf(ACCOUNT_A)).toBe(A_JOURNEYS);
    expect(await journeysOf(ACCOUNT_B)).toBe(B_JOURNEYS);
    expect(await stateHash()).toBe(before);
  });

  it('[F2.2b c18] another account\'s pregnancy and an id that exists nowhere are told the same thing (no existence oracle)', T, async () => {
    const app = await start();
    const b = await bearerFor(ACCOUNT_B);
    const theirs = await EDIT(app, b, await journeyId(app, await bearerFor(ACCOUNT_A), 'pregnant'), due('2027-01-02'));
    const nobody = await EDIT(app, b, '99999999-9999-4999-8999-999999999999', due('2027-01-02'));
    expect(nobody.statusCode).toBe(404);
    expect(nobody.statusCode).toBe(theirs.statusCode);
    expect(nobody.body).toBe(theirs.body);
  });

  it.each([['a word', 'not-a-uuid'], ['a number', '12345'], ['SQL', "1'%20or%20'1'='1"], ['a uuid with junk', '11111111-1111-4111-8111-11111111111x'], ['a very long id', 'a'.repeat(2000)]])(
    '[F2.2b c18] PUT with %s for the id -> 404 {error:"not_found"}, nothing written', T, async (_label, id) => {
      const app = await start();
      const before = await stateHash();
      const res = await EDIT(app, await bearerFor(ACCOUNT_A), id, due('2027-01-02'));
      expect(res.statusCode, res.body).toBe(404);
      expect(jsonOf(res.body)).toEqual({ error: 'not_found' });
      expect(await stateHash()).toBe(before);
    });

  it('[F2.2b c18 A1] a POST adds to the caller only, whatever the query or a header names', T, async () => {
    const app = await start();
    const u = await registered(app, 'has_child');
    const res = await app.inject({
      method: 'POST',
      url: `/api/journeys?userId=${ACCOUNT_B}&user_id=${ACCOUNT_B}`,
      headers: { authorization: u.header, 'content-type': 'application/json', 'x-user-id': ACCOUNT_B },
      payload: JSON.stringify(due('2027-01-02')),
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(await journeysOf(u.id)).toBe('has_child:null ; pregnant:2027-01-02');
    expect(await journeysOf(ACCOUNT_B)).toBe(B_JOURNEYS);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c24 A9 ERR-037 F2.1 DR-T1] stopped and unregistered accounts on the two b1 routes', () => {
  it.each([['s', S], ['x', X]] as const)('[F2.2b c24] the fixture account %s: POST and PUT -> 403 account_unavailable, nothing written', T, async (_who, id) => {
    const app = await start();
    const aPregnancy = await journeyId(app, await bearerFor(ACCOUNT_A), 'pregnant');
    const before = await stateHash();
    const header = await bearerFor(id);
    for (const res of [await ADD(app, header, due('2027-01-02')), await EDIT(app, header, aPregnancy, due('2027-01-02'))]) {
      expect(res.statusCode, res.body).toBe(403);
      expect(jsonOf(res.body)).toEqual({ error: 'account_unavailable' });
    }
    expect(await stateHash()).toBe(before);
  });

  it.each(['suspended', 'banned'] as const)('[F2.2b c24] A becomes %s: PUT of its own due date and POST -> 403, nothing changes; active again, PUT works', T, async (status) => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const id = await journeyId(app, header, 'pregnant');
    await setStatus('a', status);
    for (const res of [await EDIT(app, header, id, due('2027-01-02')), await EDIT(app, header, id, due(null)), await ADD(app, header, due('2027-01-02'))]) {
      expect(res.statusCode, res.body).toBe(403);
      expect(jsonOf(res.body)).toEqual({ error: 'account_unavailable' });
      expect(res.body).not.toMatch(/2027-03-01|pregnant|has_child/);
    }
    expect(await journeysOf(ACCOUNT_A)).toBe(A_JOURNEYS);
    await setStatus('a', 'active');
    expect((await EDIT(app, header, id, due('2027-01-02'))).statusCode).toBe(200);
    expect(await journeysOf(ACCOUNT_A)).toBe('has_child:null ; pregnant:2027-01-02');
  });

  it('[F2.2b c24] an Auth user with no account row: POST and PUT -> 404 {error:"no_profile"}, nothing created', T, async () => {
    const app = await start();
    const aPregnancy = await journeyId(app, await bearerFor(ACCOUNT_A), 'pregnant');
    const before = await stateHash();
    const header = await bearerFor(C);
    for (const res of [await ADD(app, header, due('2027-01-02')), await EDIT(app, header, aPregnancy, due('2027-01-02'))]) {
      expect(res.statusCode, res.body).toBe(404);
      expect(jsonOf(res.body)).toEqual({ error: 'no_profile' });
    }
    expect(await stateHash()).toBe(before);
    expect(await countsOf(C)).toBe('0/0/0/0/0');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c11 A8 NFR-PRIV-001] the logs of 2xx, 400, 404 and 409 hold no due date or stage', () => {
  it('[F2.2b c11] POST and PUT in success, 400, 404 and 409: none of the values in the log', T, async () => {
    const app = await start();
    const u = await registered(app, 'has_child');
    const DATE = parts('2027-02-17');
    expect((await ADD(app, u.header, { dueDate: DATE })).statusCode).toBe(201);
    expect((await ADD(app, u.header, { dueDate: DATE })).statusCode).toBe(409);
    expect((await ADD(app, u.header, { dueDate: { day: '17', month: '', year: '2027' } })).statusCode).toBe(400);
    expect((await ADD(app, u.header, { dueDate: DATE, stage: 'planning' })).statusCode).toBe(400);
    const id = await journeyId(app, u.header, 'pregnant');
    expect((await EDIT(app, u.header, id, { dueDate: parts('2027-02-18') })).statusCode).toBe(200);
    expect((await EDIT(app, u.header, id, { dueDate: parts('2031-01-01') })).statusCode).toBe(400);
    expect((await EDIT(app, u.header, await journeyId(app, u.header, 'has_child'), { dueDate: DATE })).statusCode).toBe(404);
    const text = log.text();
    expect(text.length, 'the app wrote no log at all: the capture is not wired').toBeGreaterThan(0);
    for (const secret of ['2027-02-17', '2027-02-18', '2031-01-01', '"year":"2027"', '"dueDate"', '"stage"', 'pregnant', 'has_child', 'planning', '2027-03-01']) {
      expect(text, `the log contains ${secret}`).not.toContain(secret);
    }
  });
});
