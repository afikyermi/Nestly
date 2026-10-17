import type { Writable } from 'node:stream';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { ACCOUNT_A, ACCOUNT_B, AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { CLOCK_NOW, EMPTY_DATE, buildRegisterApp, captureLog, child, parts, post, validBody } from '../helpers/register-app.js';
import { act, getLists, parseLists, sendTo } from '../helpers/friends-api.js';
import { LIMIT_HEADERS, LIMIT_WORDS, keysDeep, opened } from '../helpers/profile-view-api.js';

// I2 F2.4c1, the viewer API and the profile-open limit against the real database (CI `db` job, as app_server, fixtures of
// supabase/tests/setup/, 61_open_limit_fixtures.sql for the Configuration and the counters). Spec criteria (.work/friends/spec.md):
//   c16 the viewer API · c17-c19 Friend branch, lists, state (their rules: pgTAP 63, here seen through HTTP) · c20 the limit and
//   120 concurrent opens · c21 the committed Security event · c22 Configuration read at each open, fail closed · c23 no number in any
//   response · c24 a Friend-request send counts as an open.
// Derived from spec.md and schema.md only; the body keys are the assumptions listed in helpers/profile-view-api.ts.
// The Configuration is global: the file runs serially (npm run test:db) and restores 100 per 3600 s after every test.

const T = { timeout: COLD_START_MS };
const S = '50000000-0000-4000-8000-000000000051';
const X = 'e0000000-0000-4000-8000-0000000000e5';
const P = 'd0000000-0000-4000-8000-0000000000d4';
const M = '60000000-0000-4000-8000-0000000000a1';
const D = '60000000-0000-4000-8000-0000000000a2';
const NOBODY = '99999999-9999-4999-8999-999999999999';
const NAME_B = 'Bella Baruch';
const KEYS = ['childAges', 'childrenCount', 'friends', 'fullName', 'gender', 'isPregnant', 'mutualFriends', 'relationship', 'showsEmptyJourneySentence'];

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
const toClose: Array<{ app: App; database: Database }> = [];

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
}
const env = () => ({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() });
async function start(logStream?: Writable): Promise<App> {
  const database = createDatabase(url());
  const app = await buildRegisterApp(env(), { database, clock: () => CLOCK_NOW, ...(logStream ? { logStream } : {}) });
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
const setLimit = async (n: number, w: number): Promise<void> => {
  await side`select tests.fx_set_limit(${n}, ${w})`;
};
const events = async (who: string): Promise<number> => Number(await one(side`select tests.fx_events(${who}::uuid) as v`));
const opensOf = async (who: string): Promise<number> => Number(await one(side`select tests.fx_open_count(${who}::uuid) as v`));
const rows = (x: string, y: string) => one(side`select tests.fx_fr_rows(${x}::uuid, ${y}::uuid) as v`);
const frCount = async (): Promise<number> => Number(await one(side`select tests.fx_fr_count() as v`));
const WHO = [ACCOUNT_A, ACCOUNT_B, S, X, P];
async function resetAll(): Promise<void> {
  await setLimit(100, 3600);
  for (const who of WHO) {
    await side`select tests.fx_open_reset(${who}::uuid)`;
    await side`select tests.fx_fr_purge(${who}::uuid)`;
  }
}
async function freshUser(): Promise<string> {
  const [row] = await side`select tests.fx_new_auth_user()::text as id`;
  const id: unknown = row?.id;
  if (typeof id !== 'string') throw new Error('tests.fx_new_auth_user returned no id: is 20_registration_fixtures.sql loaded?');
  return id;
}
async function registered(app: App, fullName: string): Promise<{ id: string; header: string }> {
  const id = await freshUser();
  const header = await bearerFor(id);
  const res = await post(app, header, validBody({ fullName, stages: ['has_child'], dueDate: EMPTY_DATE, children: [child({ name: 'ילד', sex: 'boy', birthDate: parts('2020-01-01') })] }));
  if (res.statusCode !== 201) throw new Error(`could not register a fresh user: ${res.statusCode} ${res.body}`);
  return { id, header };
}

let hA: string;
let hB: string;

beforeAll(async () => {
  key = await newKey('profile-view-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  hA = await bearerFor(ACCOUNT_A);
  hB = await bearerFor(ACCOUNT_B);
}, COLD_START_MS);
beforeEach(async () => {
  await side`select tests.set_status(${ACCOUNT_A}::uuid, 'active')`;
  await side`select tests.set_status(${ACCOUNT_B}::uuid, 'active')`;
  await resetAll();
});
afterEach(async () => {
  await closeAll();
  await resetAll();
});
afterAll(async () => {
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4c1 c16 FR-PRIV-001 BR-044 OP-020 A9] the viewer API', () => {
  it('[F2.4c1 c16] A opens B: 200, exactly the profile items, B\'s name, no id', T, async () => {
    const app = await start();
    const r = await opened(app, hA, ACCOUNT_B);
    expect(r.status, r.body).toBe(200);
    expect(Object.keys(r.json).sort()).toEqual(KEYS);
    expect(r.json.fullName).toBe(NAME_B);
    expect(r.json.relationship).toBe('none');
    expect(r.json.friends).toEqual([]);
    expect(r.json.mutualFriends).toEqual([]);
    expect(r.body).not.toContain(ACCOUNT_B);
    expect(r.body).not.toMatch(/email|consent|tracker|birth|"slot"|"id"/i);
  });

  it('[F2.4c1 c16 OP-020] P (Professional) opens B: 200, the same profile, no relationship state', T, async () => {
    const app = await start();
    const viaA = await opened(app, hA, ACCOUNT_B);
    const viaP = await opened(app, await bearerFor(P), ACCOUNT_B);
    expect(viaP.status, viaP.body).toBe(200);
    expect(viaP.json.relationship).toBeNull();
    expect({ ...viaP.json, relationship: 'none' }).toEqual(viaA.json);
  });

  it('[F2.4c1 c16] P, M, D, a random uuid, S (suspended), X (banned) as targets -> 404 {error:"unavailable"}, one identical body, even for the viewer\'s own Friend', T, async () => {
    const app = await start();
    const bodies: string[] = [];
    for (const target of [P, M, D, NOBODY, S, X]) {
      const r = await opened(app, hA, target);
      expect(r.status, `${target}: ${r.body}`).toBe(404);
      expect(r.json).toEqual({ error: 'unavailable' });
      bodies.push(r.body);
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it.each([['suspended', S], ['banned', X]])('[F2.4c1 c16 A9] a %s viewer -> 403 account_unavailable, no profile', T, async (_label, who) => {
    const app = await start();
    const r = await opened(app, await bearerFor(who), ACCOUNT_B);
    expect(r.status, r.body).toBe(403);
    expect(r.json).toEqual({ error: 'account_unavailable' });
  });

  it('[F2.4c1 c16 c17 c18 c19 FR-REL-001] none -> sent / received -> friends -> removed: the state, the Friends and the mutual Friends follow the rows', T, async () => {
    const app = await start();
    const c = await registered(app, 'Carmel Shani');
    expect((await opened(app, hA, ACCOUNT_B)).json.relationship).toBe('none');
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    expect((await opened(app, hA, ACCOUNT_B)).json.relationship).toBe('sent');
    expect((await opened(app, hB, ACCOUNT_A)).json.relationship).toBe('received');
    expect((await act(app, hB, 'decline', ACCOUNT_A)).statusCode).toBe(200);
    expect((await opened(app, hA, ACCOUNT_B)).json.relationship, 'DR-3: the decline is silent').toBe('sent');
    expect((await opened(app, hB, ACCOUNT_A)).json.relationship).toBe('none');
    await side`select tests.fx_fr_purge(${ACCOUNT_A}::uuid)`;
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    expect((await act(app, hB, 'accept', ACCOUNT_A)).statusCode).toBe(200);
    expect((await opened(app, hA, ACCOUNT_B)).json.relationship).toBe('friends');
    expect((await opened(app, hB, ACCOUNT_A)).json.relationship).toBe('friends');
    // C becomes a Friend of B, then of A: B's Friends list, the viewer excluded, and the mutual list
    expect((await sendTo(app, c.header, ACCOUNT_B)).statusCode).toBe(201);
    expect((await act(app, hB, 'accept', c.id)).statusCode).toBe(200);
    const cEntry = { userId: c.id, fullName: 'Carmel Shani' };
    let r = await opened(app, hA, ACCOUNT_B);
    expect(r.json.friends).toEqual([cEntry]);
    expect(r.json.mutualFriends).toEqual([]);
    expect((await sendTo(app, hA, c.id)).statusCode).toBe(201);
    expect((await act(app, c.header, 'accept', ACCOUNT_A)).statusCode).toBe(200);
    r = await opened(app, hA, ACCOUNT_B);
    expect(r.json.friends).toEqual([cEntry]);
    expect(r.json.mutualFriends).toEqual([cEntry]);
    expect(JSON.stringify(r.json.friends)).not.toContain(ACCOUNT_A);
    expect((await act(app, hA, 'remove', ACCOUNT_B)).statusCode).toBe(200);
    expect((await opened(app, hA, ACCOUNT_B)).json.relationship).toBe('none');
    expect((await getLists(app, hA)).statusCode).toBe(200);
    expect(parseLists((await getLists(app, hA)).body).friends.map((e) => e.userId)).toEqual([c.id]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4c1 c20 c21 c22 NFR-SEC-006 AC-078 ERR-032] the profile-open limit', () => {
  it('[F2.4c1 c20 c22] N = 3 set by the fixture, no restart: the 4th open is 429 rate_limited with no profile; another account is unaffected', T, async () => {
    await setLimit(3, 3600);
    const app = await start();
    for (let i = 0; i < 3; i++) expect((await opened(app, hA, ACCOUNT_B)).status).toBe(200);
    const r = await opened(app, hA, ACCOUNT_B);
    expect(r.status, r.body).toBe(429);
    expect(r.json).toEqual({ error: 'rate_limited' });
    expect((await opened(app, hA, ACCOUNT_B)).status).toBe(429);
    expect((await opened(app, hB, ACCOUNT_A)).status, 'B is counted apart').toBe(200);
    expect(await opensOf(ACCOUNT_A), 'refused opens are not counted').toBe(3);
  });

  it('[F2.4c1 c22] the same app instance reads the new N at the next open: raised to 5, two more are 200, then 429; lowered to 2, refused at once', T, async () => {
    await setLimit(3, 3600);
    const app = await start();
    for (let i = 0; i < 3; i++) await opened(app, hA, ACCOUNT_B);
    expect((await opened(app, hA, ACCOUNT_B)).status).toBe(429);
    await setLimit(5, 3600);
    expect((await opened(app, hA, ACCOUNT_B)).status).toBe(200);
    expect((await opened(app, hA, ACCOUNT_B)).status).toBe(200);
    expect((await opened(app, hA, ACCOUNT_B)).status).toBe(429);
    await setLimit(2, 3600);
    expect((await opened(app, hA, ACCOUNT_B)).status).toBe(429);
  });

  it('[F2.4c1 c20] opens of unavailable targets count: two 404s, then an open of B is 429; 429 refusals do not extend it', T, async () => {
    await setLimit(2, 3600);
    const app = await start();
    expect((await opened(app, hA, NOBODY)).status).toBe(404);
    expect((await opened(app, hA, P)).status).toBe(404);
    expect((await opened(app, hA, ACCOUNT_B)).status).toBe(429);
    expect((await opened(app, hA, NOBODY)).status, 'at the limit even an unavailable target is 429').toBe(429);
  });

  it('[F2.4c1 c20] once the window allows it, opens succeed again', T, async () => {
    await setLimit(2, 3600);
    const app = await start();
    await opened(app, hA, ACCOUNT_B);
    await opened(app, hA, ACCOUNT_B);
    expect((await opened(app, hA, ACCOUNT_B)).status).toBe(429);
    await side`select tests.fx_age_opens(${ACCOUNT_A}::uuid, interval '3601 seconds')`;
    expect((await opened(app, hA, ACCOUNT_B)).status).toBe(200);
  });

  it('[F2.4c1 c20] P is counted too', T, async () => {
    await setLimit(2, 3600);
    const app = await start();
    const hP = await bearerFor(P);
    expect((await opened(app, hP, ACCOUNT_B)).status).toBe(200);
    expect((await opened(app, hP, ACCOUNT_B)).status).toBe(200);
    expect((await opened(app, hP, ACCOUNT_B)).status).toBe(429);
  });

  it('[F2.4c1 c20] 120 concurrent opens by one account (20 connections x 6) with 100 per hour: exactly 100 are 200, the rest 429, none else', { timeout: 300_000 }, async () => {
    const apps: App[] = [];
    for (let i = 0; i < 20; i++) apps.push(await start());
    const results = await Promise.all(apps.flatMap((app) => Array.from({ length: 6 }, () => opened(app, hA, ACCOUNT_B))));
    const statuses = results.map((r) => r.status);
    expect(statuses.length).toBe(120);
    expect(statuses.filter((s) => s === 200).length, `statuses: ${JSON.stringify(statuses.filter((s) => s !== 200 && s !== 429))}`).toBeLessThanOrEqual(100);
    expect(statuses.filter((s) => s !== 200 && s !== 429)).toEqual([]);
    expect(statuses.filter((s) => s === 200).length).toBe(100);
    expect(await opensOf(ACCOUNT_A)).toBe(100);
    expect(await events(ACCOUNT_A), 'one stretch of refusals, one event').toBe(1);
  });

  it('[F2.4c1 c21 NFR-SEC-006 (5)] the first refusal leaves one committed Security event although the request was refused; further refusals add none; a counted open ends the stretch', T, async () => {
    await setLimit(3, 3600);
    const app = await start();
    for (let i = 0; i < 3; i++) await opened(app, hA, ACCOUNT_B);
    expect(await events(ACCOUNT_A)).toBe(0);
    expect((await opened(app, hA, ACCOUNT_B)).status).toBe(429);
    expect(await events(ACCOUNT_A), 'visible from another connection: it was committed').toBe(1);
    expect(await one(side`select tests.fx_event_kinds(${ACCOUNT_A}::uuid) as v`)).toBe('profile_open_limit');
    expect((await opened(app, hA, ACCOUNT_B)).status).toBe(429);
    expect((await opened(app, hA, NOBODY)).status).toBe(429);
    expect(await events(ACCOUNT_A)).toBe(1);
    expect(await events(ACCOUNT_B)).toBe(0);
    await side`select tests.fx_age_opens(${ACCOUNT_A}::uuid, interval '3601 seconds')`;
    for (let i = 0; i < 3; i++) expect((await opened(app, hA, ACCOUNT_B)).status).toBe(200);
    expect((await opened(app, hA, ACCOUNT_B)).status).toBe(429);
    expect(await events(ACCOUNT_A)).toBe(2);
  });

  it('[F2.4c1 c22 P6] the Configuration row absent: every open is 429 rate_limited, no profile, no count, no Security event, and a server error is logged', T, async () => {
    const log = captureLog();
    const app = await start(log.stream);
    await side`select tests.fx_drop_limit()`;
    for (const target of [ACCOUNT_B, NOBODY]) {
      const r = await opened(app, hA, target);
      expect(r.status, r.body).toBe(429);
      expect(r.json).toEqual({ error: 'rate_limited' });
    }
    expect(await opensOf(ACCOUNT_A)).toBe(0);
    expect(await events(ACCOUNT_A)).toBe(0);
    expect(log.lines().some((l) => /"level":(50|60)\b/.test(l)), `no error line in: ${log.text().slice(0, 500)}`).toBe(true);
    expect(log.text()).not.toContain(NAME_B);
    await setLimit(100, 3600);
    expect((await opened(app, hA, ACCOUNT_B)).status, 'and opens work again once the row is back').toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4c1 c23 NFR-SEC-006 (2) ERR-032] no response carries a threshold, window, remaining count or reset time', () => {
  it('[F2.4c1 c23] with N = 7 and W = 1234: the 200s, a 404 and the 429 hold no such header, no such key, and no 1234; the 404 and 429 bodies hold no digit', T, async () => {
    await setLimit(7, 1234);
    const app = await start();
    const all = [];
    for (let i = 0; i < 6; i++) all.push(await opened(app, hA, ACCOUNT_B));
    all.push(await opened(app, hA, NOBODY));
    all.push(await opened(app, hA, ACCOUNT_B));
    all.push(await opened(app, hA, ACCOUNT_B));
    expect(all.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200, 404, 429, 429]);
    for (const r of all) {
      expect(Object.keys(r.headers).filter((h) => LIMIT_HEADERS.test(h))).toEqual([]);
      expect(keysDeep(r.json).filter((k) => LIMIT_WORDS.test(k))).toEqual([]);
      expect(r.body).not.toContain('1234');
      expect(JSON.stringify(r.headers)).not.toContain('1234');
      if (r.status !== 200) expect(r.body).not.toMatch(/\d/);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4c1 c24 NFR-SEC-006 (1) DR-S] an F2.4a send counts as one open', () => {
  it('[F2.4c1 c24] at the limit a send is 429 rate_limited and writes no row', T, async () => {
    await setLimit(2, 3600);
    const app = await start();
    await opened(app, hA, ACCOUNT_B);
    await opened(app, hA, ACCOUNT_B);
    const before = await frCount();
    const res = await sendTo(app, hA, ACCOUNT_B);
    expect(res.statusCode, res.body).toBe(429);
    expect(JSON.parse(res.body)).toEqual({ error: 'rate_limited' });
    expect(await rows(ACCOUNT_A, ACCOUNT_B)).toBe('');
    expect(await frCount()).toBe(before);
  });

  it('[F2.4c1 c24] below the limit a send is 201 and is one of the counted opens: open, send, then the next open is 429', T, async () => {
    await setLimit(2, 3600);
    const app = await start();
    expect((await opened(app, hA, ACCOUNT_B)).status).toBe(200);
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    expect(await opensOf(ACCOUNT_A)).toBe(2);
    expect((await opened(app, hA, ACCOUNT_B)).status).toBe(429);
  });

  it('[F2.4c1 c24] a refused send leaves the response free of any number', T, async () => {
    await setLimit(1, 4321);
    const app = await start();
    await opened(app, hA, ACCOUNT_B);
    const res = await sendTo(app, hA, ACCOUNT_B);
    expect(res.statusCode).toBe(429);
    expect(res.body).not.toMatch(/\d/);
    expect(Object.keys(res.headers).filter((h) => LIMIT_HEADERS.test(h))).toEqual([]);
  });
});
