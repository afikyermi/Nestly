import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  ACCOUNT_A,
  ACCOUNT_B,
  AUDIENCE,
  COLD_START_MS,
  ISSUER,
  deadUrl,
  hs256Token,
  hs256WithPublicKey,
  makeApp,
  newKey,
  restoreEnv,
  spyDatabase,
  startFakeDb,
  startJwks,
  toRecord,
  token,
  transactionsOpened,
  unsignedToken,
  type App,
  type EnvValues,
  type FakeDb,
  type JwksServer,
  type TestKey,
} from './helpers/identity-fixtures.js';
import type { Database } from '../src/db/client.js';

// I1 F1.1 part c, spec criteria 21, 22, 23 (the part that needs no database), 26, and spec addendum 2 (Q-a to Q-e).
// Derived from .work/identity-platform/spec.md. SRS: FR-AUTH-004, BR-015, AC-016 (server side) for 21; NFR-SEC-002,
// SRS section 12 for 22 and 23; platform rules r1, r2, r3 for 22, 23 and 26.
//
// "No database transaction is opened" is asserted twice: on a spy Database passed to buildApp({ database }), which counts
// every transaction opened through it, and on a loopback listener standing in for the database, which counts connection
// attempts (the client connects lazily, on its first transaction).

const T = { timeout: COLD_START_MS };
const hour = 3600;
const now = (): number => Math.floor(Date.now() / 1000);

let key: TestKey;
let otherKey: TestKey;
let jwks: JwksServer;
let db: FakeDb;

beforeAll(async () => {
  key = await newKey('test-key-1');
  otherKey = await newKey('test-key-other');
  jwks = await startJwks([key]);
  db = await startFakeDb();
}, COLD_START_MS);

afterAll(async () => {
  await jwks.close();
  await db.close();
  restoreEnv();
});

const goodEnv = (): EnvValues => ({
  SUPABASE_JWKS_URL: jwks.url,
  SUPABASE_JWT_ISSUER: ISSUER,
  SUPABASE_JWT_AUDIENCE: AUDIENCE,
  DATABASE_URL: db.url,
});

const mark = (): { conn: number; tx: number } => ({ conn: db.connections(), tx: transactionsOpened() });
function expectNoTransaction(since: { conn: number; tx: number }, what = 'a rejected request'): void {
  expect(transactionsOpened(), `${what} opened a transaction (spy)`).toBe(since.tx);
  expect(db.connections(), `${what} opened a database connection`).toBe(since.conn);
}

const open: Array<{ app: App; database: Database | undefined }> = [];
async function appWith(env: EnvValues, register?: (app: App) => void): Promise<App> {
  // A Database is passed in only when the environment names one, so "DATABASE_URL unset" is still tested as unset.
  const database = env.DATABASE_URL ? await spyDatabase(env.DATABASE_URL) : undefined;
  const app = await makeApp(env, register, database);
  open.push({ app, database });
  return app;
}
afterEach(async () => {
  for (const { app, database } of open.splice(0)) {
    await app.close();
    await database?.close();
  }
});

const PROTECTED = '/api/_f11c/protected';
function registerTestRoutes(app: App): void {
  app.get(PROTECTED, () => ({ reached: true }));
  app.post(PROTECTED, () => ({ reached: true }));
  app.delete(PROTECTED, () => ({ reached: true }));
  // Names that share a prefix with the one public route, or sit under it.
  app.get('/api/healthz', () => ({ reached: true }));
  app.get('/api/health-check', () => ({ reached: true }));
  app.get('/api/health/extra', () => ({ reached: true }));
}

