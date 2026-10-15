import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/db/client.js';
import { emailHandle, ipHash } from '../src/recovery/hashing.js';
import { clientAddress } from '../src/recovery/client-ip.js';
import { readRecoveryKeys } from '../src/recovery/pepper.js';
import {
  AUDIENCE,
  ISSUER,
  newKey,
  restoreEnv,
  startFakeDb,
  startJwks,
  token,
  type App,
  type FakeDb,
  type JwksServer,
  type TestKey,
} from './helpers/identity-fixtures.js';
import {
  PAIR,
  buildRecoveryApp,
  fakeAdmin,
  freshPepper,
  postJson,
  resetBody,
  restorePepper,
  setPepper,
  spyScrypt,
  type FakeAdmin,
  type ScryptSpy,
} from './helpers/recovery-app.js';
import { captureLog, jsonOf, refusingDatabase, type RefusingDatabase } from './helpers/register-app.js';

// F1.6 parts a and b, the three routes against fakes: no real database, Auth stood in for at the recovery seam. Derived from
// spec.md criteria 1, 2, 4, 5 (input contract), 10, 11 (no information from the shape of a failure), 12 (the client address),
// 14 (400 before any lookup, uncounted), 15 (503 when a secret is missing, before database work), 3 and 13 (nothing secret in
// logs), and interface.md "HTTP", "Test seams". Behaviour that needs rows (counters, locks, audit, atomicity) is in
// tests/db/recovery-*.db.test.ts.

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const T = { timeout: 60_000 };
const SECRET = 'secret-detail-that-must-not-leave-the-server';
const EMAIL = 'leak.check.person@example.invalid';
const ANSWER_ONE = 'MarkerAnswerOne';
const ANSWER_TWO = 'MarkerAnswerTwo';
const NEW_PASSWORD = 'MarkerPassword-12345';
const CLIENT_IP = '203.0.113.77';

let key: TestKey;
let jwks: JwksServer;
let fake: FakeDb;
let stub: RefusingDatabase;
let database: Database | undefined;
let app: App;
let log: ReturnType<typeof captureLog>;
let admin: FakeAdmin;
let spy: ScryptSpy;

const env = () => ({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: fake.url });
const bearer = async (over: Record<string, unknown> = {}): Promise<string> =>
  `Bearer ${await token({ key, sub: SUB, extra: { email: EMAIL }, ...over })}`;

interface Options {
  pepper?: string | undefined;
  adminConfigured?: boolean;
}

async function setup(options: Options = {}): Promise<void> {
  const adminConfigured = options.adminConfigured ?? true;
  // `pepper: undefined` means "no pepper at all"; leaving the option out means "a good one"
  setPepper('pepper' in options ? options.pepper : freshPepper());
  log = captureLog();
  stub = await refusingDatabase(fake.url);
  database = stub.database;
  admin = fakeAdmin('completed', adminConfigured);
  spy = spyScrypt();
  app = await buildRecoveryApp(env(), { database, logStream: log.stream, recovery: { authAdmin: admin.authAdmin, scrypt: spy.scrypt } });
}

/** A Database whose every transaction rejects with the given error, counting the attempts. */
async function failingWith(make: () => Error, pepper = freshPepper()): Promise<{ attempts: () => number }> {
  setPepper(pepper);
  const { createDatabase } = await import('../src/db/client.js');
  const real = createDatabase(fake.url);
  let attempts = 0;
  const fail = (): Promise<never> => {
    attempts += 1;
    return Promise.reject(make());
  };
  const db = new Proxy(real.db, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (prop === 'transaction') return fail;
      if (typeof value !== 'function') return value;
      const bound: unknown = value.bind(target);
      return bound;
    },
  });
  const client = new Proxy(real.client, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (prop === 'begin' || prop === 'reserve') return fail;
      return value;
    },
  });
  database = { db, client, close: () => real.close() };
  log = captureLog();
  admin = fakeAdmin();
  spy = spyScrypt();
  app = await buildRecoveryApp(env(), { database, logStream: log.stream, recovery: { authAdmin: admin.authAdmin, scrypt: spy.scrypt } });
  return { attempts: () => attempts };
}

const lostConnection = (): Error => Object.assign(new Error(`write CONNECTION_CLOSED ${SECRET} ${EMAIL} ${ANSWER_ONE} ${NEW_PASSWORD}`), { code: 'CONNECTION_CLOSED' });
const constraintFault = (): Error =>
  Object.assign(new postgres.PostgresError(`insert violates ${SECRET} ${EMAIL} ${ANSWER_ONE} ${NEW_PASSWORD}`), {
    message: `insert violates ${SECRET} ${EMAIL} ${ANSWER_ONE} ${NEW_PASSWORD}`,
    code: '23503',
    detail: `${SECRET} ${EMAIL} ${ANSWER_TWO}`,
  });
