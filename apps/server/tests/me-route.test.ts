import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AUDIENCE,
  ISSUER,
  hs256Token,
  newKey,
  restoreEnv,
  startFakeDb,
  startJwks,
  token,
  unsignedToken,
  type App,
  type FakeDb,
  type JwksServer,
  type TestKey,
} from './helpers/identity-fixtures.js';
import { buildRegisterApp, captureLog, jsonOf, refusingDatabase, type RefusingDatabase } from './helpers/register-app.js';
import type { Database } from '../src/db/client.js';

// I1 F1.5 part a, the route GET /api/me, the checks that need no real database. Spec criteria:
//   2  other methods -> 405 with allow: GET, protected too (the 200 shapes and no-store need a database: tests/db/me.db.test.ts)
//   3  no / malformed / tampered / expired token -> 401 unauthenticated + www-authenticate: Bearer, no database call;
//      verifier or database missing -> 503 unavailable; transient database fault -> 503; deterministic -> 500 internal;
//      logs carry status and SQLSTATE only, never token or ids
// Derived from spec.md and interface.md only. A Database that fails on purpose stands in for the real one.

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const SECRET = 'secret-detail-that-must-not-leave-the-server';
const T = { timeout: 60_000 };

let key: TestKey;
let jwks: JwksServer;
let fake: FakeDb;
let stub: RefusingDatabase;
let database: Database | undefined;
let app: App;
let log: ReturnType<typeof captureLog>;

const bearer = async (over: Record<string, unknown> = {}): Promise<string> => `Bearer ${await token({ key, sub: SUB, ...over })}`;
const env = () => ({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: fake.url });

async function setup(): Promise<void> {
  log = captureLog();
  stub = await refusingDatabase(fake.url);
  database = stub.database;
  app = await buildRegisterApp(env(), { database, logStream: log.stream });
}

/** A Database whose every transaction rejects with the given error, counting the attempts. */
async function failingWith(make: () => Error): Promise<{ attempts: () => number }> {
  const { createDatabase } = await import('../src/db/client.js');
  const real = createDatabase(fake.url);
  let attempts = 0;
  const fail = (): Promise<never> => {
    attempts += 1;
    return Promise.reject(make());
  };
  const db = new Proxy(real.db, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (prop === 'transaction') return fail;
      if (typeof value !== 'function') return value;
      const bound: unknown = value.bind(target);
      return bound;
    },
  });
  const client = new Proxy(real.client, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (prop === 'begin' || prop === 'reserve') return fail;
      return value;
    },
  });
  database = { db, client, close: () => real.close() };
  log = captureLog();
  app = await buildRegisterApp(env(), { database, logStream: log.stream });
  return { attempts: () => attempts };
}

const lostConnection = (): Error => Object.assign(new Error(`write CONNECTION_CLOSED ${SECRET}`), { code: 'CONNECTION_CLOSED' });
// The declared constructor is Error's (message); the fields a driver error carries are set after construction.
const constraintFault = (): Error =>
  Object.assign(new postgres.PostgresError(`insert or update violates ${SECRET}`), {
    message: `insert or update violates ${SECRET}`,
    code: '23503',
    detail: SECRET,
  });
const codeDefect = (): Error => new TypeError(`cannot read properties of undefined ${SECRET}`);

beforeAll(async () => {
  key = await newKey('me-route-key');
  jwks = await startJwks([key]);
  fake = await startFakeDb();
}, 60_000);

afterEach(async () => {
  await app.close();
  await database?.close();
  database = undefined;
});

afterAll(async () => {
  await jwks.close();
  await fake.close();
  restoreEnv();
});

