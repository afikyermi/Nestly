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
import { buildRegisterApp, refusingDatabase, type RefusingDatabase } from './helpers/register-app.js';
import type { Database } from '../src/db/client.js';

// I3 F3.2a2 criterion 12, the part that needs no real database: no / invalid token -> 401 and no query, a method other than GET is
// not a way in. Everything else about GET /api/feed is tests/db/feed.db.test.ts. Derived from .work/feed-view/spec.md only.

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const FEED = '/api/feed';
const T = { timeout: 60_000 };

let key: TestKey;
let jwks: JwksServer;
let fake: FakeDb;
let stub: RefusingDatabase;
let database: Database | undefined;
let app: App;

const env = () => ({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: fake.url });
const get = (authorization: string | null, query = '') =>
  app.inject({ method: 'GET', url: FEED + query, headers: authorization === null ? {} : { authorization } });

beforeAll(async () => {
  key = await newKey('feed-route-key');
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

async function setup(): Promise<void> {
  stub = await refusingDatabase(fake.url);
  database = stub.database;
  app = await buildRegisterApp(env(), { database });
}

describe('[F3.2-a2 c12] GET /api/feed without a valid session', () => {
  const bad: Array<[string, () => Promise<string | null>]> = [
    ['no Authorization header', () => Promise.resolve(null)],
    ['an empty bearer', () => Promise.resolve('Bearer ')],
    ['a garbage token', () => Promise.resolve('Bearer not.a.token')],
    ['an unsigned (alg none) token', () => Promise.resolve(`Bearer ${unsignedToken(key.kid, SUB)}`)],
    ['an expired token', async () => `Bearer ${await token({ key, sub: SUB, exp: Math.floor(Date.now() / 1000) - 60 })}`],
    ['a token for another audience', async () => `Bearer ${await token({ key, sub: SUB, aud: 'someone-else' })}`],
  ];
  for (const [name, header] of bad) {
    it(`[F3.2-a2 c12] ${name} -> 401, no body data, the database is never asked`, T, async () => {
      await setup();
      const res = await get(await header());
      expect(res.statusCode, res.body).toBe(401);
      expect(res.body).not.toMatch(/items|nextCursor|configVersion/);
      expect(stub.attempts()).toBe(0);
    });
  }

  it('[F3.2-a2 c12 c6] a 401 is the answer even with a hostile cursor: the session is checked before the cursor', T, async () => {
    await setup();
    const res = await get(null, `?cursor=${encodeURIComponent("'; drop table nestly.posts; --")}`);
    expect(res.statusCode, res.body).toBe(401);
    expect(stub.attempts()).toBe(0);
  });
});