const bearer = (t: string): { authorization: string } => ({ authorization: `Bearer ${t}` });

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.1-c c21] the public list holds only GET /api/health (FR-AUTH-004, BR-015, AC-016)', () => {
  it('GET /api/health answers 200 {status: ok} with no token and opens no transaction', T, async () => {
    const app = await appWith(goodEnv(), registerTestRoutes);
    const before = mark();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(toRecord(res.json())).toEqual({ status: 'ok' });
    expectNoTransaction(before, 'health');
  });

  it.each([
    ['GET', PROTECTED],
    ['POST', PROTECTED],
    ['DELETE', PROTECTED],
    ['GET', '/api/healthz'],
    ['GET', '/api/health-check'],
    ['GET', '/api/health/extra'],
  ] as const)('a route registered by a test and not on the list is protected: %s %s gives 401 without a token', T, async (method, url) => {
    const app = await appWith(goodEnv(), registerTestRoutes);
    const before = mark();
    const res = await app.inject({ method, url });
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain('reached');
    expectNoTransaction(before);
  });

  it('the protected route is reachable with a valid token (the 401 above is the hook, not a blanket refusal)', T, async () => {
    const app = await appWith(goodEnv(), registerTestRoutes);
    const res = await app.inject({ method: 'GET', url: PROTECTED, headers: bearer(await token({ key })) });
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
  });

  it('[Q-d] only GET /api/health is public: HEAD /api/health, and HEAD on a protected route, answer 401 without a token', T, async () => {
    const app = await appWith(goodEnv(), registerTestRoutes);
    const before = mark();
    for (const url of ['/api/health', PROTECTED]) {
      const res = await app.inject({ method: 'HEAD', url });
      expect(res.statusCode, `HEAD ${url}`).toBe(401);
    }
    expectNoTransaction(before);
  });

  it('the public list is not wider than GET /api/health: another method on that path is not served as health', T, async () => {
    const app = await appWith(goodEnv(), registerTestRoutes);
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH'] as const) {
      const res = await app.inject({ method, url: '/api/health' });
      expect(res.statusCode, `${method} /api/health`).not.toBe(200);
    }
  });

  it('other paths without a token are never served (401 or 404, never 200)', T, async () => {
    const app = await appWith(goodEnv(), registerTestRoutes);
    for (const url of ['/', '/api', '/api/', '/api/health/', '/API/HEALTH', '/api//health', '/api/me', '/api/health/../me']) {
      const res = await app.inject({ method: 'GET', url });
      expect([401, 404], `GET ${url}`).toContain(res.statusCode);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
type Ctx = { key: TestKey; otherKey: TestKey };
type HeaderMaker = (ctx: Ctx) => Promise<string | undefined> | string | undefined;

const bad = (label: string, make: HeaderMaker): [string, HeaderMaker] => [label, make];

// Changes one character in the middle of the signature segment. (The last base64url character of a 64-byte ES256
// signature carries padding bits only, so flipping it can leave the signature bytes unchanged.)
function tamperSignature(t: string): string {
  const [h, p, s] = t.split('.');
  const sig = s ?? '';
  const at = 20;
  const replacement = sig[at] === 'A' ? 'B' : 'A';
  return `${h}.${p}.${sig.slice(0, at)}${replacement}${sig.slice(at + 1)}`;
}

const REJECTED: Array<[string, HeaderMaker]> = [
  // absent, or not a Bearer token
  bad('no Authorization header', () => undefined),
  bad('empty Authorization header', () => ''),
  bad('Basic scheme', () => 'Basic dXNlcjpwYXNz'),
  bad('Bearer scheme with no token', () => 'Bearer'),
  bad('Bearer scheme with an empty token', () => 'Bearer '),
  bad('a valid token with no scheme', (c) => token({ key: c.key })),
  bad('a valid token under another scheme (Token)', async (c) => `Token ${await token({ key: c.key })}`),
  // malformed
  bad('garbage', () => 'Bearer not-a-jwt'),
  bad('one segment', () => 'Bearer abc'),
  bad('three empty-ish segments', () => 'Bearer ..'),
  bad('three non-base64 segments', () => 'Bearer a.b.c'),
  bad('a truncated valid token', async (c) => `Bearer ${(await token({ key: c.key })).slice(0, 40)}`),
  bad('a valid token with the signature dropped', async (c) => `Bearer ${(await token({ key: c.key })).split('.').slice(0, 2).join('.')}.`),
  bad('a valid token with a segment added', async (c) => `Bearer ${await token({ key: c.key })}.extra`),
  bad('a very long garbage token', () => `Bearer ${'A'.repeat(200_000)}`),
  bad('a token of unicode text', () => 'Bearer שלום.עולם.x'),
  bad('a tampered signature (key is in the JWKS, signature is not)', async (c) => `Bearer ${tamperSignature(await token({ key: c.key }))}`),
  bad('a tampered payload (sub swapped, signature kept)', async (c) => {
    const [h, , s] = (await token({ key: c.key })).split('.');
    const payload = Buffer.from(JSON.stringify({ iss: ISSUER, aud: AUDIENCE, sub: ACCOUNT_B, exp: now() + hour })).toString('base64url');
    return `Bearer ${h}.${payload}.${s}`;
  }),
  // signed by a key that is not in the configured JWKS
  bad('a key that is not in the JWKS, kid unknown', async (c) => `Bearer ${await token({ key: c.otherKey })}`),
  bad('a key that is not in the JWKS, kid claims to be the real one', async (c) => `Bearer ${await token({ key: c.otherKey, kid: c.key.kid })}`),
  bad('no kid at all, signed by a key that is not in the JWKS', async (c) => {
    const t = await token({ key: c.otherKey });
    const [h, p, s] = t.split('.');
    const header = toRecord(JSON.parse(Buffer.from(h ?? '', 'base64url').toString('utf8')));
    delete header.kid;
    return `Bearer ${Buffer.from(JSON.stringify(header)).toString('base64url')}.${p}.${s}`;
  }),
  // alg none, or HS256
  bad('alg none, kid in the JWKS', (c) => `Bearer ${unsignedToken(c.key.kid)}`),
  bad('alg none, no kid', () => `Bearer ${unsignedToken('')}`),
  bad('alg HS256 with an arbitrary secret', async (c) => `Bearer ${await hs256Token('some-shared-secret-of-sufficient-length', c.key.kid)}`),
  bad('alg HS256 with the public key as the secret (algorithm confusion)', async (c) => `Bearer ${await hs256WithPublicKey(c.key)}`),
  // expired, or nbf in the future
  bad('expired an hour ago', async (c) => `Bearer ${await token({ key: c.key, exp: now() - hour })}`),
  bad('expired a day ago', async (c) => `Bearer ${await token({ key: c.key, exp: now() - 24 * hour })}`),
  bad('exp is 0', async (c) => `Bearer ${await token({ key: c.key, exp: 0 })}`),
  bad('nbf an hour in the future', async (c) => `Bearer ${await token({ key: c.key, nbf: now() + hour })}`),
  // [Q-b] no exp
  bad('[Q-b] no exp at all', async (c) => `Bearer ${await token({ key: c.key, exp: undefined })}`),
  // issuer
  bad('wrong issuer', async (c) => `Bearer ${await token({ key: c.key, iss: 'https://other-project.example.invalid/auth/v1' })}`),
  bad('issuer is the configured one plus a trailing slash', async (c) => `Bearer ${await token({ key: c.key, iss: `${ISSUER}/` })}`),
  bad('no issuer', async (c) => `Bearer ${await token({ key: c.key, iss: undefined })}`),
  // audience
  bad('wrong audience', async (c) => `Bearer ${await token({ key: c.key, aud: 'service_role' })}`),
  bad('audience list that does not contain the configured one', async (c) => `Bearer ${await token({ key: c.key, aud: ['anon', 'other'] })}`),
  bad('no audience', async (c) => `Bearer ${await token({ key: c.key, aud: undefined })}`),
  // no sub
  bad('no sub', async (c) => `Bearer ${await token({ key: c.key, sub: undefined })}`),
  bad('empty sub', async (c) => `Bearer ${await token({ key: c.key, sub: '' })}`),
  // [Q-a] a sub that is not a UUID: the same 401, nothing opened
  bad('[Q-a] sub is not a UUID', async (c) => `Bearer ${await token({ key: c.key, sub: 'not-a-uuid' })}`),
  bad('[Q-a] sub is an injection string', async (c) => `Bearer ${await token({ key: c.key, sub: "'; drop table nestly.users; --" })}`),
  bad('[Q-a] sub is a UUID with one character too many', async (c) => `Bearer ${await token({ key: c.key, sub: `${ACCOUNT_A}0` })}`),
  bad('[Q-a] sub is a UUID with a trailing newline', async (c) => `Bearer ${await token({ key: c.key, sub: `${ACCOUNT_A}\n` })}`),
  bad('[Q-a] sub is a number', async (c) => `Bearer ${await token({ key: c.key, extra: { sub: 12345 } })}`),
  bad('[Q-a] sub is an object', async (c) => `Bearer ${await token({ key: c.key, extra: { sub: { id: ACCOUNT_A } } })}`),
  bad('[Q-a] sub is very long', async (c) => `Bearer ${await token({ key: c.key, sub: 'a'.repeat(10_000) })}`),
];

// SRS section 12 and NFR-SEC-002; platform r3. "no raw library text and no hint of which check failed".
const LEAKS =
  /ERR_J|JWTExpired|JWTInvalid|JWTClaim|JWSInvalid|JWSSignature|JWKS|JOSE|signature|expired|"exp"|"nbf"|"iss"|"aud"|"sub"|claim|issuer|audience|algorithm|\balg\b|\bkid\b|not before|timestamp|unsupported|malformed|compact|missing|absent|bearer|no matching key|uuid/i;

describe('[F1.1-c c22] a protected route answers 401, always the same body, and opens no transaction (NFR-SEC-002, SRS section 12, platform r3)', () => {
  let ctx: Ctx;
  let referenceBody = '';
  let referenceHeaders: Record<string, unknown> = {};
  let app: App;
  let database: Database;

  function pickAuthHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const name of ['www-authenticate', 'content-type', 'set-cookie']) out[name] = headers[name];
    return out;
  }

  beforeAll(async () => {
    ctx = { key, otherKey };
    database = await spyDatabase(db.url);
    app = await makeApp(goodEnv(), registerTestRoutes, database);
    const res = await app.inject({ method: 'GET', url: PROTECTED });
    referenceBody = res.body;
    referenceHeaders = pickAuthHeaders(res.headers);
  }, COLD_START_MS);

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  it('the reference 401 body is JSON with a fixed error code and leaks nothing about a check or a library', () => {
    expect(referenceBody.length).toBeGreaterThan(0);
    const parsed: unknown = JSON.parse(referenceBody);
    const values = Object.values(toRecord(parsed));
    expect(values.some((v) => typeof v === 'string' && v.length > 0), 'a string error code').toBe(true);
    expect(referenceBody).not.toMatch(LEAKS);
    // Nothing that looks like a stack trace or a file path.
    expect(referenceBody).not.toMatch(/\bat \S+ \(|node_modules|\.js:\d+|\.ts:\d+/);
  });

  it.each(REJECTED)('[F1.1-c c22] 401, identical body and headers, no transaction: %s', T, async (_label, make) => {
    const header = await make(ctx);
    const before = mark();
    const headers: Record<string, string> = {};
    if (header !== undefined) headers.authorization = header;
    const res = await app.inject({ method: 'GET', url: PROTECTED, headers });
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe(referenceBody);
    expect(res.body).not.toMatch(LEAKS);
    expect(pickAuthHeaders(res.headers)).toEqual(referenceHeaders);
    expectNoTransaction(before, 'a rejected token');
  });

  it('[F1.1-c c22] a rejected token gives 401 on every method, with the same body', T, async () => {
    const header = `Bearer ${await token({ key: otherKey })}`;
    const before = mark();
    for (const method of ['GET', 'POST', 'DELETE'] as const) {
      const res = await app.inject({ method, url: PROTECTED, headers: { authorization: header } });
      expect(res.statusCode, method).toBe(401);
      expect(res.body, method).toBe(referenceBody);
    }
    expectNoTransaction(before);
  });

  it('[F1.1-c c22] after many rejected requests the server still serves a valid token (a rejection leaves nothing behind)', T, async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await app.inject({ method: 'GET', url: PROTECTED, headers: { authorization: 'Bearer nope' } });
      expect(res.statusCode).toBe(401);
    }
    const res = await app.inject({ method: 'GET', url: PROTECTED, headers: bearer(await token({ key })) });
    expect(res.statusCode).not.toBe(401);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.1-c c23] a valid token passes the hook whatever its role claim says (SRS section 13, platform r3)', () => {
  // The in-transaction half of criterion 23 (current_user, auth.uid(), auth.role()) needs a database: tests/db/.
  // Here: the verification outcome must not depend on the role claim, and must not be a 401.
  const ROLES: Array<[string, Record<string, unknown>]> = [
    ['role authenticated', { role: 'authenticated' }],
    ['role anon', { role: 'anon' }],
    ['role service_role', { role: 'service_role' }],
    ['role postgres', { role: 'postgres' }],
    ['role app_owner', { role: 'app_owner' }],
    ['no role claim', { role: undefined }],
    ['role "" (empty)', { role: '' }],
    ['app_metadata and user_metadata saying service_role', { app_metadata: { role: 'service_role' }, user_metadata: { role: 'service_role', status: 'active' } }],
  ];

  it.each(ROLES)('[F1.1-c c23] valid ES256 token, %s: not rejected as unauthenticated, same outcome as a plain token', T, async (_label, extra) => {
    const app = await appWith(goodEnv(), registerTestRoutes);
    const baseline = await app.inject({ method: 'GET', url: PROTECTED, headers: bearer(await token({ key })) });
    const res = await app.inject({ method: 'GET', url: PROTECTED, headers: bearer(await token({ key, extra })) });
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
    expect(res.statusCode).toBe(baseline.statusCode);
  });

  it('[F1.1-c c23] [Q-e] an audience list that contains the configured audience is accepted', T, async () => {
    const app = await appWith(goodEnv(), registerTestRoutes);
    for (const aud of [[AUDIENCE], ['other', AUDIENCE]]) {
      const res = await app.inject({ method: 'GET', url: PROTECTED, headers: bearer(await token({ key, aud })) });
      expect(res.statusCode, JSON.stringify(aud)).not.toBe(401);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
const CONFIG_CASES: Array<[string, EnvValues]> = [
  ['issuer unset', { SUPABASE_JWT_ISSUER: undefined }],
  ['issuer empty', { SUPABASE_JWT_ISSUER: '' }],
  ['audience unset', { SUPABASE_JWT_AUDIENCE: undefined }],
  ['audience empty', { SUPABASE_JWT_AUDIENCE: '' }],
];

describe('[F1.1-c c26] missing configuration fails closed (platform r1, r2)', () => {
  async function rejectsEverythingProtected(app: App): Promise<void> {
    const headerSets: Array<Record<string, string>> = [{}, bearer(await token({ key })), bearer('garbage')];
    for (const headers of headerSets) {
      const res = await app.inject({ method: 'GET', url: PROTECTED, headers });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.body).not.toContain('reached');
    }
  }

  it('JWKS URL unset: GET /api/health still answers, every protected request is rejected (>= 400), no transaction', T, async () => {
    const app = await appWith({ ...goodEnv(), SUPABASE_JWKS_URL: undefined }, registerTestRoutes);
    const before = mark();
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    await rejectsEverythingProtected(app);
    expectNoTransaction(before);
  });

  it('JWKS unreachable and no key cached: protected requests are rejected (>= 400), no transaction', T, async () => {
    const app = await appWith({ ...goodEnv(), SUPABASE_JWKS_URL: await deadUrl() }, registerTestRoutes);
    const before = mark();
    await rejectsEverythingProtected(app);
    expectNoTransaction(before);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });

  it('JWKS answers with an empty key set: a token is rejected, never accepted', T, async () => {
    const empty = await startJwks([]);
    try {
      const app = await appWith({ ...goodEnv(), SUPABASE_JWKS_URL: empty.url }, registerTestRoutes);
      const before = mark();
      await rejectsEverythingProtected(app);
      expectNoTransaction(before);
    } finally {
      await empty.close();
    }
  });

  it.each(CONFIG_CASES)('[Q-c] %s: fails closed like an unset JWKS (every protected request >= 400, no transaction)', T, async (_label, change) => {
    const app = await appWith({ ...goodEnv(), ...change }, registerTestRoutes);
    const before = mark();
    await rejectsEverythingProtected(app);
    expectNoTransaction(before);
  });

  it('DATABASE_URL unset: GET /api/health answers 200, protected routes are rejected (>= 400) even for a valid token', T, async () => {
    const app = await appWith({ ...goodEnv(), DATABASE_URL: undefined }, registerTestRoutes);
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect(toRecord(health.json())).toEqual({ status: 'ok' });
    await rejectsEverythingProtected(app);
  });

  it('DATABASE_URL set to an empty string behaves as unset', T, async () => {
    const app = await appWith({ ...goodEnv(), DATABASE_URL: '' }, registerTestRoutes);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    await rejectsEverythingProtected(app);
  });

  it('nothing at all configured: health still answers 200 and everything else is rejected', T, async () => {
    const app = await appWith({}, registerTestRoutes);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    await rejectsEverythingProtected(app);
  });
});
