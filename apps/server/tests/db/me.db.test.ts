import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { ACCOUNT_A, ACCOUNT_B, AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, captureLog, jsonOf } from '../helpers/register-app.js';

// I1 F1.5 part a, GET /api/me against the real database (CI `db` job, as app_server, fixtures of supabase/tests/setup/):
//   a, b: regular, active   s: suspended   x: banned   c: an Auth user with no nestly.users row   p: professional, active
// Spec criteria 2 (the three states, byte-identical stopped bodies, no-store, nothing but `state`) and 4 (the same token
// follows the status at once, no caching). Derived from spec.md and interface.md only.

const T = { timeout: COLD_START_MS };
const S = '50000000-0000-4000-8000-000000000051';
const X = 'e0000000-0000-4000-8000-0000000000e5';
const C = 'c0000000-0000-4000-8000-0000000000c3';
const P = 'd0000000-0000-4000-8000-0000000000d4';

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

async function start(): Promise<App> {
  const database = createDatabase(url());
  const app = await buildRegisterApp(env(), { database, logStream: captureLog().stream });
  toClose.push({ app, database });
  return app;
}

async function setStatus(who: string, status: 'active' | 'suspended' | 'banned'): Promise<void> {
  await side`select tests.set_status(tests.fx_id_checked(${who}), ${status})`;
}

const bearerFor = async (sub: string, extra?: Record<string, unknown>): Promise<string> =>
  `Bearer ${await token({ key, sub, ...(extra ? { extra } : {}) })}`;
// A 200 body is returned in canonical (sorted-key) form: the key order of {state, recoveryQuestions} is not part of the contract.
const me = async (app: App, header: string | null, headers: Record<string, string> = {}) => {
  const res = await app.inject({ method: 'GET', url: '/api/me', headers: { ...(header === null ? {} : { authorization: header }), ...headers } });
  return { statusCode: res.statusCode, headers: res.headers, body: res.statusCode === 200 ? canon(res.body) : res.body };
};

