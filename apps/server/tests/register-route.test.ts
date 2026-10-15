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
import {
  CLOCK_NOW,
  buildRegisterApp,
  captureLog,
  child,
  jsonOf,
  parts,
  post,
  refusingDatabase,
  validBody,
  type RefusingDatabase,
} from './helpers/register-app.js';
import type { Database } from '../src/db/client.js';

// I1 F1.4 part b, the route POST /api/register, the checks that need no real database. Spec Revision 2 criteria:
//   2   composed body: strict at every level, raw bounds, consent literal, 100 KB -> 413 before parsing
//   3   the server's clock (UTC date + 1 day, Q4)
//   13  405 for other methods; no password / email / children's data / token in any log line or response body
//   15  401 before the body is read: none, malformed, tampered, expired
// "Nothing reached the database" is asserted on a stub Database that counts every transaction/connection request and
// refuses it at once (tests/helpers/register-app.ts refusingDatabase). The behaviour that needs the real database (201, 409, 500, 503) is in tests/db/register.db.test.ts.
// Derived from spec.md and interface.md "part b, route" only.

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const SECRET_NAME = 'שם־סודי־של־הורה';
const SECRET_CHILD = 'ילדה־סודית';
const SECRET_PASSWORD = 'hunter2-hunter2';
const SECRET_EMAIL = 'secret.person@example.invalid';
const T = { timeout: 60_000 };

let key: TestKey;
let jwks: JwksServer;
let fake: FakeDb;
let stub: RefusingDatabase;
let database: Database;
let app: App;
let log: ReturnType<typeof captureLog>;
let clockNow = CLOCK_NOW;

async function bearer(over: Record<string, unknown> = {}): Promise<string> {
  const options = { key, sub: SUB, ...over };
  return `Bearer ${await token(options)}`;
}

async function setup(clock: () => Date = () => clockNow): Promise<void> {
  log = captureLog();
  stub = await refusingDatabase(fake.url);
  database = stub.database;
  app = await buildRegisterApp(
    { SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: fake.url },
    { database, clock, logStream: log.stream },
  );
}

beforeAll(async () => {
  key = await newKey('register-route-key');
  jwks = await startJwks([key]);
  fake = await startFakeDb();
}, 60_000);

afterEach(async () => {
  await app.close();
  await database.close();
  clockNow = CLOCK_NOW;
});

afterAll(async () => {
  await jwks.close();
  await fake.close();
  restoreEnv();
});

