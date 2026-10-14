import { connect } from 'node:net';
import { Writable } from 'node:stream';
import type { IncomingHttpHeaders } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { COLD_START_MS } from './helpers/identity-fixtures.js';

// Preview access, CRITIC finding 2 (.work/preview-access/findings.md) and decision 2026-10-14 "Preview access", point 3:
// Vercel's docs do not say it strips `x-vercel-protection-bypass` before the function, so the server deletes the header
// before any route, hook or logger can see it. Derived from the decision, not from the server's source.
//   [PA-S1] the header (any case, repeated) is gone from request.headers, request.raw.headers and request.raw.rawHeaders
//           on a public route, on a protected one and on a path that does not exist; other headers (x-other,
//           x-vercel-set-bypass-cookie) are left alone; nothing in the response reflects it
//   [PA-S2] the same over a real socket, with the header in mixed case and sent twice
//   [PA-S3] the logger: with buildApp({ logStream }), no logged line carries the secret, including lines written by a
//           failing handler and by hooks that dump the request headers
// What is observed: a hook registered by the test on onSend (runs for every reply, also a 401 or a 404) records the
// request as it is after the server's own hooks ran, and an echo route says the same from inside a handler.
// The hooks and handlers return promises instead of being `async` functions: nothing in them awaits (lint: require-await).

const T = { timeout: COLD_START_MS };
const HEADER = 'x-vercel-protection-bypass';
const COOKIE = 'x-vercel-set-bypass-cookie';
const SECRET = 'FAKE-BYPASS-SECRET-7c1e9a40';
const SECRET_TWO = 'FAKE-BYPASS-SECRET-second-55f0';
const SECRET_PREFIX = 'FAKE-BYPASS-SECRET';

type App = ReturnType<typeof buildApp>;

interface Seen {
  url: string;
  headers: IncomingHttpHeaders;
  nodeHeaders: IncomingHttpHeaders;
  rawHeaders: string[];
}

const open: App[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

function watch(app: App): Seen[] {
  const seen: Seen[] = [];
  app.addHook('onSend', (request, _reply, payload) => {
    seen.push({ url: request.url, headers: { ...request.headers }, nodeHeaders: { ...request.raw.headers }, rawHeaders: [...request.raw.rawHeaders] });
    return Promise.resolve(payload);
  });
  return seen;
}

function echoRoutes(app: App): void {
  const echo = (request: { headers: IncomingHttpHeaders; raw: { rawHeaders: string[] } }): Promise<unknown> =>
    Promise.resolve({
      headers: request.headers,
      rawHeaders: request.raw.rawHeaders,
    });
  app.get('/api/_ps/echo', echo);
  app.post('/api/_ps/echo', echo);
}

const names = (raw: string[]): string[] => raw.filter((_, i) => i % 2 === 0).map((s) => s.toLowerCase());

function expectNoBypass(s: Seen): void {
  expect(Object.keys(s.headers).map((k) => k.toLowerCase()), `request.headers of ${s.url}`).not.toContain(HEADER);
  expect(Object.keys(s.nodeHeaders).map((k) => k.toLowerCase()), `request.raw.headers of ${s.url}`).not.toContain(HEADER);
  expect(names(s.rawHeaders), `request.raw.rawHeaders of ${s.url}`).not.toContain(HEADER);
  expect(JSON.stringify(s), `a value of the header survived on ${s.url}`).not.toContain(SECRET_PREFIX);
}

function expectOthersKept(s: Seen): void {
  expect(s.headers['x-other'], `x-other on ${s.url}`).toBe('keep-1');
  expect(s.headers[COOKIE], `${COOKIE} on ${s.url}`).toBe('true');
  expect(s.nodeHeaders['x-other']).toBe('keep-1');
  expect(names(s.rawHeaders)).toContain('x-other');
  expect(names(s.rawHeaders)).toContain(COOKIE);
}

const REQUESTS = [
  ['GET', '/api/health'],
  ['GET', '/api/does-not-exist-ps'],
  ['GET', '/api/_ps/echo'],
  ['POST', '/api/_ps/echo'],
  ['GET', '/'],
] as const;

describe('[PA-S1] the bypass header never reaches a route, a hook or a response', () => {
  it.each(REQUESTS)('%s %s: the header is gone, other headers stay, the response does not reflect it', T, async (method, url) => {
    const app = buildApp();
    open.push(app);
    echoRoutes(app);
    const seen = watch(app);
    const base = { method, url, headers: { [HEADER]: SECRET, [COOKIE]: 'true', 'x-other': 'keep-1', 'content-type': 'application/json' } };
    const response = await app.inject(method === 'POST' ? { ...base, payload: '{}' } : base);
    expect(seen).toHaveLength(1);
    const [s] = seen;
    expect(s).toBeDefined();
    if (!s) return;
    expectNoBypass(s);
    expectOthersKept(s);
    expect(response.body, 'the body reflects the secret').not.toContain(SECRET_PREFIX);
    expect(JSON.stringify(response.headers), 'a response header reflects the secret').not.toContain(SECRET_PREFIX);
    if (url === '/api/health') {
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    }
  });

  it('a header spelled in upper case is removed too', T, async () => {
    const app = buildApp();
    open.push(app);
    const seen = watch(app);
    await app.inject({ method: 'GET', url: '/api/health', headers: { 'X-VERCEL-PROTECTION-BYPASS': SECRET, 'x-other': 'keep-1', [COOKIE]: 'true' } });
    expect(seen).toHaveLength(1);
    const [s] = seen;
    if (!s) return;
    expectNoBypass(s);
    expectOthersKept(s);
  });

  it('a request without the header is left exactly as it was (the hook removes nothing else)', T, async () => {
    const app = buildApp();
    open.push(app);
    const seen = watch(app);
    await app.inject({ method: 'GET', url: '/api/health', headers: { 'x-other': 'keep-1', [COOKIE]: 'true', accept: 'application/json' } });
    const [s] = seen;
    if (!s) throw new Error('the request was not seen');
    expect(s.headers['x-other']).toBe('keep-1');
    expect(s.headers[COOKIE]).toBe('true');
    expect(s.headers.accept).toBe('application/json');
    expect(names(s.rawHeaders)).toEqual(expect.arrayContaining(['x-other', COOKIE, 'accept']));
  });
});

describe('[PA-S2] over a real socket: mixed case, sent twice', () => {
  function rawHttp(port: number, text: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const socket = connect({ host: '127.0.0.1', port }, () => socket.write(text));
      socket.on('data', (c: Buffer) => chunks.push(c));
      socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      socket.on('error', reject);
    });
  }

  it.each(['/api/health', '/api/does-not-exist-ps', '/api/_ps/echo'])('GET %s', T, async (url) => {
    const app = buildApp();
    open.push(app);
    echoRoutes(app);
    const seen = watch(app);
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const port = Number(new URL(address).port);
    const text = [
      `GET ${url} HTTP/1.1`,
      'Host: 127.0.0.1',
      `X-Vercel-Protection-Bypass: ${SECRET}`,
      `x-vercel-protection-bypass: ${SECRET_TWO}`,
      'X-Other: keep-1',
      'X-Vercel-Set-Bypass-Cookie: true',
      'Connection: close',
      '',
      '',
    ].join('\r\n');
    const reply = await rawHttp(port, text);
    expect(reply.startsWith('HTTP/1.1 ')).toBe(true);
    expect(reply, 'the reply reflects the secret').not.toContain(SECRET_PREFIX);
    expect(seen).toHaveLength(1);
    const [s] = seen;
    if (!s) return;
    expectNoBypass(s);
    expect(s.headers['x-other']).toBe('keep-1');
    expect(names(s.rawHeaders)).toContain('x-other');
  });
});

