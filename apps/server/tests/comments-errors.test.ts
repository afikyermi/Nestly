import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AUDIENCE, ISSUER, newKey, restoreEnv, startFakeDb, startJwks, token, type App, type FakeDb, type JwksServer, type TestKey } from './helpers/identity-fixtures.js';
import { buildRegisterApp, jsonOf } from './helpers/register-app.js';
import { addComment } from './helpers/comments-api.js';
import type { Database } from '../src/db/client.js';

// F3.3-b1 c4 c5 (.work/comments-likes/spec.md; CRITIC b1 finding 2): a fault the database raises at the INSERT, after the reads passed (the post
// or the parent went away in between), answers like the checks would have: 400 parent_invalid with a parentId, 404 post_unavailable without.
// Forcing that race for real is not reliable, so a Database that fails on purpose stands in (real faults: tests/db/comments.db.test.ts).

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const POST = 'f0000000-0000-4000-8000-0000000000f2';
const PARENT = 'f0000000-0000-4000-8000-0000000000f3';
const SECRET = 'secret-detail-that-must-not-leave-the-server';
const T = { timeout: 60_000 };

const fault = (code: string, constraint?: string): Error =>
  Object.assign(new postgres.PostgresError(`insert on "comments" violates ${SECRET}`), {
    message: `insert on "comments" violates ${SECRET}`,
    code,
    detail: SECRET,
    ...(constraint === undefined ? {} : { constraint_name: constraint }),
  });
const wrapped = (inner: Error): Error => Object.assign(new Error(`Failed query: insert into "comments" ${SECRET}`), { cause: inner });

let key: TestKey;
let jwks: JwksServer;
let fake: FakeDb;
let database: Database | undefined;
let app: App | undefined;

async function failingWith(error: Error): Promise<App> {
  const { createDatabase } = await import('../src/db/client.js');
  const real = createDatabase(fake.url);
  const fail = (): Promise<never> => Promise.reject(error);
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
      return prop === 'begin' || prop === 'reserve' ? fail : value;
    },
  });
  database = { db, client, close: () => real.close() };
  app = await buildRegisterApp({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: fake.url }, { database });
  return app;
}

beforeAll(async () => {
  key = await newKey('comments-errors-key');
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

describe('[F3.3-b1 c4 c5] a database fault on create answers like the checks', () => {
  it.each([
    ['23503', fault('23503', 'comments_parent_fkey')],
    ['42501', fault('42501')],
    ['23503, wrapped by Drizzle', wrapped(fault('23503'))],
  ])('[F3.3-b1 c4 c5] %s: 400 parent_invalid with a parentId, 404 post_unavailable without; nothing leaks', T, async (_label, error) => {
    const running = await failingWith(error);
    const header = `Bearer ${await token({ key, sub: SUB })}`;
    const withParent = await addComment(running, header, POST, { body: 'x', parentId: PARENT });
    const without = await addComment(running, header, POST, { body: 'x' });
    expect([withParent.statusCode, jsonOf(withParent.body)]).toEqual([400, { error: 'parent_invalid' }]);
    expect([without.statusCode, jsonOf(without.body)]).toEqual([404, { error: 'post_unavailable' }]);
    for (const res of [withParent, without]) expect(res.body).not.toMatch(new RegExp(`${SECRET}|violates|comments|constraint|23503|42501`, 'i'));
  });

  it('[F3.3-b1 c2] the body CHECK is 422 body_too_long; any other fault is 500 server_error', T, async () => {
    const header = `Bearer ${await token({ key, sub: SUB })}`;
    const long = await addComment(await failingWith(fault('23514', 'comments_body_length_check')), header, POST, { body: 'x' });
    expect([long.statusCode, jsonOf(long.body)]).toEqual([422, { error: 'body_too_long' }]);
    await app?.close();
    const other = await addComment(await failingWith(fault('XX000')), header, POST, { body: 'x' });
    expect([other.statusCode, jsonOf(other.body)]).toEqual([500, { error: 'server_error' }]);
    expect(other.body).not.toContain(SECRET);
  });
});
