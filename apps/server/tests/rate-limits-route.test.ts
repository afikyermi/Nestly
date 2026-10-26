import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/db/client.js';
import { AUDIENCE, ISSUER, newKey, restoreEnv, startFakeDb, startJwks, token, type App, type FakeDb, type JwksServer, type TestKey } from './helpers/identity-fixtures.js';
import { buildRegisterApp, jsonOf } from './helpers/register-app.js';

// I9 part 2 (NFR-SEC-006; the brief's "rate limiting" check): every daily limit the database counts reaches the caller as 429 with a bare code —
// no number, no time, no Retry-After (the ERR-032 principle: an answer never tells a threshold). The counting itself, the 20th accepted and the
// 21st refused, is pgTAP's (files 91, 93, 94, 108); here the database is a stand-in whose transaction fails with that limit's SQLSTATE, so
// the test needs no real database and checks only the route's mapping. Profile opens, People Search and recovery answer through their own
// outcomes and are covered by tests/db/profile-view, notifications and password (and pgTAP 64, 90, 92).

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const OTHER = 'b0000000-0000-4000-8000-0000000000b2';
const POST = 'd0000000-0000-4000-8000-0000000000d3';
const MEDIA = 'e0000000-0000-4000-8000-0000000000e4';
const T = { timeout: 60_000 };

let key: TestKey;
let jwks: JwksServer;
let fake: FakeDb;
let database: Database | undefined;
let app: App | undefined;

/** A Database whose every transaction fails as the database would with `code` (a raised exception with that SQLSTATE). */
function limitedDatabase(url: string, code: string): Database {
  const real = createDatabase(url);
  const refuse = (): Promise<never> =>
    Promise.reject(Object.assign(new postgres.PostgresError('limit'), { code, severity: 'ERROR' }));
  const db = new Proxy(real.db, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (prop === 'transaction') return refuse;
      if (typeof value !== 'function') return value;
      const bound: unknown = value.bind(target);
      return bound;
    },
  });
  const client = new Proxy(real.client, {
    get(target, prop) {
      if (prop === 'begin' || prop === 'reserve') return refuse;
      const value: unknown = Reflect.get(target, prop);
      return value;
    },
  });
  return { ...real, db, client, close: () => real.close() };
}

beforeAll(async () => {
  key = await newKey('rate-limits-key');
  jwks = await startJwks([key]);
  fake = await startFakeDb();
}, 60_000);

afterEach(async () => {
  await app?.close();
  await database?.close();
  app = undefined;
  database = undefined;
});

afterAll(async () => {
  await jwks.close();
  await fake.close();
  restoreEnv();
});

type Method = 'POST' | 'PUT';
const LIMITS: ReadonlyArray<{ label: string; code: string; method: Method; url: string; body?: unknown; error: string }> = [
  { label: '[FR-CHAT-002] the 21st chat request in 24 hours', code: 'NS022', method: 'POST', url: '/api/chat/start', body: { userId: OTHER, text: 'שלום' }, error: 'rate_limited' },
  { label: '[OP-044 (2)] the 21st Chat Block in 24 hours', code: 'NS025', method: 'PUT', url: `/api/users/${OTHER}/chat-block`, error: 'rate_limited' },
  { label: '[OP-044 (3)] the 6th Support request in 24 hours', code: 'NS023', method: 'POST', url: '/api/support', body: { topic: 'usage', text: 'שאלה' }, error: 'rate_limited' },
  { label: '[FR-REL-002] the 21st block in 24 hours', code: 'NS021', method: 'PUT', url: `/api/users/${OTHER}/block`, error: 'rate_limited' },
  { label: '[AC-014 (b) OP-010] the 101st Offer Help in 24 hours', code: 'NS029', method: 'POST', url: `/api/posts/${POST}/offer-help`, body: { text: 'אפשר לעזור' }, error: 'rate_limited' },
  { label: '[AC-103 ERR-040] the 11th Story in 24 hours', code: 'NS021', method: 'POST', url: '/api/stories', body: { mediaId: MEDIA, audience: 'everyone' }, error: 'story_limit' },
];

describe('[NFR-SEC-006 I9 part 2] each daily limit answers 429 with a bare code', () => {
  for (const limit of LIMITS) {
    it(`${limit.label} -> 429 ${limit.error}, no number or time`, T, async () => {
      database = limitedDatabase(fake.url, limit.code);
      app = await buildRegisterApp({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: fake.url }, { database });
      const res = await app.inject({
        method: limit.method,
        url: limit.url,
        headers: { authorization: `Bearer ${await token({ key, sub: SUB })}`, ...(limit.body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(limit.body === undefined ? {} : { payload: JSON.stringify(limit.body) }),
      });
      expect(res.statusCode).toBe(429);
      expect(jsonOf(res.body)).toEqual({ error: limit.error });
      expect(res.headers['retry-after']).toBeUndefined();
      expect(res.body).not.toMatch(/\d/);
    });
  }
});
