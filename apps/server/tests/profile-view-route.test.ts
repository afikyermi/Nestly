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
import { open } from './helpers/profile-view-api.js';
import type { Database } from '../src/db/client.js';

// I2 F2.4c1, the viewer route: the checks that need no real database. Spec criterion (.work/friends/spec.md):
//   16  a non-uuid id -> 400 with no query; no / invalid token -> 401 with no query
// Derived from spec.md only. A Database that refuses on purpose stands in for the real one: a request that reaches it counts.
// Everything else (c16-c24 behaviour) is tests/db/profile-view.db.test.ts and files 63 and 64.

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const TARGET = 'b0000000-0000-4000-8000-0000000000b2';
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
  key = await newKey('profile-view-route-key');
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

describe('[F2.4c1 c16 FR-AUTH-004 A9] a missing or invalid session is 401, with no database query', () => {
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
  it.each(cases)('[F2.4c1 c16] %s -> 401 unauthenticated, nothing reaches the database', T, async (_label, make) => {
    await setup();
    const res = await open(app, await make(), TARGET);
    expect(res.statusCode).toBe(401);
    expect(jsonOf(res.body)).toEqual({ error: 'unauthenticated' });
    expect(stub.attempts()).toBe(0);
  });

  it('[F2.4c1 c16] the 401 comes first, even for an id that is not a uuid', T, async () => {
    await setup();
    expect((await open(app, null, 'not-a-uuid')).statusCode).toBe(401);
    expect(stub.attempts()).toBe(0);
  });
});

describe('[F2.4c1 c16 c23] an id that is not a uuid is 400 with no database query (so it is not an open)', () => {
  const ids = [
    'not-a-uuid',
    '123',
    TARGET.slice(0, -1),
    `${TARGET}0`,
    `${TARGET}%20`,
    `${TARGET}%0A`,
    `%20${TARGET}`,
    "'%3B%20drop%20table%20nestly.users%3B--",
    `${TARGET}'%20or%20'1'%3D'1`,
    '%25',
    '.*',
    'a'.repeat(5000),
    '00000000-0000-0000-0000-00000000000g',
  ];
  it.each(ids)('[F2.4c1 c16] id %#: 400, nothing reaches the database', T, async (id) => {
    await setup();
    const res = await open(app, await bearer(), id);
    expect(res.statusCode, res.body).toBe(400);
    expect(stub.attempts()).toBe(0);
  });
});
