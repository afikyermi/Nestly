import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import type { AssistantModel, AssistantReply } from '../../src/assistant/assistant-model.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';

// The Nestly assistant (Afik 28.10.2026) through the route against the real database (CI `db` job, as app_server), with a fake model (no test
// calls Google): a Regular account is answered; its messages are counted and the one past the limit is 429 and never reaches the model
// (BR-092; the limits are configuration, 3 an hour here); a model failure is 503 "unavailable" and the message stays counted (ERR-055); staff
// get 403 and the model is never asked (Regular and Professional only). The counter row holds instants only (NFR-PRIV-008). Policies: pgTAP 121.

const T = { timeout: COLD_START_MS };

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let app: App;
let ana = '';
let ben = '';
let admin = '';
const asked: string[] = [];
let next: AssistantReply = { kind: 'ok', answer: 'תשובה' };

const model: AssistantModel = {
  available: true,
  answer: (_history, text) => {
    asked.push(text);
    return Promise.resolve(next);
  },
};

const url = (): string => {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
};
const text = async (query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> => String((await query)[0]?.v);
const ask = async (userId: string, message: string) => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/assistant',
    headers: { authorization: `Bearer ${await token({ key, sub: userId })}`, 'content-type': 'application/json' },
    payload: JSON.stringify({ text: message, history: [] }),
  });
  const body: unknown = JSON.parse(res.body);
  return { status: res.statusCode, body };
};

beforeAll(async () => {
  key = await newKey('assistant-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  app = await buildRegisterApp(
    { SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() },
    { database, clock: () => CLOCK_NOW, assistant: model, assistantLimits: { perHour: 3, perDay: 5 } },
  );
  const made: string[] = [];
  for (const fullName of ['Ana Assistant', 'Ben Assistant']) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, `Bearer ${await token({ key, sub: userId })}`, validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  [ana = '', ben = ''] = made;
  admin = await text(side`select tests.fx_fr_id('fr_d')::text as v`);
}, COLD_START_MS * 3);

afterAll(async () => {
  await app.close();
  await database.close();
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

describe('[FR-AI-001 BR-092] a Regular account', () => {
  it('is answered, up to its limit; the message past it is 429 and never reaches the model', T, async () => {
    asked.length = 0;
    for (const n of [1, 2, 3]) expect(await ask(ana, `שאלה ${n}`)).toEqual({ status: 200, body: { answer: 'תשובה' } });
    expect(await ask(ana, 'שאלה 4')).toEqual({ status: 429, body: { error: 'rate_limited' } });
    expect(asked).toEqual(['שאלה 1', 'שאלה 2', 'שאלה 3']);
  });

  it('has a limit of its own: another account is still answered', T, async () => {
    expect((await ask(ben, 'שאלה')).status).toBe(200);
  });

  it('[ERR-055] a model failure is 503 "unavailable", and the message stays counted', T, async () => {
    next = { kind: 'failed', failure: 'timeout' };
    expect(await ask(ben, 'שאלה איטית')).toEqual({ status: 503, body: { error: 'unavailable' } });
    next = { kind: 'ok', answer: 'תשובה' };
    expect((await ask(ben, 'עוד שאלה')).status).toBe(200);
    expect((await ask(ben, 'ועוד אחת')).status).toBe(429);
  });
});

describe('[FR-AI-001] staff', () => {
  it('get 403 and the model is never asked', T, async () => {
    asked.length = 0;
    expect(await ask(admin, 'שאלה')).toEqual({ status: 403, body: { error: 'not_allowed' } });
    expect(asked).toEqual([]);
  });
});
