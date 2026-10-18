// F1.8 P2a, criteria 3, 4, 5, 6, 12, 13, 15 through the whole <App> at /auth/google, with the REAL Auth client and session source
// over a stubbed Auth server and a map storage (only the network and storage are faked, names that exist since F1.5).
// Derived from .work/google-sign-in/spec.md only. The PKCE verifier is seeded where the SDK keeps it (`<storageKey>-code-verifier`),
// standing in for the start that the browser did before leaving.
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import type { AccountStateOutcome } from '@/services/api/account-state';
import { createAuthPort } from '@/services/auth/auth-client';
import { AUTH_STORAGE_KEY } from '@/services/auth/storage-key';
import { createAuthSessionSource } from '@/services/session/auth-session-source';

const FAIL = 'לא הצלחנו להשלים את הכניסה עם Google. אפשר לנסות שוב, או להתחבר עם אימייל וסיסמה.';
const CANCEL = 'הכניסה עם Google בוטלה. אפשר לנסות שוב, או להתחבר עם אימייל וסיסמה.';
const STOPPED = 'הכניסה לחשבון הזה אינה זמינה כרגע';
const CFG = { url: 'https://example.invalid', publishableKey: 'sb_publishable_AbCdEfGhIjKlMnOpQrStUv' };
const GOOGLE_EMAIL = 'google.person@example.com';
const GOOGLE_KEYS = ['full_name', 'name', 'avatar_url', 'picture'];
const CODE = 'SENTINEL-CODE-7f3a';
const VERIFIER = 'SENTINEL-VERIFIER-91bc';
const ACCESS_SIG = 'SENTINEL-ACCESS-55d1';
const REFRESH = 'SENTINEL-REFRESH-0e8c';

const b64 = (v: unknown): string => Buffer.from(JSON.stringify(v)).toString('base64url');
/** The token the exchange issues carries Google's profile keys and the email in its claims; the refreshed one does not. */
const accessToken = (dirty = false): string =>
  `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    aud: 'authenticated',
    role: 'authenticated',
    sub: 'u1',
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: dirty ? GOOGLE_EMAIL : 'account@example.com',
    ...(dirty ? { user_metadata: { full_name: 'Dana Cohen', name: 'Dana Cohen', avatar_url: 'https://x.invalid/a.png', picture: 'https://x.invalid/a.png' } } : {}),
  })}.${ACCESS_SIG}`;
const claimsOf = (token: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
  return typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
};
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function user(metadata: Record<string, unknown>) {
  return {
    id: 'f0000000-0000-4000-8000-0000000000f1',
    aud: 'authenticated',
    role: 'authenticated',
    email: GOOGLE_EMAIL,
    identities: [],
    app_metadata: { provider: 'google' },
    user_metadata: metadata,
    created_at: '2026-10-16T10:00:00Z',
  };
}

interface Call {
  method: string;
  path: string;
  search: string;
  body: string;
}

interface Options {
  /** What the token endpoint answers to the code: 200 with a session by default, or this status. */
  exchangeStatus?: number;
  metadata?: Record<string, unknown>;
  /** A status for the profile-clearing PUT /user; default 200. */
  clearStatus?: number;
  outcome?: AccountStateOutcome;
  configured?: boolean;
  /** Whether the PKCE verifier is in storage (the start happened in this browser). Default true. */
  verifier?: boolean;
}

function build(opts: Options = {}) {
  const calls: Call[] = [];
  const map = new Map<string, string>();
  if (opts.verifier !== false) map.set(`${AUTH_STORAGE_KEY}-code-verifier`, JSON.stringify(VERIFIER));
  const storage = {
    getItem: (k: string): string | null => map.get(k) ?? null,
    setItem: (k: string, v: string): void => void map.set(k, v),
    removeItem: (k: string): void => void map.delete(k),
  };
  const metadata = opts.metadata ?? { full_name: 'Dana Cohen', name: 'Dana Cohen', avatar_url: 'https://x.invalid/a.png', picture: 'https://x.invalid/a.png' };
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    await Promise.resolve();
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw);
    calls.push({ method: init?.method ?? 'GET', path: url.pathname, search: url.search, body: typeof init?.body === 'string' ? init.body : '' });
    if (url.pathname.endsWith('/token')) {
      if (opts.exchangeStatus !== undefined && opts.exchangeStatus !== 200) return json(opts.exchangeStatus, { error: 'x', error_description: 'SENTINEL-DESC' });
      const lifetime = 3600;
      const refreshed = url.search.includes('grant_type=refresh_token');
      return json(200, {
        access_token: accessToken(!refreshed),
        token_type: 'bearer',
        expires_in: lifetime,
        expires_at: Math.floor(Date.now() / 1000) + lifetime,
        refresh_token: REFRESH,
        user: user(metadata),
      });
    }
    if (url.pathname.endsWith('/user') && init?.method === 'PUT') {
      const status = opts.clearStatus ?? 200;
      return status === 200 ? json(200, user({})) : json(status, { message: 'SENTINEL-CLEAR-FAIL' });
    }
    return json(404, {});
  });
  const auth = createAuthPort(opts.configured === false ? { url: '', publishableKey: '' } : CFG, { keyValueStorage: storage, fetch: fetchStub });
  const accountState = vi.fn((token: string): Promise<AccountStateOutcome> => {
    void token;
    return Promise.resolve(opts.outcome ?? 'active');
  });
  const source = createAuthSessionSource({
    auth,
    accountState,
    now: () => Date.now(),
    events: { onTabVisible: () => () => undefined, onSessionRemovedElsewhere: () => () => undefined },
  });
  return { auth, source, calls, map, accountState };
}

