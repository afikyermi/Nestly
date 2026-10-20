import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { ACCOUNT_A, ACCOUNT_B, AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { CLOCK_NOW, buildRegisterApp, captureLog, jsonOf } from '../helpers/register-app.js';

// I6, the tracker, cycle and home routes against the real database (CI `db` job, as app_server, fixtures of supabase/tests/setup/):
//   a: active, pregnant (due 2027-03-01) + two children Noa (2024-05-10), Eli (2022-01-15)   b: active, planning, child Tali
//   s: suspended   x: banned   p: Professional (an account, no Regular profile)
// The permissions themselves are pgTAP (supabase/tests/86_trackers_cycle_guides.sql); here the routes: 404 for another's child, event
// or kind, 409 for a second cycle on one date, 403 for a stopped account, no_profile for a Professional, and the home's guides.
// The server clock is CLOCK_NOW = 2026-06-15T10:00Z. Every row a test writes is deleted through the API in afterEach.

const T = { timeout: COLD_START_MS };
const S = '50000000-0000-4000-8000-000000000051';
const X = 'e0000000-0000-4000-8000-0000000000e5';
const P = 'd0000000-0000-4000-8000-0000000000d4';
const WHEN = '2026-06-15T09:00:00Z';
const PERIOD = 'from=2026-06-01&to=2026-06-30';

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
const toClose: Array<{ app: App; database: Database }> = [];
const published: string[] = [];
const created: Array<{ header: string; path: string }> = [];

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
}
const env = () => ({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() });

async function start(): Promise<App> {
  const database = createDatabase(url());
  const app = await buildRegisterApp(env(), { database, clock: () => CLOCK_NOW, logStream: captureLog().stream });
  toClose.push({ app, database });
  return app;
}
const bearerFor = async (sub: string): Promise<string> => `Bearer ${await token({ key, sub })}`;
const setStatus = async (who: string, status: 'active' | 'suspended' | 'banned'): Promise<void> => {
  await side`select tests.set_status(tests.fx_id_checked(${who}), ${status})`;
};
async function childOf(owner: string, slot: number): Promise<string> {
  const [row] = await side`select tests.fx_child_id(tests.fx_id_checked(${owner}), ${slot})::text as id`;
  const id: unknown = row?.id;
  if (typeof id !== 'string') throw new Error(`no child in slot ${slot} for ${owner}`);
  return id;
}
async function setGuides(status: 'published' | 'draft', ...ids: string[]): Promise<void> {
  await side.begin(async (tx) => {
    for (const id of ids) {
      const sql =
        status === 'published'
          ? `update nestly.status_guides set status = 'published', published_at = now(), source_checked_on = date '2026-10-20' where id = '${id}'`
          : `update nestly.status_guides set status = 'draft', published_at = null, source_checked_on = null where id = '${id}'`;
      const [row] = await tx`select tests.fx_sg_exec(${sql}) as r`;
      if (row?.r !== 'OK:1') throw new Error(`could not set a guide to ${status}: ${String(row?.r)}`);
    }
  });
}
async function guideId(kind: string, from: number | null): Promise<string> {
  const [row] = await side`select tests.fx_sg_id(${kind}, ${from}::int)::text as id`;
  const id: unknown = row?.id;
  if (typeof id !== 'string') throw new Error(`no guide ${kind} ${String(from)}`);
  return id;
}

/** One field of an answer's object, typed unknown. */
function prop(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  const found: unknown = Reflect.get(value, name);
  return found;
}

