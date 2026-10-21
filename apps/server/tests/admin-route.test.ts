import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AUDIENCE,
  ISSUER,
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
import { buildRegisterApp, jsonOf, refusingDatabase, type RefusingDatabase } from './helpers/register-app.js';
import type { Database } from '../src/db/client.js';

// The admin routes (FR-MOD-002, FR-MOD-003, FR-ADMIN-005): the checks that need no real database. No / invalid token -> 401 with no database query;
// a malformed body, query or id -> 400 before any database work; any other method -> 405. A Database that refuses on purpose stands in for the real
// one: a request that reaches it counts. Behaviour is tests/db/admin.db.test.ts.

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const ID = 'b0000000-0000-4000-8000-0000000000b2';
const T = { timeout: 60_000 };

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
  app = await buildRegisterApp(env(), { database });
}

beforeAll(async () => {
  key = await newKey('friends-route-key');
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


const GETS = ['/api/admin/access', '/api/admin/audit', '/api/admin/reports', `/api/admin/reports/post/${ID}`, '/api/admin/users', `/api/admin/users/${ID}`];
const POSTS: Array<[string, unknown]> = [
  ['/api/admin/reports/handle', { targetKind: 'post', targetId: ID, resolution: 'dismissed' }],
  ['/api/admin/content/moderate', { targetKind: 'post', targetId: ID, status: 'hidden', reason: 'x' }],
  ['/api/admin/reports/reveal', { postId: ID }],
  ['/api/admin/enforcements', { userId: ID, kind: 'warning', reason: 'x' }],
];

describe('[FR-AUTH-004] a missing or invalid session is 401, with no database query', () => {
  it.each(GETS)('GET %s -> 401', T, async (url) => {
    await setup();
    for (const header of [null, '', 'Bearer not-a-token', `Bearer ${unsignedToken(key.kid, SUB)}`, await bearer({ aud: 'someone-else' })]) {
      const res = await app.inject({ method: 'GET', url, headers: header === null ? {} : { authorization: header } });
      expect(res.statusCode).toBe(401);
      expect(jsonOf(res.body)).toEqual({ error: 'unauthenticated' });
    }
    expect(stub.attempts()).toBe(0);
  });
  it.each(POSTS)('POST %s -> 401, even for a body that would be a 400', T, async (url, payload) => {
    await setup();
    for (const body of [payload, { nonsense: true }]) {
      const res = await app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload: JSON.stringify(body) });
      expect(res.statusCode).toBe(401);
    }
    expect(stub.attempts()).toBe(0);
  });
});

describe('[FR-MOD-002 FR-MOD-003] bad input is 400 before any database work', () => {
  const post = async (url: string, payload: unknown) => {
    await setup();
    return app.inject({ method: 'POST', url, headers: { authorization: await bearer(), 'content-type': 'application/json' }, payload: JSON.stringify(payload) });
  };
  it.each([
    ['/api/admin/reports/handle', { targetKind: 'post', targetId: ID, resolution: 'dismissed', handledBy: ID }],
    ['/api/admin/reports/handle', { targetKind: 'post', targetId: 'nope', resolution: 'dismissed' }],
    ['/api/admin/content/moderate', { targetKind: 'post', targetId: ID, status: 'hidden', reason: '   ' }],
    ['/api/admin/reports/reveal', { postId: ID, extra: 1 }],
    ['/api/admin/enforcements', { userId: ID, kind: 'suspension', reason: 'x' }],
    ['/api/admin/enforcements', { userId: ID, kind: 'warning', reason: '' }],
    ['/api/admin/enforcements', { userId: ID, kind: 'ban', reason: 'x', actorId: ID }],
  ])('POST %s %j -> 400 invalid', T, async (url, payload) => {
    const res = await post(url, payload);
    expect(res.statusCode).toBe(400);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid' });
    expect(stub.attempts()).toBe(0);
  });
  it.each(['/api/admin/audit?before=yesterday', '/api/admin/audit?limit=5', `/api/admin/reports/sponsored/${ID}`, '/api/admin/reports/post/nope', '/api/admin/users/nope', '/api/admin/users?q=', '/api/admin/users'])(
    'GET %s -> 400 invalid',
    T,
    async (url) => {
      await setup();
      const res = await app.inject({ method: 'GET', url, headers: { authorization: await bearer() } });
      expect(res.statusCode).toBe(400);
      expect(stub.attempts()).toBe(0);
    },
  );
});

describe('[FR-AUTH-004] any other method is 405 with Allow', () => {
  it('GET routes refuse POST, POST routes refuse GET', T, async () => {
    await setup();
    const h = { authorization: await bearer() };
    for (const url of GETS) {
      const res = await app.inject({ method: 'DELETE', url, headers: h });
      expect(res.statusCode, url).toBe(405);
      expect(res.headers.allow).toBe('GET');
    }
    for (const [url] of POSTS) {
      const res = await app.inject({ method: 'GET', url, headers: h });
      expect(res.statusCode, url).toBe(405);
      expect(res.headers.allow).toBe('POST');
    }
    expect(stub.attempts()).toBe(0);
  });
});