const policyRefusal = (): Error =>
  Object.assign(new postgres.PostgresError('new row violates row-level security policy'), {
    message: `new row violates row-level security policy ${SECRET}`,
    code: '42501',
  });
const codeDefect = (): Error => new TypeError(`cannot read properties of undefined ${SECRET}`);

beforeAll(async () => {
  key = await newKey('recovery-route-key');
  jwks = await startJwks([key]);
  fake = await startFakeDb();
}, 60_000);

afterEach(async () => {
  await app.close();
  await database?.close();
  database = undefined;
  restorePepper();
});

afterAll(async () => {
  await jwks.close();
  await fake.close();
  restoreEnv();
});

const reset = (payload: unknown, headers: Record<string, string> = {}) => postJson(app, '/api/recovery/reset', payload, headers);
const store = async (payload: unknown, authorization?: string | null) =>
  postJson(app, '/api/recovery-questions', payload, authorization === null ? {} : { authorization: authorization ?? (await bearer()) });
const change = async (payload: unknown, authorization?: string | null) =>
  app.inject({
    method: 'PUT',
    url: '/api/recovery-questions',
    headers: { 'content-type': 'application/json', ...(authorization === null ? {} : { authorization: authorization ?? (await bearer()) }) },
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

const entry = (question: string, answer: string) => ({ question, answer });
const hebrew = (n: number): string => 'א'.repeat(n);

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c14 VAL-003 VAL-002] POST /api/recovery/reset: a malformed request is 400 before any lookup, uncounted', () => {
  const bad: Array<[string, Record<string, unknown>]> = [
    ['a password of 7 characters', { password: 'a'.repeat(7) }],
    ['a password of 257 characters', { password: 'a'.repeat(257) }],
    ['an empty password', { password: '' }],
    ['no password', { password: undefined }],
    ['a numeric password', { password: 12345678 }],
    ['a null password', { password: null }],
    ['a malformed email', { email: 'not an email' }],
    ['an empty email', { email: '' }],
    ['no email', { email: undefined }],
    ['an email with two @', { email: 'a@@example.com' }],
    ['no answers', { answers: undefined }],
    ['no answer entries', { answers: [] }],
    ['one answer', { answers: [PAIR[0]] }],
    ['three answers', { answers: [...PAIR, entry('nickname', 'Dudi')] }],
    ['the same question twice', { answers: [entry('pet', 'Rex'), entry('pet', 'Max')] }],
    ['an unknown question', { answers: [entry('pet', 'Rex'), entry('school', 'Herzl')] }],
    ['an answer of 1 character', { answers: [entry('pet', 'a'), PAIR[1]] }],
    ['an answer of 61 characters', { answers: [entry('pet', hebrew(61)), PAIR[1]] }],
    ['an answer over 600 raw units', { answers: [entry('pet', ' '.repeat(600) + 'ab'), PAIR[1]] }],
    ['an answer that is not a string', { answers: [{ question: 'pet', answer: 7 }, PAIR[1]] }],
    ['an extra key on the body', { role: 'admin' }],
    ['a user id on the body', { userId: 'b0000000-0000-4000-8000-0000000000b2' }],
    ['an extra key on an answer', { answers: [{ ...PAIR[0], hint: 'x' }, PAIR[1]] }],
  ];

  it.each(bad)('[F1.6 c14] %s -> 400 invalid_request, nothing counted, no scrypt, no Auth call, no database', T, async (_label, over) => {
    await setup();
    const res = await reset(resetBody(over));
    expect(res.statusCode, res.body).toBe(400);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid_request' });
    expect(stub.attempts(), 'a rejected request must not open a transaction').toBe(0);
    expect(spy.calls(), 'no hashing work before the shape is valid').toBe(0);
    expect(admin.calls).toEqual([]);
  });

  it('[F1.6 c14] a body that is not an object (array, string, number, null) -> 400, nothing opened', T, async () => {
    await setup();
    for (const payload of ['[]', '"text"', '42', 'null', 'true']) {
      const res = await reset(payload);
      expect(res.statusCode, payload).toBe(400);
      expect(stub.attempts(), payload).toBe(0);
    }
  });

  it('[F1.6 c14] every 400 has the same body, so the shape of the error says nothing about which field was wrong', T, async () => {
    await setup();
    const bodies = new Set<string>();
    for (const [, over] of bad) bodies.add((await reset(resetBody(over))).body);
    expect([...bodies]).toEqual(['{"error":"invalid_request"}']);
  });

  const envelopes: Array<[string, () => ReturnType<typeof app.inject>]> = [
    ['malformed JSON', () => reset('{"email": ')],
    ['an empty body', () => reset('')],
    ['text/plain', () => app.inject({ method: 'POST', url: '/api/recovery/reset', headers: { 'content-type': 'text/plain' }, payload: JSON.stringify(resetBody()) })],
    ['form encoded', () => app.inject({ method: 'POST', url: '/api/recovery/reset', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'email=a%40b.co' })],
    ['no content type', () => app.inject({ method: 'POST', url: '/api/recovery/reset', payload: JSON.stringify(resetBody()) })],
    ['a body over 16 KiB (refused before parsing)', () => reset(JSON.stringify({ ...resetBody(), pad: 'x'.repeat(17 * 1024) }))],
  ];

  it.each(envelopes)('[F1.6 c14] %s -> a 4xx, nothing opened, nothing hashed, no Auth call', T, async (_label, send) => {
    await setup();
    const res = await send();
    expect(res.statusCode, res.body).toBeGreaterThanOrEqual(400);
    expect(res.statusCode, res.body).toBeLessThan(500);
    expect(stub.attempts()).toBe(0);
    expect(spy.calls()).toBe(0);
    expect(admin.calls).toEqual([]);
  });

  it.each(envelopes)('[F1.6 c14 interface.md "HTTP"] %s -> the body is {"error":"bad_request"}', T, async (_label, send) => {
    await setup();
    const res = await send();
    expect(jsonOf(res.body)).toEqual({ error: 'bad_request' });
  });

  it('[F1.6 c14] a request on the boundary is NOT a 400: password of 8 and of 256 characters, Hebrew with spaces, an email with spaces and capitals all reach the database', T, async () => {
    const valid: Array<[string, Record<string, unknown>]> = [
      ['8 characters', { password: 'a'.repeat(8) }],
      ['256 characters', { password: 'a'.repeat(256) }],
      ['Hebrew with spaces', { password: 'עברית עם רווחים 1' }],
      ['an email with surrounding spaces and capitals', { email: '  Dana.Recovery@Example.INVALID ' }],
      ['answers at 2 and 60 characters', { answers: [entry('pet', 'ab'), entry('street', hebrew(60))] }],
      ['answers typed with spaces and niqqud', { answers: [entry('pet', ' R e x '), entry('nickname', 'דּוּדִי')] }],
    ];
    for (const [label, over] of valid) {
      await setup();
      const res = await reset(resetBody(over));
      expect(res.statusCode, `${label}: ${res.body}`).not.toBe(400);
      expect(stub.attempts(), `${label}: a well-formed request goes on to the database`).toBeGreaterThan(0);
      await app.close();
      await database?.close();
    }
    database = undefined;
    await setup();
  });

  it('[F1.6 c14] a 400 is no-store and carries no echo of the request', T, async () => {
    await setup();
    const res = await reset(resetBody({ password: 'short', email: EMAIL }));
    expect(res.statusCode).toBe(400);
    expect(String(res.headers['cache-control']).toLowerCase()).toContain('no-store');
    expect(res.body).not.toContain('short');
    expect(res.body).not.toContain(EMAIL);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c15 NFR-SEC-001] a missing secret is 503 on the recovery endpoints, before any database work, and only there', () => {
  it('[F1.6 c15] no pepper: POST /api/recovery/reset -> 503 unavailable, nothing opened, no Auth call', T, async () => {
    await setup({ pepper: undefined });
    const res = await reset(resetBody());
    expect(res.statusCode, res.body).toBe(503);
    expect(jsonOf(res.body)).toEqual({ error: 'unavailable' });
    expect(stub.attempts()).toBe(0);
    expect(admin.calls).toEqual([]);
    expect(spy.calls()).toBe(0);
  });

  it('[F1.6 c15] a pepper under 32 bytes counts as missing: 503 on all three endpoints, nothing opened', T, async () => {
    await setup({ pepper: freshPepper(31) });
    const body = { answers: PAIR };
    for (const res of [
      await reset(resetBody()),
      await store(body),
      await change({ current: PAIR, answers: [entry('nickname', 'Dudi'), entry('street', 'Herzl')] }),
    ]) {
      expect(res.statusCode, res.body).toBe(503);
      expect(jsonOf(res.body)).toEqual({ error: 'unavailable' });
    }
    expect(stub.attempts()).toBe(0);
  });

  it('[F1.6 c15] no pepper: POST and PUT /api/recovery-questions with a valid session and body -> 503 unavailable, nothing opened', T, async () => {
    await setup({ pepper: undefined });
    const posted = await store({ answers: PAIR });
    const put = await change({ current: PAIR, answers: [entry('nickname', 'Dudi'), entry('street', 'Herzl')] });
    for (const res of [posted, put]) {
      expect(res.statusCode, res.body).toBe(503);
      expect(jsonOf(res.body)).toEqual({ error: 'unavailable' });
    }
    expect(stub.attempts()).toBe(0);
  });

  it('[F1.6 c15 c14] a malformed request is still 400 when the pepper is missing (the shape is checked first)', T, async () => {
    await setup({ pepper: undefined });
    expect((await reset(resetBody({ password: 'short' }))).statusCode).toBe(400);
    expect((await store({ answers: [PAIR[0]] })).statusCode).toBe(400);
  });

  it('[F1.6 c15] no Auth admin key (or issuer): the reset is 503 unavailable, nothing opened, nothing counted, no hashing', T, async () => {
    await setup({ adminConfigured: false });
    const res = await reset(resetBody());
    expect(res.statusCode, res.body).toBe(503);
    expect(jsonOf(res.body)).toEqual({ error: 'unavailable' });
    expect(stub.attempts()).toBe(0);
    expect(spy.calls()).toBe(0);
    expect(admin.calls).toEqual([]);
  });

  it('[F1.6 c15] the admin key is not needed for the questions endpoints: with it missing, a valid store request still reaches the database', T, async () => {
    await setup({ adminConfigured: false });
    const res = await store({ answers: PAIR });
    expect(res.statusCode).not.toBe(400);
    expect(stub.attempts()).toBeGreaterThan(0);
  });

  it('[F1.6 c15] "these endpoints only": with no pepper and no admin key, GET /api/health still answers 200', T, async () => {
    await setup({ pepper: undefined, adminConfigured: false });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(jsonOf(res.body)).toEqual({ status: 'ok' });
  });

  it('[F1.6 c15] the seam works too: keys() returning nothing is the same 503', T, async () => {
    setPepper(freshPepper());
    log = captureLog();
    stub = await refusingDatabase(fake.url);
    database = stub.database;
    admin = fakeAdmin();
    app = await buildRecoveryApp(env(), { database, logStream: log.stream, recovery: { keys: () => undefined, authAdmin: admin.authAdmin } });
    const res = await reset(resetBody());
    expect(res.statusCode).toBe(503);
    expect(stub.attempts()).toBe(0);
  });

  it('[F1.6 c15] a 503 for a missing secret is no-store and names neither the secret nor the variable', T, async () => {
    await setup({ pepper: undefined, adminConfigured: false });
    const res = await reset(resetBody());
    expect(String(res.headers['cache-control']).toLowerCase()).toContain('no-store');
    expect(res.body).not.toMatch(/pepper|RECOVERY_|SUPABASE|secret|key/i);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c1 c4 c5] /api/recovery-questions needs a session, and the session is the only thing that names the account', () => {
  const cases: Array<[string, () => Promise<string | null>]> = [
    ['no Authorization header', () => Promise.resolve(null)],
    ['a token that is not a JWT', () => Promise.resolve('Bearer not-a-token')],
    ['the scheme alone', () => Promise.resolve('Bearer ')],
    ['an expired token', async () => bearer({ exp: Math.floor(Date.now() / 1000) - 3600 })],
    ['a wrong audience', async () => bearer({ aud: 'someone-else' })],
    ['a wrong issuer', async () => bearer({ iss: 'https://evil.example.invalid/auth/v1' })],
  ];

  it.each(cases)('[F1.6 c1 c5] POST with %s -> 401 unauthenticated, nothing stored, nothing opened', T, async (_label, make) => {
    await setup();
    const res = await store({ answers: PAIR }, await make());
    expect(res.statusCode).toBe(401);
    expect(jsonOf(res.body)).toEqual({ error: 'unauthenticated' });
    expect(stub.attempts()).toBe(0);
  });

  it.each(cases)('[F1.6 c4 c5] PUT with %s -> 401 unauthenticated, nothing changed, nothing opened', T, async (_label, make) => {
    await setup();
    const res = await change({ current: PAIR, answers: PAIR }, await make());
    expect(res.statusCode).toBe(401);
    expect(jsonOf(res.body)).toEqual({ error: 'unauthenticated' });
    expect(stub.attempts()).toBe(0);
  });

  it('[F1.6 c5] a body naming another user is 400 invalid_questions, on both methods, and nothing is opened', T, async () => {
    await setup();
    const other = 'b0000000-0000-4000-8000-0000000000b2';
    for (const res of [
      await store({ answers: PAIR, userId: other }),
      await store({ answers: PAIR, user_id: other }),
      await store({ answers: [{ ...PAIR[0], userId: other }, PAIR[1]] }),
      await change({ current: PAIR, answers: PAIR, userId: other }),
    ]) {
      expect(res.statusCode, res.body).toBe(400);
      expect(jsonOf(res.body)).toEqual({ error: 'invalid_questions' });
    }
    expect(stub.attempts()).toBe(0);
  });

  it('[F1.6 c5] a query string or header naming another user changes nothing: the request is judged by its body and session alone', T, async () => {
    await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/recovery-questions?userId=b0000000-0000-4000-8000-0000000000b2',
      headers: { 'content-type': 'application/json', authorization: await bearer(), 'x-user-id': 'b0000000-0000-4000-8000-0000000000b2' },
      payload: JSON.stringify({ answers: [PAIR[0]] }),
    });
    expect(res.statusCode).toBe(400);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid_questions' });
  });
});

