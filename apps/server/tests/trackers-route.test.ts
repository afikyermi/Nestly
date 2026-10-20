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

// I6: the tracker, cycle and home routes: the checks that need no real database. A Database that refuses on purpose stands in for
// the real one: a request that reaches it counts (tests/trackers-route.test.ts; permissions: pgTAP file 86).

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const ID = '11111111-1111-4111-8111-111111111111';
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

beforeAll(async () => {
  key = await newKey('trackers-route-key');
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
const EVENT = { kind: 'bath', childId: ID, occurredAt: '2026-10-20T08:00:00Z' };
const CYCLE = { startDate: '2026-10-01', cycleLengthDays: 28 };
const GUIDE = { stageKind: 'planning', rangeFrom: null, rangeTo: null, title: 'כותרת', body: 'גוף', source: 'משרד הבריאות', sourceCheckedOn: null };
const ROUTES: Call[] = [
  ['GET', '/api/home', undefined],
  ['GET', '/api/trackers/events?kind=bath&from=2026-10-01&to=2026-10-07', undefined],
  ['POST', '/api/trackers/events', EVENT],
  ['PUT', `/api/trackers/events/${ID}`, { kind: 'bath', occurredAt: EVENT.occurredAt }],
  ['DELETE', `/api/trackers/events/${ID}`, undefined],
  ['GET', '/api/cycle', undefined],
  ['POST', '/api/cycle', CYCLE],
  ['PUT', `/api/cycle/${ID}`, CYCLE],
  ['DELETE', `/api/cycle/${ID}`, undefined],
  ['GET', '/api/guides/manage', undefined],
  ['POST', '/api/guides/manage', GUIDE],
  ['PUT', `/api/guides/manage/${ID}`, { ...GUIDE, status: 'draft' }],
];
const call = ([method, url, payload]: Call, header: string | null) =>
  app.inject({
    method,
    url,
    headers: { ...(header === null ? {} : { authorization: header }), ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
  });

describe('[F6.0-a c1 BR-053] a missing or invalid session is 401, with no database query', () => {
  const cases: Array<[string, () => Promise<string | null>]> = [
    ['no Authorization header', () => Promise.resolve(null)],
    ['a token that is not a JWT', () => Promise.resolve('Bearer not-a-token')],
    ['an expired token', async () => bearer({ exp: Math.floor(Date.now() / 1000) - 3600 })],
    ['an unsigned (alg none) token', () => Promise.resolve(`Bearer ${unsignedToken(key.kid, SUB)}`)],
    ['an HS256 token', async () => `Bearer ${await hs256Token('a-shared-secret-of-some-length-123456', key.kid, SUB)}`],
  ];
  for (const route of ROUTES) {
    it.each(cases)(`${route[0]} ${route[1].split('?')[0]}, %s -> 401, nothing reaches the database`, T, async (_label, make) => {
      await setup();
      const res = await call(route, await make());
      expect(res.statusCode).toBe(401);
      expect(jsonOf(res.body)).toEqual({ error: 'unauthenticated' });
      expect(stub.attempts()).toBe(0);
    });
  }
});

describe('[F6.0-a c2 AC-023 FR-TRACK-001] a body that breaks a rule is 400 with its reason, before any database work', () => {
  const cases: Array<[string, Call, string]> = [
    ['AC-023 an end before the start', ['POST', '/api/trackers/events', { kind: 'sleep', childId: ID, occurredAt: '2026-10-20T08:00:00Z', endedAt: '2026-10-20T07:00:00Z' }], 'end_before_start'],
    ['a bottle without an amount', ['POST', '/api/trackers/events', { kind: 'bottle', childId: ID, occurredAt: '2026-10-20T08:00:00Z' }], 'value_invalid'],
    ['a time in the far future', ['POST', '/api/trackers/events', { ...EVENT, occurredAt: '2099-01-01T00:00:00Z' }], 'time_invalid'],
    ['an owner id in the body', ['POST', '/api/trackers/events', { ...EVENT, userId: ID }], 'invalid_body'],
    ['a child in an edit', ['PUT', `/api/trackers/events/${ID}`, { ...EVENT }], 'invalid_body'],
    ['a cycle length of 10 days', ['POST', '/api/cycle', { startDate: '2026-10-01', cycleLengthDays: 10 }], 'length_invalid'],
    ['a cycle start in the far future', ['PUT', `/api/cycle/${ID}`, { startDate: '2099-01-01', cycleLengthDays: 28 }], 'date_invalid'],
    ['a DELETE with a body', ['DELETE', `/api/cycle/${ID}`, { x: 1 }], 'invalid_body'],
    ['a guide with a range on the planning stage', ['POST', '/api/guides/manage', { ...GUIDE, rangeFrom: 1, rangeTo: 2 }], 'range_invalid'],
    ['a guide published without a source date', ['PUT', `/api/guides/manage/${ID}`, { ...GUIDE, status: 'published' }], 'source_date_required'],
    ['a guide created with a status', ['POST', '/api/guides/manage', { ...GUIDE, status: 'published' }], 'invalid_body'],
    ['a guide update without a status', ['PUT', `/api/guides/manage/${ID}`, GUIDE], 'invalid_body'],
  ];
  it.each(cases)('%s', T, async (_label, route, reason) => {
    await setup();
    const res = await call(route, await bearer());
    expect(res.statusCode).toBe(400);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid', reason });
    expect(stub.attempts()).toBe(0);
  });

  it('a period of more than 366 days, or a kind that does not exist, is invalid_query', T, async () => {
    await setup();
    for (const url of ['/api/trackers/events?kind=bath&from=2025-01-01&to=2026-10-07', '/api/trackers/events?kind=nap&from=2026-10-01&to=2026-10-07']) {
      const res = await call(['GET', url, undefined], await bearer());
      expect(res.statusCode).toBe(400);
      expect(jsonOf(res.body)).toEqual({ error: 'invalid_query' });
    }
    expect(stub.attempts()).toBe(0);
  });

  it('an id that is not a uuid is 404 with no query', T, async () => {
    await setup();
    expect((await call(['DELETE', '/api/cycle/not-a-uuid', undefined], await bearer())).statusCode).toBe(404);
    expect((await call(['PUT', '/api/trackers/events/not-a-uuid', EVENT], await bearer())).statusCode).toBe(404);
    expect(stub.attempts()).toBe(0);
  });
});
