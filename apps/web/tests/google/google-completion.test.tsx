// F1.8 P2b, criteria 7-11 through the whole <App>: a Google Auth user with no account completes registration with a password.
// The REAL Auth client and session source run over a stubbed Auth server (fetch) and a map storage; POST /api/password/first and
// POST /api/register are spies on the global fetch. Derived from .work/google-sign-in/spec.md, and since F2.0 part a from its
// criterion c16 (.work/account-takeover-close/spec.md; D2): the password is set by the SERVER (POST /api/password/first with the
// caller's access token), never by an Auth updateUser call from the browser. The order of calls is recorded in one shared list.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@nestly/shared';
import { App } from '@/app/App';
import { decideAccess } from '@/app/access';
import type { AccountStateOutcome } from '@/services/api/account-state';
import { createAuthPort } from '@/services/auth/auth-client';
import { AUTH_STORAGE_KEY } from '@/services/auth/storage-key';
import { createAuthSessionSource } from '@/services/session/auth-session-source';

const CFG = { url: 'https://example.invalid', publishableKey: 'sb_publishable_AbCdEfGhIjKlMnOpQrStUv' };
const GOOGLE_EMAIL = 'google.person@example.com';
const ORPHAN_EMAIL = 'orphan.person@example.com';
const SENTINEL_PW = 'Sentinel-Pw-4821-zq';
const CONSENT_LABEL = 'אישור תנאי השימוש ומדיניות הפרטיות, והצהרה על גיל 18 ומעלה';
const NO_CONSENT = 'יש לאשר את התנאים ואת הצהרת הגיל כדי להמשיך';
const GENERIC ='משהו השתבש. אפשר לנסות שוב';
const PW_LENGTH = 'הסיסמה צריכה להכיל לפחות 8 תווים';
const REFRESH = 'SENTINEL-REFRESH-0e8c';

const b64 = (v: unknown): string => Buffer.from(JSON.stringify(v)).toString('base64url');
const accessToken = (): string =>
  `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ aud: 'authenticated', role: 'authenticated', sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })}.SIG`;
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type PutAnswer = 'ok' | 'fail' | 'pending';
interface Options {
  provider?: 'google' | 'email';
  /** What each POST /api/password/first answers (ok = 200, fail = 503), in order; the last one repeats. */
  puts?: PutAnswer[];
  /** What each POST /api/register answers, in order; the last one repeats. */
  registers?: Array<201 | 500 | 503 | 'throw'>;
}

