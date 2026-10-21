import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AUDIENCE, ISSUER, newKey, restoreEnv, startFakeDb, startJwks, token, type App, type FakeDb, type JwksServer, type TestKey } from './helpers/identity-fixtures.js';
import { buildRegisterApp, jsonOf, refusingDatabase, type RefusingDatabase } from './helpers/register-app.js';
import type { Database } from '../src/db/client.js';

// I8 chat and Support routes, the checks that need no real database (FR-CHAT-001..004, FR-ADMIN-001/002, FR-SERV-009): a missing session is 401 and
// reaches no database; a malformed id or body is 400 before any query (a text over 2000 characters, a blank one, an unknown topic, a key the
// body does not have); a wrong method is 405 with Allow. Behaviour against the database: tests/db/chat.db.test.ts and pgTAP file 94.

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const OTHER = 'b0000000-0000-4000-8000-0000000000b2';
const T = { timeout: 60_000 };

let key: TestKey;
let jwks: JwksServer;
let fake: FakeDb;
let stub: RefusingDatabase;
let database: Database | undefined;
let app: App;

const bearer = async (): Promise<string> => `Bearer ${await token({ key, sub: SUB })}`;
const env = () => ({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: fake.url });

async function setup(): Promise<void> {
  stub = await refusingDatabase(fake.url);
  database = stub.database;
  app = await buildRegisterApp(env(), { database });
}

beforeAll(async () => {
  key = await newKey('chat-route-key');
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

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
const send = async (method: Method, url: string, header: string | null, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { ...(header === null ? {} : { authorization: header }), ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
  });

const ROUTES: ReadonlyArray<[Method, string, unknown]> = [
  ['GET', '/api/chat', undefined],
  ['GET', '/api/chat/unread', undefined],
  ['POST', '/api/chat/start', { userId: OTHER, text: 'שלום' }],
  ['GET', `/api/chat/conversations/${OTHER}`, undefined],
  ['POST', `/api/chat/conversations/${OTHER}/messages`, { text: 'שלום' }],
  ['POST', `/api/chat/requests/${OTHER}/accept`, undefined],
  ['POST', `/api/chat/requests/${OTHER}/decline`, undefined],
  ['DELETE', `/api/chat/requests/${OTHER}`, undefined],
  ['PUT', `/api/users/${OTHER}/chat-block`, undefined],
  ['DELETE', `/api/users/${OTHER}/chat-block`, undefined],
  ['POST', '/api/support', { topic: 'bug', text: 'משהו לא עובד' }],
  ['GET', '/api/support', undefined],
  ['GET', `/api/support/${OTHER}`, undefined],
  ['POST', `/api/support/${OTHER}/messages`, { text: 'עדיין' }],
  ['GET', '/api/admin/support', undefined],
  ['GET', `/api/admin/support/${OTHER}`, undefined],
  ['POST', `/api/admin/support/${OTHER}/messages`, { text: 'תודה', internal: false }],
  ['POST', `/api/admin/support/${OTHER}/status`, { status: 'closed' }],
  ['POST', '/api/admin/reports/message', { messageId: OTHER }],
];

describe('[I8] a missing session is 401, with no database query', () => {
  for (const [method, url, payload] of ROUTES) {
    it(`${method} ${url} without a token -> 401`, T, async () => {
      await setup();
      const res = await send(method, url, null, payload);
      expect(res.statusCode).toBe(401);
      expect(stub.attempts()).toBe(0);
    });
  }
});

describe('[I8 VAL-024..026] a malformed id or body is 400 before any query', () => {
  const cases: ReadonlyArray<[string, Method, string, unknown]> = [
    ['an id that is not a uuid', 'GET', '/api/chat/conversations/not-a-uuid', undefined],
    ['a request id that is not a uuid', 'POST', '/api/chat/requests/nope/accept', undefined],
    ['a body on an accept', 'POST', `/api/chat/requests/${OTHER}/accept`, { status: 'accepted' }],
    ['a blank text', 'POST', '/api/chat/start', { userId: OTHER, text: '   ' }],
    ['a text over 2000 characters', 'POST', '/api/chat/start', { userId: OTHER, text: 'א'.repeat(2001) }],
    ['a sender in the body', 'POST', `/api/chat/conversations/${OTHER}/messages`, { text: 'hi', senderId: SUB }],
    ['a target that is not a uuid', 'POST', '/api/chat/start', { userId: 'x', text: 'hi' }],
    ['a topic not on the list', 'POST', '/api/support', { topic: 'billing', text: 'hi' }],
    ['a status on a new Support request', 'POST', '/api/support', { topic: 'bug', text: 'hi', status: 'closed' }],
    ['a staff message without its kind', 'POST', `/api/admin/support/${OTHER}/messages`, { text: 'hi' }],
    ['an unknown status', 'POST', `/api/admin/support/${OTHER}/status`, { status: 'reopened' }],
    ['an unknown inbox filter', 'GET', '/api/admin/support?status=all', undefined],
    ['a reported message that is not a uuid', 'POST', '/api/admin/reports/message', { messageId: 'x' }],
  ];
  for (const [label, method, url, payload] of cases) {
    it(`${label} -> 400 invalid`, T, async () => {
      await setup();
      const res = await send(method, url, await bearer(), payload);
      expect(res.statusCode).toBe(400);
      expect(jsonOf(res.body)).toEqual({ error: 'invalid' });
      expect(stub.attempts()).toBe(0);
    });
  }
});

describe('[I8] a wrong method is 405 with Allow', () => {
  const cases: ReadonlyArray<[Method, string, string]> = [
    ['POST', '/api/chat', 'GET'],
    ['GET', '/api/chat/start', 'POST'],
    ['PATCH', `/api/chat/conversations/${OTHER}`, 'GET'],
    ['GET', `/api/users/${OTHER}/chat-block`, 'PUT, DELETE'],
    ['DELETE', '/api/support', 'GET, POST'],
    ['DELETE', `/api/admin/support/${OTHER}`, 'GET'],
  ];
  for (const [method, url, allow] of cases) {
    it(`${method} ${url} -> 405`, T, async () => {
      await setup();
      const res = await send(method, url, await bearer());
      expect(res.statusCode).toBe(405);
      expect(res.headers.allow).toBe(allow);
    });
  }
});
