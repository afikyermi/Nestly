import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AUDIENCE, ISSUER, newKey, restoreEnv, startFakeDb, startJwks, token, type App, type FakeDb, type JwksServer, type TestKey } from './helpers/identity-fixtures.js';
import { buildRegisterApp, refusingDatabase, type RefusingDatabase } from './helpers/register-app.js';
import type { Database } from '../src/db/client.js';
import { ASSISTANT_TIMEOUT_MS, createAssistantModel, generationConfig, plainText, readAnswer, UNAVAILABLE_MODEL, type AssistantModel } from '../src/assistant/assistant-model.js';
import { decideLimit, readAssistantLimits } from '../src/assistant/assistant-limits.js';
import { ASSISTANT_INSTRUCTIONS } from '../src/assistant/instructions.js';

// The Nestly assistant (Afik 28.10.2026), the checks that need no real database: a missing session is 401; a body over the rules is 400 before
// any query (VAL-053); without a key the assistant is unavailable and nothing is counted (ERR-055); the limit decision (BR-092); and the Gemini
// client against a fake fetch: only the instructions and the conversation are sent (NFR-PRIV-008), a slow, refused or over-quota answer is a
// failure the user sees as "unavailable" (ERR-055), GEMINI_MODEL switches the model. No test calls Google. Counting against the database:
// tests/db/assistant.db.test.ts; the policies: pgTAP file 121.

const SUB = 'f0000000-0000-4000-8000-0000000000f1';
const T = { timeout: 60_000 };

let key: TestKey;
let jwks: JwksServer;
let fake: FakeDb;
let stub: RefusingDatabase;
let database: Database | undefined;
let app: App;

const env = () => ({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: fake.url });
const bearer = async (): Promise<string> => `Bearer ${await token({ key, sub: SUB })}`;

async function setup(assistant: AssistantModel): Promise<void> {
  stub = await refusingDatabase(fake.url);
  database = stub.database;
  app = await buildRegisterApp(env(), { database, assistant });
}

const send = async (method: 'GET' | 'POST' | 'DELETE', header: string | null, payload?: unknown) =>
  app.inject({
    method,
    url: '/api/assistant',
    headers: { ...(header === null ? {} : { authorization: header }), ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
  });

const ANSWERING: AssistantModel = { available: true, answer: () => Promise.resolve({ kind: 'ok', answer: 'תשובה' }) };

beforeAll(async () => {
  key = await newKey('assistant-route-key');
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

describe('[FR-AI-001] the route', () => {
  it('a missing session is 401 with no database query', T, async () => {
    await setup(ANSWERING);
    expect((await send('GET', null)).statusCode).toBe(401);
    expect((await send('POST', null, { text: 'שלום', history: [] })).statusCode).toBe(401);
    expect(stub.attempts()).toBe(0);
  });

  it('[VAL-053] a body over the rules is 400 before any query', T, async () => {
    await setup(ANSWERING);
    const auth = await bearer();
    for (const payload of [
      { text: 'א'.repeat(1001), history: [] },
      { text: '   ', history: [] },
      { text: 'שלום' },
      { text: 'שלום', history: Array(7).fill({ role: 'user', text: 'x' }) },
      { text: 'שלום', history: [], fullName: 'דנה' },
    ]) {
      const res = await send('POST', auth, payload);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'invalid' });
    }
    expect(stub.attempts()).toBe(0);
  });

  it('[ERR-055] without a key the assistant says unavailable and counts nothing', T, async () => {
    await setup(UNAVAILABLE_MODEL);
    const auth = await bearer();
    expect(JSON.parse((await send('GET', auth)).body)).toEqual({ available: false });
    const res = await send('POST', auth, { text: 'מתי מתחילים לשמוע דופק?', history: [] });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ error: 'unavailable' });
    expect(stub.attempts()).toBe(0);
  });

  it('with a key GET says available, without any query; another method is 405', T, async () => {
    await setup(ANSWERING);
    const auth = await bearer();
    expect(JSON.parse((await send('GET', auth)).body)).toEqual({ available: true });
    const res = await send('DELETE', auth);
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('GET, POST');
    expect(stub.attempts()).toBe(0);
  });
});

describe('[BR-092] the limit decision', () => {
  const now = new Date('2026-10-28T12:00:00.000Z');
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
  const limits = { perHour: 20, perDay: 60 };

  it('counts the 20th message of an hour and refuses the 21st', () => {
    expect(decideLimit(Array.from({ length: 19 }, (_, i) => ago(i + 1)), now, limits).kind).toBe('counted');
    expect(decideLimit(Array.from({ length: 20 }, (_, i) => ago(i + 1)), now, limits).kind).toBe('limited');
  });
  it('counts the 60th message of a day and refuses the 61st, even when the last hour is quiet', () => {
    expect(decideLimit(Array.from({ length: 59 }, (_, i) => ago(61 + i * 10)), now, limits).kind).toBe('counted');
    expect(decideLimit(Array.from({ length: 60 }, (_, i) => ago(61 + i * 10)), now, limits).kind).toBe('limited');
  });
  it('drops instants older than a day and keeps the rest, the new one last; a refused message adds nothing', () => {
    const counted = decideLimit([ago(25 * 60), ago(30)], now, limits);
    expect(counted).toEqual({ kind: 'counted', kept: [ago(30), now] });
    const refused = decideLimit(Array.from({ length: 20 }, (_, i) => ago(i + 1)), now, limits);
    expect(refused.kept).toHaveLength(20);
  });
  it('reads its thresholds from configuration, ignoring a value out of range', () => {
    expect(readAssistantLimits({})).toEqual({ perHour: 20, perDay: 60 });
    expect(readAssistantLimits({ ASSISTANT_HOURLY_LIMIT: '5', ASSISTANT_DAILY_LIMIT: '9' })).toEqual({ perHour: 5, perDay: 9 });
    expect(readAssistantLimits({ ASSISTANT_HOURLY_LIMIT: '0', ASSISTANT_DAILY_LIMIT: 'many' })).toEqual({ perHour: 20, perDay: 60 });
  });
});

