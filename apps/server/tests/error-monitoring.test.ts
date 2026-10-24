import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent } from '@sentry/node';
import { buildApp } from '../src/app.js';
import type { ServerConfig } from '../src/lib/config.js';
import { ACCOUNT_A, AUDIENCE, ISSUER, newKey, startFakeDb, startJwks, token, type FakeDb, type JwksServer, type TestKey } from './helpers/identity-fixtures.js';
import { NO_DATA_COLLECTION, noErrorMonitor, sentryOptions, startErrorMonitor, type ErrorMonitor, type ErrorReport } from '../src/lib/error-monitoring.js';
import { scrubServerEvent } from '../src/lib/scrub-error-event.js';

// SRS §12 "Error monitoring" (Afik 17.10 and 24.10.2026): Sentry, errors only, no personal data sent. These tests hold the privacy
// promise, not the code: whatever the request or the error carries, the report that leaves holds none of it.

const COLD_START_MS = 60_000;
const T = { timeout: COLD_START_MS };
// A DSN-shaped placeholder on a reserved, unreachable domain: nothing is ever sent from a test.
const FAKE_DSN = 'https://publicKeyPlaceholder@o0.ingest.example.invalid/0';
const EMAIL = 'parent.marker@example.com';
// A JWT-shaped marker, assembled at run time so the repository never holds one literally (the commit guard).
const JWT = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJtYXJrZXIifQ', 'c2lnbmF0dXJlLW1hcmtlcg'].join('.');
const UUID = '6f1c2a9e-4b7d-4e2a-9c3f-1a2b3c4d5e6f';
const HEBREW = 'הבת שלי נולדה אתמול';
const PHONE = '050-1234567';
const BYPASS = 'bypass-marker-7d1e';
const COOKIE = 'cookie-marker-55aa';
const QUERY = 'query-marker-91bc';
const BODY = 'body-marker-c0ffee';
const MARKERS = [EMAIL, JWT, UUID, HEBREW, PHONE, BYPASS, COOKIE, QUERY, BODY, '1234567', 'נולדה', '203.0.113.7'];

let key: TestKey;
let jwks: JwksServer;
let config: ServerConfig;
let bearer: string;
let fake: FakeDb;
beforeAll(async () => {
  key = await newKey('monitor-key');
  jwks = await startJwks([key]);
  fake = await startFakeDb();
  config = { auth: { jwksUrl: new URL(jwks.url), issuer: ISSUER, audience: AUDIENCE }, databaseUrl: fake.url, issues: [] };
  bearer = `Bearer ${await token({ key, sub: ACCOUNT_A })}`;
}, COLD_START_MS);
afterAll(async () => {
  await jwks.close();
  await fake.close();
});

function leaked(text: string): string[] {
  return MARKERS.filter((m) => text.includes(m));
}

