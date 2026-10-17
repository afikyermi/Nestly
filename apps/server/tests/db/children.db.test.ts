import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { ACCOUNT_A, ACCOUNT_B, AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { CLOCK_NOW, EMPTY_DATE, buildRegisterApp, captureLog, child, jsonOf, parts, post, validBody } from '../helpers/register-app.js';

// I2 F2.2a, GET /api/journeys, POST /api/children, PUT /api/children/:id against the real database (CI `db` job, as app_server,
// fixtures of supabase/tests/setup/):
//   a: active, journeys pregnant (2027-03-01) + has_child, children slot 1 Noa/girl/2024-05-10, slot 2 Eli/boy/2022-01-15
//   b: active, journey planning, child slot 1 Tali/unknown/2025-02-02   s: suspended   x: banned   c: an Auth user, no users row
// Spec criteria (.work/journeys-children/spec.md): 1 (the answer, children by slot), 3 (a POST lands last), 4/5 (the server checks
// with the shared rules: the registration reason, trimmed, the boundaries; any other key 400; no row changes), 6 (10 -> 409, and
// the two races of schema.md: 9 + 2, 5 + 2, on two real connections), 7 (the first child creates has_child, atomically), 8 (edit),
// 9 (B's id or a non-uuid -> 404), 10 (stopped, unregistered), 11 (the logs of 2xx, 400, 409). Derived from spec.md and schema.md.
// A's rows are only edited (and put back); every POST runs on a FRESH registered user (since F2.2b2 a child can be removed, but only by its owner: journeys-remove.db.test.ts).

const T = { timeout: COLD_START_MS };
const S = '50000000-0000-4000-8000-000000000051';
const X = 'e0000000-0000-4000-8000-0000000000e5';
const C = 'c0000000-0000-4000-8000-0000000000c3';
const A_CHILDREN = '1:Noa:girl:2024-05-10 ; 2:Eli:boy:2022-01-15';
const B_CHILDREN = '1:Tali:unknown:2025-02-02';
const A_RESTORE: Record<number, Record<string, unknown>> = {
  1: { name: 'Noa', sex: 'girl', birthDate: parts('2024-05-10') },
  2: { name: 'Eli', sex: 'boy', birthDate: parts('2022-01-15') },
};

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
const childrenOf = (id: string) => one(side`select tests.fx_children(${id}::uuid) as v`);
const journeysOf = (id: string) => one(side`select tests.fx_journeys(${id}::uuid) as v`);
const countsOf = (id: string) => one(side`select tests.fx_counts(${id}::uuid) as v`);
const childId = (id: string, slot: number) => one(side`select tests.fx_child_id(${id}::uuid, ${slot}::int)::text as v`);
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
/** A fresh, registered, active user with `n` children (has_child), or planning only when n = 0. */
async function registered(app: App, n: number): Promise<{ id: string; header: string }> {
  const id = await freshUser();
  const header = await bearerFor(id);
  const kids = Array.from({ length: n }, (_v, i) => child({ name: `ילד ${i + 1}`, sex: 'boy', birthDate: parts('2020-01-01') }));
  const body = n === 0 ? validBody({ stages: ['planning'], dueDate: EMPTY_DATE, children: [] }) : validBody({ stages: ['has_child'], dueDate: EMPTY_DATE, children: kids });
  const res = await post(app, header, body);
  if (res.statusCode !== 201) throw new Error(`could not register a fresh user: ${res.statusCode} ${res.body}`);
  return { id, header };
}

const GET = (app: App, header: string | null) =>
  app.inject({ method: 'GET', url: '/api/journeys', headers: header === null ? {} : { authorization: header } });
const send = (app: App, method: 'POST' | 'PUT', path: string, header: string | null, payload: unknown) =>
  app.inject({
    method,
    url: path,
    headers: { 'content-type': 'application/json', ...(header === null ? {} : { authorization: header }) },
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
const POST = (app: App, header: string | null, payload: unknown) => send(app, 'POST', '/api/children', header, payload);
const PUT = (app: App, header: string | null, id: string, payload: unknown) => send(app, 'PUT', `/api/children/${id}`, header, payload);
const ok = (status: number): boolean => status === 200 || status === 201;

/** A date of the answer as YYYY-MM-DD, whether the API sends an ISO string or day/month/year parts (the spec fixes neither). */
function isoOf(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (typeof value === 'object') {
    const d = String(Reflect.get(value, 'day') ?? '').padStart(2, '0');
    const m = String(Reflect.get(value, 'month') ?? '').padStart(2, '0');
    return `${String(Reflect.get(value, 'year') ?? '')}-${m}-${d}`;
  }
  return `not a date: ${JSON.stringify(value)}`;
}
interface Seen {
  journeys: Array<{ id: unknown; stage: unknown; dueDate: string | null }>;
  children: Array<{ id: unknown; name: unknown; sex: unknown; birthDate: string | null }>;
}
function seen(body: string): Seen {
  const parsed = jsonOf(body);
  const list = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? v.map((x: unknown) => (typeof x === 'object' && x !== null ? jsonOf(JSON.stringify(x)) : {})) : []);
  expect(Array.isArray(parsed.journeys) && Array.isArray(parsed.children), body).toBe(true);
  return {
    journeys: list(parsed.journeys).map((j) => ({ id: j.id, stage: j.stage, dueDate: isoOf(j.dueDate) })),
    children: list(parsed.children).map((c) => ({ id: c.id, name: c.name, sex: c.sex, birthDate: isoOf(c.birthDate) })),
  };
}

beforeAll(async () => {
  key = await newKey('children-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  await setStatus('a', 'active');
}, COLD_START_MS);

afterEach(async () => {
  await setStatus('a', 'active');
  // Tests edit A's two children: put them back through the API itself, then close.
  if ((await childrenOf(ACCOUNT_A)) !== A_CHILDREN) {
    const app = await start();
    for (const slot of [1, 2]) {
      const res = await PUT(app, await bearerFor(ACCOUNT_A), await childId(ACCOUNT_A, slot), A_RESTORE[slot]);
      if (!ok(res.statusCode)) throw new Error(`could not restore A's child ${slot}: ${res.statusCode} ${res.body}`);
    }
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
describe('[F2.2a c1 FR-PROFILE-002] GET /api/journeys returns the caller\'s own journeys and children', () => {
  it('[F2.2a c1] A -> 200: its two journeys (due date or null) and its two children in slot order, nothing of B', T, async () => {
    const app = await start();
    const res = await GET(app, await bearerFor(ACCOUNT_A));
    expect(res.statusCode, res.body).toBe(200);
    const got = seen(res.body);
    expect(got.journeys.map((j) => `${String(j.stage)}:${String(j.dueDate)}`).sort()).toEqual(['has_child:null', 'pregnant:2027-03-01']);
    expect(got.children.map((c) => [c.name, c.sex, c.birthDate])).toEqual([['Noa', 'girl', '2024-05-10'], ['Eli', 'boy', '2022-01-15']]);
    expect(got.children.map((c) => c.id)).toEqual([await childId(ACCOUNT_A, 1), await childId(ACCOUNT_A, 2)]);
    for (const j of got.journeys) expect(typeof j.id).toBe('string');
    expect(res.body).not.toContain('Tali');
    expect(res.body).not.toContain(ACCOUNT_A);
    expect(res.body).not.toMatch(/user_?id/i);
  });

  it('[F2.2a c1 c2 A1] B -> its planning journey and its child only; another account\'s id in the query changes nothing', T, async () => {
    const app = await start();
    const res = await app.inject({ method: 'GET', url: `/api/journeys?userId=${ACCOUNT_A}&user_id=${ACCOUNT_A}`, headers: { authorization: await bearerFor(ACCOUNT_B), 'x-user-id': ACCOUNT_A } });
    expect(res.statusCode, res.body).toBe(200);
    const got = seen(res.body);
    expect(got.journeys.map((j) => [j.stage, j.dueDate])).toEqual([['planning', null]]);
    expect(got.children.map((c) => [c.name, c.sex, c.birthDate])).toEqual([['Tali', 'unknown', '2025-02-02']]);
    expect(res.body).not.toMatch(/Noa|Eli|pregnant/);
  });

  it('[F2.2a c2] a planning-only user with no children -> children is an empty list', T, async () => {
    const app = await start();
    const u = await registered(app, 0);
    const got = seen((await GET(app, u.header)).body);
    expect(got.journeys.map((j) => [j.stage, j.dueDate])).toEqual([['planning', null]]);
    expect(got.children).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2a c3 c4 c5 VAL-043 VAL-006 VAL-005] POST /api/children stores a valid child, last; refuses the rest', () => {
  it('[F2.2a c3] a valid child -> 2xx, stored in the next slot, trimmed, and last in GET', T, async () => {
    const app = await start();
    const u = await registered(app, 2);
    const res = await POST(app, u.header, { name: '  איתי  ', sex: 'boy', birthDate: parts('2025-01-10') });
    expect(ok(res.statusCode), res.body).toBe(true);
    expect(await childrenOf(u.id)).toBe('1:ילד 1:boy:2020-01-01 ; 2:ילד 2:boy:2020-01-01 ; 3:איתי:boy:2025-01-10');
    const got = seen((await GET(app, u.header)).body);
    expect(got.children.at(-1)).toMatchObject({ name: 'איתי', sex: 'boy', birthDate: '2025-01-10' });
    expect(got.children).toHaveLength(3);
  });

  it('[F2.2a c4 c5] the boundaries that are accepted: a 1- and a 60-character name, 01.01.1900, the server\'s today, each sex', T, async () => {
    const app = await start();
    const u = await registered(app, 1);
    const accepted: Array<Record<string, unknown>> = [
      { name: 'א', sex: 'girl', birthDate: parts('2020-02-29') },
      { name: 'נ'.repeat(60), sex: 'unknown', birthDate: parts('1900-01-01') },
      { name: 'היום', sex: 'boy', birthDate: parts(CLOCK_NOW.toISOString().slice(0, 10)) },
    ];
    for (const body of accepted) {
      const res = await POST(app, u.header, body);
      expect(ok(res.statusCode), `${JSON.stringify(body)} -> ${res.statusCode} ${res.body}`).toBe(true);
    }
    expect(await childrenOf(u.id)).toBe(`1:ילד 1:boy:2020-01-01 ; 2:א:girl:2020-02-29 ; 3:${'נ'.repeat(60)}:unknown:1900-01-01 ; 4:היום:boy:2026-06-15`);
  });

  const REFUSED: Array<[string, Record<string, unknown>, string]> = [
    ['an empty name', { name: '' }, 'child_name_required'],
    ['a name of spaces', { name: '     ' }, 'child_name_required'],
    ['61 characters after trim', { name: ` ${'נ'.repeat(61)} ` }, 'child_name_length'],
    ['a 10 000-character name', { name: 'x'.repeat(10_000) }, 'child_name_length'],
    ['no sex chosen', { sex: '' }, 'child_sex_required'],
    ['a sex outside the three', { sex: 'female' }, 'child_sex_invalid'],
    ['a hostile sex string', { sex: "girl'); drop table nestly.children;--" }, 'child_sex_invalid'],
    ['an empty date', { birthDate: EMPTY_DATE }, 'birth_date_required'],
    ['a partial date', { birthDate: { day: '4', month: '', year: '2023' } }, 'birth_date_required'],
    ['31.02.2024 (does not exist)', { birthDate: { day: '31', month: '2', year: '2024' } }, 'birth_date_invalid'],
    ['letters in the date', { birthDate: { day: 'aa', month: '05', year: '2023' } }, 'birth_date_invalid'],
    ['a date years in the future', { birthDate: parts('2030-01-01') }, 'birth_date_future'],
    ['31.12.1899', { birthDate: parts('1899-12-31') }, 'birth_date_out_of_range'],
  ];
  it.each(REFUSED)('[F2.2a c5] POST with %s -> 400 {error:"invalid", reason:%j}, no row changes', T, async (_label, over, reason) => {
    const app = await start();
    const u = await registered(app, 1);
    const before = await stateHash();
    const res = await POST(app, u.header, { name: 'נועה', sex: 'girl', birthDate: parts('2023-05-04'), ...over });
    expect(res.statusCode, res.body).toBe(400);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid', reason });
    expect(await stateHash()).toBe(before);
  });

  it.each(REFUSED)('[F2.2a c5 c8] PUT of A\'s child with %s -> 400 {error:"invalid", reason:%j}, the child unchanged', T, async (_label, over, reason) => {
    const app = await start();
    const before = await stateHash();
    const res = await PUT(app, await bearerFor(ACCOUNT_A), await childId(ACCOUNT_A, 1), { name: 'נועה', sex: 'girl', birthDate: parts('2023-05-04'), ...over });
    expect(res.statusCode, res.body).toBe(400);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid', reason });
    expect(await stateHash()).toBe(before);
    expect(await childrenOf(ACCOUNT_A)).toBe(A_CHILDREN);
  });

  const FORBIDDEN: Array<[string, unknown]> = [['userId', ACCOUNT_B], ['user_id', ACCOUNT_B], ['slot', 7], ['id', '11111111-1111-4111-8111-111111111111']];
  it.each(FORBIDDEN)('[F2.2a c5 rule 12] POST and PUT carrying %s -> 400, no row changes (A\'s and B\'s included)', T, async (name, value) => {
    const app = await start();
    const u = await registered(app, 1);
    const before = await stateHash();
    const body = { name: 'Hijacker', sex: 'boy', birthDate: parts('2021-01-01'), [name]: value };
    const posted = await POST(app, u.header, body);
    expect(posted.statusCode, posted.body).toBe(400);
    const put = await PUT(app, await bearerFor(ACCOUNT_A), await childId(ACCOUNT_A, 1), body);
    expect(put.statusCode, put.body).toBe(400);
    expect(await stateHash()).toBe(before);
    expect(await childrenOf(ACCOUNT_A)).toBe(A_CHILDREN);
    expect(await childrenOf(ACCOUNT_B)).toBe(B_CHILDREN);
  });

  it.each([['an array', [child()]], ['a string', 'נועה'], ['null', null], ['an empty object', {}], ['no birth date', { name: 'נועה', sex: 'girl' }], ['a date as a string', { name: 'נועה', sex: 'girl', birthDate: '2023-05-04' }], ['not JSON', '{"name":']])(
    '[F2.2a c5 S2] POST with %s -> 4xx, nothing written', T, async (_label, body) => {
      const app = await start();
      const u = await registered(app, 1);
      const before = await stateHash();
      const res = await POST(app, u.header, body);
      expect(res.statusCode, res.body).toBeGreaterThanOrEqual(400);
      expect(res.statusCode, res.body).toBeLessThan(500);
      expect(await stateHash()).toBe(before);
    });

  it('[F2.2a c5 S2 hostile] a name shaped like SQL is stored as data', T, async () => {
    const app = await start();
    const u = await registered(app, 1);
    const name = "Rob'); drop table nestly.children;--";
    expect(ok((await POST(app, u.header, { name, sex: 'boy', birthDate: parts('2021-01-01') })).statusCode)).toBe(true);
    expect(await childrenOf(u.id)).toBe(`1:ילד 1:boy:2020-01-01 ; 2:${name}:boy:2021-01-01`);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2a c6 VAL-040 AC-090] at most 10 children, also under concurrency', () => {
  it('[F2.2a c6] with 10 stored, POST -> 409 {error:"children_too_many"}, still 10', T, async () => {
    const app = await start();
    const u = await registered(app, 10);
    const res = await POST(app, u.header, { name: 'האחד עשר', sex: 'girl', birthDate: parts('2024-01-01') });
    expect(res.statusCode, res.body).toBe(409);
    expect(jsonOf(res.body)).toEqual({ error: 'children_too_many' });
    expect((await countsOf(u.id)).split('/')[3]).toBe('10');
  });

  it('[F2.2a c6] 9 stored: the 10th is accepted, the 11th is 409', T, async () => {
    const app = await start();
    const u = await registered(app, 9);
    expect(ok((await POST(app, u.header, { name: 'עשירי', sex: 'girl', birthDate: parts('2024-01-01') })).statusCode)).toBe(true);
    expect((await POST(app, u.header, { name: 'אחד עשר', sex: 'girl', birthDate: parts('2024-01-01') })).statusCode).toBe(409);
    expect((await countsOf(u.id)).split('/')[3]).toBe('10');
  });

  for (const round of [1, 2, 3]) {
    it(`[F2.2a c6 schema c6] 9 stored, two POSTs at once on two connections: exactly one succeeds, the other 409; 10 stored (round ${round})`, T, async () => {
      const setupApp = await start();
      const u = await registered(setupApp, 9);
      const [one, two] = [await start(), await start()];
      const [r1, r2] = await Promise.all([
        POST(one, u.header, { name: 'ראשון', sex: 'girl', birthDate: parts('2024-01-01') }),
        POST(two, u.header, { name: 'שני', sex: 'boy', birthDate: parts('2024-01-02') }),
      ]);
      const statuses = [r1.statusCode, r2.statusCode];
      expect(statuses.filter(ok), `${r1.body} | ${r2.body}`).toHaveLength(1);
      expect(statuses.filter((s) => s === 409), `${r1.body} | ${r2.body}`).toHaveLength(1);
      expect((await countsOf(u.id)).split('/')[3]).toBe('10');
    });

    it(`[F2.2a c6 schema c6] 5 stored, two POSTs at once on two connections: both stored, in distinct slots 6 and 7 (round ${round})`, T, async () => {
      const setupApp = await start();
      const u = await registered(setupApp, 5);
      const [one, two] = [await start(), await start()];
      const [r1, r2] = await Promise.all([
        POST(one, u.header, { name: 'ראשון', sex: 'girl', birthDate: parts('2024-01-01') }),
        POST(two, u.header, { name: 'שני', sex: 'boy', birthDate: parts('2024-01-02') }),
      ]);
      expect(ok(r1.statusCode), r1.body).toBe(true);
      expect(ok(r2.statusCode), r2.body).toBe(true);
      const rows = (await childrenOf(u.id)).split(' ; ');
      expect(rows).toHaveLength(7);
      expect(rows.map((r) => r.split(':')[0])).toEqual(['1', '2', '3', '4', '5', '6', '7']);
      expect(rows.slice(5).map((r) => r.split(':')[1]).sort()).toEqual(['ראשון', 'שני'].sort());
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2a c7 DR-4] the first child creates the has_child journey, in the same transaction', () => {
  it('[F2.2a c7] a planning-only user adds a child: has_child and the child both exist; a second add makes no second has_child', T, async () => {
    const app = await start();
    const u = await registered(app, 0);
    expect(await journeysOf(u.id)).toBe('planning:null');
    expect(ok((await POST(app, u.header, { name: 'נועה', sex: 'girl', birthDate: parts('2024-05-04') })).statusCode)).toBe(true);
    expect(await journeysOf(u.id)).toBe('has_child:null ; planning:null');
    expect(await childrenOf(u.id)).toBe('1:נועה:girl:2024-05-04');
    expect(ok((await POST(app, u.header, { name: 'איתי', sex: 'boy', birthDate: parts('2025-01-10') })).statusCode)).toBe(true);
    expect(await journeysOf(u.id)).toBe('has_child:null ; planning:null');
    const got = seen((await GET(app, u.header)).body);
    expect(got.journeys.map((j) => j.stage).sort()).toEqual(['has_child', 'planning']);
  });

  it('[F2.2a c7] a failed add leaves neither row: whichever transaction fails, has_child exists if and only if the child does', T, async () => {
    let failed = 0;
    for (const nth of [1, 2, 3]) {
      const setupApp = await start();
      const u = await registered(setupApp, 0);
      const flaky = failingAfterWork(createDatabase(url()));
      const app = await start(flaky.database);
      flaky.arm(nth);
      const res = await POST(app, u.header, { name: 'נועה', sex: 'girl', birthDate: parts('2024-05-04') });
      const journeys = await journeysOf(u.id);
      const kids = await childrenOf(u.id);
      expect(journeys.includes('has_child'), `transaction ${nth}: ${journeys} / ${kids}`).toBe(kids !== '-');
      if (flaky.failures() > 0) {
        failed += 1;
        expect(res.statusCode, `transaction ${nth} failed, so the answer is a 5xx`).toBeGreaterThanOrEqual(500);
        expect(journeys).toBe('planning:null');
        expect(kids).toBe('-');
        // and a retry with the same session and body succeeds, once
        const retry = await POST(app, u.header, { name: 'נועה', sex: 'girl', birthDate: parts('2024-05-04') });
        expect(ok(retry.statusCode), retry.body).toBe(true);
        expect(await journeysOf(u.id)).toBe('has_child:null ; planning:null');
        expect(await childrenOf(u.id)).toBe('1:נועה:girl:2024-05-04');
      }
    }
    expect(failed, 'the add opened no transaction at all').toBeGreaterThan(0);
  });
});

/** A Database whose Nth transaction (counted from arm()) runs its work and then fails like a lost connection: the work rolls back. */
function failingAfterWork(real: Database): { database: Database; arm: (nth: number) => void; failures: () => number } {
  let remaining = 0;
  let failures = 0;
  const db = new Proxy(real.db, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (typeof value !== 'function') return value;
      if (prop !== 'transaction') {
        const bound: unknown = value.bind(target);
        return bound;
      }
      return (work: unknown, ...rest: unknown[]) => {
        if (remaining > 0) remaining -= 1;
        if (remaining !== 0 || typeof work !== 'function') {
          const passed: unknown = Reflect.apply(value, target, [work, ...rest]);
          return passed;
        }
        remaining = -1;
        failures += 1;
        const failing = async (tx: unknown): Promise<never> => {
          await Reflect.apply(work, undefined, [tx]);
          throw Object.assign(new Error('write CONNECTION_CLOSED'), { code: 'CONNECTION_CLOSED' });
        };
        const outcome: unknown = Reflect.apply(value, target, [failing, ...rest]);
        return outcome;
      };
    },
  });
  return { database: { db, client: real.client, close: () => real.close() }, arm: (nth) => { remaining = nth; }, failures: () => failures };
}

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2a c8 FR-PROFILE-002 DR-5] PUT /api/children/:id edits name, sex and birth date of one own child', () => {
  it('[F2.2a c8] A edits its slot-1 child: 2xx, stored trimmed, slot 2 untouched, GET shows it in the same place', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const id = await childId(ACCOUNT_A, 1);
    const res = await PUT(app, header, id, { name: '  נועה  ', sex: 'unknown', birthDate: { day: '4', month: '5', year: '2023' } });
    expect(ok(res.statusCode), res.body).toBe(true);
    expect(await childrenOf(ACCOUNT_A)).toBe('1:נועה:unknown:2023-05-04 ; 2:Eli:boy:2022-01-15');
    expect(await childId(ACCOUNT_A, 1)).toBe(id);
    const got = seen((await GET(app, header)).body);
    expect(got.children.map((c) => [c.id, c.name, c.sex, c.birthDate])).toEqual([
      [id, 'נועה', 'unknown', '2023-05-04'],
      [await childId(ACCOUNT_A, 2), 'Eli', 'boy', '2022-01-15'],
    ]);
    expect(await journeysOf(ACCOUNT_A)).toBe('has_child:null ; pregnant:2027-03-01');
  });

  it('[F2.2a c8 Q2] two PUTs of one child at once both answer 2xx and the row ends as exactly one of them; a repeat is idempotent', T, async () => {
    const [one, two] = [await start(), await start()];
    const header = await bearerFor(ACCOUNT_A);
    const id = await childId(ACCOUNT_A, 2);
    const [r1, r2] = await Promise.all([
      PUT(one, header, id, { name: 'ראשון', sex: 'boy', birthDate: parts('2022-01-15') }),
      PUT(two, header, id, { name: 'שני', sex: 'girl', birthDate: parts('2022-01-16') }),
    ]);
    expect(ok(r1.statusCode) && ok(r2.statusCode), `${r1.body} | ${r2.body}`).toBe(true);
    expect(['1:Noa:girl:2024-05-10 ; 2:ראשון:boy:2022-01-15', '1:Noa:girl:2024-05-10 ; 2:שני:girl:2022-01-16']).toContain(await childrenOf(ACCOUNT_A));
    expect(ok((await PUT(one, header, id, { name: 'שני', sex: 'girl', birthDate: parts('2022-01-16') })).statusCode)).toBe(true);
    expect(ok((await PUT(one, header, id, { name: 'שני', sex: 'girl', birthDate: parts('2022-01-16') })).statusCode)).toBe(true);
    expect(await childrenOf(ACCOUNT_A)).toBe('1:Noa:girl:2024-05-10 ; 2:שני:girl:2022-01-16');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2a c9 A1 NFR-PRIV-005] another account\'s child, a guessed id, a non-uuid', () => {
  const BODY = { name: 'Hijacked', sex: 'boy', birthDate: parts('2021-01-01') };

  it('[F2.2a c9] A PUTs B\'s child id -> 404 {error:"not_found"}, B unchanged, and the answer leaks nothing of B', T, async () => {
    const app = await start();
    const before = await stateHash();
    const res = await PUT(app, await bearerFor(ACCOUNT_A), await childId(ACCOUNT_B, 1), BODY);
    expect(res.statusCode, res.body).toBe(404);
    expect(jsonOf(res.body)).toEqual({ error: 'not_found' });
    expect(res.body).not.toContain('Tali');
    expect(await childrenOf(ACCOUNT_B)).toBe(B_CHILDREN);
    expect(await stateHash()).toBe(before);
  });

  it('[F2.2a c9] B\'s id and an id that exists nowhere are told the same thing (no existence oracle)', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const theirs = await PUT(app, header, await childId(ACCOUNT_B, 1), BODY);
    const nobody = await PUT(app, header, '99999999-9999-4999-8999-999999999999', BODY);
    expect(nobody.statusCode).toBe(theirs.statusCode);
    expect(nobody.body).toBe(theirs.body);
  });

  it.each([['a word', 'not-a-uuid'], ['a number', '12345'], ['SQL', "1'%20or%20'1'='1"], ['a uuid with junk', '11111111-1111-4111-8111-11111111111x'], ['a very long id', 'a'.repeat(2000)]])(
    '[F2.2a c9] PUT with %s for the id -> 404 {error:"not_found"}, nothing written', T, async (_label, id) => {
      const app = await start();
      const before = await stateHash();
      const res = await PUT(app, await bearerFor(ACCOUNT_A), id, BODY);
      expect(res.statusCode, res.body).toBe(404);
      expect(jsonOf(res.body)).toEqual({ error: 'not_found' });
      expect(await stateHash()).toBe(before);
    });

  it('[F2.2a c9] B\'s valid body against A\'s child id -> 404, A unchanged', T, async () => {
    const app = await start();
    const res = await PUT(app, await bearerFor(ACCOUNT_B), await childId(ACCOUNT_A, 1), BODY);
    expect(res.statusCode, res.body).toBe(404);
    expect(await childrenOf(ACCOUNT_A)).toBe(A_CHILDREN);
  });

  it('[F2.2a c9 A1] POST for B writes B\'s row only; A is untouched (the owner is the token, never the request)', T, async () => {
    const app = await start();
    const u = await registered(app, 1);
    const res = await app.inject({
      method: 'POST',
      url: `/api/children?userId=${ACCOUNT_A}`,
      headers: { authorization: u.header, 'content-type': 'application/json', 'x-user-id': ACCOUNT_A },
      payload: JSON.stringify({ name: 'שלי', sex: 'boy', birthDate: parts('2021-01-01') }),
    });
    expect(ok(res.statusCode), res.body).toBe(true);
    expect(await childrenOf(u.id)).toBe('1:ילד 1:boy:2020-01-01 ; 2:שלי:boy:2021-01-01');
    expect(await childrenOf(ACCOUNT_A)).toBe(A_CHILDREN);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2a c10 A9 ERR-037 F2.1 DR-T1] stopped and unregistered accounts', () => {
  it.each([['s', S], ['x', X]] as const)('[F2.2a c10] the fixture account %s: every route -> 403 account_unavailable, no data, nothing written', T, async (_who, id) => {
    const app = await start();
    const before = await stateHash();
    const header = await bearerFor(id);
    for (const res of [await GET(app, header), await POST(app, header, child()), await PUT(app, header, await childId(ACCOUNT_A, 1), child())]) {
      expect(res.statusCode, res.body).toBe(403);
      expect(jsonOf(res.body)).toEqual({ error: 'account_unavailable' });
    }
    expect(await stateHash()).toBe(before);
  });

  it.each(['suspended', 'banned'] as const)('[F2.2a c10] A becomes %s: GET, POST and PUT -> 403 with no data; active again, they work', T, async (status) => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const id = await childId(ACCOUNT_A, 1);
    await setStatus('a', status);
    const got = await GET(app, header);
    expect(got.statusCode, got.body).toBe(403);
    expect(jsonOf(got.body)).toEqual({ error: 'account_unavailable' });
    expect(got.body).not.toMatch(/Noa|Eli|pregnant|has_child|2027-03-01/);
    for (const res of [await POST(app, header, child()), await PUT(app, header, id, { name: 'While Stopped', sex: 'boy', birthDate: parts('2021-01-01') })]) {
      expect(res.statusCode, res.body).toBe(403);
      expect(jsonOf(res.body)).toEqual({ error: 'account_unavailable' });
    }
    expect(await countsOf(ACCOUNT_A)).toBe('1/1/2/2/1');
    expect(await childrenOf(ACCOUNT_A)).toBe(A_CHILDREN);
    await setStatus('a', 'active');
    expect((await GET(app, header)).statusCode).toBe(200);
    expect(ok((await PUT(app, header, id, { name: 'Back Again', sex: 'girl', birthDate: parts('2024-05-10') })).statusCode)).toBe(true);
    expect(await childrenOf(ACCOUNT_A)).toBe('1:Back Again:girl:2024-05-10 ; 2:Eli:boy:2022-01-15');
  });

  it('[F2.2a c10] an Auth user with no account row: every route -> 404 {error:"no_profile"}, nothing created', T, async () => {
    const app = await start();
    const before = await stateHash();
    const header = await bearerFor(C);
    for (const res of [await GET(app, header), await POST(app, header, child()), await PUT(app, header, await childId(ACCOUNT_A, 1), child())]) {
      expect(res.statusCode, res.body).toBe(404);
      expect(jsonOf(res.body)).toEqual({ error: 'no_profile' });
    }
    expect(await stateHash()).toBe(before);
    expect(await countsOf(C)).toBe('0/0/0/0/0');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2a c11 A8 NFR-PRIV-001] the logs of 2xx, 400 and 409 hold no child name, sex, birth date, due date or stage', () => {
  it('[F2.2a c11] GET, POST, PUT in success, 400 and 409: none of the values in the log', T, async () => {
    const app = await start();
    const u = await registered(app, 9);
    const NAME = 'Marker-Child-Zq9-Private';
    const DATE = parts('2019-03-17');
    expect(ok((await POST(app, u.header, { name: NAME, sex: 'girl', birthDate: DATE })).statusCode)).toBe(true);
    expect((await POST(app, u.header, { name: NAME, sex: 'girl', birthDate: DATE })).statusCode).toBe(409);
    expect((await POST(app, u.header, { name: `${NAME}${'x'.repeat(80)}`, sex: 'girl', birthDate: DATE })).statusCode).toBe(400);
    expect((await POST(app, u.header, { name: NAME, sex: 'girl', birthDate: DATE, userId: ACCOUNT_B })).statusCode).toBe(400);
    const header = await bearerFor(ACCOUNT_A);
    expect((await GET(app, header)).statusCode).toBe(200);
    expect(ok((await PUT(app, header, await childId(ACCOUNT_A, 2), { name: NAME, sex: 'girl', birthDate: DATE })).statusCode)).toBe(true);
    expect((await PUT(app, header, await childId(ACCOUNT_A, 2), { name: NAME, sex: 'girl', birthDate: parts('2031-01-01') })).statusCode).toBe(400);
    expect((await PUT(app, header, await childId(ACCOUNT_B, 1), { name: NAME, sex: 'girl', birthDate: DATE })).statusCode).toBe(404);
    const text = log.text();
    expect(text.length, 'the app wrote no log at all: the capture is not wired').toBeGreaterThan(0);
    for (const secret of [NAME, '2019-03-17', '"year":"2019"', '2031-01-01', 'girl', 'Noa', '2024-05-10', '2022-01-15', 'Tali', '2027-03-01', 'pregnant', 'has_child', 'planning', '"sex"', '"birthDate"', '"dueDate"', '"stage"']) {
      expect(text, `the log contains ${secret}`).not.toContain(secret);
    }
  });
});
