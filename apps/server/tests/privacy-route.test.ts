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

// I2 F2.3a, GET and PUT /api/privacy: the checks that need no real database. Spec criteria (.work/profile-privacy/spec.md):
//   5  no token -> 401, and no database query runs under that request (GET and PUT); no user id from the request
// The 400s, stopped accounts, 404 and the stored values are against the real database: tests/db/privacy.db.test.ts.
// Derived from spec.md; route and body key names from interface.md. A Database that refuses on purpose stands in for the real
// one: a request that reaches it counts.

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const OTHER = 'b0000000-0000-4000-8000-0000000000b2';
const T = { timeout: 60_000 };
const BODY = { profileVisibility: 'restricted', isEmptyJourneySentenceShown: false, isChildBirthdayShared: false };

let key: TestKey;
let jwks: JwksServer;
let fake: FakeDb;
let stub: RefusingDatabase;
let database: Database | undefined;
let app: App;

const bearer = async (over: Record<string, unknown> = {}): Promise<string> => `Bearer ${await token({ key, sub: SUB, ...over })}`;
const env = () => ({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: fake.url });

async function setup(): Promise<void> {
  stub = await refusingDatabase(fake.url);
  database = stub.database;
  app = await buildRegisterApp(env(), { database, logStream: captureLog().stream });
}

beforeAll(async () => {
  key = await newKey('privacy-route-key');
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

const call = (method: 'GET' | 'PUT', header: string | null, payload?: unknown, url = '/api/privacy') =>
  app.inject({
    method,
    url,
    headers: { ...(header === null ? {} : { authorization: header }), ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(payload === undefined ? {} : { payload: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
  });

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.3a c5 FR-AUTH-004] a missing or invalid session is 401, with no database query', () => {
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

  it.each(cases)('[F2.3a c5] GET, %s -> 401 unauthenticated, nothing reaches the database', T, async (_label, make) => {
    await setup();
    const res = await call('GET', await make());
    expect(res.statusCode).toBe(401);
    expect(jsonOf(res.body)).toEqual({ error: 'unauthenticated' });
    expect(stub.attempts()).toBe(0);
  });

  it.each(cases)('[F2.3a c5] PUT, %s -> 401 unauthenticated, nothing reaches the database', T, async (_label, make) => {
    await setup();
    const res = await call('PUT', await make(), BODY);
    expect(res.statusCode).toBe(401);
    expect(jsonOf(res.body)).toEqual({ error: 'unauthenticated' });
    expect(stub.attempts()).toBe(0);
  });

  it('[F2.3a c5 c3] the 401 comes first, even for a body that would be a 400', T, async () => {
    await setup();
    const res = await call('PUT', null, { ...BODY, userId: OTHER, searchable: false });
    expect(res.statusCode).toBe(401);
    expect(stub.attempts()).toBe(0);
  });

  it('[F2.3a c5 rule 12] the route takes no id: a path naming another account is not a route that serves settings', T, async () => {
    await setup();
    const byPath = await call('GET', await bearer(), undefined, `/api/privacy/${OTHER}`);
    expect(byPath.statusCode).toBeGreaterThanOrEqual(400);
    const byPut = await call('PUT', await bearer(), BODY, `/api/privacy/${OTHER}`);
    expect(byPut.statusCode).toBeGreaterThanOrEqual(400);
    expect(stub.attempts()).toBe(0);
  });
});