describe('[§12 Error monitoring] the server report scrubber keeps no personal data', () => {
  it('removes request data, user, IP, extra, breadcrumbs, host name, foreign tags and contexts', () => {
    const event: ErrorEvent = {
      type: undefined,
      message: `failed for ${EMAIL}`,
      request: {
        url: `https://nestly.example/api/posts/${UUID}?q=${QUERY}`,
        query_string: `q=${QUERY}`,
        cookies: { sb: COOKIE },
        headers: { authorization: `Bearer ${JWT}`, 'x-vercel-protection-bypass': BYPASS, cookie: `sb=${COOKIE}` },
        data: { text: BODY, email: EMAIL },
      },
      user: { id: UUID, email: EMAIL, ip_address: '203.0.113.7' },
      extra: { body: BODY },
      breadcrumbs: [{ message: `GET /api/posts/${UUID}?q=${QUERY}` }],
      server_name: 'host-203.0.113.7',
      tags: { route: '/api/posts/:postId', method: 'POST', status: '500', surface: 'api', email: EMAIL },
      contexts: { trace: { trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16) }, custom: { email: EMAIL } },
      exception: {
        values: [
          {
            type: 'DrizzleQueryError',
            value: `Failed query: insert into posts values ($1, $2)\nparams: ${HEBREW},${EMAIL}`,
            mechanism: { type: 'generic', handled: true, data: { arg: BODY } },
            stacktrace: { frames: [{ filename: '/var/task/apps/server/src/routes/posts.js', function: 'create', lineno: 4, colno: 2, vars: { body: BODY }, context_line: `const t = '${HEBREW}'`, pre_context: [EMAIL] }] },
          },
          { type: 'PostgresError', value: `duplicate key value violates unique constraint "x" Key (email)=(${EMAIL})` },
        ],
      },
    };
    const out = scrubServerEvent(event);
    const text = JSON.stringify(out);
    expect(leaked(text)).toEqual([]);
    expect(out.request).toBeUndefined();
    expect(out.user).toBeUndefined();
    expect(out.extra).toBeUndefined();
    expect(out.breadcrumbs).toBeUndefined();
    expect(out.server_name).toBeUndefined();
    expect(out.tags).toEqual({ route: '/api/posts/:postId', method: 'POST', status: '500', surface: 'api' });
    expect(Object.keys(out.contexts ?? {})).toEqual(['trace']);
    // What finds the bug stays: the error types, the SQL shape, the frame.
    expect(out.exception?.values?.map((v) => v.type)).toEqual(['DrizzleQueryError', 'PostgresError']);
    expect(out.exception?.values?.[0]?.value).toContain('Failed query: insert into posts');
    expect(out.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({ filename: '/var/task/apps/server/src/routes/posts.js', function: 'create', lineno: 4, colno: 2 });
    expect(out.exception?.values?.[0]?.mechanism).toEqual({ type: 'generic', handled: true });
  });
});

describe('[§12 Error monitoring] Sentry starts only with a DSN, errors only', () => {
  it('without SENTRY_DSN (local, tests, CI): no SDK load, a no-op monitor', async () => {
    const load = vi.fn();
    expect(startErrorMonitor({}, load)).toBe(noErrorMonitor);
    expect(startErrorMonitor({ SENTRY_DSN: '  ' }, load)).toBe(noErrorMonitor);
    expect(load).not.toHaveBeenCalled();
    await expect(noErrorMonitor.flush()).resolves.toBeUndefined();
  });

  it('with a DSN: no default integrations, no tracing, no data collection, the scrubber last, Vercel environment and commit', async () => {
    const sentry = await import('@sentry/node');
    const options = sentryOptions(sentry, FAKE_DSN, { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_SHA: 'abc123' });
    expect(options).toMatchObject({ dsn: FAKE_DSN, environment: 'preview', release: 'abc123', maxBreadcrumbs: 0, includeServerName: false, includeLocalVariables: false });
    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(options).not.toHaveProperty('tracesSampler');
    expect(options?.dataCollection).toEqual(NO_DATA_COLLECTION);
    expect(Object.values(NO_DATA_COLLECTION).flatMap((v) => (typeof v === 'object' && !Array.isArray(v) ? Object.values(v) : [v]))).not.toContain(true);
    expect(options?.beforeSend).toBe(scrubServerEvent);
    const integrations = options?.integrations;
    const names = (Array.isArray(integrations) ? integrations : []).map((i) => i.name).sort();
    expect(names).toEqual(['Dedupe', 'LinkedErrors', 'OnUncaughtException', 'OnUnhandledRejection']);
    expect(sentryOptions(sentry, FAKE_DSN, {})?.environment).toBe('development');
  });
});

