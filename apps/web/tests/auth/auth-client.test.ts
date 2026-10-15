// F1.5 part b, the Auth module with the REAL client (criteria 5, 10, 11, 12, 14) against a stubbed Auth server: createAuthPort(cfg,
// { keyValueStorage, fetch }) per .work/login-session/interface.md "Storage" and "Auth module". Only the network and the storage
// are faked. Derived from spec.md and interface.md only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthPort } from '@/services/auth/auth-client';

const KEY = 'nestly-auth';
const URL_BASE = 'https://example.invalid';
const CFG = { url: URL_BASE, publishableKey: 'sb_publishable_AbCdEfGhIjKlMnOpQrStUv' };
const EMAIL = 'dana.cohen@example.com';
const PASSWORD = 'correct horse 42 zq';
const NOW_MS = Date.parse('2026-10-15T10:00:00Z');
const nowSec = (): number => Math.floor(Date.now() / 1000);

const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (exp: number): string => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ aud: 'authenticated', role: 'authenticated', sub: 'u1', exp })}.sig`;

interface Call {
  path: string;
  query: URLSearchParams;
  method: string;
  headers: Headers;
  body: string;
}

function userObject() {
  return {
    id: 'f0000000-0000-4000-8000-0000000000f1',
    aud: 'authenticated',
    role: 'authenticated',
    email: EMAIL,
    identities: [],
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-10-14T10:00:00Z',
  };
}
function tokenBody(access: string, refresh: string, lifetimeSec = 3600) {
  return { access_token: access, token_type: 'bearer', expires_in: lifetimeSec, expires_at: nowSec() + lifetimeSec, refresh_token: refresh, user: userObject() };
}
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A stubbed Auth server: handler gets the call and answers, or throws to simulate a network failure. */
function stubFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw);
    const headers = new Headers(init?.headers);
    const call: Call = { path: url.pathname, query: url.searchParams, method: init?.method ?? 'GET', headers, body: typeof init?.body === 'string' ? init.body : '' };
    calls.push(call);
    return handler(call);
  });
  return { fetchStub, calls };
}

/** A synchronous map-backed storage with the auth-js storage shape. */
function mapStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const storage = {
    getItem: (k: string): string | null => map.get(k) ?? null,
    setItem: (k: string, v: string): void => void map.set(k, v),
    removeItem: (k: string): void => void map.delete(k),
  };
  return { map, storage };
}

const storedSession = (access: string, refresh: string, expiresAt: number): string =>
  JSON.stringify({ access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, refresh_token: refresh });

function build(handler: (call: Call) => Response | Promise<Response>, initial: Record<string, string> = {}) {
  const { fetchStub, calls } = stubFetch(handler);
  const store = mapStorage(initial);
  const port = createAuthPort(CFG, { keyValueStorage: store.storage, fetch: fetchStub });
  return { port, calls, ...store };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NOW_MS);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('[F1.5 c5][c10] signIn: success and the stored session', () => {
  it('[c10][NFR-SEC-001] the password goes in the token request to Auth only; the storage then holds the one key, the five session fields, no email, no password', async () => {
    const { port, calls, map } = build(() => json(200, tokenBody(jwt(nowSec() + 3600), 'refresh-1')));
    const answer = await port.signIn({ email: EMAIL, password: PASSWORD });
    expect(answer.failure).toBeNull();
    expect(answer.accessToken).toBe(jwt(nowSec() + 3600));
    const carrying = calls.filter((c) => `${c.path}${c.query.toString()}${c.body}${JSON.stringify([...c.headers])}`.includes(PASSWORD));
    expect(carrying.map((c) => c.path)).toEqual(['/auth/v1/token']);
    expect(carrying[0]?.query.get('grant_type')).toBe('password');
    expect([...map.keys()]).toEqual([KEY]);
    const raw = map.get(KEY) ?? '';
    const stored: unknown = JSON.parse(raw);
    expect(Object.keys(typeof stored === 'object' && stored !== null ? stored : {}).sort()).toEqual(['access_token', 'expires_at', 'expires_in', 'refresh_token', 'token_type']);
    expect(raw).not.toContain(EMAIL);
    expect(raw).not.toContain(PASSWORD);
  });

  it('[c10] the publishable key is sent as apikey and the password is in no other header', async () => {
    const { port, calls } = build(() => json(200, tokenBody(jwt(nowSec() + 3600), 'r')));
    await port.signIn({ email: EMAIL, password: PASSWORD });
    expect(calls[0]?.headers.get('apikey')).toBe(CFG.publishableKey);
  });
});

describe('[F1.5 c5][c6] signIn: failures are returned, not thrown, and store nothing', () => {
  it.each([
    ['wrong password', 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 'invalid_credentials'],
    ['unconfirmed email', 400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' }, 'email_not_confirmed'],
    ['banned user', 400, { code: 400, error_code: 'user_banned', msg: 'User is banned' }, 'user_banned'],
    ['rate limit', 429, { code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }, 'over_request_rate_limit'],
  ])('%s -> accessToken null, the Auth code in failure, no session in storage', async (_label, status, body, code) => {
    const { port, map } = build(() => json(status, body));
    const answer = await port.signIn({ email: EMAIL, password: PASSWORD });
    expect(answer.accessToken).toBeNull();
    expect(answer.failure?.code).toBe(code);
    expect(answer.failure?.status).toBe(status);
    expect(map.size).toBe(0);
  });

  it('[c6] an Auth 5xx is a retryable failure (status >= 500 or the retryable name), nothing stored', async () => {
    const { port, map } = build(() => new Response('upstream down', { status: 503 }));
    const answer = await port.signIn({ email: EMAIL, password: PASSWORD });
    expect(answer.accessToken).toBeNull();
    const retryable = answer.failure?.name === 'AuthRetryableFetchError' || (answer.failure?.status ?? 0) >= 500;
    expect(retryable).toBe(true);
    expect(map.size).toBe(0);
  });

  it('[c6] a network failure is a failure value or a rejection, never a stored session', async () => {
    const { port, map } = build(() => {
      throw new TypeError('Failed to fetch');
    });
    const answer = await port.signIn({ email: EMAIL, password: PASSWORD }).catch(() => null);
    expect(answer?.accessToken ?? null).toBeNull();
    expect(map.size).toBe(0);
  });

  it('[c6] not configured (empty url) -> AuthNotConfigured failure and no network call', async () => {
    const { fetchStub, calls } = stubFetch(() => json(200, {}));
    const port = createAuthPort({ url: '', publishableKey: '' }, { keyValueStorage: mapStorage().storage, fetch: fetchStub });
    const answer = await port.signIn({ email: EMAIL, password: PASSWORD });
    expect(answer.accessToken).toBeNull();
    expect(answer.failure?.name).toBe('AuthNotConfigured');
    expect(calls).toHaveLength(0);
  });
});

describe('[F1.5 c10][NFR-SEC-001] which config counts as configured (the password must never go to our own origin or over plain http)', () => {
  it.each([
    ['plain http to a public host', 'http://example.com'],
    ['a relative URL', '/auth/v1'],
    ['a protocol-relative URL', '//example.com'],
    ['a blank URL', '   '],
    ['an unsupported scheme', 'ftp://example.com'],
  ])('%s -> AuthNotConfigured on sign-in, restore "none", no token, and no request at all', async (_label, url) => {
    const { fetchStub, calls } = stubFetch(() => json(200, tokenBody(jwt(nowSec() + 3600), 'r1')));
    const port = createAuthPort({ url, publishableKey: CFG.publishableKey }, { keyValueStorage: mapStorage().storage, fetch: fetchStub });
    const answer = await port.signIn({ email: EMAIL, password: PASSWORD });
    expect(answer.accessToken).toBeNull();
    expect(answer.failure?.name).toBe('AuthNotConfigured');
    expect(await port.restore()).toBe('none');
    expect(await port.getAccessToken()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('a blank publishable key -> AuthNotConfigured and no request', async () => {
    const { fetchStub, calls } = stubFetch(() => json(200, {}));
    const port = createAuthPort({ url: URL_BASE, publishableKey: '  ' }, { keyValueStorage: mapStorage().storage, fetch: fetchStub });
    expect((await port.signIn({ email: EMAIL, password: PASSWORD })).failure?.name).toBe('AuthNotConfigured');
    expect(calls).toHaveLength(0);
  });

  it.each(['http://localhost:54321', 'http://127.0.0.1:54321'])('%s (local development) is accepted: the sign-in reaches Auth', async (url) => {
    const { fetchStub, calls } = stubFetch(() => json(200, tokenBody(jwt(nowSec() + 3600), 'r1')));
    const port = createAuthPort({ url, publishableKey: CFG.publishableKey }, { keyValueStorage: mapStorage().storage, fetch: fetchStub });
    const answer = await port.signIn({ email: EMAIL, password: PASSWORD });
    expect(answer.failure).toBeNull();
    expect(calls.map((c) => c.path)).toContain('/auth/v1/token');
  });

  it('an https URL with trailing slashes is accepted and the token path has no double slash', async () => {
    const { fetchStub, calls } = stubFetch(() => json(200, tokenBody(jwt(nowSec() + 3600), 'r1')));
    const port = createAuthPort({ url: `${URL_BASE}//`, publishableKey: CFG.publishableKey }, { keyValueStorage: mapStorage().storage, fetch: fetchStub });
    expect((await port.signIn({ email: EMAIL, password: PASSWORD })).failure).toBeNull();
    expect(calls[0]?.path).toBe('/auth/v1/token');
  });
});