function world(opts: Options = {}) {
  const provider = opts.provider ?? 'google';
  const email = provider === 'google' ? GOOGLE_EMAIL : ORPHAN_EMAIL;
  const events: string[] = [];
  const passwordBodies: string[] = [];
  const passwordAuth: Array<string | null> = [];
  const authPasswordPuts: string[] = [];
  const registerBodies: string[] = [];
  const map = new Map<string, string>();
  map.set(`${AUTH_STORAGE_KEY}-code-verifier`, JSON.stringify('SENTINEL-VERIFIER'));
  const storage = {
    getItem: (k: string): string | null => map.get(k) ?? null,
    setItem: (k: string, v: string): void => void map.set(k, v),
    removeItem: (k: string): void => void map.delete(k),
  };
  const authUser = {
    id: 'f0000000-0000-4000-8000-0000000000f2',
    aud: 'authenticated',
    role: 'authenticated',
    email,
    identities: [],
    app_metadata: { provider },
    user_metadata: provider === 'google' ? { full_name: 'Dana Cohen', name: 'Dana Cohen', picture: 'https://x.invalid/a.png' } : {},
    created_at: '2026-10-16T10:00:00Z',
  };
  const putPlan = [...(opts.puts ?? ['ok'])];
  const releasePending: Array<() => void> = [];
  const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    await Promise.resolve();
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw);
    const body = typeof init?.body === 'string' ? init.body : '';
    if (url.pathname.endsWith('/token')) {
      const lifetime = 3600;
      return json(200, {
        access_token: accessToken(),
        token_type: 'bearer',
        expires_in: lifetime,
        expires_at: Math.floor(Date.now() / 1000) + lifetime,
        refresh_token: REFRESH,
        user: authUser,
      });
    }
    if (url.pathname.endsWith('/user') && init?.method === 'PUT') {
      if (body.includes('"password"')) authPasswordPuts.push(body); // the browser must never do this (c13)
      return json(200, authUser); // the profile-keys clearing (DR-5)
    }
    if (url.pathname.endsWith('/user')) return json(200, authUser);
    return json(404, {});
  });
  const registerPlan = [...(opts.registers ?? [201])];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (target.includes('/api/password/first')) {
      events.push('setPassword');
      passwordBodies.push(typeof init?.body === 'string' ? init.body : '');
      passwordAuth.push(new Headers(init?.headers).get('authorization'));
      const answer = putPlan.length > 1 ? (putPlan.shift() ?? 'ok') : (putPlan[0] ?? 'ok');
      if (answer === 'pending') return new Promise<Response>((resolve) => releasePending.push(() => resolve(json(200, { ok: true }))));
      return Promise.resolve(answer === 'fail' ? json(503, { error: 'unavailable' }) : json(200, { ok: true }));
    }
    if (!target.includes('/api/register')) return Promise.resolve(json(404, {}));
    events.push('register');
    registerBodies.push(typeof init?.body === 'string' ? init.body : '');
    const next = registerPlan.length > 1 ? registerPlan.shift() : registerPlan[0];
    if (next === 'throw') return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(new Response(next === 201 || next === undefined ? '{"status":"created"}' : '{"error":"x"}', { status: next ?? 201 }));
  });
  const outcomes: AccountStateOutcome[] = ['unregistered'];
  const boot = () => {
    const auth = createAuthPort(CFG, { keyValueStorage: storage, fetch: authFetch });
    const accountState = vi.fn((token: string): Promise<AccountStateOutcome> => {
      void token;
      return Promise.resolve(outcomes[0] ?? 'unregistered');
    });
    const source = createAuthSessionSource({
      auth,
      accountState,
      now: () => Date.now(),
      events: { onTabVisible: () => () => undefined, onSessionRemovedElsewhere: () => () => undefined },
    });
    return { auth, source };
  };
  return { events, passwordBodies, passwordAuth, authPasswordPuts, registerBodies, map, boot, releasePending, setOutcome: (o: AccountStateOutcome) => void (outcomes[0] = o) };
}

type World = ReturnType<typeof world>;

