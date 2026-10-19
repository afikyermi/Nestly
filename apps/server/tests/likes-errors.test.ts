import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AUDIENCE, ISSUER, newKey, restoreEnv, startFakeDb, startJwks, token, type App, type FakeDb, type JwksServer, type TestKey } from './helpers/identity-fixtures.js';
import { buildRegisterApp, jsonOf } from './helpers/register-app.js';
import { deleteLike, likeUrl, putLike, type LikeKind } from './helpers/likes-api.js';
import type { Database } from '../src/db/client.js';

// F3.3-b2 c10 (.work/comments-likes/spec.md; CRITIC b2 finding 2): a request with a body is 400 before anything is read, any other method is 405 with
// Allow, and a database fault that is not "the target went away" is 500 with nothing leaked. A Database that fails on purpose stands in (real
// faults: tests/db/likes.db.test.ts). Same method as comments-errors.test.ts.

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const ID = 'f0000000-0000-4000-8000-0000000000f2';
const SECRET = 'secret-detail-that-must-not-leave-the-server';
const T = { timeout: 60_000 };
const KINDS: LikeKind[] = ['post', 'comment'];

const fault = (code: string, constraint?: string): Error =>
  Object.assign(new postgres.PostgresError(`insert violates ${SECRET}`), { message: `insert violates ${SECRET}`, code, detail: SECRET, ...(constraint === undefined ? {} : { constraint_name: constraint }) });

let key: TestKey;
let jwks: JwksServer;
let fake: FakeDb;
let database: Database | undefined;
let app: App | undefined;

async function failingWith(error: Error | null): Promise<App> {
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
  app = await buildRegisterApp({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: fake.url }, { database });
  return app;
}

beforeAll(async () => {
  key = await newKey('likes-errors-key');
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

describe.each(KINDS)('[F3.3-b2 c10] like on a %s: request shape and faults', (kind) => {
  it('[F3.3-b2 c10] PUT and DELETE with a body (including a userId) → 400 invalid, before the database', T, async () => {
    const running = await failingWith(null);
    const header = `Bearer ${await token({ key, sub: SUB })}`;
    for (const method of ['PUT', 'DELETE'] as const) {
      for (const payload of [{ userId: SUB }, {}]) {
        const res = await running.inject({ method, url: likeUrl(kind, ID), headers: { authorization: header, 'content-type': 'application/json' }, payload: JSON.stringify(payload) });
        expect([res.statusCode, jsonOf(res.body)], `${method} ${JSON.stringify(payload)}`).toEqual([400, { error: 'invalid' }]);
      }
    }
  });

  it('[F3.3-b2 c10] any other method → 405 with Allow: PUT, DELETE', T, async () => {
    const running = await failingWith(null);
    const header = `Bearer ${await token({ key, sub: SUB })}`;
    for (const method of ['GET', 'POST', 'PATCH'] as const) {
      const res = await running.inject({ method, url: likeUrl(kind, ID), headers: { authorization: header } });
      expect(res.statusCode, method).toBe(405);
      expect(res.headers.allow, method).toBe('PUT, DELETE');
    }
  });

  it.each([
    ['23505 on another constraint', fault('23505', 'some_other_key')],
    ['another SQLSTATE', fault('XX000')],
  ])('[F3.3-b2 c10] %s → 500 server_error and nothing leaks', T, async (_label, error) => {
    const running = await failingWith(error);
    const header = `Bearer ${await token({ key, sub: SUB })}`;
    for (const send of [putLike, deleteLike]) {
      const res = await send(running, header, kind, ID);
      expect([res.statusCode, jsonOf(res.body)]).toEqual([500, { error: 'server_error' }]);
      expect(res.body).not.toMatch(new RegExp(`${SECRET}|violates|constraint|23505|XX000`, 'i'));
    }
  });
});
