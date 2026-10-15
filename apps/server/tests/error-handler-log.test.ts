import { Writable } from 'node:stream';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_A, AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startFakeDb, startJwks, token, type FakeDb, type JwksServer, type TestKey } from './helpers/identity-fixtures.js';
import { buildRegisterApp } from './helpers/register-app.js';

// Debt D3 (.work/debt-before-f15/intake.md, NFR-PRIV-001): the app-wide error handler logs no part of the request. On a
// body-parse error whose message quotes the body, the log line carries status, code and name only; the response is unchanged.
// Derived from the criterion and interface.md, not from the source.

const T = { timeout: COLD_START_MS };
const MARKER = 'D3-MARKER-3f9a71c2';

type App = Awaited<ReturnType<typeof buildRegisterApp>>;
const open: App[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

function sink(): { stream: Writable; lines: () => string[] } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      lines.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      callback();
    },
  });
  return { stream, lines: () => [...lines] };
}

function parsed(lines: string[]): Record<string, unknown>[] {
  return lines.map((l) => {
    const value: unknown = JSON.parse(l);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('log line is not an object');
    return Object.fromEntries(Object.entries(value));
  });
}

let key: TestKey;
let jwks: JwksServer;
let fake: FakeDb;
beforeAll(async () => {
  key = await newKey('d3-key');
  jwks = await startJwks([key]);
  fake = await startFakeDb();
}, 60_000);
afterAll(async () => {
  await jwks.close();
  await fake.close();
  restoreEnv();
});

async function build(): Promise<{ app: App; lines: () => string[] }> {
  const { stream, lines } = sink();
  const app = await buildRegisterApp(
    { SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: fake.url },
    { logStream: stream },
  );
  open.push(app);
  app.post('/api/_d3/echo', (request) => Promise.resolve({ ok: true, got: request.body }));
  app.post('/api/_d3/boom', () => Promise.reject(new Error(`boom ${MARKER}`)));
  return { app, lines };
}

async function jsonHeaders(): Promise<Record<string, string>> {
  return { 'content-type': 'application/json', authorization: `Bearer ${await token({ key, sub: ACCOUNT_A })}` };
}

describe('[D3] the error handler logs no part of the request', () => {
  it('a malformed JSON body quoting the marker: response unchanged (400 bad_request), no log line holds the marker, the error line carries status/code/name', T, async () => {
    const { app, lines } = await build();
    const response = await app.inject({ method: 'POST', url: '/api/_d3/echo', headers: await jsonHeaders(), payload: `{"fullName": ${MARKER}, "password": ` });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'bad_request' });

    const all = lines();
    expect(all.length, 'the logger wrote nothing, so this test proves nothing').toBeGreaterThan(0);
    expect(all.filter((l) => l.includes(MARKER)), 'a log line carries the body').toEqual([]);

    const errorLine = parsed(all).find((l) => l.msg === 'request failed');
    expect(errorLine, 'no "request failed" error line').toBeDefined();
    expect(errorLine?.status).toBe(400);
    expect(typeof errorLine?.code).toBe('string');
    expect(String(errorLine?.code).length).toBeGreaterThan(0);
    expect(typeof errorLine?.name).toBe('string');
    expect(String(errorLine?.name).length).toBeGreaterThan(0);
  });

  it('the registration route, malformed body quoting the marker: 400 bad_request and no log line holds the marker', T, async () => {
    const { app, lines } = await build();
    const response = await app.inject({ method: 'POST', url: '/api/register', headers: await jsonHeaders(), payload: `{"password": ${MARKER}, ` });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'bad_request' });
    expect(lines().filter((l) => l.includes(MARKER))).toEqual([]);
  });

  it('the message and stack of the client error are not logged (no err.message / err.stack / err object)', T, async () => {
    const { app, lines } = await build();
    await app.inject({ method: 'POST', url: '/api/_d3/echo', headers: await jsonHeaders(), payload: `{ ${MARKER}` });
    const errorLine = parsed(lines()).find((l) => l.msg === 'request failed');
    expect(errorLine).toBeDefined();
    expect(errorLine).not.toHaveProperty('message');
    expect(errorLine).not.toHaveProperty('stack');
    expect(errorLine).not.toHaveProperty('err');
    expect(JSON.stringify(errorLine)).not.toMatch(/Unexpected token|is not valid JSON|at .*\.(js|ts):\d+/);
  });

  it('an unexpected server error (500): response is internal, and the thrown message (carrying the marker) is not logged', T, async () => {
    const { app, lines } = await build();
    const response = await app.inject({ method: 'POST', url: '/api/_d3/boom', headers: await jsonHeaders(), payload: '{}' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'internal' });
    expect(response.body).not.toContain(MARKER);
    expect(lines().filter((l) => l.includes(MARKER))).toEqual([]);
    const errorLine = parsed(lines()).find((l) => l.msg === 'request failed');
    expect(errorLine, `no "request failed" line among: ${lines().join('')}`).toBeDefined();
    expect(errorLine?.name).toBe('Error');
  });

  it('a valid body still passes (the handler is not on the success path)', T, async () => {
    const { app, lines } = await build();
    const response = await app.inject({ method: 'POST', url: '/api/_d3/echo', headers: await jsonHeaders(), payload: JSON.stringify({ a: 1 }) });
    expect(response.statusCode).toBe(200);
    expect(parsed(lines()).find((l) => l.msg === 'request failed')).toBeUndefined();
  });
});