beforeAll(async () => {
  key = await newKey('me-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  await setStatus('a', 'active');
}, COLD_START_MS);

afterEach(async () => {
  for (const { app, database } of toClose.splice(0)) {
    await app.close();
    await database.close();
  }
  await setStatus('a', 'active');
});

afterAll(async () => {
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

// F1.6-a criterion 6: an active account's body is {state, recoveryQuestions}; the fixtures a, b and p have saved no answers, so
// "missing". The other two states keep {state} alone. Key order is not part of the contract, so an active body is compared in
// canonical (sorted-key) form.
const canon = (body: string): string =>
  JSON.stringify(Object.fromEntries(Object.entries(jsonOf(body)).sort(([left], [right]) => left.localeCompare(right))));
const ACTIVE = '{"recoveryQuestions":"missing","state":"active"}';
const UNAVAILABLE = '{"state":"unavailable"}';
const UNREGISTERED = '{"state":"unregistered"}';

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.5-a c2 FR-AUTH-002] the three states', () => {
  it('[F1.5-a c2 · F1.6-a c6] an active account (regular a, b; professional p) without saved answers -> 200 {"state":"active","recoveryQuestions":"missing"}', T, async () => {
    const app = await start();
    for (const who of [ACCOUNT_A, ACCOUNT_B, P]) {
      const res = await me(app, await bearerFor(who));
      expect(res.statusCode, res.body).toBe(200);
      expect(canon(res.body)).toBe(ACTIVE);
    }
  });

  it('[F1.5-a c2 DR-1] a suspended account (s) and a banned account (x) -> 200 {"state":"unavailable"}, byte-identical', T, async () => {
    const app = await start();
    const suspended = await me(app, await bearerFor(S));
    const banned = await me(app, await bearerFor(X));
    expect(suspended.statusCode, suspended.body).toBe(200);
    expect(banned.statusCode, banned.body).toBe(200);
    expect(suspended.body).toBe(UNAVAILABLE);
    expect(banned.body).toBe(suspended.body);
    expect(banned.headers['content-type']).toBe(suspended.headers['content-type']);
    expect(banned.headers['content-length']).toBe(suspended.headers['content-length']);
    expect(banned.headers['cache-control']).toBe(suspended.headers['cache-control']);
  });

  it('[F1.5-a c2] an Auth user with no users row (c) -> 200 {"state":"unregistered"}', T, async () => {
    const app = await start();
    const res = await me(app, await bearerFor(C));
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).toBe(UNREGISTERED);
  });

  it('[F1.5-a c2] an Auth user that never existed anywhere reads as unregistered, not as an error', T, async () => {
    const app = await start();
    const res = await me(app, await bearerFor('99999999-9999-4999-8999-999999999991'));
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).toBe(UNREGISTERED);
  });

  it('[F1.5-a c2 c1] a token that claims to be active, admin or service_role cannot change the answer for s, x or c', T, async () => {
    const app = await start();
    const lying = {
      role: 'service_role',
      status: 'active',
      app_metadata: { status: 'active', role: 'service_role' },
      user_metadata: { status: 'active', role: 'service_role' },
    };
    expect((await me(app, await bearerFor(S, lying))).body).toBe(UNAVAILABLE);
    expect((await me(app, await bearerFor(X, lying))).body).toBe(UNAVAILABLE);
    expect((await me(app, await bearerFor(C, lying))).body).toBe(UNREGISTERED);
  });

  it('[F1.5-a c2] the answer is about the token, never a query or header: another account\'s id changes nothing', T, async () => {
    const app = await start();
    // A (active) asks with S's and X's ids in every place a client could put one: still A's answer
    for (const target of [S, X, C]) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/me?id=${target}&userId=${target}&user_id=${target}`,
        headers: { authorization: await bearerFor(ACCOUNT_A), 'x-user-id': target, 'x-nestly-user': target },
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(canon(res.body)).toBe(ACTIVE);
    }
    // and S asking with A's id is still told it is unavailable
    const res = await app.inject({ method: 'GET', url: `/api/me?id=${ACCOUNT_A}`, headers: { authorization: await bearerFor(S), 'x-user-id': ACCOUNT_A } });
    expect(res.body).toBe(UNAVAILABLE);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.5-a c2 NFR-SEC-001] the body carries the state, one more field for an active account, and nothing about the account', () => {
  it('[F1.5-a c2 · F1.6-a c6] every body is exactly {"state"} (active: also "recoveryQuestions"): no id, email, type, status word or timestamp', T, async () => {
    const app = await start();
    const bodies: string[] = [];
    for (const who of [ACCOUNT_A, S, X, C, P]) {
      const res = await me(app, await bearerFor(who));
      bodies.push(res.body);
      const parsed = jsonOf(res.body);
      expect(Object.keys(parsed).sort()).toEqual(parsed.state === 'active' ? ['recoveryQuestions', 'state'] : ['state']);
      expect(['active', 'unavailable', 'unregistered']).toContain(parsed.state);
      if (parsed.state === 'active') expect(['set', 'missing']).toContain(parsed.recoveryQuestions);
    }
    const all = bodies.join('\n');
    expect(all).not.toMatch(/suspend|ban|status|regular|professional|account_type|accountType|email|created|[0-9a-f]{8}-[0-9a-f]{4}|\d{4}-\d{2}-\d{2}/i);
  });

  it('[F1.5-a c2] cache-control: no-store on every state', T, async () => {
    const app = await start();
    for (const who of [ACCOUNT_A, S, X, C]) {
      const res = await me(app, await bearerFor(who));
      expect(res.statusCode).toBe(200);
      expect(String(res.headers['cache-control']).toLowerCase()).toContain('no-store');
    }
  });

  it('[F1.5-a c2 c3] a 401 carries no state', T, async () => {
    const app = await start();
    const res = await me(app, null);
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain('state');
  });

  it('[F1.5-a c2] a conditional request cannot turn into a cached answer: no etag / last-modified on a 200', T, async () => {
    const app = await start();
    const res = await me(app, await bearerFor(ACCOUNT_A), { 'if-none-match': '*', 'if-modified-since': 'Wed, 21 Oct 2037 07:28:00 GMT' });
    expect(res.statusCode).toBe(200);
    expect(canon(res.body)).toBe(ACTIVE);
    expect(res.headers['etag']).toBeUndefined();
    expect(res.headers['last-modified']).toBeUndefined();
  });

  it('[F1.5-a c2] other methods are 405 and allow GET, with a real session, without changing any account', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const) {
      const res = await app.inject({ method, url: '/api/me', headers: { authorization: header } });
      expect(res.statusCode, method).toBe(405);
      expect(String(res.headers.allow)).toMatch(/^get$/i);
    }
    expect((await me(app, header)).body).toBe(ACTIVE);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.5-a c4 BR-024] a status change is seen by the very next call with the same token', () => {
  it('[F1.5-a c4] active -> suspended -> active -> banned -> active -> suspended -> banned: each call answers the status just set', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A); // minted once; never refreshed
    const steps: Array<['active' | 'suspended' | 'banned', string]> = [
      ['active', ACTIVE],
      ['suspended', UNAVAILABLE],
      ['active', ACTIVE],
      ['banned', UNAVAILABLE],
      ['active', ACTIVE],
      ['suspended', UNAVAILABLE],
      ['banned', UNAVAILABLE],
      ['active', ACTIVE],
    ];
    for (const [status, expected] of steps) {
      await setStatus('a', status);
      const res = await me(app, header);
      expect(res.statusCode, `after ${status}: ${res.body}`).toBe(200);
      expect(res.body, `after setting ${status}`).toBe(expected);
    }
  });

  it('[F1.5-a c4] the first call right after the flip already sees it, on a connection that served the previous answer', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    expect((await me(app, header)).body).toBe(ACTIVE);
    await setStatus('a', 'suspended');
    expect((await me(app, header)).body).toBe(UNAVAILABLE);
    expect((await me(app, header)).body).toBe(UNAVAILABLE);
    await setStatus('a', 'active');
    expect((await me(app, header)).body).toBe(ACTIVE);
    expect((await me(app, header)).body).toBe(ACTIVE);
  });

  it('[F1.5-a c4] a flip applies to a second app (another instance) with the same token too, and to no other account', T, async () => {
    const first = await start();
    const second = await start();
    const header = await bearerFor(ACCOUNT_A);
    const other = await bearerFor(ACCOUNT_B);
    expect((await me(first, header)).body).toBe(ACTIVE);
    await setStatus('a', 'banned');
    expect((await me(second, header)).body).toBe(UNAVAILABLE);
    expect((await me(first, header)).body).toBe(UNAVAILABLE);
    expect((await me(second, other)).body).toBe(ACTIVE);
  });

  it('[F1.5-a c4] concurrent calls with one token during a flip each answer one of the two true states, never an error', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const calls = Array.from({ length: 6 }, () => me(app, header));
    await setStatus('a', 'suspended');
    const more = Array.from({ length: 6 }, () => me(app, header));
    for (const res of await Promise.all([...calls, ...more])) {
      expect(res.statusCode, res.body).toBe(200);
      expect([ACTIVE, UNAVAILABLE]).toContain(canon(res.body));
    }
    expect((await me(app, header)).body).toBe(UNAVAILABLE);
  });

  it('[F1.5-a c4] a suspended account that is registered stays unavailable (never unregistered) however often it asks', T, async () => {
    const app = await start();
    const header = await bearerFor(S);
    for (let i = 0; i < 5; i += 1) expect((await me(app, header)).body).toBe(UNAVAILABLE);
  });
});
