import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { ACCOUNT_A, ACCOUNT_B, AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { CLOCK_NOW, buildRegisterApp, captureLog, jsonOf } from '../helpers/register-app.js';

// I6, the Admin's guide routes against the real database (CI `db` job, as app_server, after the pgTAP files): D = the Admin of
// supabase/tests/setup/60_, M = its Moderator (no key), A = a Regular, B = a Regular in "planning". The seed guides are drafts; a test
// edits or publishes the planning guide and puts it back to a draft with no source date (the Audit Log keeps the entries: it is append-only).

const T = { timeout: COLD_START_MS };
const PLANNING_TITLE = 'מתכננים הריון: איך מתחילים';

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
const toClose: Array<{ app: App; database: Database }> = [];
let admin = '';
let moderator = '';
let planningId = '';

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
const call = (app: App, method: 'GET' | 'POST' | 'PUT', path: string, header: string, payload?: unknown) =>
  app.inject({
    method,
    url: path,
    headers: { authorization: header, ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
  });
function prop(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  const found: unknown = Reflect.get(value, name);
  return found;
}
const audit = async (action: string): Promise<number> => {
  const [row] = await side`select tests.fx_sf_audit(${action})::int as n`;
  return Number(row?.n);
};
const fields = (title: string, over: Record<string, unknown> = {}) => ({
  stageKind: 'planning',
  rangeFrom: null,
  rangeTo: null,
  title,
  body: 'גוף המדריך לבדיקה.',
  source: 'משרד הבריאות',
  sourceCheckedOn: null,
  status: 'draft',
  ...over,
});

beforeAll(async () => {
  key = await newKey('guides-admin-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  const [d] = await side`select tests.fx_fr_id('fr_d')::text as id`;
  const [m] = await side`select tests.fx_fr_id('fr_m')::text as id`;
  admin = String(d?.id);
  moderator = String(m?.id);
  const [g] = await side`select tests.fx_sg_id('planning')::text as id`;
  planningId = String(g?.id);
}, COLD_START_MS);

afterEach(async () => {
  const app = await start();
  await call(app, 'PUT', `/api/guides/manage/${planningId}`, await bearerFor(admin), fields(PLANNING_TITLE));
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

describe('[F6.1-a c8 FR-ADMIN-012 BR-070] /api/guides/manage', () => {
  it('only an Admin: a Regular and a Moderator get 403 on every route, and nothing is written', T, async () => {
    const app = await start();
    for (const who of [ACCOUNT_A, ACCOUNT_B, moderator]) {
      const header = await bearerFor(who);
      expect((await call(app, 'GET', '/api/guides/manage', header)).statusCode).toBe(403);
      expect((await call(app, 'POST', '/api/guides/manage', header, fields('x', { status: undefined }))).statusCode).toBe(403);
      expect((await call(app, 'PUT', `/api/guides/manage/${planningId}`, header, fields('x', { status: 'published', sourceCheckedOn: '2026-06-01' }))).statusCode).toBe(403);
    }
    const list = jsonOf((await call(app, 'GET', '/api/guides/manage', await bearerFor(admin))).body);
    expect(JSON.stringify(list.guides)).not.toContain('"published"');
  });

  it('the Admin reads every guide (drafts too) and edits one; the edit is audited; a bad body is 400 with a reason', T, async () => {
    const app = await start();
    const header = await bearerFor(admin);
    const list = jsonOf((await call(app, 'GET', '/api/guides/manage', header)).body);
    const guides: unknown[] = Array.isArray(list.guides) ? list.guides : [];
    expect(guides.length).toBeGreaterThanOrEqual(9);
    expect(guides.every((g) => prop(g, 'status') === 'draft')).toBe(true);
    const before = await audit('guide_edited');
    const edit = await call(app, 'PUT', `/api/guides/manage/${planningId}`, header, fields('כותרת אחרת'));
    expect(edit.statusCode, edit.body).toBe(200);
    expect(await audit('guide_edited')).toBe(before + 1);
    const bad = await call(app, 'PUT', `/api/guides/manage/${planningId}`, header, fields('x', { rangeFrom: 3, rangeTo: 5 }));
    expect(bad.statusCode).toBe(400);
    expect(jsonOf(bad.body)).toEqual({ error: 'invalid', reason: 'range_invalid' });
    expect((await call(app, 'PUT', '/api/guides/manage/11111111-1111-4111-8111-111111111111', header, fields('x'))).statusCode).toBe(404);
  });

  it('[AC-095 BR-070] publishing needs the source date; a published guide reaches the users of that stage only; hiding removes it; both are audited', T, async () => {
    const app = await start();
    const header = await bearerFor(admin);
    const path = `/api/guides/manage/${planningId}`;
    const refused = await call(app, 'PUT', path, header, fields(PLANNING_TITLE, { status: 'published' }));
    expect(refused.statusCode).toBe(400);
    expect(jsonOf(refused.body)).toEqual({ error: 'invalid', reason: 'source_date_required' });
    const published = await audit('guide_published');
    const hidden = await audit('guide_hidden');
    expect((await call(app, 'PUT', path, header, fields(PLANNING_TITLE, { status: 'published', sourceCheckedOn: '2026-06-01' }))).statusCode).toBe(200);
    expect(await audit('guide_published')).toBe(published + 1);
    const titlesFor = async (who: string): Promise<unknown[]> => {
      const home = jsonOf((await call(app, 'GET', '/api/home', await bearerFor(who))).body);
      const guidesOf: unknown[] = Array.isArray(home.guides) ? home.guides : [];
      return guidesOf.map((g) => prop(g, 'title'));
    };
    expect(await titlesFor(ACCOUNT_B)).toContain(PLANNING_TITLE);
    expect(await titlesFor(ACCOUNT_A)).not.toContain(PLANNING_TITLE);
    expect((await call(app, 'PUT', path, header, fields(PLANNING_TITLE, { status: 'hidden', sourceCheckedOn: '2026-06-01' }))).statusCode).toBe(200);
    expect(await audit('guide_hidden')).toBe(hidden + 1);
    expect(await titlesFor(ACCOUNT_B)).not.toContain(PLANNING_TITLE);
  });
});
