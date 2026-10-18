import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AUDIENCE, ISSUER, newKey, restoreEnv, startFakeDb, startJwks, token, type App, type FakeDb, type JwksServer, type TestKey } from './helpers/identity-fixtures.js';
import { buildRegisterApp, jsonOf } from './helpers/register-app.js';
import { createPost, deletePost, patchPost } from './helpers/posts-api.js';
import { postFaultReply } from '../src/lib/pg-error.js';
import type { Database } from '../src/db/client.js';

// F3.1a criterion 7 (.work/post-create/spec.md): 23514 on the body CHECK -> 422 body_too_long; 42501 and 23503 -> 403 not_allowed;
// any other pg error -> 500 server_error; no response carries a pg message, constraint or table name. A Database that fails on
// purpose stands in for the real one, as in me-route.test.ts. (What the real database raises is asserted in tests/db/posts.db.test.ts.)

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const ID = 'f0000000-0000-4000-8000-0000000000f2';
const SECRET = 'secret-detail-that-must-not-leave-the-server';
const T = { timeout: 60_000 };
const BODY_CHECK = 'posts_body_length_check';

const fault = (code: string, constraint?: string): Error =>
  Object.assign(new postgres.PostgresError(`new row for relation "posts" violates ${SECRET}`), {
    message: `new row for relation "posts" violates ${SECRET}`,
    code,
    detail: SECRET,
    table_name: 'posts',
    ...(constraint === undefined ? {} : { constraint_name: constraint }),
  });
/** Drizzle wraps the driver error and keeps it as `cause`. */
const wrapped = (inner: Error): Error => Object.assign(new Error(`Failed query: insert into "posts" ${SECRET}`), { cause: inner });

const EXPECTED: Array<[string, Error, number, string]> = [
  ['23514 on the body CHECK', fault('23514', BODY_CHECK), 422, 'body_too_long'],
  ['23514 on the body CHECK, wrapped by Drizzle', wrapped(fault('23514', BODY_CHECK)), 422, 'body_too_long'],
  ['42501 (policy or privilege)', fault('42501'), 403, 'not_allowed'],
  ['23503 (not a Regular account)', fault('23503', 'posts_author_id_fkey'), 403, 'not_allowed'],
  ['42501, wrapped', wrapped(fault('42501')), 403, 'not_allowed'],
  ['23514 on another CHECK', fault('23514', 'posts_audience_check'), 500, 'server_error'],
  ['23514 with no constraint named', fault('23514'), 500, 'server_error'],
  ['23505 (unique)', fault('23505', 'posts_pkey'), 500, 'server_error'],
  ['XX000 (internal)', fault('XX000'), 500, 'server_error'],
  ['22P02 (bad text representation)', fault('22P02'), 500, 'server_error'],
];

describe('[F3.1-a c7] postFaultReply, the mapping itself', () => {
  it.each(EXPECTED)('[F3.1-a c7] %s', (_label, error, status, code) => {
    expect(postFaultReply(error)).toEqual({ status, error: code });
  });

  it('[F3.1-a c7] a failure that is not the database\'s is left to the caller (undefined)', () => {
    expect(postFaultReply(new TypeError(SECRET))).toBeUndefined();
    expect(postFaultReply(undefined)).toBeUndefined();
    expect(postFaultReply('42501')).toBeUndefined();
  });
});

let key: TestKey;
let jwks: JwksServer;
let fake: FakeDb;
let database: Database | undefined;
let app: App | undefined;

const env = () => ({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: fake.url });
const bearer = async (): Promise<string> => `Bearer ${await token({ key, sub: SUB })}`;

/** An app whose every database transaction rejects with `make()`. */
async function failingWith(make: () => Error): Promise<App> {
  const { createDatabase } = await import('../src/db/client.js');
  const real = createDatabase(fake.url);
  const fail = (): Promise<never> => Promise.reject(make());
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
  app = await buildRegisterApp(env(), { database });
  return app;
}

beforeAll(async () => {
  key = await newKey('posts-errors-key');
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

describe('[F3.1-a c7] the routes answer a database fault with the mapped status, and leak nothing', () => {
  it.each(EXPECTED)('[F3.1-a c7] POST, PATCH and DELETE: %s', T, async (_label, error, status, code) => {
    const running = await failingWith(() => error);
    const header = await bearer();
    const outcomes = [
      await createPost(running, header, { body: 'x', audience: 'everyone' }),
      await patchPost(running, header, ID, { body: 'x', audience: 'everyone' }),
      await deletePost(running, header, ID),
    ];
    for (const res of outcomes) {
      expect(res.statusCode, res.body).toBe(status);
      expect(jsonOf(res.body)).toEqual({ error: code });
      expect(res.body).not.toMatch(new RegExp(`${SECRET}|violates|posts|constraint|23514|42501|23503|relation`, 'i'));
    }
  });

  it.each([
    ['an unreachable database', () => Object.assign(new Error(`write CONNECTION_CLOSED ${SECRET}`), { code: 'CONNECTION_CLOSED' }), 503],
    ['a code defect', () => new TypeError(`cannot read properties of undefined ${SECRET}`), 500],
  ])('[F3.1-a c7] %s: %i and nothing about why', T, async (_label, make, status) => {
    const res = await createPost(await failingWith(make), await bearer(), { body: 'x', audience: 'everyone' });
    expect(res.statusCode).toBe(status);
    expect(res.body).not.toContain(SECRET);
  });

  it('[F3.1-a c2] a refused body never reaches the database', T, async () => {
    const running = await failingWith(() => new Error('the database must not be asked'));
    const header = await bearer();
    expect((await createPost(running, header, { body: 'x', audience: 'everyone', isAnonymous: true })).statusCode).toBe(400);
    expect((await createPost(running, header, { body: '   ', audience: 'everyone' })).statusCode).toBe(422);
    expect((await patchPost(running, header, ID, { body: 'x', audience: 'everyone', authorId: SUB })).statusCode).toBe(400);
  });

  it('[F3.1-a c1] a body with U+0000 is 400 invalid on POST and PATCH, and never reaches the database', T, async () => {
    const running = await failingWith(() => new Error('the database must not be asked'));
    const header = await bearer();
    const nul = { body: 'hello\u0000', audience: 'everyone' };
    for (const res of [await createPost(running, header, nul), await patchPost(running, header, ID, nul)]) {
      expect(res.statusCode, res.body).toBe(400);
      expect(jsonOf(res.body)).toEqual({ error: 'invalid' });
    }
  });
});