describe('[FR-AI-001 NFR-PRIV-008 ERR-055] the Gemini client', () => {
  type Call = { url: string; init: RequestInit };
  const answering = (status: number, body: unknown, calls: Call[] = []): typeof fetch => (url, init) => {
    calls.push({ url: typeof url === 'string' ? url : url instanceof URL ? url.href : url.url, init: init ?? {} });
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  };
  const OK_BODY = { candidates: [{ content: { parts: [{ text: '**שלום**\n* אחת\n* שתיים' }] }, finishReason: 'STOP' }] };

  it('has no key: unavailable, and nothing is called', () => {
    const calls: Call[] = [];
    const model = createAssistantModel({}, answering(200, OK_BODY, calls));
    expect(model.available).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('sends only the instructions, the earlier messages and the new one, with the key in a header; Flash-Lite by default', async () => {
    const calls: Call[] = [];
    const model = createAssistantModel({ GEMINI_API_KEY: 'k-test' }, answering(200, OK_BODY, calls));
    const reply = await model.answer([{ role: 'user', text: 'שאלה קודמת' }, { role: 'assistant', text: 'תשובה קודמת' }], 'שאלה חדשה');
    expect(reply).toEqual({ kind: 'ok', answer: 'שלום\n• אחת\n• שתיים' });
    const [call] = calls;
    expect(call?.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent');
    expect(new Headers(call?.init.headers).get('x-goog-api-key')).toBe('k-test');
    const raw = call?.init.body;
    const sent: unknown = JSON.parse(typeof raw === 'string' ? raw : '');
    expect(sent).toEqual({
      systemInstruction: { parts: [{ text: ASSISTANT_INSTRUCTIONS }] },
      contents: [
        { role: 'user', parts: [{ text: 'שאלה קודמת' }] },
        { role: 'model', parts: [{ text: 'תשובה קודמת' }] },
        { role: 'user', parts: [{ text: 'שאלה חדשה' }] },
      ],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
    });
  });

  it('GEMINI_MODEL switches the model with no code change; a malformed name is ignored', async () => {
    const calls: Call[] = [];
    await createAssistantModel({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-2.5-flash' }, answering(200, OK_BODY, calls)).answer([], 'x');
    await createAssistantModel({ GEMINI_API_KEY: 'k', GEMINI_MODEL: '../evil?x=1' }, answering(200, OK_BODY, calls)).answer([], 'x');
    expect(calls.map((c) => c.url.split('/models/')[1])).toEqual(['gemini-2.5-flash:generateContent', 'gemini-2.5-flash-lite:generateContent']);
  });

  it('an answer past the time limit, a refusal, an exhausted quota or a blocked answer is a failure', async () => {
    expect(ASSISTANT_TIMEOUT_MS).toBe(10_000);
    const slow: typeof fetch = () => Promise.reject(new DOMException('timed out', 'TimeoutError'));
    expect(await createAssistantModel({ GEMINI_API_KEY: 'k' }, slow).answer([], 'x')).toEqual({ kind: 'failed', failure: 'timeout' });
    expect(await createAssistantModel({ GEMINI_API_KEY: 'k' }, answering(429, {})).answer([], 'x')).toEqual({ kind: 'failed', failure: 'quota', status: 429 });
    expect(await createAssistantModel({ GEMINI_API_KEY: 'k' }, answering(500, {})).answer([], 'x')).toEqual({ kind: 'failed', failure: 'error', status: 500 });
    expect(readAnswer({ promptFeedback: { blockReason: 'SAFETY' } })).toEqual({ kind: 'failed', failure: 'blocked' });
    expect(readAnswer({ candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] })).toEqual({ kind: 'failed', failure: 'blocked' });
    expect(readAnswer({ candidates: [] })).toEqual({ kind: 'failed', failure: 'empty' });
  });

  it('turns Markdown into plain text, keeping the break before a list', () => {
    expect(plainText('## כותרת\n- א\n__ב__\n\n\n\nג')).toBe('כותרת\n• א\nב\n\nג');
    expect(plainText('פתיחה:\n\n* א\n  * ב')).toBe('פתיחה:\n\n• א\n• ב');
  });

  it('turns thinking off for a 2.5 model (Flash thinks by default), and leaves other models their default', () => {
    expect(generationConfig('gemini-2.5-flash')).toEqual({ temperature: 0.4, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } });
    expect(generationConfig('gemini-3-flash')).toEqual({ temperature: 0.4, maxOutputTokens: 1024 });
  });

  it('marks an answer cut at the length limit, and never returns more than the next message may send back (4,000)', () => {
    expect(readAnswer({ candidates: [{ content: { parts: [{ text: 'תשובה חלקית' }] }, finishReason: 'MAX_TOKENS' }] })).toEqual({ kind: 'ok', answer: 'תשובה חלקית …' });
    const long = readAnswer({ candidates: [{ content: { parts: [{ text: 'א'.repeat(5000) }] }, finishReason: 'STOP' }] });
    expect(long.kind === 'ok' ? Array.from(long.answer).length : 0).toBe(4000);
  });
});