describe('[F1.5 c11] restore', () => {
  it('no stored value -> "none", no network call', async () => {
    const { port, calls } = build(() => json(500, {}));
    expect(await port.restore()).toBe('none');
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['not JSON', 'this is not json'],
    ['an empty object', '{}'],
    ['an array', '[]'],
    ['null', 'null'],
    ['a number', '42'],
    ['a string', '"x"'],
    ['wrong field types', '{"access_token":1,"refresh_token":2,"expires_at":"soon"}'],
    ['a foreign shape', '{"theme":"dark","user":{"email":"a@b.co"}}'],
    ['a missing refresh token', JSON.stringify({ access_token: 'a', token_type: 'bearer', expires_in: 1, expires_at: nowSec() + 100 })],
    ['a very long garbage value', 'x'.repeat(200_000)],
  ])('corrupt or foreign content (%s) -> "none", the value is removed, no exception, no signed-in', async (_label, raw) => {
    const { port, map } = build(() => json(500, {}), { [KEY]: raw });
    await expect(port.restore()).resolves.toBe('none');
    expect(map.has(KEY)).toBe(false);
    expect(await port.getAccessToken()).toBeNull();
  });

  it('a valid unexpired stored session -> "session" and the access token is served', async () => {
    const access = jwt(nowSec() + 3000);
    const { port } = build(() => json(200, tokenBody('unused', 'unused')), { [KEY]: storedSession(access, 'r1', nowSec() + 3000) });
    expect(await port.restore()).toBe('session');
    expect(await port.getAccessToken()).toBe(access);
  });

  it('an expired stored session whose refresh token is accepted -> "session", new tokens stored, the old refresh token was sent', async () => {
    const fresh = jwt(nowSec() + 3600);
    const { port, calls, map } = build(() => json(200, tokenBody(fresh, 'r2')), { [KEY]: storedSession(jwt(nowSec() - 10), 'r1', nowSec() - 10) });
    expect(await port.restore()).toBe('session');
    const refresh = calls.find((c) => c.query.get('grant_type') === 'refresh_token');
    expect(JSON.parse(refresh?.body ?? '{}')).toMatchObject({ refresh_token: 'r1' });
    expect(await port.getAccessToken()).toBe(fresh);
    expect(map.get(KEY)).toContain('r2');
    expect(map.get(KEY)).not.toContain('"r1"');
  });

  it.each([
    ['refresh_token_not_found', 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }],
    ['refresh_token_already_used', 400, { code: 400, error_code: 'refresh_token_already_used', msg: 'Invalid Refresh Token: Already Used' }],
    ['invalid_grant', 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' }],
    ['session_not_found', 400, { code: 400, error_code: 'session_not_found', msg: 'Session not found' }],
  ])('a refresh token Auth refuses (%s) -> "refused", the storage is cleared, no access token afterwards', async (_label, status, body) => {
    const { port, map } = build(() => json(status, body), { [KEY]: storedSession(jwt(nowSec() - 10), 'r1', nowSec() - 10) });
    expect(await port.restore()).toBe('refused');
    expect(map.has(KEY)).toBe(false);
    expect(await port.getAccessToken()).toBeNull();
  });

  it.each([
    ['Auth 503', () => new Response('down', { status: 503 })],
    ['Auth 500', () => json(500, { msg: 'boom' })],
    [
      'a network failure',
      () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])('Auth unreachable (%s) -> "unreachable", the stored session is KEPT (not a sign-out)', async (_label, handler) => {
    const raw = storedSession(jwt(nowSec() - 10), 'r1', nowSec() - 10);
    const { port, map } = build(handler, { [KEY]: raw });
    const pending = port.restore();
    await vi.advanceTimersByTimeAsync(120_000); // the SDK backs off between attempts on a retryable error
    expect(await pending).toBe('unreachable');
    expect(map.get(KEY)).toBe(raw);
  });
});

describe('[F1.5 c12] refresh before expiry, and after it', () => {
  it('[DR-3] the SDK refreshes ahead of expiry on its ticker, emits "refreshed", and the next request carries the new token', async () => {
    let first = true;
    const { port, calls } = build((call) => {
      if (call.query.get('grant_type') === 'password') return json(200, tokenBody(jwt(nowSec() + 3600), 'r1'));
      first = false;
      return json(200, tokenBody('refreshed-token', 'r2'));
    });
    const events: string[] = [];
    port.subscribe((e) => events.push(e));
    const signedIn = await port.signIn({ email: EMAIL, password: PASSWORD });
    expect(signedIn.failure).toBeNull();
    expect(first).toBe(true);
    // Move to 45 s before expiry and let the 30 s ticker run.
    await vi.advanceTimersByTimeAsync(3600_000 - 45_000);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(calls.some((c) => c.query.get('grant_type') === 'refresh_token')).toBe(true);
    expect(events).toContain('refreshed');
    expect(events).not.toContain('signed-out');
    const token = await port.getAccessToken();
    expect(token).toBe('refreshed-token');
    // the refresh used the refresh token from sign-in
    const refresh = calls.find((c) => c.query.get('grant_type') === 'refresh_token');
    expect(JSON.parse(refresh?.body ?? '{}')).toMatchObject({ refresh_token: 'r1' });
  });

  it('a request made after expiry gets a renewed token, never the expired one', async () => {
    const stale = jwt(nowSec() + 3600);
    const { port } = build(
      (call) => (call.query.get('grant_type') === 'password' ? json(200, tokenBody(stale, 'r1')) : json(200, tokenBody('renewed-token', 'r2'))),
    );
    await port.signIn({ email: EMAIL, password: PASSWORD });
    // Jump past expiry without letting the ticker run (system clock only).
    vi.setSystemTime(NOW_MS + 3601_000);
    expect(await port.getAccessToken()).toBe('renewed-token');
  });

  it('refresh refused ("invalid/revoked") -> signed-out event, storage cleared, no token', async () => {
    const { port, map } = build((call) =>
      call.query.get('grant_type') === 'password'
        ? json(200, tokenBody(jwt(nowSec() + 3600), 'r1'))
        : json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }),
    );
    const events: string[] = [];
    port.subscribe((e) => events.push(e));
    await port.signIn({ email: EMAIL, password: PASSWORD });
    vi.setSystemTime(NOW_MS + 3601_000);
    expect(await port.getAccessToken()).toBeNull();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(map.has(KEY)).toBe(false);
    expect(events).toContain('refresh-refused');
  });

  it('refresh failing on the network or a 5xx -> the session stays in storage, no signed-out event, the refresh is retried', async () => {
    let refreshCalls = 0;
    const { port, map } = build((call) => {
      if (call.query.get('grant_type') === 'password') return json(200, tokenBody(jwt(nowSec() + 3600), 'r1'));
      refreshCalls += 1;
      if (refreshCalls % 2 === 1) throw new TypeError('Failed to fetch');
      return new Response('down', { status: 502 });
    });
    const events: string[] = [];
    port.subscribe((e) => events.push(e));
    await port.signIn({ email: EMAIL, password: PASSWORD });
    await vi.advanceTimersByTimeAsync(3600_000 - 45_000);
    await vi.advanceTimersByTimeAsync(31_000 * 4);
    expect(refreshCalls).toBeGreaterThanOrEqual(2);
    expect(map.has(KEY)).toBe(true);
    expect(events).not.toContain('signed-out');
    expect(events).not.toContain('refresh-refused');
  });
});

