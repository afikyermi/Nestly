import type { Writable } from 'node:stream';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AUDIENCE, ISSUER, newKey, restoreEnv, startFakeDb, startJwks, token, type App, type FakeDb, type JwksServer, type TestKey } from './helpers/identity-fixtures.js';
import { buildRegisterApp, captureLog, jsonOf } from './helpers/register-app.js';
import { deleteHide, hideUrl, putHide } from './helpers/post-hides-api.js';
import type { Database } from '../src/db/client.js';

// F3.9 c2 c3 c6 c7 (.work/hide-post/spec.md; SQLSTATE contract .work/i3-rest-schema/schema.md: NS004 unknown/unreadable, NS003 own post, 42501 caller
// gate): request shape and how a database refusal is answered, with a Database that fails on purpose (real refusals: tests/db/post-hides.db.test.ts).
// Same method as likes-errors.test.ts.

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const ID = 'f0000000-0000-4000-8000-0000000000f2';
const SECRET = 'secret-detail-that-must-not-leave-the-server';
const T = { timeout: 60_000 };

const fault = (code: string, constraint?: string): Error =>
  Object.assign(new postgres.PostgresError(`refused ${SECRET}`), { message: `refused ${SECRET}`, code, detail: SECRET, ...(constraint === undefined ? {} : { constraint_name: constraint }) });

let key: TestKey;
let jwks: JwksServer;
let fake: FakeDb;
let database: Database | undefined;
let app: App | undefined;

async function failingWith(error: Error | null, logStream?: Writable): Promise<App> {
  const { createDatabase } = await import('../src/db/client.js');
  const real = createDatabase(fake.url);
  const fail = (): Promise<never> => Promise.reject(error ?? new Error('the database must not be reached'));
  const wrap = <O extends object>(inner: O, blocked: ReadonlyArray<string | symbol>): O =>
    new Proxy(inner, {
      get(target, prop) {
        const value: unknown = Reflect.get(target, prop);
        return blocked.includes(prop) ? fail : value;
      },
    });
  const db = wrap(real.db, ['transaction']);
  const client = wrap(real.client, ['begin', 'reserve']);
  database = { db, client, close: () => real.close() };
  app = await buildRegisterApp(
    { SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: fake.url },
    { database, ...(logStream === undefined ? {} : { logStream }) },
  );
  return app;
}