const get = (header: string | null, url = '/api/me') =>
  app.inject({ method: 'GET', url, headers: header === null ? {} : { authorization: header } });

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.5-a c3 NFR-SEC-004] a missing, malformed, tampered or expired session is 401, with no database call', () => {
  async function tampered(): Promise<string> {
    const t = await token({ key, sub: SUB });
    const [h = '', p = '', s = ''] = t.split('.');
    return `Bearer ${h}.${p}.${s.slice(0, -4) + (s.endsWith('AAAA') ? 'BBBB' : 'AAAA')}`;
  }
  const cases: Array<[string, () => Promise<string | null>]> = [
    ['no Authorization header', () => Promise.resolve(null)],
    ['an empty Authorization header', () => Promise.resolve('')],
    ['the scheme alone ("Bearer ")', () => Promise.resolve('Bearer ')],
    ['a token that is not a JWT', () => Promise.resolve('Bearer not-a-token')],
    ['another scheme (Basic)', () => Promise.resolve('Basic dXNlcjpwYXNz')],
    ['the token without the scheme', async () => token({ key, sub: SUB })],
    ['a tampered signature', tampered],
    ['an expired token', async () => bearer({ exp: Math.floor(Date.now() / 1000) - 3600 })],
    ['a token not valid yet', async () => bearer({ nbf: Math.floor(Date.now() / 1000) + 3600 })],
    ['a token for another audience', async () => bearer({ aud: 'someone-else' })],
    ['a token from another issuer', async () => bearer({ iss: 'https://evil.example.invalid/auth/v1' })],
    ['an unsigned (alg none) token', () => Promise.resolve(`Bearer ${unsignedToken(key.kid, SUB)}`)],
    ['an HS256 token', async () => `Bearer ${await hs256Token('a-shared-secret-of-some-length-123456', key.kid, SUB)}`],
    ['a token whose sub is not a UUID', async () => bearer({ sub: 'not-a-uuid' })],
    ['a token with no sub', async () => bearer({ sub: undefined })],
  ];

  it.each(cases)('[F1.5-a c3] %s -> 401 unauthenticated + www-authenticate: Bearer, nothing reaches the database', T, async (_label, make) => {
    await setup();
    const before = stub.attempts();
    const res = await get(await make());
    expect(res.statusCode).toBe(401);
    expect(jsonOf(res.body)).toEqual({ error: 'unauthenticated' });
    expect(String(res.headers['www-authenticate'])).toMatch(/bearer/i);
    expect(stub.attempts() - before).toBe(0);
  });

  it('[F1.5-a c3] a 401 body is the same for every failure and names no reason', T, async () => {
    await setup();
    const bodies = new Set<string>();
    for (const [, make] of cases) bodies.add((await get(await make())).body);
    expect([...bodies]).toEqual(['{"error":"unauthenticated"}']);
  });

  it('[F1.5-a c3 c2] the route takes no id: a query naming another account changes nothing about a 401', T, async () => {
    await setup();
    const res = await get(null, '/api/me?id=b0000000-0000-4000-8000-0000000000b2&userId=b0000000-0000-4000-8000-0000000000b2');
    expect(res.statusCode).toBe(401);
    expect(stub.attempts()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.5-a c2] other methods are 405 with allow: GET; they are protected too', () => {
  const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;

  it.each(METHODS)('[F1.5-a c2] %s with a valid session -> 405 method_not_allowed, allow: GET, no database call', T, async (method) => {
    await setup();
    const res = await app.inject({ method, url: '/api/me', headers: { authorization: await bearer() } });
    expect(res.statusCode).toBe(405);
    expect(String(res.headers.allow)).toMatch(/^get$/i);
    expect(jsonOf(res.body)).toEqual({ error: 'method_not_allowed' });
    expect(stub.attempts()).toBe(0);
  });

  it.each(METHODS)('[F1.5-a c2 c3] %s without a token -> 401 first, not 405', T, async (method) => {
    await setup();
    const res = await app.inject({ method, url: '/api/me' });
    expect(res.statusCode).toBe(401);
    expect(stub.attempts()).toBe(0);
  });

  it('[F1.5-a c2] a POST carrying a body is still 405 and reads nothing', T, async () => {
    await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/me',
      headers: { authorization: await bearer(), 'content-type': 'application/json' },
      payload: JSON.stringify({ state: 'active' }),
    });
    expect(res.statusCode).toBe(405);
    expect(stub.attempts()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.5-a c3] verifier or database missing -> 503 unavailable', () => {
  it('[F1.5-a c3] no database configured: a valid-looking request is 503 unavailable', T, async () => {
    log = captureLog();
    app = await buildRegisterApp({ ...env(), DATABASE_URL: undefined }, { logStream: log.stream });
    const res = await get(await bearer());
    expect(res.statusCode).toBe(503);
    expect(jsonOf(res.body)).toEqual({ error: 'unavailable' });
  });

  it('[F1.5-a c3] no token verifier configured: 503 unavailable, never a pass-through', T, async () => {
    log = captureLog();
    stub = await refusingDatabase(fake.url);
    database = stub.database;
    app = await buildRegisterApp(
      { SUPABASE_JWKS_URL: undefined, SUPABASE_JWT_ISSUER: undefined, SUPABASE_JWT_AUDIENCE: undefined, DATABASE_URL: fake.url },
      { database, logStream: log.stream },
    );
    const res = await get(await bearer());
    expect(res.statusCode).toBe(503);
    expect(jsonOf(res.body)).toEqual({ error: 'unavailable' });
    for (const header of [null, 'Bearer junk']) expect([401, 503]).toContain((await get(header)).statusCode);
    expect(stub.attempts()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.5-a c3] database faults: transient -> 503, deterministic -> 500, nothing leaks', () => {
  it('[F1.5-a c3] a lost connection (transient) -> 503 unavailable', T, async () => {
    const f = await failingWith(lostConnection);
    const res = await get(await bearer());
    expect(f.attempts()).toBeGreaterThan(0);
    expect(res.statusCode, res.body).toBe(503);
    expect(jsonOf(res.body)).toEqual({ error: 'unavailable' });
    expect(res.body).not.toContain(SECRET);
  });

  it('[F1.5-a c3] a deterministic database refusal (SQLSTATE 23503) -> 500 internal', T, async () => {
    const f = await failingWith(constraintFault);
    const res = await get(await bearer());
    expect(f.attempts()).toBeGreaterThan(0);
    expect(res.statusCode, res.body).toBe(500);
    expect(jsonOf(res.body)).toEqual({ error: 'internal' });
    expect(res.body).not.toContain(SECRET);
  });

  it('[F1.5-a c3] a code defect (TypeError) -> 500 internal, never 200 and never a state', T, async () => {
    await failingWith(codeDefect);
    const res = await get(await bearer());
    expect(res.statusCode, res.body).toBe(500);
    expect(jsonOf(res.body)).toEqual({ error: 'internal' });
    expect(res.body).not.toMatch(/state|active|unregistered|unavailable|undefined|TypeError/);
  });

  it('[F1.5-a c3] a failure is never answered as a state: no fault gives "unregistered" or "active"', T, async () => {
    for (const make of [lostConnection, constraintFault, codeDefect]) {
      await failingWith(make);
      const res = await get(await bearer());
      expect(res.statusCode).not.toBe(200);
      expect(res.body).not.toContain('"state"');
      await app.close();
      await database?.close();
    }
    database = undefined;
    // afterEach closes `app` again; closing twice must not throw, so rebuild a closable app
    log = captureLog();
    app = await buildRegisterApp(env(), { logStream: log.stream });
  });

  it('[F1.5-a c3 NFR-PRIV-001] the failure log is one line "account state read failed" with the SQLSTATE; no token, id, message or detail', T, async () => {
    await failingWith(constraintFault);
    const header = await bearer();
    const raw = header.replace('Bearer ', '');
    const res = await get(header);
    expect(res.statusCode).toBe(500);
    const text = log.text();
    expect(text).toContain('account state read failed');
    expect(text).toContain('23503');
    for (const secret of [SECRET, raw, raw.split('.')[1] ?? 'x', SUB]) expect(text, `log contains ${secret.slice(0, 12)}`).not.toContain(secret);
    expect(text.toLowerCase()).not.toContain('bearer ');
    const own = log.lines().filter((line) => line.includes('account state read failed'));
    expect(own.length).toBe(1);
  });

  it('[F1.5-a c3 NFR-PRIV-001] a transient failure and a code defect also log neither token, id nor detail', T, async () => {
    for (const make of [lostConnection, codeDefect]) {
      await failingWith(make);
      const header = await bearer();
      const raw = header.replace('Bearer ', '');
      await get(header);
      const text = log.text();
      for (const secret of [SECRET, raw, raw.split('.')[1] ?? 'x', SUB]) expect(text, `log contains ${secret.slice(0, 12)}`).not.toContain(secret);
      await app.close();
      await database?.close();
    }
    database = undefined;
    log = captureLog();
    app = await buildRegisterApp(env(), { logStream: log.stream });
  });
});
