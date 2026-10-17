import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { ACCOUNT_A, ACCOUNT_B, AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { holdingAfterWork } from '../helpers/hold-transaction.js';
import { CLOCK_NOW, EMPTY_DATE, buildRegisterApp, captureLog, child, jsonOf, parts, post, validBody } from '../helpers/register-app.js';

// I2 F2.2b2 against the real database (CI `db` job, as app_server; OWNER_DATABASE_URL for the forced-failure seam only):
// DELETE /api/children/:id (remove a child), DELETE /api/journeys/:id (end a pregnancy), POST /api/journeys/:id/birth, and
// POST /api/journeys with the planning confirmation. Route names and the confirmation key (`endPlanning: true`) from interface.md.
// Spec criteria (.work/journeys-children/spec.md): 17 (hard delete, gone from GET, no longer counts, a new child shows last, a new
// pregnancy after an ended one), 18 (another account's id, unknown, non-uuid -> 404, nothing changes), 19 (has_child kept / deleted
// with the last child, atomically; has_child <=> >= 1 child after two concurrent writes), 20 (no body; a body -> 400; has_child or
// planning id -> 404; no log line), 21 (zero journeys), 22 (birth, atomic, 409 at 10), 23 (planning -> pregnant, atomic), 24
// (stopped, unregistered), 25 (already gone -> 404; double press), 11 (logs). Derived from spec.md and schema.md (F2.2b: "Server
// db tests", "Forced-failure seam"). Every test that deletes runs on FRESH registered users: the fixture rows of a and b are never
// written; they serve as the "another account" whose rows must stay what they are.

const T = { timeout: COLD_START_MS };
const LONG = { timeout: COLD_START_MS * 6 };
const S = '50000000-0000-4000-8000-000000000051';
const X = 'e0000000-0000-4000-8000-0000000000e5';
const C = 'c0000000-0000-4000-8000-0000000000c3';
const NOBODY = '99999999-9999-4999-8999-999999999999';
const OWNER_URL = process.env.OWNER_DATABASE_URL;

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

async function start(database: Database = createDatabase(url())): Promise<App> {
  log = captureLog();
  const app = await buildRegisterApp(env(), { database, clock: () => CLOCK_NOW, logStream: log.stream });
  toClose.push({ app, database });
  return app;
}
async function closeAll(): Promise<void> {
  for (const { app, database } of toClose.splice(0)) {
    await app.close();
    await database.close();
  }
}

const bearerFor = async (sub: string): Promise<string> => `Bearer ${await token({ key, sub })}`;
async function one(query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> {
  const rows = await query;
  return String(rows[0]?.v);
}
const journeysOf = (id: string) => one(side`select tests.fx_journeys(${id}::uuid) as v`);
const childrenOf = (id: string) => one(side`select tests.fx_children(${id}::uuid) as v`);
const countsOf = (id: string) => one(side`select tests.fx_counts(${id}::uuid) as v`);
const stateHash = () => one(side`select tests.fx_state() as v`);
const kidCount = async (id: string): Promise<number> => Number((await countsOf(id)).split('/')[3]);

interface User { id: string; header: string }
type Stage = 'planning' | 'pregnant' | 'has_child';
const kidNamed = (n: number) => child({ name: `ילד ${n}`, sex: 'boy', birthDate: parts('2020-01-01') });
/** A fresh, registered, active user with these stages and `kids` children (has_child needs >= 1). */
async function registered(app: App, stages: Stage[], kids = stages.includes('has_child') ? 1 : 0): Promise<User> {
  const [row] = await side`select tests.fx_new_auth_user()::text as id`;
  const id: unknown = row?.id;
  if (typeof id !== 'string') throw new Error('tests.fx_new_auth_user returned no id');
  const header = await bearerFor(id);
  const body = validBody({
    stages,
    dueDate: stages.includes('pregnant') ? parts('2026-12-01') : EMPTY_DATE,
    children: Array.from({ length: kids }, (_v, i) => kidNamed(i + 1)),
  });
  const res = await post(app, header, body);
  if (res.statusCode !== 201) throw new Error(`could not register a fresh user: ${res.statusCode} ${res.body}`);
  return { id, header };
}

const GET = (app: App, header: string) => app.inject({ method: 'GET', url: '/api/journeys', headers: { authorization: header } });
function send(app: App, method: 'POST' | 'DELETE', path: string, header: string | null, payload?: unknown) {
  const auth = header === null ? {} : { authorization: header };
  if (payload === undefined) return app.inject({ method, url: path, headers: auth });
  return app.inject({ method, url: path, headers: { ...auth, 'content-type': 'application/json' }, payload: typeof payload === 'string' ? payload : JSON.stringify(payload) });
}
const REMOVE = (app: App, header: string | null, id: string, payload?: unknown) => send(app, 'DELETE', `/api/children/${id}`, header, payload);
const END = (app: App, header: string | null, id: string, payload?: unknown) => send(app, 'DELETE', `/api/journeys/${id}`, header, payload);
const BIRTH = (app: App, header: string | null, id: string, payload: unknown) => send(app, 'POST', `/api/journeys/${id}/birth`, header, payload);
const ADD_KID = (app: App, header: string, payload: unknown) => send(app, 'POST', '/api/children', header, payload);
const ADD_PREG = (app: App, header: string, payload: unknown) => send(app, 'POST', '/api/journeys', header, payload);
const NEW_KID = { name: 'תינוקת', sex: 'girl', birthDate: parts('2026-06-10') };
const due = (iso: string | null) => ({ dueDate: iso === null ? EMPTY_DATE : parts(iso) });

interface Answer { journeys: Array<{ id: string; stage: string }>; children: Array<{ id: string; name: string }> }
function answer(body: string): Answer {
  const parsed = jsonOf(body);
  const pick = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? v.map((x: unknown) => (typeof x === 'object' && x !== null ? jsonOf(JSON.stringify(x)) : {})) : []);
  expect(Array.isArray(parsed.journeys) && Array.isArray(parsed.children), body).toBe(true);
  return {
    journeys: pick(parsed.journeys).map((j) => ({ id: String(j.id), stage: String(j.stage) })),
    children: pick(parsed.children).map((c) => ({ id: String(c.id), name: String(c.name) })),
  };
}
const read = async (app: App, u: User): Promise<Answer> => answer((await GET(app, u.header)).body);
const stagesIn = (a: Answer) => a.journeys.map((j) => j.stage);
const namesIn = (a: Answer) => a.children.map((c) => c.name);
async function journeyIdOf(app: App, u: User, stage: Stage): Promise<string> {
  const found = (await read(app, u)).journeys.find((j) => j.stage === stage);
  if (found === undefined) throw new Error(`no ${stage} journey`);
  return found.id;
}
const kidIds = async (app: App, u: User): Promise<string[]> => (await read(app, u)).children.map((c) => c.id);
/** DR-4: has_child exists if and only if at least one child does (owner-observed, not through RLS). */
async function invariantHolds(u: User): Promise<boolean> {
  return (await journeysOf(u.id)).includes('has_child') === (await kidCount(u.id)) > 0;
}

beforeAll(async () => {
  key = await newKey('journeys-remove-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
}, COLD_START_MS);

afterEach(closeAll);

afterAll(async () => {
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c17 c19 DR-1 VAL-040] DELETE /api/children/:id removes the caller\'s child for good', () => {
  it('[F2.2b c17 c19] removing one of two: 200 with the full answer, the row deleted, gone from GET; has_child kept', T, async () => {
    const app = await start();
    const u = await registered(app, ['has_child'], 2);
    const [first, second] = await kidIds(app, u);
    const res = await REMOVE(app, u.header, first ?? '');
    expect(res.statusCode, res.body).toBe(200);
    expect(namesIn(answer(res.body))).toEqual(['ילד 2']);
    expect(answer(res.body).children.map((c) => c.id)).toEqual([second]);
    expect(await kidCount(u.id), 'hard delete: no row remains, hidden or not').toBe(1);
    expect(await childrenOf(u.id)).not.toContain('ילד 1');
    expect((await read(app, u)).children.map((c) => c.id)).toEqual([second]);
    expect(await journeysOf(u.id)).toBe('has_child:null');
  });

  it('[F2.2b c17 VAL-040 AC-090] at 10: POST 409; remove one in the middle; POST 201 and the new child is shown last, also in GET', T, async () => {
    const app = await start();
    const u = await registered(app, ['has_child'], 10);
    expect((await ADD_KID(app, u.header, NEW_KID)).statusCode).toBe(409);
    const ids = await kidIds(app, u);
    expect((await REMOVE(app, u.header, ids[2] ?? '')).statusCode).toBe(200);
    expect(await kidCount(u.id)).toBe(9);
    const added = await ADD_KID(app, u.header, NEW_KID);
    expect(added.statusCode, added.body).toBe(201);
    const expected = ['ילד 1', 'ילד 2', 'ילד 4', 'ילד 5', 'ילד 6', 'ילד 7', 'ילד 8', 'ילד 9', 'ילד 10', 'תינוקת'];
    expect(namesIn(answer(added.body))).toEqual(expected);
    expect(namesIn(await read(app, u))).toEqual(expected);
    expect((await ADD_KID(app, u.header, NEW_KID)).statusCode, 'back at 10').toBe(409);
  });

  it('[F2.2b c17] remove the FIRST child, add one: the new child is last (a reused seat does not move it to the top)', T, async () => {
    const app = await start();
    const u = await registered(app, ['has_child'], 3);
    expect((await REMOVE(app, u.header, (await kidIds(app, u))[0] ?? '')).statusCode).toBe(200);
    expect((await ADD_KID(app, u.header, NEW_KID)).statusCode).toBe(201);
    expect(namesIn(await read(app, u))).toEqual(['ילד 2', 'ילד 3', 'תינוקת']);
    expect((await ADD_KID(app, u.header, { ...NEW_KID, name: 'עוד אחת' })).statusCode).toBe(201);
    expect(namesIn(await read(app, u))).toEqual(['ילד 2', 'ילד 3', 'תינוקת', 'עוד אחת']);
  });

  it('[F2.2b c19 c21 DR-4 DR-6] removing the last child deletes has_child too; with no other journey the answer is zero journeys', T, async () => {
    const app = await start();
    const u = await registered(app, ['has_child'], 1);
    const res = await REMOVE(app, u.header, (await kidIds(app, u))[0] ?? '');
    expect(res.statusCode, res.body).toBe(200);
    expect(answer(res.body)).toEqual({ journeys: [], children: [] });
    expect(await countsOf(u.id)).toBe('1/1/0/0/1');
    expect(await read(app, u)).toEqual({ journeys: [], children: [] });
  });

  it('[F2.2b c19] removing the last child with planning kept: has_child goes, planning stays', T, async () => {
    const app = await start();
    const u = await registered(app, ['planning', 'has_child'], 1);
    expect((await REMOVE(app, u.header, (await kidIds(app, u))[0] ?? '')).statusCode).toBe(200);
    expect(await journeysOf(u.id)).toBe('planning:null');
    expect(stagesIn(await read(app, u))).toEqual(['planning']);
  });

  it('[F2.2b c25 Q3] removing a child already gone (another tab): 404 {error:"not_found"}, nothing else changes', T, async () => {
    const app = await start();
    const u = await registered(app, ['has_child'], 2);
    const [first] = await kidIds(app, u);
    expect((await REMOVE(app, u.header, first ?? '')).statusCode).toBe(200);
    const before = await stateHash();
    const again = await REMOVE(app, u.header, first ?? '');
    expect(again.statusCode, again.body).toBe(404);
    expect(jsonOf(again.body)).toEqual({ error: 'not_found' });
    expect(await stateHash()).toBe(before);
  });

  it('[F2.2b c25] the same removal sent twice at once on two connections: one 200, one 404, exactly one row gone', T, async () => {
    for (let round = 1; round <= 5; round += 1) {
      const setupApp = await start();
      const u = await registered(setupApp, ['has_child'], 3);
      const [target] = await kidIds(setupApp, u);
      const [one1, two] = [await start(), await start()];
      const results = await Promise.all([REMOVE(one1, u.header, target ?? ''), REMOVE(two, u.header, target ?? '')]);
      expect(results.map((r) => r.statusCode).sort(), `round ${round}`).toEqual([200, 404]);
      expect(await kidCount(u.id)).toBe(2);
      await closeAll();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c20 c21 c17 DR-1 DR-2r] DELETE /api/journeys/:id ends the caller\'s pregnancy: deleted, no reason, no body', () => {
  it('[F2.2b c20] ending the pregnancy: 200, the row deleted, has_child and the children untouched; GET agrees', T, async () => {
    const app = await start();
    const u = await registered(app, ['pregnant', 'has_child'], 2);
    const res = await END(app, u.header, await journeyIdOf(app, u, 'pregnant'));
    expect(res.statusCode, res.body).toBe(200);
    expect(stagesIn(answer(res.body))).toEqual(['has_child']);
    expect(await journeysOf(u.id)).toBe('has_child:null');
    expect(await countsOf(u.id), 'no pregnant row remains, marked or hidden').toBe('1/1/1/2/1');
    expect(stagesIn(await read(app, u))).toEqual(['has_child']);
  });

  it('[F2.2b c21 DR-6] ending the only journey: 200, zero journeys, and a new pregnancy can then be added (c17, c15)', T, async () => {
    const app = await start();
    const u = await registered(app, ['pregnant']);
    const res = await END(app, u.header, await journeyIdOf(app, u, 'pregnant'));
    expect(res.statusCode, res.body).toBe(200);
    expect(answer(res.body)).toEqual({ journeys: [], children: [] });
    expect(await journeysOf(u.id)).toBe('-');
    const again = await ADD_PREG(app, u.header, due('2027-01-02'));
    expect(again.statusCode, again.body).toBe(201);
    expect(await journeysOf(u.id)).toBe('pregnant:2027-01-02');
  });

  it.each([['{}', {}], ['null', null], ['a reason', { reason: 'loss' }], ['an empty reason', { reason: '' }], ['a note', { note: 'x' }], ['an array', []]])(
    '[F2.2b c20 DR-2r] the end route takes no body: a body of %s -> 400, the pregnancy kept', T, async (_label, body) => {
      const app = await start();
      const u = await registered(app, ['pregnant']);
      const res = await END(app, u.header, await journeyIdOf(app, u, 'pregnant'), body);
      expect(res.statusCode, res.body).toBe(400);
      expect(await journeysOf(u.id)).toBe('pregnant:2026-12-01');
    });

  it('[F2.2b c20 c19 c23] the end route on the caller\'s own has_child or planning id -> 404, the journey kept', T, async () => {
    const app = await start();
    const hc = await registered(app, ['has_child'], 1);
    const r1 = await END(app, hc.header, await journeyIdOf(app, hc, 'has_child'));
    expect(r1.statusCode, r1.body).toBe(404);
    expect(jsonOf(r1.body)).toEqual({ error: 'not_found' });
    const pl = await registered(app, ['planning']);
    const mid = await stateHash();
    const r2 = await END(app, pl.header, await journeyIdOf(app, pl, 'planning'));
    expect(r2.statusCode, r2.body).toBe(404);
    expect(jsonOf(r2.body)).toEqual({ error: 'not_found' });
    expect(await journeysOf(hc.id)).toBe('has_child:null');
    expect(await journeysOf(pl.id)).toBe('planning:null');
    expect(await stateHash()).toBe(mid);
  });

  it('[F2.2b c25 Q3] ending a pregnancy already ended: 404 not_found', T, async () => {
    const app = await start();
    const u = await registered(app, ['pregnant', 'has_child'], 1);
    const id = await journeyIdOf(app, u, 'pregnant');
    expect((await END(app, u.header, id)).statusCode).toBe(200);
    const again = await END(app, u.header, id);
    expect(again.statusCode).toBe(404);
    expect(jsonOf(again.body)).toEqual({ error: 'not_found' });
  });

  it('[F2.2b c20 c11 DR-2r A8] the logs of an end, a refused body and a 404 hold no stage, date, id or reason', T, async () => {
    const app = await start();
    const u = await registered(app, ['pregnant', 'has_child'], 1);
    const id = await journeyIdOf(app, u, 'pregnant');
    const hcId = await journeyIdOf(app, u, 'has_child');
    expect((await END(app, u.header, id, { reason: 'Marker-Reason-Zq8' })).statusCode).toBe(400);
    expect((await END(app, u.header, hcId)).statusCode).toBe(404);
    expect((await END(app, u.header, id)).statusCode).toBe(200);
    const text = log.text();
    expect(text.length, 'the capture is not wired').toBeGreaterThan(0);
    for (const secret of [id, hcId, u.id, 'Marker-Reason-Zq8', 'reason', 'pregnant', 'has_child', '2026-12-01', '"stage"']) {
      expect(text, `the log contains ${secret}`).not.toContain(secret);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c22 DR-2 DR-4] POST /api/journeys/:id/birth adds the child and deletes the pregnancy, in one transaction', () => {
  it('[F2.2b c22] pregnant + has_child with children: 201, the pregnancy gone, the child added last, one has_child', T, async () => {
    const app = await start();
    const u = await registered(app, ['pregnant', 'has_child'], 2);
    const res = await BIRTH(app, u.header, await journeyIdOf(app, u, 'pregnant'), NEW_KID);
    expect(res.statusCode, res.body).toBe(201);
    expect(stagesIn(answer(res.body))).toEqual(['has_child']);
    expect(namesIn(answer(res.body))).toEqual(['ילד 1', 'ילד 2', 'תינוקת']);
    expect(await journeysOf(u.id)).toBe('has_child:null');
    expect(await childrenOf(u.id)).toContain(':תינוקת:girl:2026-06-10');
    expect(namesIn(await read(app, u))).toEqual(['ילד 1', 'ילד 2', 'תינוקת']);
  });

  it('[F2.2b c22 c7 DR-4] pregnant only: the birth also creates has_child', T, async () => {
    const app = await start();
    const u = await registered(app, ['pregnant']);
    const res = await BIRTH(app, u.header, await journeyIdOf(app, u, 'pregnant'), NEW_KID);
    expect(res.statusCode, res.body).toBe(201);
    expect(await journeysOf(u.id)).toBe('has_child:null');
    expect(await kidCount(u.id)).toBe(1);
  });

  it('[F2.2b c22 VAL-040] with 10 children: 409 {error:"children_too_many"}, the pregnancy kept, nothing written', T, async () => {
    const app = await start();
    const u = await registered(app, ['pregnant', 'has_child'], 10);
    const before = await stateHash();
    const res = await BIRTH(app, u.header, await journeyIdOf(app, u, 'pregnant'), NEW_KID);
    expect(res.statusCode, res.body).toBe(409);
    expect(jsonOf(res.body)).toEqual({ error: 'children_too_many' });
    expect(await stateHash()).toBe(before);
    expect(await journeysOf(u.id)).toBe('has_child:null ; pregnant:2026-12-01');
  });

  it.each([
    ['an empty name', { ...NEW_KID, name: '  ' }, 'child_name_required'],
    ['no sex', { ...NEW_KID, sex: '' }, 'child_sex_required'],
    ['a birth date tomorrow+1', { ...NEW_KID, birthDate: parts('2026-06-17') }, 'birth_date_future'],
    ['a partial birth date', { ...NEW_KID, birthDate: { day: '1', month: '', year: '2026' } }, 'birth_date_required'],
    ['a userId', { ...NEW_KID, userId: ACCOUNT_B }, 'invalid_body'],
    ['a slot', { ...NEW_KID, slot: 1 }, 'invalid_body'],
  ])('[F2.2b c22 c4 c5] birth with %s -> 400 {error:"invalid", reason:%j}, the pregnancy kept, no child', T, async (_label, body, reason) => {
    const app = await start();
    const u = await registered(app, ['pregnant']);
    const before = await stateHash();
    const res = await BIRTH(app, u.header, await journeyIdOf(app, u, 'pregnant'), body);
    expect(res.statusCode, res.body).toBe(400);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid', reason });
    expect(await stateHash()).toBe(before);
  });

  it('[F2.2b c22] birth on the caller\'s has_child or planning id -> 404, no child added', T, async () => {
    const app = await start();
    const combos: Stage[][] = [['has_child'], ['planning']];
    for (const stages of combos) {
      const u = await registered(app, stages);
      const before = await stateHash();
      const res = await BIRTH(app, u.header, await journeyIdOf(app, u, stages[0] ?? 'planning'), NEW_KID);
      expect(res.statusCode, res.body).toBe(404);
      expect(jsonOf(res.body)).toEqual({ error: 'not_found' });
      expect(await stateHash()).toBe(before);
    }
  });

  it('[F2.2b c22 c25] a birth sent twice (already done): the second is 404 and adds no second child', T, async () => {
    const app = await start();
    const u = await registered(app, ['pregnant']);
    const id = await journeyIdOf(app, u, 'pregnant');
    expect((await BIRTH(app, u.header, id, NEW_KID)).statusCode).toBe(201);
    expect((await BIRTH(app, u.header, id, NEW_KID)).statusCode).toBe(404);
    expect(await kidCount(u.id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c23 DR-3 VAL-039] planning -> pregnant: POST /api/journeys carrying the confirmation, one transaction', () => {
  it('[F2.2b c23] planning only + endPlanning: 201, planning deleted, pregnant created; GET agrees', T, async () => {
    const app = await start();
    const u = await registered(app, ['planning']);
    const res = await ADD_PREG(app, u.header, { ...due('2027-01-02'), endPlanning: true });
    expect(res.statusCode, res.body).toBe(201);
    expect(stagesIn(answer(res.body))).toEqual(['pregnant']);
    expect(await journeysOf(u.id)).toBe('pregnant:2027-01-02');
    expect(stagesIn(await read(app, u))).toEqual(['pregnant']);
  });

  it('[F2.2b c23] planning + has_child + endPlanning: pregnant before has_child, no planning, the child untouched', T, async () => {
    const app = await start();
    const u = await registered(app, ['planning', 'has_child'], 1);
    const res = await ADD_PREG(app, u.header, { ...due(null), endPlanning: true });
    expect(res.statusCode, res.body).toBe(201);
    expect(stagesIn(answer(res.body))).toEqual(['pregnant', 'has_child']);
    expect(await journeysOf(u.id)).toBe('has_child:null ; pregnant:null');
    expect(await kidCount(u.id)).toBe(1);
  });

  it('[F2.2b c23 c15] the confirmation with a pregnancy already present -> 409 stage_conflict, nothing changes', T, async () => {
    const app = await start();
    const u = await registered(app, ['pregnant']);
    const before = await stateHash();
    const res = await ADD_PREG(app, u.header, { ...due(null), endPlanning: true });
    expect(res.statusCode, res.body).toBe(409);
    expect(jsonOf(res.body)).toEqual({ error: 'stage_conflict' });
    expect(await stateHash()).toBe(before);
  });

  it('[F2.2b c23 c14] the confirmation does not bypass the date rules: today-31 -> 400, planning kept', T, async () => {
    const app = await start();
    const u = await registered(app, ['planning']);
    const res = await ADD_PREG(app, u.header, { ...due('2026-05-15'), endPlanning: true });
    expect(res.statusCode, res.body).toBe(400);
    expect(await journeysOf(u.id)).toBe('planning:null');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c18 A1 NFR-PRIV-005] another account\'s id, an unknown id, a non-uuid: 404 on every b2 route', () => {
  it('[F2.2b c18] owner O, intruder I (both fresh): remove, end and birth on O\'s ids -> 404 not_found; O unchanged; I gains no child', T, async () => {
    const app = await start();
    const owner = await registered(app, ['pregnant', 'has_child'], 2);
    const intruder = await registered(app, ['has_child'], 1);
    const [kid] = await kidIds(app, owner);
    const preg = await journeyIdOf(app, owner, 'pregnant');
    const hc = await journeyIdOf(app, owner, 'has_child');
    const before = await stateHash();
    for (const res of [
      await REMOVE(app, intruder.header, kid ?? ''), await END(app, intruder.header, preg), await END(app, intruder.header, hc),
      await BIRTH(app, intruder.header, preg, NEW_KID),
    ]) {
      expect(res.statusCode, res.body).toBe(404);
      expect(jsonOf(res.body)).toEqual({ error: 'not_found' });
    }
    expect(await stateHash()).toBe(before);
    expect(await countsOf(owner.id)).toBe('1/1/2/2/1');
    expect(await kidCount(intruder.id)).toBe(1);
  });

  it('[F2.2b c18] the fixture accounts: B on A\'s child and pregnancy, A on B\'s child and planning -> 404, both unchanged', T, async () => {
    const app = await start();
    const a: User = { id: ACCOUNT_A, header: await bearerFor(ACCOUNT_A) };
    const b: User = { id: ACCOUNT_B, header: await bearerFor(ACCOUNT_B) };
    const before = await stateHash();
    const aKid = (await kidIds(app, a))[0] ?? '';
    const bKid = (await kidIds(app, b))[0] ?? '';
    for (const res of [
      await REMOVE(app, b.header, aKid), await END(app, b.header, await journeyIdOf(app, a, 'pregnant')),
      await BIRTH(app, b.header, await journeyIdOf(app, a, 'pregnant'), NEW_KID),
      await REMOVE(app, a.header, bKid), await END(app, a.header, await journeyIdOf(app, b, 'planning')),
    ]) {
      expect(res.statusCode, res.body).toBe(404);
      expect(jsonOf(res.body)).toEqual({ error: 'not_found' });
    }
    expect(await stateHash()).toBe(before);
  });

  it('[F2.2b c18] someone else\'s id and an id that exists nowhere get the same answer (no existence oracle)', T, async () => {
    const app = await start();
    const owner = await registered(app, ['pregnant', 'has_child'], 1);
    const intruder = await registered(app, ['has_child'], 1);
    const theirs = await REMOVE(app, intruder.header, (await kidIds(app, owner))[0] ?? '');
    const nobody = await REMOVE(app, intruder.header, NOBODY);
    expect([theirs.statusCode, theirs.body]).toEqual([nobody.statusCode, nobody.body]);
    const theirEnd = await END(app, intruder.header, await journeyIdOf(app, owner, 'pregnant'));
    const nobodyEnd = await END(app, intruder.header, NOBODY);
    expect([theirEnd.statusCode, theirEnd.body]).toEqual([nobodyEnd.statusCode, nobodyEnd.body]);
  });

  it.each([['a word', 'not-a-uuid'], ['a number', '12345'], ['SQL', "1'%20or%20'1'='1"], ['a uuid with junk', '11111111-1111-4111-8111-11111111111x'], ['a very long id', 'a'.repeat(2000)]])(
    '[F2.2b c18 S2] %s for the id on remove, end and birth -> 404 {error:"not_found"}, nothing written', T, async (_label, id) => {
      const app = await start();
      const u = await registered(app, ['pregnant', 'has_child'], 1);
      const before = await stateHash();
      for (const res of [await REMOVE(app, u.header, id), await END(app, u.header, id), await BIRTH(app, u.header, id, NEW_KID)]) {
        expect(res.statusCode, res.body).toBe(404);
        expect(jsonOf(res.body)).toEqual({ error: 'not_found' });
      }
      expect(await stateHash()).toBe(before);
    });

  it('[F2.2b c18 c17] the remove route takes no body either: {} or {"userId": B} -> 400, the child kept', T, async () => {
    const app = await start();
    const u = await registered(app, ['has_child'], 2);
    const [kid] = await kidIds(app, u);
    for (const body of [{}, { userId: ACCOUNT_B }]) expect((await REMOVE(app, u.header, kid ?? '', body)).statusCode).toBe(400);
    expect(await kidCount(u.id)).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c24 A9 ERR-037 F2.1 DR-T1] stopped and unregistered accounts on the b2 routes', () => {
  it.each(['suspended', 'banned'] as const)('[F2.2b c24] a fresh user becomes %s: remove, end, birth, planning -> pregnant -> 403, nothing deleted', T, async (status) => {
    const app = await start();
    const u = await registered(app, ['pregnant', 'has_child'], 2);
    const pl = await registered(app, ['planning']);
    const [kid] = await kidIds(app, u);
    const preg = await journeyIdOf(app, u, 'pregnant');
    await side`select tests.set_status(${u.id}::uuid, ${status})`;
    await side`select tests.set_status(${pl.id}::uuid, ${status})`;
    const before = await stateHash();
    for (const res of [
      await REMOVE(app, u.header, kid ?? ''), await END(app, u.header, preg), await BIRTH(app, u.header, preg, NEW_KID),
      await ADD_PREG(app, pl.header, { ...due(null), endPlanning: true }),
    ]) {
      expect(res.statusCode, res.body).toBe(403);
      expect(jsonOf(res.body)).toEqual({ error: 'account_unavailable' });
      expect(res.body).not.toMatch(/ילד|pregnant|has_child|planning/);
    }
    expect(await stateHash()).toBe(before);
    await side`select tests.set_status(${u.id}::uuid, 'active')`;
    expect((await REMOVE(app, u.header, kid ?? '')).statusCode, 'active again: the removal works').toBe(200);
  });

  it.each([['s', S], ['x', X]] as const)('[F2.2b c24] the fixture account %s on A\'s ids -> 403, nothing written', T, async (_who, id) => {
    const app = await start();
    const a: User = { id: ACCOUNT_A, header: await bearerFor(ACCOUNT_A) };
    const aKid = (await kidIds(app, a))[0] ?? '';
    const aPreg = await journeyIdOf(app, a, 'pregnant');
    const before = await stateHash();
    const header = await bearerFor(id);
    for (const res of [await REMOVE(app, header, aKid), await END(app, header, aPreg), await BIRTH(app, header, aPreg, NEW_KID)]) {
      expect(res.statusCode, res.body).toBe(403);
      expect(jsonOf(res.body)).toEqual({ error: 'account_unavailable' });
    }
    expect(await stateHash()).toBe(before);
  });

  it('[F2.2b c24] an Auth user with no account row: the b2 routes -> 404 {error:"no_profile"}, nothing created', T, async () => {
    const app = await start();
    const before = await stateHash();
    const header = await bearerFor(C);
    for (const res of [await REMOVE(app, header, NOBODY), await END(app, header, NOBODY), await BIRTH(app, header, NOBODY, NEW_KID), await ADD_PREG(app, header, { ...due(null), endPlanning: true })]) {
      expect(res.statusCode, res.body).toBe(404);
      expect(jsonOf(res.body)).toEqual({ error: 'no_profile' });
    }
    expect(await stateHash()).toBe(before);
    expect(await countsOf(C)).toBe('0/0/0/0/0');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c19 DR-4 schema "has_child ⇔ ≥ 1"] two concurrent writes: has_child exists if and only if a child does', () => {
  type Write = (app: App, u: User, ids: string[]) => ReturnType<typeof REMOVE>;
  const removeAt = (i: number): Write => (app, u, ids) => REMOVE(app, u.header, ids[i] ?? '');
  const add: Write = (app, u) => ADD_KID(app, u.header, NEW_KID);
  const cases: Array<[string, number, Write, Write]> = [
    ['remove the last two (first held)', 2, removeAt(0), removeAt(1)],
    ['add one while removing the last (the removal held)', 1, removeAt(0), add],
    ['add one while removing the last (the add held)', 1, add, removeAt(0)],
  ];
  it.each(cases)('[F2.2b c19] %s, 20 rounds, the first transaction held open after its work: the invariant holds every time', LONG, async (_label, kids, first, second) => {
    for (let round = 1; round <= 20; round += 1) {
      const setupApp = await start();
      const u = await registered(setupApp, ['has_child'], kids);
      const ids = await kidIds(setupApp, u);
      const holder = holdingAfterWork(createDatabase(url()));
      const held = await start(holder.database);
      const other = await start();
      holder.arm();
      const p1 = first(held, u, ids);
      const state = await Promise.race([holder.reached.then(() => 'held'), p1.then(() => 'done')]);
      expect(state, `round ${round}: the first write never opened a transaction to hold`).toBe('held');
      const p2 = second(other, u, ids);
      await new Promise((resolve) => setTimeout(resolve, 150));
      holder.release();
      const [r1, r2] = await Promise.all([p1, p2]);
      expect([r1.statusCode, r2.statusCode].every((s) => s === 200 || s === 201), `round ${round}: ${r1.body} | ${r2.body}`).toBe(true);
      expect(await invariantHolds(u), `round ${round}: ${await journeysOf(u.id)} with ${await kidCount(u.id)} children`).toBe(true);
      await closeAll();
    }
  });

  it('[F2.2b c19 control] the hazard is real: the same two removals as plain SQL with no lock leave has_child with no child', T, async () => {
    const app = await start();
    const u = await registered(app, ['has_child'], 2);
    const ids = await kidIds(app, u);
    const claims = JSON.stringify({ sub: u.id, role: 'authenticated', aud: 'authenticated' });
    const [c1, c2] = [postgres(url(), { max: 1, prepare: false }), postgres(url(), { max: 1, prepare: false })];
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    let firstDone: () => void = () => undefined;
    const firstReady = new Promise<void>((resolve) => { firstDone = resolve; });
    const removeKeepingRule = (sql: ReturnType<typeof postgres>, id: string, hold: boolean) => sql.begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claims', ${claims}, true)`;
      await tx`delete from nestly.children where id = ${id}::uuid`;
      const left = await tx`select 1 from nestly.children limit 1`;
      if (left.length === 0) await tx`delete from nestly.journey_contexts where stage = 'has_child'`;
      if (hold) { firstDone(); await gate; }
    });
    try {
      const p1 = removeKeepingRule(c1, ids[0] ?? '', true);
      await firstReady;
      await removeKeepingRule(c2, ids[1] ?? '', false);
      open();
      await p1;
    } finally {
      await c1.end({ timeout: 5 });
      await c2.end({ timeout: 5 });
    }
    expect(await kidCount(u.id)).toBe(0);
    expect(await invariantHolds(u), 'without a lock both removals keep has_child: the tests above would catch a server that does this').toBe(false);
  });

  it.each(cases)('[F2.2b c19] %s, 10 rounds at once with no hold: the invariant holds every time', LONG, async (_label, kids, first, second) => {
    for (let round = 1; round <= 10; round += 1) {
      const setupApp = await start();
      const u = await registered(setupApp, ['has_child'], kids);
      const ids = await kidIds(setupApp, u);
      const [one1, two] = [await start(), await start()];
      await Promise.all([first(one1, u, ids), second(two, u, ids)]);
      expect(await invariantHolds(u), `round ${round}: ${await journeysOf(u.id)}`).toBe(true);
      await closeAll();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The schema.md seam: through OWNER_DATABASE_URL (app_owner) a trigger that raises, scoped by WHEN to the victim user, on one step.
// app_owner has no CREATE on schema `tests` (postgres owns it), so the raising function lives in a scratch schema of its own,
// dropped with the trigger in `finally`.
interface Step { table: 'children' | 'journey_contexts'; op: 'insert' | 'delete'; stage?: Stage }
async function withFailingStep<R>(victim: string, step: Step, run: () => Promise<R>): Promise<R> {
  if (OWNER_URL === undefined || OWNER_URL === '') throw new Error('OWNER_DATABASE_URL is not set: the forced-failure seam is required in CI');
  const owner = postgres(OWNER_URL, { max: 1, prepare: false, onnotice: () => undefined });
  const row = step.op === 'delete' ? 'old' : 'new';
  const when = `${row}.user_id = '${victim}'::uuid${step.stage === undefined ? '' : ` and ${row}.stage = '${step.stage}'`}`;
  try {
    await owner.unsafe(`create schema if not exists zz_te_seam;
      create or replace function zz_te_seam.fail_step() returns trigger language plpgsql security invoker set search_path = ''
        as $f$ begin raise exception 'forced step failure'; end $f$;
      create trigger zz_te_fail before ${step.op} on nestly.${step.table} for each row when (${when}) execute function zz_te_seam.fail_step();`);
    return await run();
  } finally {
    await owner.unsafe(`drop trigger if exists zz_te_fail on nestly.${step.table}; drop schema if exists zz_te_seam cascade;`);
    await owner.end({ timeout: 5 });
  }
}

describe('[F2.2b c19 c22 c23 schema "Forced-failure seam"] a failure of any step rolls the whole write back', () => {
  const failed = (status: number) => status >= 500;

  const REMOVE_STEPS: Array<[string, Step]> = [
    ['delete child', { table: 'children', op: 'delete' }],
    ['delete has_child', { table: 'journey_contexts', op: 'delete', stage: 'has_child' }],
  ];
  const BIRTH_STEPS: Array<[string, Stage[], Step]> = [
    ['delete pregnant', ['pregnant', 'has_child'], { table: 'journey_contexts', op: 'delete', stage: 'pregnant' }],
    ['insert has_child', ['pregnant'], { table: 'journey_contexts', op: 'insert', stage: 'has_child' }],
    ['insert child (pregnant + has_child)', ['pregnant', 'has_child'], { table: 'children', op: 'insert' }],
    ['insert child (pregnant only)', ['pregnant'], { table: 'children', op: 'insert' }],
  ];
  const PLANNING_STEPS: Array<[string, Step]> = [
    ['delete planning', { table: 'journey_contexts', op: 'delete', stage: 'planning' }],
    ['insert pregnant', { table: 'journey_contexts', op: 'insert', stage: 'pregnant' }],
  ];

  it.each(REMOVE_STEPS)('[F2.2b c19] removing the last child, the step "%s" fails: 5xx, the child and has_child both remain', T, async (_label, step) => {
    const app = await start();
    const u = await registered(app, ['has_child'], 1);
    const before = `${await journeysOf(u.id)} | ${await childrenOf(u.id)}`;
    const res = await withFailingStep(u.id, step, async () => REMOVE(app, u.header, (await kidIds(app, u))[0] ?? ''));
    expect(failed(res.statusCode), res.body).toBe(true);
    expect(res.body).not.toContain('forced step failure');
    expect(`${await journeysOf(u.id)} | ${await childrenOf(u.id)}`).toBe(before);
  });

  it.each(BIRTH_STEPS)('[F2.2b c22] a birth, the step "%s" fails: 5xx, every row as before', T, async (_label, stages, step) => {
    const app = await start();
    const u = await registered(app, stages);
    const id = await journeyIdOf(app, u, 'pregnant');
    const before = `${await journeysOf(u.id)} | ${await childrenOf(u.id)}`;
    const res = await withFailingStep(u.id, step, () => BIRTH(app, u.header, id, NEW_KID));
    expect(failed(res.statusCode), res.body).toBe(true);
    expect(`${await journeysOf(u.id)} | ${await childrenOf(u.id)}`).toBe(before);
    expect(await journeysOf(u.id)).toContain('pregnant:2026-12-01');
  });

  it.each(PLANNING_STEPS)('[F2.2b c23] planning -> pregnant, the step "%s" fails: 5xx, planning kept and no pregnant', T, async (_label, step) => {
    const app = await start();
    const u = await registered(app, ['planning']);
    const res = await withFailingStep(u.id, step, () => ADD_PREG(app, u.header, { ...due('2027-01-02'), endPlanning: true }));
    expect(failed(res.statusCode), res.body).toBe(true);
    expect(await journeysOf(u.id)).toBe('planning:null');
  });

  it('[F2.2b c11 A8] the 5xx logs of a forced failure hold no child name, stage, date or id', T, async () => {
    const app = await start();
    const u = await registered(app, ['pregnant']);
    const id = await journeyIdOf(app, u, 'pregnant');
    const res = await withFailingStep(u.id, { table: 'children', op: 'insert' }, () => BIRTH(app, u.header, id, NEW_KID));
    expect(failed(res.statusCode)).toBe(true);
    const text = log.text();
    expect(text.length).toBeGreaterThan(0);
    for (const secret of ['תינוקת', 'girl', '2026-06-10', '"birthDate"', 'pregnant', 'has_child', id, u.id, 'forced step failure']) {
      expect(text, `the log contains ${secret}`).not.toContain(secret);
    }
  });

  it('[F2.2b seam control] the seam really fires: with the trigger on another user, the victim\'s removal succeeds', T, async () => {
    const app = await start();
    const u = await registered(app, ['has_child'], 2);
    const bystander = await registered(app, ['has_child'], 1);
    const res = await withFailingStep(bystander.id, { table: 'children', op: 'delete' }, async () => REMOVE(app, u.header, (await kidIds(app, u))[0] ?? ''));
    expect(res.statusCode, res.body).toBe(200);
    expect(await kidCount(u.id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c11 A8 NFR-PRIV-001] the logs of the b2 routes in 2xx, 400, 404 and 409 hold no child or journey data', () => {
  it('[F2.2b c11] remove, birth (201, 400, 409) and planning -> pregnant: none of the values in the log', T, async () => {
    const app = await start();
    const u = await registered(app, ['pregnant', 'has_child'], 10);
    const pl = await registered(app, ['planning']);
    const ids = await kidIds(app, u);
    const preg = await journeyIdOf(app, u, 'pregnant');
    expect((await BIRTH(app, u.header, preg, NEW_KID)).statusCode).toBe(409);
    expect((await BIRTH(app, u.header, preg, { ...NEW_KID, name: '' })).statusCode).toBe(400);
    expect((await REMOVE(app, u.header, ids[0] ?? '')).statusCode).toBe(200);
    expect((await REMOVE(app, u.header, ids[0] ?? '')).statusCode).toBe(404);
    expect((await BIRTH(app, u.header, preg, NEW_KID)).statusCode).toBe(201);
    expect((await ADD_PREG(app, pl.header, { ...due('2027-02-17'), endPlanning: true })).statusCode).toBe(201);
    const text = log.text();
    expect(text.length).toBeGreaterThan(0);
    for (const secret of ['ילד', 'תינוקת', 'girl', 'boy', '2026-06-10', '2020-01-01', '2027-02-17', '"birthDate"', '"endPlanning"', 'pregnant', 'has_child', 'planning', ids[0] ?? '-', preg, u.id, pl.id]) {
      expect(text, `the log contains ${secret}`).not.toContain(secret);
    }
  });
});
