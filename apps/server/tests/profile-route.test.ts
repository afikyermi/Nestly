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

// I2 F2.1, GET and PUT /api/profile, the checks that need no real database. Spec criteria (.work/profile-view-edit/spec.md):
//   12  no / invalid token -> 401, and no database query runs under that request (GET and PUT)
//   scope  any other method -> 405
//   14  the logs for GET and PUT hold no full name, gender or token, in a 400 and in a 5xx (the success line: tests/db/profile.db.test.ts)
// Derived from spec.md only. A Database that refuses on purpose stands in for the real one: a request that reaches it counts.

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const T = { timeout: 60_000 };
const NAME = 'Marker-Name-Zq9-Private';
const GENDER = 'prefer_not_to_say';

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

beforeAll(async () => {
  key = await newKey('profile-route-key');
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

const call = (method: 'GET' | 'PUT', header: string | null, payload?: unknown, url = '/api/profile') =>
  app.inject({
    method,
    url,
    headers: { ...(header === null ? {} : { authorization: header }), ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(payload === undefined ? {} : { payload: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
  });

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.1 c12 FR-AUTH-004] a missing or invalid session is 401, with no database query', () => {
  async function tampered(): Promise<string> {
    const t = await token({ key, sub: SUB });
    const [h = '', p = '', s = ''] = t.split('.');
    return `Bearer ${h}.${p}.${s.slice(0, -4) + (s.endsWith('AAAA') ? 'BBBB' : 'AAAA')}`;
  }
  const cases: Array<[string, () => Promise<string | null>]> = [
    ['no Authorization header', () => Promise.resolve(null)],
    ['an empty Authorization header', () => Promise.resolve('')],
    ['a token that is not a JWT', () => Promise.resolve('Bearer not-a-token')],
    ['another scheme (Basic)', () => Promise.resolve('Basic dXNlcjpwYXNz')],
    ['a tampered signature', tampered],
    ['an expired token', async () => bearer({ exp: Math.floor(Date.now() / 1000) - 3600 })],
    ['a token for another audience', async () => bearer({ aud: 'someone-else' })],
    ['an unsigned (alg none) token', () => Promise.resolve(`Bearer ${unsignedToken(key.kid, SUB)}`)],
    ['an HS256 token', async () => `Bearer ${await hs256Token('a-shared-secret-of-some-length-123456', key.kid, SUB)}`],
    ['a token with no sub', async () => bearer({ sub: undefined })],
  ];
  const BODY = { fullName: NAME, parentGender: 'woman' };

  it.each(cases)('[F2.1 c12] GET, %s -> 401 unauthenticated, nothing reaches the database', T, async (_label, make) => {
    await setup();
    const res = await call('GET', await make());
    expect(res.statusCode).toBe(401);
    expect(jsonOf(res.body)).toEqual({ error: 'unauthenticated' });
    expect(stub.attempts()).toBe(0);
  });

  it.each(cases)('[F2.1 c12] PUT, %s -> 401 unauthenticated, nothing reaches the database', T, async (_label, make) => {
    await setup();
    const res = await call('PUT', await make(), BODY);
    expect(res.statusCode).toBe(401);
    expect(jsonOf(res.body)).toEqual({ error: 'unauthenticated' });
    expect(stub.attempts()).toBe(0);
  });

  it('[F2.1 c12] the 401 comes first, even for a body that would be a 400', T, async () => {
    await setup();
    const res = await call('PUT', null, { fullName: '', userId: 'b0000000-0000-4000-8000-0000000000b2' });
    expect(res.statusCode).toBe(401);
    expect(stub.attempts()).toBe(0);
  });

  it('[F2.1 c9 c12] the route takes no id: a path or query naming another account is not a route that serves a profile', T, async () => {
    await setup();
    const other = 'b0000000-0000-4000-8000-0000000000b2';
    const byPath = await call('GET', await bearer(), undefined, `/api/profile/${other}`);
    expect(byPath.statusCode).toBeGreaterThanOrEqual(400);
    const byPut = await call('PUT', await bearer(), { fullName: 'Okay Name', parentGender: null }, `/api/profile/${other}`);
    expect(byPut.statusCode).toBeGreaterThanOrEqual(400);
    expect(stub.attempts()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.1 scope] any other method is 405, protected too', () => {
  const METHODS = ['POST', 'PATCH', 'DELETE'] as const;

  it.each(METHODS)('[F2.1 scope] %s with a valid session -> 405, no database call', T, async (method) => {
    await setup();
    const res = await app.inject({ method, url: '/api/profile', headers: { authorization: await bearer() } });
    expect(res.statusCode).toBe(405);
    expect(stub.attempts()).toBe(0);
  });

  it.each(METHODS)('[F2.1 scope c12] %s without a token -> 401 first, not 405', T, async (method) => {
    await setup();
    const res = await app.inject({ method, url: '/api/profile' });
    expect(res.statusCode).toBe(401);
    expect(stub.attempts()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.1 c14 NFR-PRIV-001] the logs hold no full name, gender or token', () => {
  function assertClean(label: string, authorization: string): void {
    const text = log.text();
    const raw = authorization.replace(/^Bearer /, '');
    const [header = '', payload = '', signature = ''] = raw.split('.');
    for (const secret of [NAME, GENDER, raw, header, payload, signature]) {
      expect(text, `${label}: the log contains ${secret.slice(0, 14)}`).not.toContain(secret);
    }
  }

  it('[F2.1 c14] a PUT that fails in the database (5xx): nothing of the body in the log', T, async () => {
    await setup();
    const authorization = await bearer();
    const res = await call('PUT', authorization, { fullName: NAME, parentGender: GENDER });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(res.body).not.toContain(NAME);
    assertClean('PUT 5xx', authorization);
  });

  it('[F2.1 c14] a GET that fails in the database (5xx): nothing in the log or the answer but the status', T, async () => {
    await setup();
    const authorization = await bearer();
    const res = await call('GET', authorization);
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    assertClean('GET 5xx', authorization);
  });

  it('[F2.1 c8 c14] a PUT that is a 400 (name too long, hostile gender): the answer and the log do not echo the input', T, async () => {
    await setup();
    const authorization = await bearer();
    const res = await call('PUT', authorization, { fullName: NAME.repeat(10), parentGender: `${GENDER}'; drop table nestly.users;--` });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain(NAME);
    expect(res.body).not.toContain(GENDER);
    assertClean('PUT 400', authorization);
  });

  it('[F2.1 c9 c14] a PUT with a forbidden key is a 400 and logs neither the name nor the key\'s value', T, async () => {
    await setup();
    const authorization = await bearer();
    const res = await call('PUT', authorization, { fullName: NAME, parentGender: GENDER, userId: 'b0000000-0000-4000-8000-0000000000b2' });
    expect(res.statusCode).toBe(400);
    assertClean('PUT forbidden key', authorization);
    expect(log.text()).not.toContain('b0000000-0000-4000-8000-0000000000b2');
  });

  it('[F2.1 c14 hostile] a body that is not JSON is a 4xx whose answer and log do not quote it', T, async () => {
    await setup();
    const authorization = await bearer();
    const res = await call('PUT', authorization, `{"fullName":"${NAME}","parentGender":`);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(res.body).not.toContain(NAME);
    assertClean('PUT not JSON', authorization);
  });
});
