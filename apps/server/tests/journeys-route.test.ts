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
import { buildRegisterApp, captureLog, jsonOf, parts, refusingDatabase, type RefusingDatabase } from './helpers/register-app.js';
import type { Database } from '../src/db/client.js';

// I2 F2.2a, GET /api/journeys, POST /api/children, PUT /api/children/:id: the checks that need no real database. Spec criteria
// (.work/journeys-children/spec.md):
//   10  no / invalid token -> 401, and no database query runs under that request (every route)
//   11  the answer and the log of a 5xx hold no child name, sex, birth date (the 2xx, 400 and 409 logs: tests/db/children.db.test.ts)
// Derived from spec.md only. A Database that refuses on purpose stands in for the real one: a request that reaches it counts.
// F2.2b1 adds POST /api/journeys and PUT /api/journeys/:id (route names from interface.md): c24 (no / invalid token -> 401, no query)
// and c11 (a 5xx answer and log hold no due date or stage) on those two routes too. F2.2b2 adds DELETE /api/children/:id, DELETE
// /api/journeys/:id and POST /api/journeys/:id/birth (interface.md): c24 (401 first, no query) and c11 (a 5xx holds no child or stage).

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const CHILD_ID = '11111111-1111-4111-8111-111111111111';
const T = { timeout: 60_000 };
const NAME = 'Marker-Child-Zq9-Private';
const BODY = { name: NAME, sex: 'girl', birthDate: parts('2019-03-17') };

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
  key = await newKey('journeys-route-key');
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

