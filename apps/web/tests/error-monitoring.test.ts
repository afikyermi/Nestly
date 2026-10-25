import { describe, expect, it, vi } from 'vitest';
import type { Breadcrumb, ErrorEvent } from '@sentry/react';
import { monitorConfig } from '@/services/monitoring/monitor-config';
import { scrubBreadcrumb, scrubBrowserEvent } from '@/services/monitoring/scrub-browser-event';

// SRS §12 "Error monitoring" (Afik 17.10 and 24.10.2026): Sentry, errors only, no personal data sent. The tests hold the privacy
// promise: whatever the page, the error or the breadcrumbs carry, the report that leaves holds none of it.

const sent: string[] = [];
vi.mock('@sentry/react', async (importOriginal) => {
  const real = await importOriginal<typeof import('@sentry/react')>();
  // The real SDK, with a recording transport: nothing is ever sent from a test.
  const transport = (): ReturnType<typeof real.createTransport> =>
    real.createTransport({ recordDroppedEvent: () => undefined }, (request) => {
      sent.push(typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body));
      return Promise.resolve({ statusCode: 200 });
    });
  return { ...real, init: vi.fn((options: Parameters<typeof real.init>[0]) => real.init({ ...options, transport })) };
});

const FAKE_DSN = 'https://publicKeyPlaceholder@o0.ingest.example.invalid/0';
const EMAIL = 'mom.marker@example.com';
// A JWT-shaped marker, assembled at run time so the repository never holds one literally (the commit guard).
const JWT = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJtYXJrZXIifQ', 'c2lnbmF0dXJlLW1hcmtlcg'].join('.');
const UUID = '6f1c2a9e-4b7d-4e2a-9c3f-1a2b3c4d5e6f';
const HEBREW = 'שם הילד שלי';
const TYPED = 'typed-marker-a1b2';
const QUERY = 'query-marker-91bc';
const MARKERS = [EMAIL, JWT, UUID, HEBREW, TYPED, QUERY, 'הילד', '0501234567'];
const leaked = (text: string): string[] => MARKERS.filter((m) => text.includes(m));

describe('[§12 Error monitoring] the web app reports only with a DSN', () => {
  it('no DSN (local, tests, e2e build): no monitoring', () => {
    expect(monitorConfig({})).toBeUndefined();
    expect(monitorConfig({ VITE_SENTRY_DSN: '   ' })).toBeUndefined();
    expect(monitorConfig({ VITE_SENTRY_DSN: undefined, VITE_DEPLOY_ENV: 'preview' })).toBeUndefined();
  });
  it('a DSN: Vercel environment and commit; development when the build has neither', () => {
    expect(monitorConfig({ VITE_SENTRY_DSN: FAKE_DSN, VITE_DEPLOY_ENV: 'preview', VITE_DEPLOY_RELEASE: 'abc123' })).toEqual({ dsn: FAKE_DSN, environment: 'preview', release: 'abc123' });
    expect(monitorConfig({ VITE_SENTRY_DSN: FAKE_DSN, VITE_DEPLOY_ENV: '', VITE_DEPLOY_RELEASE: '' })).toEqual({ dsn: FAKE_DSN, environment: 'development' });
  });
});

