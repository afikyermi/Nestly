import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_DELETION_REAUTH_SECONDS } from '@nestly/shared';
import { AUDIENCE, ISSUER, newKey, restoreEnv, startFakeDb, startJwks, token, type App, type FakeDb, type JwksServer, type TestKey } from './helpers/identity-fixtures.js';
import { buildRegisterApp, captureLog, refusingDatabase, type RefusingDatabase } from './helpers/register-app.js';
import { isFreshPasswordSignIn } from '../src/services/account-deletion-service.js';
import type { Database } from '../src/db/client.js';

// I9 part 1, the account's own deletion: the checks that need no real database (FR-SET-002, VAL-052, ERR-048). The scheduling, the
// cancel, the Group Owner refusal and the Admin counts run against the real database: tests/db/account-deletion.db.test.ts.
// A Database that refuses on purpose stands in: a request that reaches it counts.

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const T = { timeout: 60_000 };
const NOW = new Date('2026-10-25T12:00:00.000Z');
const nowSeconds = Math.floor(NOW.getTime() / 1000);

let key: TestKey;
let jwks: JwksServer;
let fake: FakeDb;
let stub: RefusingDatabase;
let database: Database | undefined;
let app: App | undefined;

const env = () => ({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: fake.url });
const bearer = async (amr?: unknown): Promise<string> =>
  `Bearer ${await token({ key, sub: SUB, extra: { session_id: '11111111-1111-4111-8111-111111111111', ...(amr === undefined ? {} : { amr }) } })}`;

beforeAll(async () => {
  key = await newKey('account-deletion-route-key');
  jwks = await startJwks([key]);
  fake = await startFakeDb();
}, 60_000);

afterEach(async () => {
  await app?.close();
  app = undefined;
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
  app = await buildRegisterApp(env(), { database, clock: () => NOW, logStream: captureLog().stream });
}

function started(): App {
  if (app === undefined) throw new Error('setup() first');
  return app;
}

const send = (method: 'GET' | 'POST' | 'DELETE', url: string, header: string | null, payload?: unknown) =>
  started().inject({
    method,
    url,
    headers: { ...(header === null ? {} : { authorization: header }), ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
  });

describe('[I9 VAL-052 ERR-048] the request needs a fresh password sign-in', () => {
  it('[VAL-052] fresh within five minutes, a password entry only, not from the future', () => {
    expect(isFreshPasswordSignIn(nowSeconds - 10, NOW)).toBe(true);
    expect(isFreshPasswordSignIn(nowSeconds - ACCOUNT_DELETION_REAUTH_SECONDS, NOW)).toBe(true);
    expect(isFreshPasswordSignIn(nowSeconds - ACCOUNT_DELETION_REAUTH_SECONDS - 1, NOW)).toBe(false);
    expect(isFreshPasswordSignIn(nowSeconds + 3600, NOW)).toBe(false);
    expect(isFreshPasswordSignIn(null, NOW)).toBe(false);
  });

  it('[ERR-048 AC-183] a session with no recent password entry is 401 reauth_required, before any database work', T, async () => {
    await setup();
    const cases: unknown[] = [
      undefined,
      [{ method: 'password', timestamp: nowSeconds - ACCOUNT_DELETION_REAUTH_SECONDS - 60 }],
      // a malformed claim yields nothing, even with a fresh password entry in it (all or nothing, Gate 2 A7)
      [{ method: 'password', timestamp: nowSeconds }, { method: 'Bad Method' }],
    ];
    for (const amr of cases) {
      const res = await send('POST', '/api/account/deletion', await bearer(amr), { confirmed: true });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'reauth_required' });
    }
    expect(stub.attempts()).toBe(0);
  });

  it('[FR-SET-002] with a fresh password sign-in the request reaches the database', T, async () => {
    await setup();
    const res = await send('POST', '/api/account/deletion', await bearer([{ method: 'password', timestamp: nowSeconds - 30 }]), { confirmed: true });
    expect(stub.attempts()).toBe(1);
    expect(res.statusCode).toBe(500);
  });
});

describe('[I9 VAL-052] the body is judged before anything else', () => {
  it('[VAL-052] the box unticked, a missing body or an extra key (an account id) is 400 with no database query', T, async () => {
    await setup();
    const fresh = await bearer([{ method: 'password', timestamp: nowSeconds }]);
    for (const body of [{ confirmed: false }, {}, { confirmed: true, userId: SUB }, 'yes']) {
      const res = await send('POST', '/api/account/deletion', fresh, body);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'invalid' });
    }
    const cancel = await send('POST', '/api/account/deletion/cancel', fresh, { userId: SUB });
    expect(cancel.statusCode).toBe(400);
    expect(stub.attempts()).toBe(0);
  });

  it('[FR-AUTH-004] no token is 401 on every route; other methods are 405', T, async () => {
    await setup();
    for (const [method, url] of [['GET', '/api/account/deletion'], ['POST', '/api/account/deletion'], ['POST', '/api/account/deletion/cancel']] as const) {
      expect((await send(method, url, null, method === 'POST' ? { confirmed: true } : undefined)).statusCode).toBe(401);
    }
    const res = await send('DELETE', '/api/account/deletion', await bearer());
    expect(res.statusCode).toBe(405);
    expect(res.headers['allow']).toBe('GET, POST');
    expect(stub.attempts()).toBe(0);
  });
});