type Call = readonly ['GET' | 'POST' | 'PUT' | 'DELETE', string, unknown];
const ROUTES: Call[] = [
  ['GET', '/api/journeys', undefined],
  ['POST', '/api/children', BODY],
  ['PUT', `/api/children/${CHILD_ID}`, BODY],
];
const JOURNEY_ID = '22222222-2222-4222-8222-222222222222';
const DUE = { dueDate: parts('2027-02-17') };
const ROUTES_B1: Call[] = [
  ['POST', '/api/journeys', DUE],
  ['PUT', `/api/journeys/${JOURNEY_ID}`, DUE],
];
const ROUTES_B2: Call[] = [
  ['DELETE', `/api/children/${CHILD_ID}`, undefined],
  ['DELETE', `/api/journeys/${JOURNEY_ID}`, undefined],
  ['POST', `/api/journeys/${JOURNEY_ID}/birth`, BODY],
  ['POST', '/api/journeys', { ...DUE, endPlanning: true }],
];
const call = ([method, url, payload]: Call, header: string | null) =>
  app.inject({
    method,
    url,
    headers: { ...(header === null ? {} : { authorization: header }), ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(payload === undefined ? {} : { payload: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
  });

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2a c10 FR-AUTH-004] a missing or invalid session is 401, with no database query', () => {
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

  for (const route of ROUTES) {
    it.each(cases)(`[F2.2a c10] ${route[0]} ${route[1]}, %s -> 401 unauthenticated, nothing reaches the database`, T, async (_label, make) => {
      await setup();
      const res = await call(route, await make());
      expect(res.statusCode).toBe(401);
      expect(jsonOf(res.body)).toEqual({ error: 'unauthenticated' });
      expect(stub.attempts()).toBe(0);
    });
  }

  for (const route of ROUTES_B1) {
    it.each(cases)(`[F2.2b c24] ${route[0]} ${route[1]}, %s -> 401 unauthenticated, nothing reaches the database`, T, async (_label, make) => {
      await setup();
      const res = await call(route, await make());
      expect(res.statusCode).toBe(401);
      expect(jsonOf(res.body)).toEqual({ error: 'unauthenticated' });
      expect(stub.attempts()).toBe(0);
    });
  }

  for (const route of ROUTES_B2) {
    it.each(cases)(`[F2.2b c24] ${route[0]} ${route[1]}, %s -> 401 unauthenticated, nothing reaches the database`, T, async (_label, make) => {
      await setup();
      const res = await call(route, await make());
      expect(res.statusCode).toBe(401);
      expect(jsonOf(res.body)).toEqual({ error: 'unauthenticated' });
      expect(stub.attempts()).toBe(0);
    });
  }

  it('[F2.2b c24 c20] the 401 comes first on the b2 routes: a DELETE with a body, a non-uuid id, a bad birth body', T, async () => {
    await setup();
    expect((await call(['DELETE', `/api/journeys/${JOURNEY_ID}`, { reason: 'x' }], null)).statusCode).toBe(401);
    expect((await call(['DELETE', '/api/children/not-a-uuid', undefined], null)).statusCode).toBe(401);
    expect((await call(['POST', '/api/journeys/not-a-uuid/birth', { name: '' }], null)).statusCode).toBe(401);
    expect(stub.attempts()).toBe(0);
  });

  it('[F2.2b c24] the 401 comes first on the b1 routes too: a body that would be a 400, an id that is not a uuid', T, async () => {
    await setup();
    expect((await call(['POST', '/api/journeys', { dueDate: { day: '1', month: '', year: '' }, userId: 'b0000000-0000-4000-8000-0000000000b2' }], null)).statusCode).toBe(401);
    expect((await call(['PUT', '/api/journeys/not-a-uuid', DUE], null)).statusCode).toBe(401);
    expect(stub.attempts()).toBe(0);
  });

  it('[F2.2a c10] the 401 comes first, even for a body that would be a 400 or an id that is not a uuid', T, async () => {
    await setup();
    expect((await call(['POST', '/api/children', { name: '', userId: 'b0000000-0000-4000-8000-0000000000b2' }], null)).statusCode).toBe(401);
    expect((await call(['PUT', '/api/children/not-a-uuid', BODY], null)).statusCode).toBe(401);
    expect(stub.attempts()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2a c11 NFR-PRIV-001] a 5xx: the answer and the log hold no child name, sex or birth date, nor the token', () => {
  for (const route of ROUTES) {
    it(`[F2.2a c11] ${route[0]} ${route[1]} that fails in the database (5xx): nothing of the body or the token in the log`, T, async () => {
      await setup();
      const authorization = await bearer();
      const res = await call(route, authorization);
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      expect(stub.attempts()).toBeGreaterThan(0);
      expect(res.body).not.toContain(NAME);
      const text = log.text();
      const raw = authorization.replace(/^Bearer /, '');
      for (const secret of [NAME, '2019-03-17', '"year":"2019"', 'girl', '"birthDate"', '"sex"', raw, raw.split('.')[1] ?? raw]) {
        expect(text, `the log contains ${secret.slice(0, 14)}`).not.toContain(secret);
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c11 NFR-PRIV-001] a 5xx on the b1 routes: the answer and the log hold no due date or stage, nor the token', () => {
  for (const route of ROUTES_B1) {
    it(`[F2.2b c11] ${route[0]} ${route[1]} that fails in the database (5xx): nothing of the body or the token in the log`, T, async () => {
      await setup();
      const authorization = await bearer();
      const res = await call(route, authorization);
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      expect(stub.attempts()).toBeGreaterThan(0);
      expect(res.body).not.toContain('2027-02-17');
      const text = log.text();
      const raw = authorization.replace(/^Bearer /, '');
      for (const secret of ['2027-02-17', '"year":"2027"', '"dueDate"', '"stage"', 'pregnant', raw, raw.split('.')[1] ?? raw]) {
        expect(text, `the log contains ${secret.slice(0, 14)}`).not.toContain(secret);
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.2b c11 NFR-PRIV-001] a 5xx on the b2 routes: the answer and the log hold no child data, stage or id, nor the token', () => {
  for (const route of ROUTES_B2) {
    it(`[F2.2b c11] ${route[0]} ${route[1]} that fails in the database (5xx): nothing of the body, the ids or the token in the log`, T, async () => {
      await setup();
      const authorization = await bearer();
      const res = await call(route, authorization);
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      expect(stub.attempts()).toBeGreaterThan(0);
      expect(res.body).not.toContain(NAME);
      const text = log.text();
      const raw = authorization.replace(/^Bearer /, '');
      for (const secret of [NAME, '2019-03-17', '2027-02-17', 'girl', '"birthDate"', '"endPlanning"', 'pregnant', 'planning', CHILD_ID, JOURNEY_ID, SUB, raw, raw.split('.')[1] ?? raw]) {
        expect(text, `the log contains ${secret.slice(0, 14)}`).not.toContain(secret);
      }
    });
  }
});