const call = (app: App, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, header: string, payload?: unknown) =>
  app.inject({
    method,
    url: path,
    headers: { authorization: header, ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
  });
const bottle = (childId: string, ml = 120) => ({ kind: 'bottle', childId, occurredAt: WHEN, amountMl: ml });

/** Saves a bottle as `header` and returns its id, read back from the list; the row is deleted in afterEach. */
async function saveBottle(app: App, header: string, childId: string): Promise<string> {
  const res = await call(app, 'POST', '/api/trackers/events', header, bottle(childId));
  expect(res.statusCode, res.body).toBe(201);
  const list = jsonOf((await call(app, 'GET', `/api/trackers/events?kind=bottle&${PERIOD}`, header)).body);
  const events: unknown[] = Array.isArray(list.events) ? list.events : [];
  const first: unknown = events[0];
  const id = prop(first, 'id');
  if (typeof id !== 'string') throw new Error('the saved event is not in the list');
  created.push({ header, path: `/api/trackers/events/${id}` });
  return id;
}

beforeAll(async () => {
  key = await newKey('trackers-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
}, COLD_START_MS);

afterEach(async () => {
  for (const who of ['a', 'b']) await setStatus(who, 'active');
  const app = await start();
  for (const { header, path } of created.splice(0)) await call(app, 'DELETE', path, header);
  if (published.length > 0) await setGuides('draft', ...published.splice(0));
  for (const { app: a, database } of toClose.splice(0)) {
    await a.close();
    await database.close();
  }
}, COLD_START_MS);

afterAll(async () => {
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

describe('[F6.0-a c8 AC-007 BR-053] tracker events', () => {
  it('[AC-007] A saves a bottle for their own child and reads it back; B reads none of it', T, async () => {
    const app = await start();
    const a = await bearerFor(ACCOUNT_A);
    const noa = await childOf('a', 1);
    const id = await saveBottle(app, a, noa);
    const mine = jsonOf((await call(app, 'GET', `/api/trackers/events?kind=bottle&${PERIOD}`, a)).body);
    expect(mine.truncated).toBe(false);
    expect(JSON.stringify(mine.events)).toContain(id);
    const theirs = jsonOf((await call(app, 'GET', `/api/trackers/events?kind=bottle&${PERIOD}`, await bearerFor(ACCOUNT_B))).body);
    expect(theirs.events).toEqual([]);
  });

  it('B cannot log an event for A\'s child: 404 not_found, nothing stored', T, async () => {
    const app = await start();
    const res = await call(app, 'POST', '/api/trackers/events', await bearerFor(ACCOUNT_B), bottle(await childOf('a', 1)));
    expect(res.statusCode).toBe(404);
    expect(jsonOf(res.body)).toEqual({ error: 'not_found' });
    const [row] = await side`select tests.fx_te_count()::text as n`;
    expect(row?.n).toBe('0');
  });

  it('B cannot edit or delete A\'s event: 404; A cannot edit it as another kind: 404; A can edit and delete it', T, async () => {
    const app = await start();
    const a = await bearerFor(ACCOUNT_A);
    const b = await bearerFor(ACCOUNT_B);
    const id = await saveBottle(app, a, await childOf('a', 1));
    const path = `/api/trackers/events/${id}`;
    expect((await call(app, 'PUT', path, b, { kind: 'bottle', occurredAt: WHEN, amountMl: 50 })).statusCode).toBe(404);
    expect((await call(app, 'DELETE', path, b)).statusCode).toBe(404);
    expect((await call(app, 'PUT', path, a, { kind: 'bath', occurredAt: WHEN })).statusCode).toBe(404);
    const edit = await call(app, 'PUT', path, a, { kind: 'bottle', occurredAt: WHEN, amountMl: 150 });
    expect(edit.statusCode, edit.body).toBe(200);
    expect(JSON.stringify(jsonOf((await call(app, 'GET', `/api/trackers/events?kind=bottle&${PERIOD}`, a)).body).events)).toContain('150');
    expect((await call(app, 'DELETE', path, a)).statusCode).toBe(200);
    expect((await call(app, 'DELETE', path, a)).statusCode).toBe(404);
  });

  it('[AC-023] an end before the start is 400 end_before_start and stores nothing', T, async () => {
    const app = await start();
    const res = await call(app, 'POST', '/api/trackers/events', await bearerFor(ACCOUNT_A), {
      kind: 'breastfeeding',
      childId: await childOf('a', 1),
      occurredAt: WHEN,
      endedAt: '2026-06-15T08:00:00Z',
      choice: 'left',
    });
    expect(res.statusCode).toBe(400);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid', reason: 'end_before_start' });
  });

  it('a suspended or banned account is 403 account_unavailable on every tracker route; a Professional has no profile (404)', T, async () => {
    const app = await start();
    for (const who of [S, X]) {
      const header = await bearerFor(who);
      for (const path of ['/api/home', `/api/trackers/events?kind=bottle&${PERIOD}`, '/api/cycle']) {
        const res = await call(app, 'GET', path, header);
        expect(res.statusCode, path).toBe(403);
        expect(jsonOf(res.body)).toEqual({ error: 'account_unavailable' });
      }
    }
    const pro = await bearerFor(P);
    for (const path of ['/api/home', `/api/trackers/events?kind=bottle&${PERIOD}`, '/api/cycle']) {
      const res = await call(app, 'GET', path, pro);
      expect(res.statusCode, path).toBe(404);
      expect(jsonOf(res.body)).toEqual({ error: 'no_profile' });
    }
  });
});

describe('[F6.0-a c9 FR-TRACK-001] the cycle', () => {
  it('a second entry on one date is 409 duplicate_date; the window comes from the latest entry; B sees none; delete works', T, async () => {
    const app = await start();
    const a = await bearerFor(ACCOUNT_A);
    const body = { startDate: '2026-06-01', cycleLengthDays: 28 };
    expect((await call(app, 'POST', '/api/cycle', a, body)).statusCode).toBe(201);
    const view = jsonOf((await call(app, 'GET', '/api/cycle', a)).body);
    const entries: unknown[] = Array.isArray(view.entries) ? view.entries : [];
    const entry: unknown = entries[0];
    const id = prop(entry, 'id');
    if (typeof id !== 'string') throw new Error('the cycle entry is not in the list');
    created.push({ header: a, path: `/api/cycle/${id}` });
    expect(view.window).toMatchObject({ windowStart: '2026-06-10', windowEnd: '2026-06-16', expectedNextStart: '2026-06-29' });
    const again = await call(app, 'POST', '/api/cycle', a, { startDate: '2026-06-01', cycleLengthDays: 30 });
    expect(again.statusCode).toBe(409);
    expect(jsonOf(again.body)).toEqual({ error: 'duplicate_date' });
    expect(jsonOf((await call(app, 'GET', '/api/cycle', await bearerFor(ACCOUNT_B))).body).entries).toEqual([]);
    expect((await call(app, 'PUT', `/api/cycle/${id}`, await bearerFor(ACCOUNT_B), body)).statusCode).toBe(404);
    expect((await call(app, 'DELETE', `/api/cycle/${id}`, a)).statusCode).toBe(200);
  });
});

describe('[F6.0-a c10 FR-HOME-001 FR-HOME-004 AC-006 AC-069 AC-095] GET /api/home', () => {
  it('shows the contexts of the stage and only the PUBLISHED guides that match them; a draft is never shown', T, async () => {
    const app = await start();
    const a = await bearerFor(ACCOUNT_A);
    const before = jsonOf((await call(app, 'GET', '/api/home', a)).body);
    expect(before.guides).toEqual([]);
    const contexts: unknown[] = Array.isArray(before.contexts) ? before.contexts : [];
    expect(contexts.map((c) => prop(c, 'kind'))).toEqual(['pregnancy', 'parenting', 'parenting']);
    expect(contexts[0]).toMatchObject({ week: 3, trimester: 1 });
    // At 15.06.2026: week 3; Noa is 25 months, Eli 53 months. Publish the first trimester, Eli's age (36-71) and a guide for no one here.
    const first = await guideId('pregnancy', 1);
    const eli = await guideId('parenting', 36);
    const nobody = await guideId('pregnancy', 28);
    published.push(first, eli, nobody);
    await setGuides('published', first, eli, nobody);
    const after = jsonOf((await call(app, 'GET', '/api/home', a)).body);
    const guides: unknown[] = Array.isArray(after.guides) ? after.guides : [];
    const titles = guides.map((g) => prop(g, 'title'));
    expect(titles).toEqual(['השליש הראשון: מה כדאי לדעת', 'גיל הגן: שינה, משחק ומסכים']);
    // B (planning only, a child of 16 months or so) gets no guide that is not for B's stage.
    const b = jsonOf((await call(app, 'GET', '/api/home', await bearerFor(ACCOUNT_B))).body);
    expect(JSON.stringify(b.guides)).not.toContain('השליש הראשון');
    expect(b.cycle).toBeNull();
  });
});