beforeAll(async () => {
  key = await newKey('post-hides-errors-key');
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

describe('[F3.9 c2 c3 c7] PUT|DELETE /posts/:id/hide: request shape and faults', () => {
  it('[F3.9 c2] a body (including a userId) → 400 invalid, before the database', T, async () => {
    const running = await failingWith(null);
    const header = `Bearer ${await token({ key, sub: SUB })}`;
    for (const method of ['PUT', 'DELETE'] as const) {
      for (const payload of [{ userId: SUB }, {}]) {
        const res = await running.inject({ method, url: hideUrl(ID), headers: { authorization: header, 'content-type': 'application/json' }, payload: JSON.stringify(payload) });
        expect([res.statusCode, jsonOf(res.body)], `${method} ${JSON.stringify(payload)}`).toEqual([400, { error: 'invalid' }]);
      }
    }
  });

  it.each(['not-a-uuid', '123', 'f0000000-0000-4000-8000-0000000000f', 'f0000000-0000-4000-8000-0000000000f2x', '%00', 'f0000000-0000-4000-8000-0000000000f2%27%3B--'])(
    '[F3.9 c2] id %s is not a uuid → 400 invalid, before the database',
    T,
    async (bad) => {
      const running = await failingWith(null);
      const header = `Bearer ${await token({ key, sub: SUB })}`;
      for (const send of [putHide, deleteHide]) {
        const res = await send(running, header, bad);
        expect([res.statusCode, jsonOf(res.body)]).toEqual([400, { error: 'invalid' }]);
      }
    },
  );

  it('[F3.9 c7] no token → 401 and the database is never reached', T, async () => {
    const running = await failingWith(null);
    for (const send of [putHide, deleteHide]) expect((await send(running, null, ID)).statusCode).toBe(401);
  });

  it('[F3.9 c2] any other method → 405 with Allow: PUT, DELETE', T, async () => {
    const running = await failingWith(null);
    const header = `Bearer ${await token({ key, sub: SUB })}`;
    for (const method of ['GET', 'POST', 'PATCH'] as const) {
      const res = await running.inject({ method, url: hideUrl(ID), headers: { authorization: header } });
      expect(res.statusCode, method).toBe(405);
      expect(res.headers.allow, method).toBe('PUT, DELETE');
    }
  });

  it('[F3.9 c2] SQLSTATE NS004 (unknown or unreadable) → 404 post_unavailable, nothing leaks', T, async () => {
    const running = await failingWith(fault('NS004'));
    const header = `Bearer ${await token({ key, sub: SUB })}`;
    const res = await putHide(running, header, ID);
    expect([res.statusCode, jsonOf(res.body)]).toEqual([404, { error: 'post_unavailable' }]);
    expect(res.body).not.toMatch(new RegExp(`${SECRET}|refused|NS004|constraint`, 'i'));
  });

  it('[F3.9 c3] SQLSTATE NS003 (own post) → 409 own_post, nothing leaks, no author id', T, async () => {
    const running = await failingWith(fault('NS003'));
    const header = `Bearer ${await token({ key, sub: SUB })}`;
    const res = await putHide(running, header, ID);
    expect([res.statusCode, jsonOf(res.body)]).toEqual([409, { error: 'own_post' }]);
    expect(res.body).not.toMatch(new RegExp(`${SECRET}|refused|NS003|constraint|${SUB}`, 'i'));
  });

  it('[F3.9 c7] SQLSTATE 42501 (not an active Regular, a policy or a privilege) → 403 not_allowed', T, async () => {
    const running = await failingWith(fault('42501'));
    const header = `Bearer ${await token({ key, sub: SUB })}`;
    for (const send of [putHide, deleteHide]) {
      const res = await send(running, header, ID);
      expect([res.statusCode, jsonOf(res.body)]).toEqual([403, { error: 'not_allowed' }]);
      expect(res.body).not.toMatch(new RegExp(`${SECRET}|refused|42501`, 'i'));
    }
  });

  it.each([
    ['23505 (a constraint)', fault('23505', 'some_other_key')],
    ['23503 (a foreign key)', fault('23503')],
    ['another SQLSTATE', fault('XX000')],
    ['a non-database error', new Error(SECRET)],
  ])('[F3.9 c2] %s → 500 server_error and nothing leaks', T, async (_label, error) => {
    const running = await failingWith(error);
    const header = `Bearer ${await token({ key, sub: SUB })}`;
    for (const send of [putHide, deleteHide]) {
      const res = await send(running, header, ID);
      expect([res.statusCode, jsonOf(res.body)]).toEqual([500, { error: 'server_error' }]);
      expect(res.body).not.toMatch(new RegExp(`${SECRET}|refused|constraint|23505|23503|XX000`, 'i'));
    }
  });

  it('[F3.9 c2] a lost connection → 503 unavailable (a retry may pass), never a 4xx', T, async () => {
    const running = await failingWith(Object.assign(new Error('gone'), { code: 'CONNECTION_CLOSED' }));
    const header = `Bearer ${await token({ key, sub: SUB })}`;
    for (const send of [putHide, deleteHide]) {
      const res = await send(running, header, ID);
      expect([res.statusCode, jsonOf(res.body)]).toEqual([503, { error: 'unavailable' }]);
    }
  });

  it('[F3.9 c6] the failure log holds no post id, user id or database message', T, async () => {
    const log = captureLog();
    const running = await failingWith(fault('NS004'), log.stream);
    const header = `Bearer ${await token({ key, sub: SUB })}`;
    expect((await putHide(running, header, ID)).statusCode).toBe(404);
    expect(log.text()).not.toContain(ID);
    expect(log.text()).not.toContain(SUB);
    expect(log.text()).not.toContain(SECRET);
  });
});