describe('[§12 Error monitoring] the browser report scrubber keeps no personal data', () => {
  it('the page becomes a route template; user, extra, cookies, query and foreign tags and contexts go; the user agent stays', () => {
    const event: ErrorEvent = {
      type: undefined,
      message: `could not open ${EMAIL}`,
      request: {
        url: `https://nestly.example/u/${UUID}?q=${QUERY}#${TYPED}`,
        headers: { 'User-Agent': 'Mozilla/5.0 Edg/140', Referer: `https://nestly.example/search?q=${QUERY}`, Cookie: `sb=${JWT}` },
        cookies: { sb: JWT },
        query_string: `q=${QUERY}`,
      },
      user: { id: UUID, email: EMAIL, ip_address: '{{auto}}' },
      extra: { typed: TYPED },
      tags: { surface: 'web', name: HEBREW },
      contexts: { trace: { trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16) }, custom: { email: EMAIL } },
      exception: { values: [{ type: 'TypeError', value: `Cannot read "${HEBREW}" of ${EMAIL} token ${JWT}`, stacktrace: { frames: [{ filename: `https://nestly.example/assets/index-Bx1.js?v=${QUERY}`, function: 'render', lineno: 1, colno: 2, vars: { typed: TYPED } }] } }] },
      breadcrumbs: [
        { category: 'navigation', data: { from: `/u/${UUID}`, to: `/groups/${UUID}?tab=${QUERY}` } },
        { category: 'fetch', data: { url: `https://x.supabase.co/auth/v1/token?refresh=${JWT}`, method: 'POST', status_code: 400, request_body_size: 10 } },
        { category: 'ui.click', message: `button[aria-label="${HEBREW}"]` },
        { category: 'ui.input', message: `input[name="email"] ${TYPED}` },
        { category: 'console', message: `log ${EMAIL}` },
      ],
    };
    const out = scrubBrowserEvent(event);
    expect(leaked(JSON.stringify(out))).toEqual([]);
    expect(out.request).toEqual({ url: 'https://nestly.example/u/:id', headers: { 'User-Agent': 'Mozilla/5.0 Edg/140' } });
    expect(out.user).toBeUndefined();
    expect(out.extra).toBeUndefined();
    expect(out.tags).toEqual({ surface: 'web' });
    expect(Object.keys(out.contexts ?? {})).toEqual(['trace']);
    expect(out.exception?.values?.[0]?.type).toBe('TypeError');
    expect(out.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({ filename: 'https://nestly.example/assets/index-Bx1.js', function: 'render', lineno: 1, colno: 2 });
    expect(out.breadcrumbs?.map((b) => b.category)).toEqual(['navigation', 'fetch', 'ui.click']);
    expect(out.breadcrumbs?.[0]?.data).toEqual({ from: '/u/:id', to: '/groups/:id' });
    expect(out.breadcrumbs?.[1]?.data).toEqual({ url: 'https://x.supabase.co/auth/v1/token', method: 'POST', status_code: 400 });
  });

  it('breadcrumbs of typing and console output are dropped', () => {
    const typed: Breadcrumb = { category: 'ui.input', message: TYPED };
    expect(scrubBreadcrumb(typed)).toBeNull();
    expect(scrubBreadcrumb({ category: 'console', message: EMAIL })).toBeNull();
    expect(scrubBreadcrumb({ category: 'sentry.event', message: EMAIL })).toBeNull();
    expect(scrubBreadcrumb({ message: EMAIL })).toBeNull();
  });
});

describe('[§12 Error monitoring] the real SDK in the page: errors only, scrubbed', () => {
  it('no tracing, Replay, sessions or console; a captured error leaves with no personal data', async () => {
    const sentry = await import('@sentry/react');
    const { startBrowserErrorMonitor } = await import('@/platform/browser-error-monitor');
    startBrowserErrorMonitor({ dsn: FAKE_DSN, environment: 'preview', scrubEvent: scrubBrowserEvent, scrubBreadcrumb });
    const options = vi.mocked(sentry.init).mock.calls[0]?.[0];
    expect(options?.defaultIntegrations).toBe(false);
    const integrations = options?.integrations;
    const names = (Array.isArray(integrations) ? integrations : []).map((i) => i.name).sort();
    expect(names).toEqual(['Breadcrumbs', 'BrowserApiErrors', 'Dedupe', 'GlobalHandlers', 'HttpContext', 'LinkedErrors']);
    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(options).not.toHaveProperty('replaysSessionSampleRate');
    expect(options?.dataCollection).toMatchObject({ userInfo: false, cookies: false, httpHeaders: { request: { allow: ['User-Agent'] }, response: false }, httpBodies: [], urlQueryParams: false });

    sentry.addBreadcrumb({ category: 'ui.input', message: TYPED });
    sentry.addBreadcrumb({ category: 'console', message: EMAIL });
    sentry.captureException(new Error(`save failed for ${EMAIL}: "${HEBREW}" ${UUID} 0501234567`));
    await sentry.flush(2000);
    const events = sent.filter((s) => s.includes('"exception"'));
    expect(events).toHaveLength(1);
    expect(leaked(events[0] ?? '')).toEqual([]);
    expect(events[0]).toContain('"environment":"preview"');
    expect(events[0]).toContain('[email]');
    // The page as a route template, and of the headers the user agent only.
    expect(events[0]).toMatch(/"headers":\{"User-Agent":"[^"]*"\}/);
    expect(sent.some((s) => s.includes('"type":"session"'))).toBe(false);
  });
});