describe('[F1.6 c2 c4] the store and change bodies: exactly two entries of two different ids, strict objects', () => {
  const invalid: Array<[string, unknown]> = [
    ['no body keys', {}],
    ['one entry', { answers: [PAIR[0]] }],
    ['zero entries', { answers: [] }],
    ['three entries', { answers: [...PAIR, entry('nickname', 'Dudi')] }],
    ['the same id twice', { answers: [entry('pet', 'Rex'), entry('pet', 'Max')] }],
    ['an unknown id', { answers: [entry('pet', 'Rex'), entry('school', 'Herzl')] }],
    ['an answer of 1 character', { answers: [entry('pet', 'a'), PAIR[1]] }],
    ['an answer of 61 characters', { answers: [entry('pet', hebrew(61)), PAIR[1]] }],
    ['an answer of separators only', { answers: [entry('pet', ' - '), PAIR[1]] }],
    ['an answer over 600 raw units', { answers: [entry('pet', 'a'.repeat(601)), PAIR[1]] }],
    ['an extra field', { answers: PAIR, note: 'x' }],
    ['an extra field on an entry', { answers: [{ ...PAIR[0], extra: 1 }, PAIR[1]] }],
    ['an answer that is not a string', { answers: [{ question: 'pet', answer: ['Rex'] }, PAIR[1]] }],
    ['answers that is an object', { answers: { 0: PAIR[0], 1: PAIR[1] } }],
  ];

  it.each(invalid)('[F1.6 c2] POST with %s -> 400 invalid_questions, nothing stored', T, async (_label, payload) => {
    await setup();
    const res = await store(payload);
    expect(res.statusCode, res.body).toBe(400);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid_questions' });
    expect(stub.attempts(), 'a rejected body opens no transaction, so nothing can be stored').toBe(0);
    expect(spy.calls(), 'no hashing before the body is valid').toBe(0);
  });

  it.each([
    ['no current', { answers: PAIR }],
    ['current with one entry', { current: [PAIR[0]], answers: PAIR }],
    ['current with the same id twice', { current: [entry('pet', 'Rex'), entry('pet', 'Max')], answers: PAIR }],
    ['current with an unknown id', { current: [entry('pet', 'Rex'), entry('school', 'Herzl')], answers: PAIR }],
    ['new answers with one entry', { current: PAIR, answers: [PAIR[0]] }],
    ['new answers of 61 characters', { current: PAIR, answers: [entry('pet', hebrew(61)), PAIR[1]] }],
    ['an extra field', { current: PAIR, answers: PAIR, email: EMAIL }],
    ['the store shape (no current)', { answers: PAIR }],
  ])('[F1.6 c4 c2] PUT with %s -> 400 invalid_questions, nothing changed and nothing counted', T, async (_label, payload) => {
    await setup();
    const res = await change(payload);
    expect(res.statusCode, res.body).toBe(400);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid_questions' });
    expect(stub.attempts()).toBe(0);
    expect(spy.calls()).toBe(0);
  });

  const questionEnvelopes: Array<[string, (header: string) => ReturnType<typeof app.inject>]> = [
    ['malformed JSON', (header) => postJson(app, '/api/recovery-questions', '{"answers": [', { authorization: header })],
    ['text/plain', (header) => app.inject({ method: 'POST', url: '/api/recovery-questions', headers: { authorization: header, 'content-type': 'text/plain' }, payload: 'x' })],
    ['a body over 16 KiB', (header) => postJson(app, '/api/recovery-questions', JSON.stringify({ answers: PAIR, pad: 'x'.repeat(17 * 1024) }), { authorization: header })],
  ];

  it.each(questionEnvelopes)('[F1.6 c2] %s -> a 4xx, nothing opened', T, async (_label, send) => {
    await setup();
    const res = await send(await bearer());
    expect(res.statusCode, res.body).toBeGreaterThanOrEqual(400);
    expect(res.statusCode, res.body).toBeLessThan(500);
    expect(stub.attempts()).toBe(0);
  });

  it.each(questionEnvelopes)('[F1.6 c2 interface.md "HTTP"] %s -> the body is {"error":"bad_request"}', T, async (_label, send) => {
    await setup();
    const res = await send(await bearer());
    expect(jsonOf(res.body)).toEqual({ error: 'bad_request' });
  });

  it('[F1.6 c2] a well-formed store request is not a 400: it goes on to the database (control for the refusals above)', T, async () => {
    await setup();
    const res = await store({ answers: [entry('pet', 'ab'), entry('nickname', hebrew(60))] });
    expect(res.statusCode).not.toBe(400);
    expect(stub.attempts()).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c1 c4 c13] methods, caching and the answer headers', () => {
  it.each(['GET', 'DELETE', 'PATCH', 'OPTIONS'] as const)('[F1.6 c1] %s on /api/recovery-questions with a session -> 405 method_not_allowed, allow: POST, PUT, no database call', T, async (method) => {
    await setup();
    const res = await app.inject({ method, url: '/api/recovery-questions', headers: { authorization: await bearer() } });
    expect(res.statusCode).toBe(405);
    expect(jsonOf(res.body)).toEqual({ error: 'method_not_allowed' });
    expect(String(res.headers.allow).split(/\s*,\s*/).sort()).toEqual(['POST', 'PUT']);
    expect(stub.attempts()).toBe(0);
  });

  it.each(['GET', 'DELETE', 'PATCH', 'OPTIONS'] as const)('[F1.6 c1] %s on /api/recovery-questions without a session -> 401 first', T, async (method) => {
    await setup();
    const res = await app.inject({ method, url: '/api/recovery-questions' });
    expect(res.statusCode).toBe(401);
  });

  it.each(['GET', 'PUT', 'DELETE', 'PATCH'] as const)('[F1.6 c11] %s on /api/recovery/reset is never served: 405 with allow: POST (or 401 from the hook), nothing opened', T, async (method) => {
    await setup();
    const res = await app.inject({ method, url: '/api/recovery/reset', headers: { 'content-type': 'application/json' }, payload: method === 'GET' ? undefined : JSON.stringify(resetBody()) });
    expect([401, 405], `${method}: ${res.body}`).toContain(res.statusCode);
    if (res.statusCode === 405) expect(String(res.headers.allow).toUpperCase()).toBe('POST');
    expect(stub.attempts()).toBe(0);
    expect(admin.calls).toEqual([]);
  });

  it('[F1.6 c11] POST /api/recovery/reset is public: with no token an invalid body gets 400, not 401', T, async () => {
    await setup();
    const res = await reset(resetBody({ password: 'short' }));
    expect(res.statusCode).toBe(400);
  });

  it('[F1.6 c11] the public route is the only one added: its sibling paths and a trailing slash are not public', T, async () => {
    await setup();
    for (const url of ['/api/recovery', '/api/recovery/', '/api/recovery/reset/', '/api/recovery/reset/extra', '/api/recovery-questions/', '/api/recovery/RESET']) {
      const res = await postJson(app, url, resetBody());
      expect([401, 404], url).toContain(res.statusCode);
      expect(res.body, url).not.toContain('invalid_request');
    }
    expect(stub.attempts()).toBe(0);
  });

  it('[F1.6 c13 NFR-SEC-001] cache-control: no-store on the answers of the recovery routes, a 400 and a 503 included (a 401 comes from the hook, a 405 from the router)', T, async () => {
    await setup();
    const responses = [await reset(resetBody({ password: 'short' })), await store({ answers: [PAIR[0]] })];
    for (const res of responses) expect(String(res.headers['cache-control']).toLowerCase(), `${res.statusCode}`).toContain('no-store');
    await app.close();
    await database?.close();
    await setup({ pepper: undefined });
    expect(String((await reset(resetBody())).headers['cache-control']).toLowerCase()).toContain('no-store');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c15 c10] database faults: transient -> 503, deterministic -> 500, nothing leaks', () => {
  it('[F1.6 c15] reset: a lost connection (transient) -> 503 unavailable, no Auth call', T, async () => {
    const f = await failingWith(lostConnection);
    const res = await reset(resetBody());
    expect(f.attempts()).toBeGreaterThan(0);
    expect(res.statusCode, res.body).toBe(503);
    expect(jsonOf(res.body)).toEqual({ error: 'unavailable' });
    expect(admin.calls).toEqual([]);
    for (const secret of [SECRET, EMAIL, ANSWER_ONE, NEW_PASSWORD]) expect(res.body).not.toContain(secret);
  });

  it('[F1.6 c15] reset: a deterministic database refusal (23503) -> 500 internal, no Auth call', T, async () => {
    await failingWith(constraintFault);
    const res = await reset(resetBody());
    expect(res.statusCode, res.body).toBe(500);
    expect(jsonOf(res.body)).toEqual({ error: 'internal' });
    expect(admin.calls).toEqual([]);
    for (const secret of [SECRET, EMAIL, ANSWER_ONE, ANSWER_TWO, NEW_PASSWORD]) expect(res.body).not.toContain(secret);
  });

  it('[F1.6 c15] reset: a code defect (TypeError) -> 500 internal, never a 200 and never a 401 (a failure is not "wrong answers")', T, async () => {
    await failingWith(codeDefect);
    const res = await reset(resetBody());
    expect(res.statusCode).toBe(500);
    expect(jsonOf(res.body)).toEqual({ error: 'internal' });
    expect(res.body).not.toContain('invalid_recovery');
  });

  it('[F1.6 c10] no database fault is answered as invalid_recovery: that code means "the answers did not match" and nothing else', T, async () => {
    for (const make of [lostConnection, constraintFault, codeDefect, policyRefusal]) {
      await failingWith(make);
      const res = await reset(resetBody());
      expect(res.statusCode).not.toBe(401);
      expect(res.body).not.toContain('invalid_recovery');
      await app.close();
      await database?.close();
    }
    database = undefined;
    await setup();
  });

  it('[F1.6 c1] store: a lost connection -> 503 unavailable; a deterministic fault -> 500 internal; nothing leaks', T, async () => {
    await failingWith(lostConnection);
    const transient = await store({ answers: PAIR });
    expect(transient.statusCode, transient.body).toBe(503);
    expect(jsonOf(transient.body)).toEqual({ error: 'unavailable' });
    await app.close();
    await database?.close();
    await failingWith(constraintFault);
    const hard = await store({ answers: PAIR });
    expect(hard.statusCode, hard.body).toBe(500);
    expect(jsonOf(hard.body)).toEqual({ error: 'internal' });
    for (const res of [transient, hard]) for (const secret of [SECRET, EMAIL, ANSWER_ONE, NEW_PASSWORD]) expect(res.body).not.toContain(secret);
    database = undefined;
    await setup();
  });

  it('[F1.6 c1 c5] store: a policy refusal (SQLSTATE 42501: not an active account, or no account row) -> 403 forbidden', T, async () => {
    await failingWith(policyRefusal);
    const res = await store({ answers: PAIR });
    expect(res.statusCode, res.body).toBe(403);
    expect(jsonOf(res.body)).toEqual({ error: 'forbidden' });
    expect(res.body).not.toContain(SECRET);
  });

  it('[F1.6 c4] change: a lost connection -> 503, a deterministic fault -> 500; never 401 invalid_recovery', T, async () => {
    await failingWith(lostConnection);
    const transient = await change({ current: PAIR, answers: PAIR });
    expect(transient.statusCode, transient.body).toBe(503);
    await app.close();
    await database?.close();
    await failingWith(constraintFault);
    const hard = await change({ current: PAIR, answers: PAIR });
    expect(hard.statusCode, hard.body).toBe(500);
    for (const res of [transient, hard]) expect(res.body).not.toContain('invalid_recovery');
    database = undefined;
    await setup();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c3 c13 NFR-PRIV-001] logs carry no email, answers, password, token, handle or IP', () => {
  it('[F1.6 c3] a failed reset logs one fixed line with status, code and sqlstate only; nothing from the request or the error', T, async () => {
    const pepper = freshPepper();
    await failingWith(constraintFault, pepper);
    const res = await reset(resetBody({ email: EMAIL, answers: [entry('pet', ANSWER_ONE), entry('street', ANSWER_TWO)], password: NEW_PASSWORD }), {
      'x-forwarded-for': CLIENT_IP,
    });
    expect(res.statusCode).toBe(500);
    const text = log.text();
    expect(text).toContain('recovery reset failed');
    const keys = readRecoveryKeys({ RECOVERY_PEPPER: pepper });
    if (keys === undefined) throw new Error('test pepper rejected');
    const handle = emailHandle(keys, EMAIL).toString('hex');
    const ip = ipHash(keys, clientAddress(CLIENT_IP).key).toString('hex');
    const forbidden = [
      EMAIL,
      EMAIL.toLowerCase(),
      'leak.check',
      ANSWER_ONE,
      ANSWER_ONE.toLowerCase(),
      ANSWER_TWO,
      ANSWER_TWO.toLowerCase(),
      NEW_PASSWORD,
      SECRET,
      CLIENT_IP,
      handle,
      ip,
      Buffer.from(EMAIL).toString('base64'),
    ];
    for (const secret of forbidden) expect(text, `log contains ${secret.slice(0, 14)}`).not.toContain(secret);
    expect(text).toContain('23503');
  });

  it('[F1.6 c3] every recovery log line has only the documented fields', T, async () => {
    await failingWith(constraintFault);
    await reset(resetBody());
    await store({ answers: PAIR });
    await change({ current: PAIR, answers: PAIR });
    const allowed = new Set(['level', 'time', 'pid', 'hostname', 'msg', 'reqId', 'req', 'res', 'responseTime', 'status', 'code', 'sqlstate', 'reason', 'err']);
    const recoveryLines = log.lines().filter((line) => /recovery/.test(line) && !line.includes('"req"'));
    expect(recoveryLines.length).toBeGreaterThan(0);
    for (const line of recoveryLines) {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== 'object' || parsed === null) throw new Error('log line is not an object');
      const unexpected = Object.keys(parsed).filter((k) => !allowed.has(k));
      expect(unexpected, line).toEqual([]);
      expect(Object.keys(parsed), line).not.toContain('err');
    }
  });

  it('[F1.6 c3] the request line names the route pattern, not the query string: a secret in the query is not logged', T, async () => {
    await failingWith(constraintFault);
    await app.inject({
      method: 'POST',
      url: `/api/recovery/reset?email=${encodeURIComponent(EMAIL)}&password=${NEW_PASSWORD}`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(resetBody()),
    });
    const text = log.text();
    for (const secret of [EMAIL, NEW_PASSWORD, encodeURIComponent(EMAIL)]) expect(text).not.toContain(secret);
  });

  it('[F1.6 c3] a failed store logs a fixed line; no token, answer, email or hash', T, async () => {
    await failingWith(constraintFault);
    const header = await bearer();
    const res = await store({ answers: [entry('pet', ANSWER_ONE), entry('street', ANSWER_TWO)] }, header);
    expect(res.statusCode).toBe(500);
    const text = log.text();
    const raw = header.replace('Bearer ', '');
    for (const secret of [raw, raw.split('.')[1] ?? '', EMAIL, ANSWER_ONE, ANSWER_ONE.toLowerCase(), ANSWER_TWO, SECRET, SUB]) {
      expect(text, `log contains ${secret.slice(0, 12)}`).not.toContain(secret);
    }
    expect(text).toMatch(/recovery answers write failed/);
  });

  it('[F1.6 c3] a failed change logs a fixed line; no token, answer, email or hash', T, async () => {
    await failingWith(constraintFault);
    const header = await bearer();
    const res = await change({ current: [entry('pet', ANSWER_ONE), entry('street', ANSWER_TWO)], answers: PAIR }, header);
    expect(res.statusCode).toBe(500);
    const text = log.text();
    for (const secret of [header.replace('Bearer ', ''), EMAIL, ANSWER_ONE, ANSWER_ONE.toLowerCase(), ANSWER_TWO, SECRET]) {
      expect(text, `log contains ${secret.slice(0, 12)}`).not.toContain(secret);
    }
    expect(text).toMatch(/recovery answers change failed/);
  });

  it('[F1.6 c3] an invalid request is answered without logging its content', T, async () => {
    await setup();
    await reset(resetBody({ email: EMAIL, password: 'short', answers: [entry('pet', ANSWER_ONE)] }));
    await store({ answers: [entry('pet', ANSWER_ONE)] });
    const text = log.text();
    for (const secret of [EMAIL, ANSWER_ONE, ANSWER_ONE.toLowerCase(), 'short"']) expect(text).not.toContain(secret);
  });

  it('[F1.6 c3] a store request by a token with no email claim is refused without logging the token', T, async () => {
    await setup();
    const header = await bearer({ extra: {} });
    const res = await store({ answers: PAIR }, header);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(log.text()).not.toContain(header.replace('Bearer ', ''));
  });
});