// The whole path with the real SDK: a request full of personal data hits a failing route; the envelope that would leave for Sentry
// (caught by a recording transport, never sent) holds the route template and the error type, and none of the request or the user.
describe('[§12 Error monitoring] a real 5xx report leaves with the route template and no personal data', () => {
  const sent: string[] = [];
  let monitor: ErrorMonitor;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    monitor = startErrorMonitor({ SENTRY_DSN: FAKE_DSN, VERCEL_ENV: 'preview' }, async () => {
      const sentry = await import('@sentry/node');
      const transport = (): ReturnType<typeof sentry.createTransport> =>
        sentry.createTransport({ recordDroppedEvent: () => undefined }, (request) => {
          sent.push(typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body));
          return Promise.resolve({ statusCode: 200 });
        });
      return { ...sentry, initWithoutDefaultIntegrations: (options) => sentry.initWithoutDefaultIntegrations({ ...options, transport }) };
    });
    app = buildApp({ config, errorMonitor: monitor });
    app.post('/_monitor/:itemId/boom', () => Promise.reject(new Error(`could not save "${HEBREW}" for ${EMAIL} ${PHONE} token ${JWT}`)));
    app.get('/_monitor/:itemId/down', (_request, reply) => reply.code(503).send({ error: 'unavailable' }));
    await app.ready();
  }, COLD_START_MS);
  afterAll(async () => {
    await app.close();
  });

  const headers = {
    cookie: `sb-session=${COOKIE}`,
    'x-vercel-protection-bypass': BYPASS,
    'x-forwarded-for': '203.0.113.7',
    'content-type': 'application/json',
  };

  it('a thrown error: one event, route template, error type, scrubbed message, nothing from the request', T, async () => {
    sent.length = 0;
    const response = await app.inject({ method: 'POST', url: `/_monitor/${UUID}/boom?q=${QUERY}`, headers: { ...headers, authorization: bearer }, payload: JSON.stringify({ text: BODY, email: EMAIL }) });
    expect(response.statusCode).toBe(500);
    await monitor.flush(2000);
    const events = sent.filter((s) => s.includes('"exception"'));
    expect(events).toHaveLength(1);
    const envelope = events[0] ?? '';
    expect(leaked(envelope)).toEqual([]);
    expect(envelope).toContain('"route":"/_monitor/:itemId/boom"');
    expect(envelope).toContain('"status":"500"');
    expect(envelope).toContain('"environment":"preview"');
    expect(envelope).toContain('[email]');
    expect(envelope).not.toContain('"request"');
    expect(envelope).not.toContain('"user"');
    // Errors only: the SDK runs with exactly the four integrations, nothing that traces or streams spans.
    expect(envelope).toContain('"integrations":["LinkedErrors","Dedupe","OnUncaughtException","OnUnhandledRejection"]');
  });

  it('a 5xx answered without a throw: reported by status and route template only', T, async () => {
    sent.length = 0;
    const response = await app.inject({ method: 'GET', url: `/_monitor/${UUID}/down?q=${QUERY}`, headers: { ...headers, authorization: bearer } });
    expect(response.statusCode).toBe(503);
    await monitor.flush(2000);
    expect(sent).toHaveLength(1);
    expect(leaked(sent[0] ?? '')).toEqual([]);
    expect(sent[0]).toContain('HTTP 503 GET /_monitor/:itemId/down');
  });

  it('a 4xx is not reported', T, async () => {
    sent.length = 0;
    const response = await app.inject({ method: 'GET', url: '/no-such-route', headers: { authorization: bearer } });
    expect(response.statusCode).toBe(404);
    await monitor.flush(500);
    expect(sent).toEqual([]);
  });
});

describe('[§12 Error monitoring] the error handler reports every 500 once, with the route template', () => {
  it('captures the error with route, method and status; the response is unchanged', T, async () => {
    const reports: Array<{ error: unknown; report: ErrorReport }> = [];
    const statuses: ErrorReport[] = [];
    const fake: ErrorMonitor = {
      enabled: true,
      capture: (error, report) => reports.push({ error, report }),
      captureStatus: (report) => statuses.push(report),
      flush: () => Promise.resolve(),
    };
    const app = buildApp({ config, errorMonitor: fake });
    app.get('/_t/:id', () => Promise.reject(new Error('boom')));
    const response = await app.inject({ method: 'GET', url: `/_t/${UUID}`, headers: { authorization: bearer } });
    await app.close();
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'internal' });
    expect(reports.map((r) => r.report)).toEqual([{ route: '/_t/:id', method: 'GET', status: 500, surface: 'api' }]);
    expect(statuses).toEqual([]);
  });
});