/** Runs the request and returns what reached the database side: connection attempts and transactions opened. */
async function reached<R>(run: () => Promise<R>): Promise<{ result: R; connections: number; transactions: number }> {
  const a0 = stub.attempts();
  const result = await run();
  const reachedDatabase = stub.attempts() - a0;
  return { result, connections: reachedDatabase, transactions: reachedDatabase };
}

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.4-b c15] a missing, malformed, tampered or expired session is 401 before the body is read', () => {
  const GARBAGE_BODY = '{"this is": not json, '.repeat(10);
  const HUGE_BODY = JSON.stringify({ fullName: 'x'.repeat(200_000) });

  async function tampered(): Promise<string> {
    const t = await token({ key, sub: SUB });
    const [h = '', p = '', s = ''] = t.split('.');
    const flipped = s.slice(0, -4) + (s.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    return `Bearer ${h}.${p}.${flipped}`;
  }

  const cases: Array<[string, () => Promise<string | null>]> = [
    ['no Authorization header', () => Promise.resolve(null)],
    ['an empty Authorization header', () => Promise.resolve('')],
    ['the scheme alone ("Bearer ")', () => Promise.resolve('Bearer ')],
    ['a token that is not a JWT', () => Promise.resolve('Bearer not-a-token')],
    ['another scheme (Basic)', () => Promise.resolve('Basic dXNlcjpwYXNz')],
    ['the token without the scheme', async () => token({ key, sub: SUB })],
    ['a tampered signature', tampered],
    ['an expired token', async () => bearer({ exp: Math.floor(Date.now() / 1000) - 3600 })],
    ['a token not valid yet (nbf in the future)', async () => bearer({ nbf: Math.floor(Date.now() / 1000) + 3600 })],
    ['a token for another audience', async () => bearer({ aud: 'someone-else' })],
    ['a token from another issuer', async () => bearer({ iss: 'https://evil.example.invalid/auth/v1' })],
    ['a token with an unknown key id', async () => `Bearer ${await token({ key, kid: 'unknown-kid', sub: SUB })}`],
    ['an unsigned (alg none) token', () => Promise.resolve(`Bearer ${unsignedToken(key.kid, SUB)}`)],
    ['an HS256 token', async () => `Bearer ${await hs256Token('a-shared-secret-of-some-length-123456', key.kid, SUB)}`],
    ['a token whose sub is not a UUID', async () => bearer({ sub: 'not-a-uuid' })],
    ['a token with no sub', async () => bearer({ sub: undefined })],
  ];

  it.each(cases)('[F1.4-b c15] %s -> 401 unauthenticated, nothing read, nothing reaches the database', T, async (_label, make) => {
    await setup();
    const header = await make();
    for (const payload of [JSON.stringify(validBody()), GARBAGE_BODY, HUGE_BODY, '']) {
      const { result, connections, transactions } = await reached(() => post(app, header, payload));
      expect(result.statusCode, payload.slice(0, 30)).toBe(401);
      expect(jsonOf(result.body)).toEqual({ error: 'unauthenticated' });
      expect(String(result.headers['www-authenticate'])).toMatch(/bearer/i);
      expect(connections).toBe(0);
      expect(transactions).toBe(0);
    }
  });

  it('[F1.4-b c15] the 401 comes before validation: garbage JSON and a 200 KB body with a bad token are 401, never 400 or 413', T, async () => {
    await setup();
    expect((await post(app, 'Bearer nope', GARBAGE_BODY)).statusCode).toBe(401);
    expect((await post(app, 'Bearer nope', HUGE_BODY)).statusCode).toBe(401);
  });

  it('[F1.4-b c15] a 401 body names no reason (the same for every failure)', T, async () => {
    await setup();
    const bodies = new Set<string>();
    for (const [, make] of cases) bodies.add((await post(app, await make(), validBody())).body);
    expect([...bodies]).toEqual(['{"error":"unauthenticated"}']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.4-b c2] the composed body is strict at every level; a rejected body writes nothing', () => {
  async function rejected(payload: string | Record<string, unknown>, expectedError = 'invalid_request') {
    const header = await bearer();
    const { result, connections, transactions } = await reached(() => post(app, header, payload));
    expect(result.statusCode, typeof payload === 'string' ? payload.slice(0, 60) : JSON.stringify(payload).slice(0, 120)).toBe(400);
    expect(jsonOf(result.body)).toEqual({ error: expectedError });
    expect(connections, 'no database connection for a rejected body').toBe(0);
    expect(transactions).toBe(0);
    return result;
  }

  it.each([
    ['email', { email: 'a@b.co' }],
    ['password', { password: SECRET_PASSWORD }],
    ['email and password together', { email: 'a@b.co', password: SECRET_PASSWORD }],
    ['a terms version', { termsVersion: 'x' }],
    ['a privacy version', { privacyVersion: 'x' }],
    ['a consent version key', { consentTermsVersion: 'x' }],
    ['a parent birth date', { parentBirthDate: parts('1990-01-01') }],
    ['an owner id', { userId: SUB }],
    ['a user_id', { user_id: SUB }],
    ['an id', { id: SUB }],
    ['an access token', { accessToken: 'x' }],
    ['an accepted_at', { accepted_at: '2020-01-01' }],
    ['an account type', { accountType: 'admin' }],
    ['a status', { status: 'active' }],
  ])('[F1.4-b c2] a top-level key %s -> 400 invalid_request', T, async (_label, extra) => {
    await setup();
    await rejected(validBody(extra));
  });

  it('[F1.4-b c2] an unknown key inside dueDate, inside a child, and inside a birthDate -> 400', T, async () => {
    await setup();
    await rejected(validBody({ dueDate: { ...parts('2026-12-01'), hour: '1' } }));
    await rejected(validBody({ children: [child({ nickname: 'x' })] }));
    await rejected(validBody({ children: [child(), child({ birthDate: { ...parts('2022-01-15'), era: 'x' } })] }));
  });

  it('[F1.4-b c2] unknown keys are rejected even where the section is dropped (children while has_child is not ticked)', T, async () => {
    await setup();
    await rejected(validBody({ stages: ['planning'], children: [child({ nickname: 'x' })] }));
  });

  it.each([
    ['false', false],
    ['the string "true"', 'true'],
    ['absent', undefined],
    ['null', null],
    ['1', 1],
    ['an object', { accepted: true }],
  ])('[F1.4-b c2] consent %s -> 400', T, async (_label, consent) => {
    await setup();
    await rejected(validBody({ consent }));
  });

  it('[F1.4-b c2] a body without consent at all -> 400', T, async () => {
    await setup();
    await rejected(Object.fromEntries(Object.entries(validBody()).filter(([name]) => name !== 'consent')));
  });

  it('[F1.4-b c2] raw bounds: stages over 3, children over 10 (at any stage), names over 600 units -> 400', T, async () => {
    await setup();
    await rejected(validBody({ stages: ['planning', 'planning', 'planning', 'planning'] }));
    await rejected(validBody({ stages: ['planning'], children: Array.from({ length: 11 }, () => child()) }));
    await rejected(validBody({ children: Array.from({ length: 11 }, () => child()) }));
    await rejected(validBody({ fullName: 'x'.repeat(601) }));
    await rejected(validBody({ children: [child({ name: 'x'.repeat(601) })] }));
  });

  it('[F1.4-b c2] a ~90 KB name is rejected in under 100 ms with no database write', T, async () => {
    await setup();
    const header = await bearer();
    await post(app, header, validBody()); // warm-up: key fetch, schema
    const payload = JSON.stringify(validBody({ fullName: 'x'.repeat(90_000) }));
    expect(Buffer.byteLength(payload)).toBeLessThan(102_400);
    const { result, connections } = await reached(async () => {
      const t0 = Date.now();
      const res = await post(app, header, payload);
      return { res, ms: Date.now() - t0 };
    });
    expect(result.res.statusCode).toBe(400);
    expect(result.ms, `took ${result.ms} ms`).toBeLessThan(100);
    expect(connections).toBe(0);
  });

  it('[F1.4-b c2] unparseable JSON, a JSON null, an array and a scalar -> 400 (bad_request for unparseable)', T, async () => {
    await setup();
    await rejected('{"fullName": ', 'bad_request');
    await rejected('not json at all', 'bad_request');
    await rejected('null');
    await rejected('[]');
    await rejected('[{"fullName":"x"}]');
    await rejected('"text"');
    await rejected('42');
    await rejected('{}');
  });

  it('[F1.4-b c2] no 400 body repeats what the client sent', T, async () => {
    await setup();
    const res = await rejected(validBody({ fullName: SECRET_NAME, password: SECRET_PASSWORD, email: SECRET_EMAIL, children: [child({ name: SECRET_CHILD })] }));
    for (const secret of [SECRET_NAME, SECRET_PASSWORD, SECRET_EMAIL, SECRET_CHILD]) expect(res.body).not.toContain(secret);
    expect(res.body).not.toMatch(/zod|issue|path|unrecognized|expected|invalid_type|stack|at \w+ \(/i);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.4-b c13] request limits: a body over 100 KB is 413 before parsing', () => {
  const LIMIT = 102_400;
  const withLength = (bytes: number): string => {
    const shell = JSON.stringify({ fullName: '' });
    return JSON.stringify({ fullName: 'x'.repeat(bytes - Buffer.byteLength(shell)) });
  };

  it('[F1.4-b c13] 102,401 bytes -> 413 bad_request, nothing reaches the database', T, async () => {
    await setup();
    const payload = withLength(LIMIT + 1);
    expect(Buffer.byteLength(payload)).toBe(LIMIT + 1);
    const { result, connections, transactions } = await reached(async () => post(app, await bearer(), payload));
    expect(result.statusCode).toBe(413);
    expect(jsonOf(result.body)).toEqual({ error: 'bad_request' });
    expect(connections).toBe(0);
    expect(transactions).toBe(0);
  });

  it('[F1.4-b c13] exactly 102,400 bytes is under the limit: it reaches validation and is a 400, not a 413', T, async () => {
    await setup();
    const payload = withLength(LIMIT);
    expect(Buffer.byteLength(payload)).toBe(LIMIT);
    expect((await post(app, await bearer(), payload)).statusCode).toBe(400);
  });

  it('[F1.4-b c13] 5 MB -> 413 fast, and the limit applies to unparseable bodies too (it is not the parser that refuses)', T, async () => {
    await setup();
    const header = await bearer();
    await post(app, header, validBody()); // warm-up
    const t0 = Date.now();
    const big = await post(app, header, 'x'.repeat(5_000_000));
    const ms = Date.now() - t0;
    expect(big.statusCode).toBe(413);
    expect(jsonOf(big.body)).toEqual({ error: 'bad_request' });
    expect(ms, `took ${ms} ms`).toBeLessThan(1000);
  });

  it('[F1.4-b c13] the limit does not depend on the token: with no token a 200 KB body is still 401 (auth first)', T, async () => {
    await setup();
    expect((await post(app, null, withLength(200_000))).statusCode).toBe(401);
  });
});

describe('[F1.4-b c13] other methods are 405 with Allow: POST; they are protected too', () => {
  const METHODS = ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;

  it.each(METHODS)('[F1.4-b c13] %s with a valid session -> 405 method_not_allowed, allow: POST', T, async (method) => {
    await setup();
    const { result, connections } = await reached(async () =>
      app.inject({ method, url: '/api/register', headers: { authorization: await bearer() } }),
    );
    expect(result.statusCode).toBe(405);
    expect(String(result.headers.allow)).toMatch(/^post$/i);
    if (method !== 'HEAD') expect(jsonOf(result.body)).toEqual({ error: 'method_not_allowed' });
    expect(connections).toBe(0);
  });

  it.each(METHODS)('[F1.4-b c13 c15] %s without a token -> 401 first', T, async (method) => {
    await setup();
    const res = await app.inject({ method, url: '/api/register' });
    expect(res.statusCode).toBe(401);
  });

  it('[F1.4-b c13] a PUT carrying a valid registration body is 405 and writes nothing', T, async () => {
    await setup();
    const { result, connections } = await reached(async () =>
      app.inject({ method: 'PUT', url: '/api/register', headers: { authorization: await bearer(), 'content-type': 'application/json' }, payload: JSON.stringify(validBody()) }),
    );
    expect(result.statusCode).toBe(405);
    expect(connections).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.4-b c3] the server clock decides "not in the future": UTC date + 1 day (Q4)', () => {
  /** A request is "accepted by the schema" when it gets past validation: not 400, and the database was asked for something. */
  async function passesValidation(birthIso: string, now: Date): Promise<boolean> {
    clockNow = now;
    const header = await bearer();
    const { result, connections } = await reached(() =>
      post(app, header, validBody({ stages: ['has_child'], dueDate: { day: '', month: '', year: '' }, children: [child({ birthDate: parts(birthIso) })] })),
    );
    if (result.statusCode === 400) {
      expect(connections).toBe(0);
      return false;
    }
    expect(connections, 'a body that passed validation reaches the database').toBeGreaterThan(0);
    return true;
  }

  it('[F1.4-b c3] server date D: D passes, D+1 passes, D+2 fails', T, async () => {
    await setup();
    const d = new Date('2026-06-15T10:00:00.000Z');
    expect(await passesValidation('2026-06-15', d)).toBe(true);
    expect(await passesValidation('2026-06-16', d)).toBe(true);
    expect(await passesValidation('2026-06-17', d)).toBe(false);
    expect(await passesValidation('2027-06-15', d)).toBe(false);
  });

  it('[F1.4-b c3] the UTC date is used, not the local one: 23:59:59Z and 00:00:00Z on either side of midnight', T, async () => {
    await setup();
    expect(await passesValidation('2026-06-16', new Date('2026-06-15T23:59:59.999Z'))).toBe(true);
    expect(await passesValidation('2026-06-17', new Date('2026-06-15T23:59:59.999Z'))).toBe(false);
    expect(await passesValidation('2026-06-17', new Date('2026-06-16T00:00:00.000Z'))).toBe(true);
    expect(await passesValidation('2026-06-18', new Date('2026-06-16T00:00:00.000Z'))).toBe(false);
  });

  it('[F1.4-b c3] the clock is read per request: the same body flips with the injected clock', T, async () => {
    await setup();
    expect(await passesValidation('2026-06-20', new Date('2026-06-10T00:00:00Z'))).toBe(false);
    expect(await passesValidation('2026-06-20', new Date('2026-06-19T00:00:00Z'))).toBe(true);
  });

  it('[F1.4-b c3] every other F1.3 rule holds on the route: planning with pregnant, no stage, short name, has_child without children', T, async () => {
    await setup();
    const header = await bearer();
    for (const bad of [
      validBody({ stages: ['planning', 'pregnant'], children: [] }),
      validBody({ stages: [], children: [] }),
      validBody({ fullName: 'א' }),
      validBody({ stages: ['has_child'], children: [] }),
      validBody({ stages: ['has_child'], children: [child({ sex: 'bogus' })] }),
      validBody({ stages: ['pregnant'], dueDate: parts('2028-01-01'), children: [] }),
      validBody({ stages: ['has_child'], children: [child({ birthDate: parts('1899-12-31') })] }),
    ]) {
      const { result, connections } = await reached(() => post(app, header, bad));
      expect(result.statusCode, JSON.stringify(bad).slice(0, 100)).toBe(400);
      expect(connections).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.4-b c13 NFR-PRIV-001] no password, email, name, date or token in any log line or response body', () => {
  const SECRET_DATE = '2019-03-17';

  async function noisy() {
    const header = await bearer();
    const raw = header.replace('Bearer ', '');
    const bodyWith = validBody({
      fullName: SECRET_NAME,
      children: [child({ name: SECRET_CHILD, birthDate: parts(SECRET_DATE) })],
      stages: ['has_child'],
      dueDate: parts('2026-12-01'),
    });
    const responses = [
      await post(app, header, bodyWith), // valid -> reaches the (fake, failing) database
      await post(app, header, { ...bodyWith, password: SECRET_PASSWORD, email: SECRET_EMAIL }), // 400
      await post(app, header, JSON.stringify(bodyWith).slice(0, 40)), // unparseable
      await post(app, 'Bearer ' + raw.slice(0, -3) + 'xyz', bodyWith), // tampered -> 401
      await post(app, header, JSON.stringify({ ...bodyWith, pad: 'x'.repeat(200_000) })), // 413
      await app.inject({ method: 'GET', url: '/api/register', headers: { authorization: header } }), // 405
    ];
    return { raw, responses };
  }

  it('[F1.4-b c13] none of the secrets appears in any log line', T, async () => {
    await setup();
    const { raw } = await noisy();
    const text = log.text();
    expect(text.length, 'the app logs something (so this test is not vacuous)').toBeGreaterThan(0);
    for (const secret of [SECRET_NAME, SECRET_CHILD, SECRET_PASSWORD, SECRET_EMAIL, SECRET_DATE, raw, raw.split('.')[1] ?? 'x', '2026-12-01']) {
      expect(text, `log contains ${secret.slice(0, 12)}`).not.toContain(secret);
    }
    expect(text.toLowerCase()).not.toContain('bearer ');
  });

  it('[F1.4-b c13] no response body repeats a secret or carries a library error, a stack, SQL or a driver message', T, async () => {
    await setup();
    const { raw, responses } = await noisy();
    for (const res of responses) {
      for (const secret of [SECRET_NAME, SECRET_CHILD, SECRET_PASSWORD, SECRET_EMAIL, SECRET_DATE, raw]) expect(res.body).not.toContain(secret);
      expect(res.body).not.toMatch(/postgres|select |insert |nestly\.|constraint|sqlstate|ECONN|stack|node_modules|\bat \w+ \(/i);
    }
  });

  it('[F1.4-b c13] the log of a failed database call carries no SQL parameters and no row values', T, async () => {
    await setup();
    await post(app, await bearer(), validBody({ fullName: SECRET_NAME }));
    const text = log.text();
    expect(text).not.toContain(SECRET_NAME);
    expect(text).not.toMatch(/\$1|params|parameters|insert into/i);
  });

  it('[F1.4-b c13] every response is JSON with a fixed, short error code', T, async () => {
    await setup();
    const { responses } = await noisy();
    for (const res of responses) {
      if (res.body === '') continue;
      const body = jsonOf(res.body);
      expect(Object.keys(body)).toEqual(['error']);
      expect(String(body.error)).toMatch(/^[a-z_]{3,32}$/);
    }
  });
});