function mountAt(url: string, w: World) {
  const { auth, source } = w.boot();
  act(() => {
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  return render(<App sessionSource={source} authPort={auth} />);
}

const path = () => window.location.pathname;
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const fullName = () => screen.findByLabelText(/^שם מלא/);
const passwordField = () => screen.getByLabelText('סיסמה', { exact: true });
const consentBox = () => screen.getByRole('checkbox', { name: CONSENT_LABEL });
const finalButton = (name = 'יצירת חשבון') => screen.getByRole('button', { name });
const isDisabled = (el: HTMLElement) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
const logs: unknown[][] = [];

/** A Google user returns with a code and has no account: the app leads to /register in completion mode, step 1. */
async function googleToCompletion(w: World) {
  const view = mountAt('/auth/google?code=SENTINEL-CODE', w);
  await waitFor(() => expect(path()).toBe('/register'));
  await fullName();
  return view;
}

async function throughStep1(u: ReturnType<typeof userEvent.setup>) {
  await u.click(within(screen.getByRole('group', { name: 'השלב במסע' })).getByRole('checkbox', { name: /מתכננים/ }));
  await u.type(await fullName(), 'דנה כהן');
  await u.click(screen.getByRole('button', { name: 'המשך' }));
  await screen.findByRole('checkbox', { name: CONSENT_LABEL });
}

beforeEach(() => {
  logs.length = 0;
  window.localStorage.clear();
  window.sessionStorage.clear();
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('F1.8 c7 completion mode for a Google user [FR-AUTH-005][AC-100][AC-088][FR-REG-004][VAL-003]', () => {
  it('[F1.8 c7][AC-100] step 1 is empty: nothing from Google is prefilled', async () => {
    const w = world();
    await googleToCompletion(w);
    await settle();
    expect(screen.queryByText(/Dana|Cohen/)).toBeNull();
    for (const input of document.querySelectorAll('input')) {
      if (input.type === 'checkbox' || input.type === 'radio') expect(input.checked).toBe(false);
      else expect(input.value).toBe('');
    }
  });

  it('[F1.8 c7][AC-088][VAL-003] step 2 has a password field with the show/hide control, the consent box and no email field', async () => {
    const w = world();
    await googleToCompletion(w);
    await throughStep1(userEvent.setup());
    expect(passwordField()).toHaveAttribute('type', 'password');
    expect(screen.queryByRole('textbox', { name: 'אימייל' })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'הצגת הסיסמה' }));
    expect(passwordField()).toHaveAttribute('type', 'text');
    expect(consentBox()).not.toBeChecked();
  });

  it.each([PASSWORD_MIN_LENGTH - 1, PASSWORD_MAX_LENGTH + 1])(
    '[F1.8 c7][VAL-003] a %i-character password with the consent ticked: the final action is enabled, pressing shows the password error and sends nothing',
    async (length) => {
      const w = world();
      await googleToCompletion(w);
      const u = userEvent.setup();
      await throughStep1(u);
      fireEvent.change(passwordField(), { target: { value: 'a1'.repeat(length).slice(0, length) } });
      await u.click(consentBox());
      expect(isDisabled(finalButton())).toBe(false);
      await u.click(finalButton());
      const describedBy = passwordField().getAttribute('aria-describedby') ?? '';
      expect(describedBy).not.toBe('');
      const text = describedBy.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      expect(text.length).toBeGreaterThan(0);
      if (length < PASSWORD_MIN_LENGTH) expect(text).toContain(PW_LENGTH);
      await settle();
      expect(w.events).toEqual([]);
      expect(w.passwordBodies).toEqual([]);
      expect(w.registerBodies).toEqual([]);
    },
  );

  it.each([PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH])('[F1.8 c7][VAL-003] a %i-character password with the consent ticked is accepted: the server password call then register', async (length) => {
    const w = world();
    await googleToCompletion(w);
    const u = userEvent.setup();
    await throughStep1(u);
    fireEvent.change(passwordField(), { target: { value: 'a1'.repeat(length).slice(0, length) } });
    await u.click(consentBox());
    await u.click(finalButton());
    await waitFor(() => expect(w.events).toEqual(['setPassword', 'register']));
  });

  it('[F1.8 c7][AC-088] a valid password without the consent: the final action is enabled, pressing shows the consent error linked by aria-describedby, and sends nothing', async () => {
    const w = world();
    await googleToCompletion(w);
    const u = userEvent.setup();
    await throughStep1(u);
    await u.type(passwordField(), SENTINEL_PW);
    expect(isDisabled(finalButton())).toBe(false);
    await u.click(finalButton());
    await screen.findByText(NO_CONSENT);
    expect(consentBox()).toHaveAccessibleDescription(expect.stringContaining(NO_CONSENT));
    await settle();
    expect(w.events).toEqual([]);
    expect(w.registerBodies).toEqual([]);
  });

  it('[F1.8 c7][AC-088][VAL-003] a 7-character password and no consent: both errors show at once, each linked by aria-describedby, nothing is sent', async () => {
    const w = world();
    await googleToCompletion(w);
    const u = userEvent.setup();
    await throughStep1(u);
    fireEvent.change(passwordField(), { target: { value: 'a1b2c3d' } });
    await u.click(finalButton());
    await screen.findByText(NO_CONSENT);
    await screen.findByText(PW_LENGTH);
    expect(passwordField()).toHaveAccessibleDescription(expect.stringContaining(PW_LENGTH));
    expect(consentBox()).toHaveAccessibleDescription(expect.stringContaining(NO_CONSENT));
    await settle();
    expect(w.events).toEqual([]);
    expect(w.passwordBodies).toEqual([]);
    expect(w.registerBodies).toEqual([]);
  });

  it('[F1.8 c7][VAL-003] a too-short password shows the same error copy as the email path', async () => {
    const w = world();
    await googleToCompletion(w);
    const u = userEvent.setup();
    await throughStep1(u);
    await u.type(passwordField(), 'short1');
    await u.tab();
    expect(await screen.findByText(PW_LENGTH)).toBeInTheDocument();
  });
});

describe('F1.8 c8 / F2.0-a c16 ordering: POST /api/password/first first, then register [FR-REG-004][AC-088][FR-AUTH-005]', () => {
  it('[F1.8 c8] register is not sent while the server password call is pending; after it resolves register follows and the body has no password', async () => {
    const w = world({ puts: ['pending'] });
    await googleToCompletion(w);
    const u = userEvent.setup();
    await throughStep1(u);
    await u.type(passwordField(), SENTINEL_PW);
    await u.click(consentBox());
    await u.click(finalButton());
    await waitFor(() => expect(w.events).toEqual(['setPassword']));
    await settle();
    expect(w.events).toEqual(['setPassword']);
    await act(async () => {
      w.releasePending.forEach((r) => r());
      await Promise.resolve();
    });
    await waitFor(() => expect(w.events).toEqual(['setPassword', 'register']));
    expect(JSON.parse(w.passwordBodies[0] ?? '{}')).toEqual({ password: SENTINEL_PW });
    expect(w.passwordAuth[0], 'the call carries the signed-in user\'s access token').toMatch(/^Bearer .+/);
    expect(w.authPasswordPuts, 'F2.0-a c13: the browser never sets a password through Auth').toEqual([]);
    expect(w.registerBodies[0]).not.toContain(SENTINEL_PW);
    expect(w.registerBodies[0]).not.toMatch(/password/i);
    expect(await screen.findByRole('heading', { level: 1, name: 'הפיד' })).toBeInTheDocument();
  });

  it('[F1.8 c8][F2.0-a c16] the server password call fails (503): register is never sent, the user stays on step 2 with the generic text, the password is empty and the consent is kept', async () => {
    const w = world({ puts: ['fail'] });
    await googleToCompletion(w);
    const u = userEvent.setup();
    await throughStep1(u);
    await u.type(passwordField(), SENTINEL_PW);
    await u.click(consentBox());
    await u.click(finalButton());
    await waitFor(() => expect(screen.queryAllByRole('alert').some((a) => (a.textContent ?? '').includes(GENERIC))).toBe(true));
    await settle();
    expect(w.events).toEqual(['setPassword']);
    expect(path()).toBe('/register');
    expect(passwordField()).toHaveValue('');
    expect(consentBox()).toBeChecked();
    await u.click(screen.getByRole('button', { name: 'חזרה' }));
    expect(await fullName()).toHaveValue('דנה כהן');
  });
});

describe('F1.8 c9 a failed register can be retried [FR-REG-004]', () => {
  it.each([
    ['503', 503 as const],
    ['500', 500 as const],
    ['a network failure', 'throw' as const],
  ])('[F1.8 c9] register fails with %s: still in completion with an error; the retry sets the password again, then registers; a retry after the failed registration succeeds', async (_label, failure) => {
    const w = world({ puts: ['ok', 'ok'], registers: [failure, 201] });
    await googleToCompletion(w);
    const u = userEvent.setup();
    await throughStep1(u);
    await u.type(passwordField(), SENTINEL_PW);
    await u.click(consentBox());
    await u.click(finalButton());
    await waitFor(() => expect(screen.queryAllByRole('alert').length).toBeGreaterThan(0));
    expect(w.events).toEqual(['setPassword', 'register']);
    expect(path()).toBe('/register');
    const pw = passwordField();
    if (pw instanceof HTMLInputElement && pw.value === '') await u.type(pw, SENTINEL_PW);
    const box = consentBox();
    if (box instanceof HTMLInputElement && !box.checked) await u.click(box);
    await u.click(finalButton());
    expect(await screen.findByRole('heading', { level: 1, name: 'הפיד' })).toBeInTheDocument();
    expect(w.events).toEqual(['setPassword', 'register', 'setPassword', 'register']);
  });

  it('[F1.8 c9] the password is never in web storage, the URL, a register body or the console', async () => {
    const w = world({ registers: [503, 201] });
    await googleToCompletion(w);
    const u = userEvent.setup();
    await throughStep1(u);
    await u.type(passwordField(), SENTINEL_PW);
    await u.click(consentBox());
    await u.click(finalButton());
    await waitFor(() => expect(w.events).toContain('register'));
    await settle();
    const webStorage = [window.localStorage, window.sessionStorage].flatMap((s) =>
      Array.from({ length: s.length }, (_, i) => s.getItem(s.key(i) ?? '') ?? ''),
    );
    const stored = [...w.map.values(), ...webStorage].join('|');
    expect(stored).not.toContain(SENTINEL_PW);
    expect(window.location.href).not.toContain(SENTINEL_PW);
    expect(w.registerBodies.join('|')).not.toContain(SENTINEL_PW);
    expect(JSON.stringify(logs)).not.toContain(SENTINEL_PW);
  });
});

describe('F1.8 c10 the email is the Auth user\'s, read-only; an email+password orphan has no password step [FR-REG-004][AC-100]', () => {
  it('[F1.8 c10] Google completion shows the Google email as text, no email input exists, and the register body has no email', async () => {
    const w = world();
    await googleToCompletion(w);
    const u = userEvent.setup();
    await throughStep1(u);
    expect(document.body.textContent).toContain(GOOGLE_EMAIL);
    expect(screen.queryByRole('textbox', { name: 'אימייל' })).toBeNull();
    for (const input of document.querySelectorAll('input')) expect(input.value).not.toBe(GOOGLE_EMAIL);
    await u.type(passwordField(), SENTINEL_PW);
    await u.click(consentBox());
    await u.click(finalButton());
    await waitFor(() => expect(w.events).toEqual(['setPassword', 'register']));
    expect(w.registerBodies[0]).not.toContain(GOOGLE_EMAIL);
  });

  it('[F1.8 c10] an email+password orphan: step 2 has no password field and no password call at all', async () => {
    const w = world({ provider: 'email' });
    mountAt('/login', w);
    const u = userEvent.setup();
    await u.type(await screen.findByRole('textbox', { name: 'אימייל' }), ORPHAN_EMAIL);
    await u.type(screen.getByLabelText('סיסמה', { exact: true }), SENTINEL_PW);
    await u.click(screen.getByRole('button', { name: 'התחברות' }));
    await waitFor(() => expect(path()).toBe('/register'));
    await throughStep1(u);
    expect(screen.queryByLabelText('סיסמה', { exact: true })).toBeNull();
    await u.click(consentBox());
    await u.click(screen.getByRole('button', { name: 'יצירת חשבון' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'הפיד' })).toBeInTheDocument();
    expect(w.passwordBodies).toEqual([]);
    expect(w.authPasswordPuts).toEqual([]);
    expect(w.events).toEqual(['register']);
  });
});

describe('F1.8 c11 no protected route before the account exists [FR-AUTH-004][AC-100]', () => {
  it.each(['/feed', '/', '/settings', '/profile', '/login', '/auth/google', '/recovery'])(
    '[F1.8 c11] decideAccess: signed in with no account at %s leads to /register',
    (p) => {
      expect(decideAccess('signed-in-no-account', p)).toEqual({ kind: 'redirect', to: '/register' });
    },
  );

  it.each(['/feed', '/settings'])('[F1.8 c11][AC-100] a Google user with no account opening %s lands on /register completion; after a failed register a reload does too', async (p) => {
    const w = world({ registers: [503] });
    const first = await googleToCompletion(w);
    const u = userEvent.setup();
    await throughStep1(u);
    await u.type(passwordField(), SENTINEL_PW);
    await u.click(consentBox());
    await u.click(finalButton());
    await waitFor(() => expect(screen.queryAllByRole('alert').length).toBeGreaterThan(0));
    // A reload: a new app over the same storage, asked for a protected URL.
    first.unmount();
    mountAt(p, w);
    await waitFor(() => expect(path()).toBe('/register'));
    expect(screen.queryByRole('heading', { level: 1, name: /^(פיד|הפיד|הגדרות|בית|פרופיל)$/ })).toBeNull();
    await fullName();
  });
});