describe('[PA-S3] the logger never carries the secret', () => {
  function sink(): { stream: Writable; lines: string[] } {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    return { stream, lines };
  }

  it('after a failing handler, a 404, a bad body and a hook that dumps the headers, no logged line holds the secret', T, async () => {
    const { stream, lines } = sink();
    const app = buildApp({ logStream: stream });
    open.push(app);
    app.get('/api/_ps/fail', (request) => {
      request.log.info({ headers: request.headers, rawHeaders: request.raw.rawHeaders }, 'ps-handler-dump');
      return Promise.reject(new Error(`ps-failing ${JSON.stringify(request.headers)} ${JSON.stringify(request.raw.rawHeaders)}`));
    });
    app.post('/api/_ps/fail', () => Promise.reject(new Error('ps-failing-post')));
    app.addHook('onSend', (request, _reply, payload) => {
      request.log.error({ err: new Error(JSON.stringify(request.headers)), headers: request.headers, rawHeaders: request.raw.rawHeaders }, `ps-onsend-dump ${JSON.stringify(request.headers)}`);
      return Promise.resolve(payload);
    });

    const headers = { [HEADER]: SECRET, [COOKIE]: 'true', 'x-other': 'keep-1' };
    await app.inject({ method: 'GET', url: '/api/health', headers });
    await app.inject({ method: 'GET', url: '/api/does-not-exist-ps', headers });
    await app.inject({ method: 'GET', url: '/api/_ps/fail', headers });
    await app.inject({ method: 'POST', url: '/api/_ps/fail', headers: { ...headers, 'content-type': 'application/json' }, payload: '{ not json' });

    expect(lines.length, 'the logger wrote nothing, so this test proves nothing').toBeGreaterThan(0);
    const dumps = lines.filter((l) => l.includes('ps-onsend-dump'));
    expect(dumps.length, 'the hook that dumps the headers never logged').toBeGreaterThan(0);
    expect(
      dumps.some((l) => l.includes('keep-1')),
      'the dump does not carry the other headers, so it is not a real dump',
    ).toBe(true);
    const leaked = lines.filter((l) => l.includes(SECRET_PREFIX) || l.toLowerCase().includes(HEADER));
    expect(leaked, 'a logged line carries the bypass secret or its header name').toEqual([]);
  });
});
