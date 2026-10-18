import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AUDIENCE, ISSUER, newKey, restoreEnv, startFakeDb, startJwks, token, unsignedToken, type App, type FakeDb, type JwksServer, type TestKey } from './helpers/identity-fixtures.js';
import { buildRegisterApp, refusingDatabase, type RefusingDatabase } from './helpers/register-app.js';

// I3 F3.2a2 c12 without a real database: no / invalid token -> 401 and the database is never asked. The rest is tests/db/feed.db.test.ts.
const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const T = { timeout: 60_000 };
let key: TestKey;
let jwks: JwksServer;
let fake: FakeDb;
let stub: RefusingDatabase;
let app: App;

beforeAll(async () => {
  key = await newKey('feed-route-key');
  jwks = await startJwks([key]);
  fake = await startFakeDb();
}, 60_000);
afterEach(async () => {
  await app.close();
  await stub.database.close();
});
afterAll(async () => {
  await jwks.close();
  await fake.close();
  restoreEnv();
});

const exp = Math.floor(Date.now() / 1000) - 60;
const bad: Array<[string, () => Promise<string | null>]> = [
  ['no Authorization header', () => Promise.resolve(null)],
  ['an empty bearer', () => Promise.resolve('Bearer ')],
  ['a garbage token', () => Promise.resolve('Bearer not.a.token')],
  ['an unsigned (alg none) token', () => Promise.resolve(`Bearer ${unsignedToken(key.kid, SUB)}`)],
  ['an expired token', async () => `Bearer ${await token({ key, sub: SUB, exp })}`],
  ['a token for another audience', async () => `Bearer ${await token({ key, sub: SUB, aud: 'someone-else' })}`],
];
describe('[F3.2-a2 c12] GET /api/feed without a valid session', () => {
  for (const [name, header] of bad) {
    for (const query of ['', `?cursor=${encodeURIComponent("'; drop table nestly.posts; --")}`]) {
      it(`[F3.2-a2 c12 c6] ${name}${query ? ' + hostile cursor' : ''} -> 401, no post data, the database is never asked`, T, async () => {
        stub = await refusingDatabase(fake.url);
        app = await buildRegisterApp({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: fake.url }, { database: stub.database });
        const authorization = await header();
        const res = await app.inject({ method: 'GET', url: `/api/feed${query}`, headers: authorization === null ? {} : { authorization } });
        expect(res.statusCode, res.body).toBe(401);
        expect(res.body).not.toMatch(/items|nextCursor|configVersion/);
        expect(stub.attempts()).toBe(0);
      });
    }
  }
});
