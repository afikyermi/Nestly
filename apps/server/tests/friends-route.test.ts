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
import { buildRegisterApp, jsonOf, refusingDatabase, type RefusingDatabase } from './helpers/register-app.js';
import { callOf } from './helpers/friends-api.js';
import type { Database } from '../src/db/client.js';

// I2 F2.4a, the six friendship routes: the checks that need no real database. Spec criterion (.work/friends/spec.md):
//   10  no / invalid token -> 401, and no database query runs under that request (every route)
// Derived from spec.md only. A Database that refuses on purpose stands in for the real one: a request that reaches it counts.
// The URLs are the ones assumed in helpers/friends-api.ts. Everything else (c1-c12 behaviour) is tests/db/friends.db.test.ts.

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const OTHER = 'b0000000-0000-4000-8000-0000000000b2';
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

const ROUTES = [
  ['send', { targetUserId: OTHER }],
  ['lists', undefined],
  ['accept', undefined],
  ['decline', undefined],
  ['cancel', undefined],
  ['remove', undefined],
] as const;

const call = (action: (typeof ROUTES)[number][0], payload: unknown, id: string, header: string | null) => {
  const { method, url } = callOf(action, id);
  return app.inject({
    method,
    url,
    headers: { ...(header === null ? {} : { authorization: header }), ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(payload === undefined ? {} : { payload: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
  });
};

describe('[F2.4a c10 FR-AUTH-004 A9] a missing or invalid session is 401, with no database query', () => {
  async function tampered(): Promise<string> {
    const t = await token({ key, sub: SUB });
    const [h = '', p = '', s = ''] = t.split('.');
    return `Bearer ${h}.${p}.${s.slice(0, -4) + (s.endsWith('AAAA') ? 'BBBB' : 'AAAA')}`;
  }
  const cases: Array<[string, () => Promise<string | null>]> = [
    ['no Authorization header', () => Promise.resolve(null)],
    ['an empty Authorization header', () => Promise.resolve('')],
    ['a token that is not a JWT', () => Promise.resolve('Bearer not-a-token')],
    ['a tampered signature', tampered],
    ['an expired token', async () => bearer({ exp: Math.floor(Date.now() / 1000) - 3600 })],
    ['a token for another audience', async () => bearer({ aud: 'someone-else' })],
    ['an unsigned (alg none) token', () => Promise.resolve(`Bearer ${unsignedToken(key.kid, SUB)}`)],
    ['an HS256 token', async () => `Bearer ${await hs256Token('a-shared-secret-of-some-length-123456', key.kid, SUB)}`],
    ['a token with no sub', async () => bearer({ sub: undefined })],
  ];

  for (const [action, payload] of ROUTES) {
    it.each(cases)(`[F2.4a c10] ${action}, %s -> 401 unauthenticated, nothing reaches the database`, T, async (_label, make) => {
      await setup();
      const res = await call(action, payload, OTHER, await make());
      expect(res.statusCode).toBe(401);
      expect(jsonOf(res.body)).toEqual({ error: 'unauthenticated' });
      expect(stub.attempts()).toBe(0);
    });
  }

  it('[F2.4a c10 c12] the 401 comes first, even for a body that would be a 400 and an id that is not a uuid', T, async () => {
    await setup();
    expect((await call('send', { targetUserId: 'not-a-uuid', requesterId: OTHER }, OTHER, null)).statusCode).toBe(401);
    for (const action of ['accept', 'decline', 'cancel', 'remove'] as const) {
      expect((await call(action, undefined, 'not-a-uuid', null)).statusCode).toBe(401);
    }
    expect(stub.attempts()).toBe(0);
  });
});