describe('[F1.5 c14][c10] signOut', () => {
  async function signedIn(handler: (call: Call) => Response | Promise<Response>) {
    const ctx = build((call) => (call.query.get('grant_type') === 'password' ? json(200, tokenBody(jwt(nowSec() + 3600), 'r1')) : handler(call)));
    await ctx.port.signIn({ email: EMAIL, password: PASSWORD });
    return ctx;
  }

  it('scope local, with the bearer token; the storage key is removed; true', async () => {
    const { port, calls, map } = await signedIn(() => new Response(null, { status: 204 }));
    expect(await port.signOut()).toBe(true);
    const logout = calls.find((c) => c.path === '/auth/v1/logout');
    expect(logout?.method).toBe('POST');
    expect(logout?.query.get('scope')).toBe('local');
    expect(logout?.headers.get('authorization')).toMatch(/^Bearer /);
    expect(map.size).toBe(0);
    expect(await port.getAccessToken()).toBeNull();
  });

  it.each([
    ['Auth 500', () => json(500, { msg: 'boom' }), false],
    [
      'a network failure',
      () => {
        throw new TypeError('Failed to fetch');
      },
      false,
    ],
  ])('when Auth cannot be told (%s) the storage is still cleared, nothing rejects, the answer is false', async (_label, handler, expected) => {
    const { port, map } = await signedIn(handler);
    await expect(port.signOut()).resolves.toBe(expected);
    expect(map.size).toBe(0);
    expect(await port.getAccessToken()).toBeNull();
  });

  it('[c14] a sign-out while a refresh is in flight wins: when the refresh answers, the storage is still empty and no token is served', async () => {
    let answerRefresh: () => void = () => undefined;
    const { port, map } = build((call) => {
      if (call.query.get('grant_type') === 'password') return json(200, tokenBody(jwt(nowSec() + 3600), 'r1'));
      if (call.path === '/auth/v1/logout') return new Response(null, { status: 204 });
      return new Promise<Response>((resolve) => {
        answerRefresh = () => resolve(json(200, tokenBody('late-token', 'r2')));
      });
    });
    await port.signIn({ email: EMAIL, password: PASSWORD });
    vi.setSystemTime(NOW_MS + 3601_000);
    const renewal = port.getAccessToken();
    await vi.advanceTimersByTimeAsync(10);
    const out = port.signOut();
    await vi.advanceTimersByTimeAsync(10);
    answerRefresh();
    await vi.advanceTimersByTimeAsync(1000);
    await out;
    await renewal;
    expect(map.has(KEY)).toBe(false);
    expect(await port.getAccessToken()).toBeNull();
  });

  it('signing out twice, or with nothing stored, does not reject and leaves storage empty', async () => {
    const { port, map } = await signedIn(() => new Response(null, { status: 204 }));
    await port.signOut();
    await expect(port.signOut()).resolves.toEqual(expect.any(Boolean));
    expect(map.size).toBe(0);
  });

  it('a refused (expired) session removed by restore leaves signOut harmless', async () => {
    const { port, map } = build(() => json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'x' }), { [KEY]: storedSession(jwt(nowSec() - 10), 'r1', nowSec() - 10) });
    await port.restore();
    await expect(port.signOut()).resolves.toEqual(expect.any(Boolean));
    expect(map.size).toBe(0);
  });
});