function mountAt(url: string, built: ReturnType<typeof build>) {
  act(() => {
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  return render(<App sessionSource={built.source} authPort={built.auth} />);
}

/** The `data` object of an updateUser request body. */
const dataOf = (body: string | undefined): unknown => {
  const parsed: unknown = JSON.parse(body ?? '{}');
  return typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'data') : undefined;
};
/** The landing page now asks GET /api/feed (F3.2b): an empty page, so only the sign-in's own alerts can show. */
const stubFeed = (): void => {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({ items: [], nextCursor: null, configVersion: 1 }), { status: 200, headers: { 'content-type': 'application/json' } })));
};
const settle =() => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const sessionKeys = (map: Map<string, string>) => [...map.keys()].filter((k) => k === AUTH_STORAGE_KEY);
const logs: unknown[][] = [];

beforeEach(() => {
  logs.length = 0;
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('F1.8 c3 the failure text is one text for every failure [FR-AUTH-005][AC-087][ERR-001]', () => {
  const cases: Array<[string, string, Options]> = [
    ['a provider error with a description', '?error=server_error&error_description=%3Cimg%20src%3Dx%3E', {}],
    ['a provider error with an email in the description', `?error=server_error&error_description=${GOOGLE_EMAIL}`, {}],
    ['a provider error that is not access_denied', '?error=invalid_request', {}],
    ['no code and no error', '', {}],
    ['an empty code', '?code=', {}],
    ['a code with no PKCE verifier (reused or foreign)', `?code=${CODE}`, { verifier: false }],
    ['a code the exchange refuses (400)', `?code=${CODE}`, { exchangeStatus: 400 }],
    ['a code the exchange refuses (500)', `?code=${CODE}`, { exchangeStatus: 500 }],
    ['Auth not configured', `?code=${CODE}`, { configured: false }],
  ];
  it.each(cases)('[F1.8 c3][AC-087][ERR-001] %s shows the failure text, with no description or email, at the same URL', async (_label, search, opts) => {
    const b = build(opts);
    mountAt(`/auth/google${search}`, b);
    const alert = await screen.findByRole('alert');
    await settle();
    expect(alert.textContent).toBe(FAIL);
    expect(document.body.textContent).not.toContain('SENTINEL-DESC');
    expect(document.body.textContent).not.toContain('img src');
    expect(document.body.textContent).not.toContain(GOOGLE_EMAIL);
    expect(window.location.pathname).toBe('/auth/google');
    expect(window.location.search).toBe('');
    expect(sessionKeys(b.map)).toEqual([]);
    if (opts.configured !== false) expect([...b.map.keys()], 'no Auth key at all').toEqual([]);
    expect(b.accountState).not.toHaveBeenCalled();
  });
});

describe('F1.8 c4 cancelled consent [FR-AUTH-005][AC-087]', () => {
  it('[F1.8 c4][AC-087] access_denied shows the cancel text, makes no exchange and creates no session', async () => {
    const b = build();
    mountAt('/auth/google?error=access_denied&error_description=The+user+denied', b);
    expect((await screen.findByRole('alert')).textContent).toBe(CANCEL);
    expect(document.body.textContent).not.toContain('denied');
    expect(b.calls.filter((c) => c.path.endsWith('/token'))).toEqual([]);
    expect(sessionKeys(b.map)).toEqual([]);
    expect([...b.map.keys()], 'verifier removed, no Auth key at all').toEqual([]);
    expect(window.location.search).toBe('');
  });

  it('[F1.8 c4][AC-087] access_denied together with a code still exchanges nothing', async () => {
    const b = build();
    mountAt(`/auth/google?error=access_denied&code=${CODE}`, b);
    expect((await screen.findByRole('alert')).textContent).toBe(CANCEL);
    expect(b.calls.filter((c) => c.path.endsWith('/token'))).toEqual([]);
    expect(sessionKeys(b.map)).toEqual([]);
  });

  it('[F1.8 c4][ERR-001] a hostile error_description appears nowhere in the DOM, and the text is the criterion 3 text', async () => {
    const b = build();
    const { container } = mountAt('/auth/google?error=server_error&error_description=%3Cimg%20src%3Dx%3E', b);
    expect((await screen.findByRole('alert')).textContent).toBe(FAIL);
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toMatch(/src=x|img src/);
  });
});

describe('F1.8 c5 the URL is cleaned and the failure screen offers a way out [AC-087][FR-AUTH-005]', () => {
  it('[F1.8 c5][AC-087] after a failure code and error* are gone from the address bar and no history entry is added', async () => {
    const b = build({ exchangeStatus: 400 });
    window.history.replaceState(null, '', '/');
    const before = window.history.length;
    mountAt(`/auth/google?code=${CODE}&error=x&error_description=y&error_code=z`, b);
    await screen.findByRole('alert');
    await settle();
    expect(window.location.href).not.toMatch(/code|error/);
    expect(window.history.length).toBe(before);
  });

  it('[F1.8 c5][AC-087] after a successful return the code is gone from the address bar too', async () => {
    const b = build();
    mountAt(`/auth/google?code=${CODE}`, b);
    await waitFor(() => expect(window.location.pathname).toBe('/feed'));
    expect(window.location.href).not.toContain(CODE);
    expect(window.location.search).toBe('');
  });

  it('[F1.8 c5][AC-087] opening the same URL again (code already used) shows the failure text and creates no session', async () => {
    const first = build();
    const { unmount } = mountAt(`/auth/google?code=${CODE}`, first);
    await waitFor(() => expect(window.location.pathname).toBe('/feed'));
    unmount();
    // A fresh browser state: the verifier was consumed by the first exchange, so the second visit has none.
    const second = build({ verifier: false });
    mountAt(`/auth/google?code=${CODE}`, second);
    expect((await screen.findByRole('alert')).textContent).toBe(FAIL);
    expect(sessionKeys(second.map)).toEqual([]);
    expect(first.map.has(`${AUTH_STORAGE_KEY}-code-verifier`)).toBe(false);
  });

  it.each(['?error=access_denied', '?error=server_error', '', `?code=${CODE}`])('[F1.8 c5][AC-087] the failure screen at %s links to /login and to /register', async (search) => {
    const b = build({ exchangeStatus: 400 });
    const { container } = mountAt(`/auth/google${search}`, b);
    await screen.findByRole('alert');
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    expect(container.querySelector('a[href="/register"]')).not.toBeNull();
  });
});

describe('F1.8 c6 the account status after a Google return [AC-087][AC-099][AC-100][NFR-SEC-009]', () => {
  it('[F1.8 c6][AC-087] an active account gets a session, the status check runs with the access token, and the user lands on /feed', async () => {
    const b = build({ outcome: 'active' });
    mountAt(`/auth/google?code=${CODE}`, b);
    await waitFor(() => expect(window.location.pathname).toBe('/feed'));
    expect(b.accountState).toHaveBeenCalledTimes(1);
    expect(b.accountState.mock.calls[0]?.[0].split('.')).toHaveLength(3);
    expect(sessionKeys(b.map)).toEqual([AUTH_STORAGE_KEY]);
  });

  it('[F1.8 c6][AC-099][ERR-037] a suspended or banned account: session ended, the stopped text, no protected screen', async () => {
    const b = build({ outcome: 'unavailable' });
    mountAt(`/auth/google?code=${CODE}`, b);
    await waitFor(() => expect(document.body.textContent).toContain(STOPPED));
    await settle();
    expect(sessionKeys(b.map)).toEqual([]);
    expect(screen.queryByRole('navigation', { name: 'ניווט ראשי' })).not.toBeInTheDocument();
    expect(['/feed', '/home', '/profile', '/settings']).not.toContain(window.location.pathname);
  });

  it('[F1.8 c6][AC-100] a Google user with no account is sent to /register (completion), session kept', async () => {
    const b = build({ outcome: 'unregistered' });
    mountAt(`/auth/google?code=${CODE}`, b);
    await waitFor(() => expect(window.location.pathname).toBe('/register'));
    expect(sessionKeys(b.map)).toEqual([AUTH_STORAGE_KEY]);
  });
});

describe('F1.8 c12 Google profile keys are cleared, never read [DR-5][FR-AUTH-005]', () => {
  it('[F1.8 c12][DR-5] given the Google profile keys, user_metadata is updated to clear each of them before /feed shows', async () => {
    const b = build();
    mountAt(`/auth/google?code=${CODE}`, b);
    await waitFor(() => expect(window.location.pathname).toBe('/feed'));
    const puts = b.calls.filter((c) => c.method === 'PUT' && c.path.endsWith('/user'));
    expect(puts.length).toBeGreaterThan(0);
    const data = dataOf(puts[0]?.body);
    for (const key of GOOGLE_KEYS) expect(data, key).toHaveProperty(key, null);
  });

  it('[F1.8 c12][DR-5] the cleared name and picture are not rendered anywhere', async () => {
    const b = build();
    mountAt(`/auth/google?code=${CODE}`, b);
    await waitFor(() => expect(window.location.pathname).toBe('/feed'));
    await settle();
    expect(document.body.textContent).not.toContain('Dana Cohen');
    expect(document.querySelector('img')).toBeNull();
  });

  it('[F1.8 c12][DR-5] given no Google profile keys, no update is made', async () => {
    const b = build({ metadata: {} });
    mountAt(`/auth/google?code=${CODE}`, b);
    await waitFor(() => expect(window.location.pathname).toBe('/feed'));
    await settle();
    expect(b.calls.filter((c) => c.method === 'PUT')).toEqual([]);
  });

  it('[F1.8 c12][DR-5] only keys that are present are cleared; an unrelated key is left alone', async () => {
    const b = build({ metadata: { picture: 'https://x.invalid/p.png', locale: 'he' } });
    mountAt(`/auth/google?code=${CODE}`, b);
    await waitFor(() => expect(window.location.pathname).toBe('/feed'));
    const puts = b.calls.filter((c) => c.method === 'PUT');
    const data = dataOf(puts[0]?.body);
    expect(data).toHaveProperty('picture', null);
    expect(data).not.toHaveProperty('locale');
  });

  it('[F1.8 c12][DR-5] a failed clear does not block sign-in and shows nothing', async () => {
    stubFeed();
    const b = build({ clearStatus: 500 });
    mountAt(`/auth/google?code=${CODE}`, b);
    await waitFor(() => expect(window.location.pathname).toBe('/feed'));
    await settle();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('SENTINEL-CLEAR-FAIL');
    expect(sessionKeys(b.map)).toEqual([AUTH_STORAGE_KEY]);
  });
});

describe('F1.8 c13 + c15 the Google start [NFR-SEC-009][AC-101][FR-AUTH-005]', () => {
  const REDIRECT = 'https://nestly-preview.example.invalid/auth/google';

  it('[F1.8 c13][FR-AUTH-005] the start asks Google for openid email only and returns to /auth/google', async () => {
    const b = build({ verifier: false });
    const started = await b.auth.startGoogleSignIn(REDIRECT);
    expect(started.failure).toBeNull();
    const url = new URL(started.url ?? 'about:blank');
    expect(url.origin + url.pathname).toBe(`${CFG.url}/auth/v1/authorize`);
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('redirect_to')).toBe(REDIRECT);
    expect(url.searchParams.get('scopes')).toBe('openid email');
    expect(b.calls).toEqual([]);
  });

  it('[F1.8 c15][NFR-SEC-009] between the start and the return the PKCE verifier is only under the SDK verifier key: in no URL, no console output, and no other storage key', async () => {
    const b = build({ verifier: false });
    const started = await b.auth.startGoogleSignIn(REDIRECT);
    const verifier = b.map.get(`${AUTH_STORAGE_KEY}-code-verifier`) ?? '';
    expect(verifier.length).toBeGreaterThan(20);
    expect([...b.map.keys()]).toEqual([`${AUTH_STORAGE_KEY}-code-verifier`]);
    expect(started.url ?? '').not.toContain(verifier.split('/')[0] ?? 'x');
    expect(JSON.stringify(logs)).not.toContain(verifier);
    expect(window.location.href).not.toContain(verifier);
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });

  it('[F1.8 c3][ERR-001] with Auth not configured the start gives no URL and makes no call', async () => {
    const b = build({ configured: false, verifier: false });
    const started = await b.auth.startGoogleSignIn(REDIRECT);
    expect(started.url).toBeNull();
    expect(started.failure).not.toBeNull();
    expect(b.calls).toEqual([]);
    expect(b.map.size).toBe(0);
  });
});

describe('F1.8 c14 /auth/google is Guest-only [FR-AUTH-004][AC-087]', () => {
  it('[F1.8 c14][FR-AUTH-004] signed in, /auth/google?code goes to the landing page and exchanges no code', async () => {
    stubFeed();
    const b = build();
    mountAt(`/auth/google?code=${CODE}`, b);
    await waitFor(() => expect(window.location.pathname).toBe('/feed'));
    const exchanges = () => b.calls.filter((c) => c.path.endsWith('/token') && c.search.includes('grant_type=pkce')).length;
    expect(exchanges()).toBe(1);
    act(() => {
      window.history.pushState(null, '', '/auth/google?code=SENTINEL-CODE-second');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(window.location.pathname).toBe('/feed'));
    await settle();
    expect(exchanges()).toBe(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('[F1.8 c14][FR-AUTH-004] signed out, /auth/google/extra is denied and goes to Welcome', async () => {
    const b = build();
    mountAt(`/auth/google/extra?code=${CODE}`, b);
    await screen.findByRole('heading', { level: 1, name: 'הצטרפות ל-Nestly' });
    expect(window.location.pathname).toBe('/');
    expect(b.calls).toEqual([]);
  });
});

describe('F1.8 c13 + c15 what is stored, sent and logged [NFR-SEC-009][AC-101]', () => {
  it('[F1.8 c13][NFR-SEC-009][AC-101] after a return web storage holds only the one session key, with tokens and no email', async () => {
    const b = build();
    mountAt(`/auth/google?code=${CODE}`, b);
    await waitFor(() => expect(window.location.pathname).toBe('/feed'));
    await settle();
    expect([...b.map.keys()]).toEqual([AUTH_STORAGE_KEY]);
    const stored = b.map.get(AUTH_STORAGE_KEY) ?? '';
    expect(stored).toContain(REFRESH);
    expect(stored).not.toContain(GOOGLE_EMAIL);
    expect(stored).not.toContain('Dana Cohen');
    const session: unknown = JSON.parse(stored);
    const token: unknown = typeof session === 'object' && session !== null ? Reflect.get(session, 'access_token') : undefined;
    expect(typeof token).toBe('string');
    const claims = claimsOf(String(token));
    for (const key of GOOGLE_KEYS) expect(claims, `token claim ${key}`).not.toHaveProperty(key);
    expect(JSON.stringify(claims.user_metadata ?? {})).not.toMatch(/full_name|avatar_url|picture|Dana/);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('[F1.8 c13][NFR-SEC-009] the status check receives an access token without the Google profile keys', async () => {
    const b = build();
    mountAt(`/auth/google?code=${CODE}`, b);
    await waitFor(() => expect(window.location.pathname).toBe('/feed'));
    const sent = b.accountState.mock.calls[0]?.[0] ?? '';
    for (const key of GOOGLE_KEYS) expect(claimsOf(sent), key).not.toHaveProperty(key);
  });

  it('[F1.8 c13][NFR-SEC-009] the status check receives only the access token: nothing from the identity goes to the server', async () => {
    const b = build();
    mountAt(`/auth/google?code=${CODE}`, b);
    await waitFor(() => expect(window.location.pathname).toBe('/feed'));
    expect(b.accountState.mock.calls.every((c) => c.length === 1)).toBe(true);
  });

  it('[F1.8 c15][NFR-SEC-009] the code, verifier and tokens are in no URL but the exchange body, and in no console output, history or DOM', async () => {
    const b = build();
    mountAt(`/auth/google?code=${CODE}`, b);
    await waitFor(() => expect(window.location.pathname).toBe('/feed'));
    await settle();
    const secrets = [CODE, VERIFIER, ACCESS_SIG, REFRESH];
    for (const call of b.calls) for (const s of secrets) expect(call.path + call.search, s).not.toContain(s);
    for (const s of secrets) {
      expect(JSON.stringify(logs), s).not.toContain(s);
      expect(window.location.href, s).not.toContain(s);
      expect(document.documentElement.outerHTML, s).not.toContain(s);
    }
    const stored = [...b.map.entries()].filter(([k]) => k !== AUTH_STORAGE_KEY);
    expect(JSON.stringify(stored)).not.toContain(CODE);
    expect(JSON.stringify(stored)).not.toContain(REFRESH);
  });

  it('[F1.8 c15][NFR-SEC-009] on a failure too, no console output carries the code or the verifier', async () => {
    const b = build({ exchangeStatus: 400 });
    mountAt(`/auth/google?code=${CODE}`, b);
    await screen.findByRole('alert');
    await settle();
    for (const s of [CODE, VERIFIER, 'SENTINEL-DESC']) expect(JSON.stringify(logs), s).not.toContain(s);
  });
});
