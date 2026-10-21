// F1.5 part c criterion 16 (component + route stub): completing an unfinished registration for a signed-in Auth user with no account.
// Derived from spec.md criterion 16 (DR-2 A) and interface.md "part c" only.
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PASSWORD, STOPPED, WELCOME, flush, mountApp, path, user, waitAlert } from './login-helpers';
import type { MountOptions } from './login-helpers';

afterEach(() => vi.restoreAllMocks());

const CONSENT_LABEL = 'אישור תנאי השימוש ומדיניות הפרטיות, והצהרה על גיל 18 ומעלה';
const NO_CONSENT = 'יש לאשר את התנאים ואת הצהרת הגיל כדי להמשיך';
const RETRY = 'השמירה לא הצליחה. אפשר לנסות שוב';
const h1 = () => screen.getByRole('heading', { level: 1 });
const hasCredentialFields = () => screen.queryByRole('textbox', { name: 'אימייל' }) !== null || screen.queryByLabelText('סיסמה', { exact: true }) !== null;

function stubRegister(...statuses: Array<number | 'throw'>) {
  const queue = [...statuses];
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next === 'throw') return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(new Response(next === 201 ? '{"status":"created"}' : '{"error":"x"}', { status: next ?? 201 }));
  });
}

async function toCompletion(over: MountOptions = {}, at = '/feed') {
  const m = mountApp(at, { restore: 'session', outcomes: ['unregistered'], ...over });
  await waitFor(() => expect(path()).toBe('/register'));
  await screen.findByRole('heading', { level: 1, name: 'השלמת ההרשמה' });
  return m;
}

async function throughStep1(u: ReturnType<typeof user>) {
  await u.click(within(screen.getByRole('group', { name: 'השלב במסע' })).getByRole('checkbox', { name: /מתכננים/ }));
  await u.type(screen.getByLabelText(/^שם מלא/), 'דנה כהן');
  await u.click(screen.getByRole('button', { name: 'המשך' }));
  await screen.findByRole('checkbox', { name: CONSENT_LABEL });
}
const consentBox = () => screen.getByRole('checkbox', { name: CONSENT_LABEL });
const finish = async (u: ReturnType<typeof user>) => {
  await u.click(consentBox());
  await u.click(screen.getByRole('button', { name: 'יצירת חשבון' }));
};

describe('[F1.5 c16][FR-REG-004] the completion screen', () => {
  it('[c16] unregistered: no feed; /register opens with "השלמת ההרשמה", the explanation, step 1 as F1.3, no email or password field', async () => {
    const m = await toCompletion();
    expect(h1()).toHaveTextContent('השלמת ההרשמה');
    expect(screen.getByText('ההרשמה הקודמת לא הסתיימה. עוד רגע מסיימים.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^שם מלא/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'המשך' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'התנתקות' })).toBeInTheDocument();
    expect(hasCredentialFields()).toBe(false);
    expect(document.title).toBe('השלמת ההרשמה · Nestly');
    expect(m.seen).toEqual([]);
    m.stop();
  });

  it('[c16] the consent-only step: only the checkbox, "יצירת חשבון", no email or password field; unticked submit sends nothing and focuses the checkbox', async () => {
    const fetchSpy = stubRegister(201);
    const m = await toCompletion();
    const u = user();
    await throughStep1(u);
    expect(h1()).toHaveTextContent('השלמת ההרשמה');
    expect(screen.getByText('עוד רגע מסיימים.')).toBeInTheDocument();
    expect(hasCredentialFields()).toBe(false);
    expect(screen.getByRole('button', { name: 'התנתקות' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'יצירת חשבון' }));
    expect(await screen.findByText(NO_CONSENT)).toBeInTheDocument();
    expect(consentBox()).toHaveFocus();
    expect(fetchSpy).not.toHaveBeenCalled();
    m.stop();
  });

  it('[c16] a reload keeps the user in completion: step 1 again, never email or password fields', async () => {
    const m1 = await toCompletion();
    m1.stop();
    m1.view.unmount();
    const m2 = await toCompletion({}, '/register');
    expect(h1()).toHaveTextContent('השלמת ההרשמה');
    expect(screen.getByLabelText(/^שם מלא/)).toBeInTheDocument();
    expect(hasCredentialFields()).toBe(false);
    m2.stop();
  });
});

const urlOf = (u: Parameters<typeof fetch>[0]): string => (typeof u === 'string' ? u : u instanceof URL ? u.href : u instanceof Request ? u.url : '');

describe('[F1.5 c16] submitting the completion', () => {
  it('[c16][AC-091] 201: POST /api/register with the held session and no sign-up; then /feed; the body carries step 1 and consent, never email or password', async () => {
    const fetchSpy = stubRegister(201);
    const m = await toCompletion();
    const u = user();
    await throughStep1(u);
    await finish(u);
    expect(await screen.findByRole('heading', { level: 1, name: 'הפיד' })).toBeInTheDocument();
    expect(path()).toBe('/feed');
    const registerCalls = fetchSpy.mock.calls.filter(([u]) => urlOf(u).includes('/api/register')); // the feed then asks /api/profile (F3.1b)
    expect(registerCalls).toHaveLength(1);
    const [url, init] = registerCalls[0] ?? [];
    const target = typeof url === 'string' ? url : url instanceof URL ? url.href : url instanceof Request ? url.url : '';
    expect(target).toContain('/api/register');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer tok');
    const raw = typeof init?.body === 'string' ? init.body : '';
    const body: unknown = JSON.parse(raw);
    expect(body).toMatchObject({ stages: ['planning'], fullName: 'דנה כהן', consent: true });
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('password');
    expect(raw).not.toContain(PASSWORD);
    expect(m.signUp).not.toHaveBeenCalled();
    m.stop();
  });

  it('[c16] 409 then /api/me says active: /feed', async () => {
    stubRegister(409);
    const m = await toCompletion({ outcomes: ['unregistered', 'active'] });
    const u = user();
    await throughStep1(u);
    await finish(u);
    expect(await screen.findByRole('heading', { level: 1, name: 'הפיד' })).toBeInTheDocument();
    expect(m.accountState).toHaveBeenCalledTimes(2);
    m.stop();
  });

  it('[c16][c8] 409 then /api/me says unavailable: the session ends and /login shows the stopped text; no feed', async () => {
    stubRegister(409);
    const m = await toCompletion({ outcomes: ['unregistered', 'unavailable'] });
    const u = user();
    await throughStep1(u);
    await finish(u);
    await waitFor(() => expect(path()).toBe('/login'));
    await waitAlert(STOPPED);
    expect(m.signOut).toHaveBeenCalled();
    expect(m.seen).toEqual([]);
    m.stop();
  });

  it('[c16] 409 and the server cannot answer the re-check: the save-failed alert, and the user may submit again', async () => {
    const fetchSpy = stubRegister(409, 201);
    const m = await toCompletion({ outcomes: ['unregistered', 'unreachable', 'active'] });
    const u = user();
    await throughStep1(u);
    await finish(u);
    await waitAlert(RETRY);
    expect(path()).toBe('/register');
    await u.click(screen.getByRole('button', { name: 'יצירת חשבון' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'הפיד' })).toBeInTheDocument();
    expect(fetchSpy.mock.calls.filter(([u]) => urlOf(u).includes('/api/register'))).toHaveLength(2);
    m.stop();
  });

  it('[c16] 401: signed out, /login, no notice and no feed', async () => {
    stubRegister(401);
    const m = await toCompletion();
    const u = user();
    await throughStep1(u);
    await finish(u);
    await waitFor(() => expect(path()).toBe('/login'));
    await flush();
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(m.signOut).toHaveBeenCalled();
    expect(m.seen).toEqual([]);
    m.stop();
  });

  it.each([
    ['503', 503],
    ['a network failure', 'throw' as const],
  ])('[c16] %s: the save-failed alert, still in completion, nothing signed out', async (_label, outcome) => {
    stubRegister(outcome);
    const m = await toCompletion();
    const u = user();
    await throughStep1(u);
    await finish(u);
    await waitAlert(RETRY);
    expect(path()).toBe('/register');
    expect(m.signOut).not.toHaveBeenCalled();
    m.stop();
  });

  it('[c16] a double activation of "יצירת חשבון" sends one request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));
    const m = await toCompletion();
    const u = user();
    await throughStep1(u);
    await u.click(consentBox());
    const button = screen.getByRole('button', { name: 'יצירת חשבון' });
    await u.click(button);
    await u.click(button);
    await act(async () => void (await Promise.resolve()));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    m.stop();
  });
});

describe('[F1.5 c14][c16][CRITIC c1] a sign-out during a pending POST /api/register is not undone by its 201', () => {
  async function pendingSubmit() {
    let resolveRegister: (r: Response) => void = () => undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveRegister = resolve;
        }),
    );
    const m = await toCompletion();
    const u = user();
    await throughStep1(u);
    await u.click(consentBox());
    await u.click(screen.getByRole('button', { name: 'יצירת חשבון' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'יצירת חשבון' })).toHaveAttribute('aria-busy', 'true'));
    return { m, u, created: () => resolveRegister(new Response('{"status":"created"}', { status: 201 })) };
  }

  it('[c14] "התנתקות" while the request runs, then 201: still signed out on /, no shell ever rendered after the logout, no web storage', async () => {
    const { m, u, created } = await pendingSubmit();
    await u.click(screen.getByRole('button', { name: 'התנתקות' }));
    expect(await screen.findByRole('heading', { level: 1, name: WELCOME })).toBeInTheDocument();
    m.seen.length = 0;
    await act(async () => {
      created();
      await Promise.resolve();
    });
    await flush();
    await flush();
    expect(path()).toBe('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(WELCOME);
    expect(screen.queryByRole('navigation', { name: 'ניווט ראשי' })).not.toBeInTheDocument();
    expect(m.seen).toEqual([]);
    expect(window.localStorage.length).toBe(0);
    m.stop();
  });

  it('[c12/c14] another tab removing the session while the request runs, then 201: signed out, no shell, no protected render', async () => {
    const { m, created } = await pendingSubmit();
    await m.removedElsewhere();
    m.seen.length = 0;
    await act(async () => {
      created();
      await Promise.resolve();
    });
    await flush();
    await flush();
    expect(path()).not.toBe('/feed');
    expect(screen.queryByRole('navigation', { name: 'ניווט ראשי' })).not.toBeInTheDocument();
    expect(m.seen).toEqual([]);
    expect(window.localStorage.length).toBe(0);
    m.stop();
  });
});

describe('[F1.5 c15] completion state and the Guest documents (Amendment 1)', () => {
  it.each(['/terms', '/privacy'])('%s renders in completion and is not redirected to /register', async (p) => {
    const m = mountApp(p, { restore: 'session', outcomes: ['unregistered'] });
    await flush();
    await flush();
    expect(path()).toBe(p);
    expect(screen.queryByRole('heading', { level: 1, name: 'השלמת ההרשמה' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    m.stop();
  });
});

describe('[F1.5 c16][FR-MENU-001] logout from completion', () => {
  it('[c16] "התנתקות" on step 1 ends the session and leads to / (Welcome) with no notice', async () => {
    const m = await toCompletion();
    await user().click(screen.getByRole('button', { name: 'התנתקות' }));
    expect(await screen.findByRole('heading', { level: 1, name: WELCOME })).toBeInTheDocument();
    expect(path()).toBe('/');
    expect(m.signOut).toHaveBeenCalledTimes(1);
    m.stop();
  });

  it('[c16] "התנתקות" on the consent step does the same', async () => {
    const m = await toCompletion();
    const u = user();
    await throughStep1(u);
    await u.click(screen.getByRole('button', { name: 'התנתקות' }));
    expect(await screen.findByRole('heading', { level: 1, name: WELCOME })).toBeInTheDocument();
    expect(m.signOut).toHaveBeenCalledTimes(1);
    m.stop();
  });

  it('[c15/c16] in completion every other path leads back to /register', async () => {
    for (const p of ['/feed', '/login', '/']) {
      const m = await toCompletion({}, p);
      expect(path()).toBe('/register');
      m.stop();
      m.view.unmount();
    }
  });
});

describe('[I11 follow-ups FR-REG-004 AC-100] a Professional account from "complete registration"', () => {
  it('the Professional form, the required declaration and the consent: POST /api/register/professional with the held session, never email or password', async () => {
    const fetchSpy = stubRegister(201);
    const m = await toCompletion();
    const u = user();
    await u.click(screen.getByRole('button', { name: 'נרשמים כבעלי מקצוע? להרשמה לחשבון מקצועי' }));
    await screen.findByRole('heading', { level: 1, name: 'פרטים מקצועיים' });
    await u.type(screen.getByLabelText(/^שם מלא/), 'דנה דולה');
    await u.selectOptions(screen.getByLabelText(/^תחום/), 'doula');
    await u.type(screen.getByLabelText(/^שנות ניסיון/), '9');
    await u.click(screen.getByRole('button', { name: 'המשך' }));
    expect(await screen.findByText('יש לאשר את ההצהרה כדי להמשיך')).toBeInTheDocument();
    await u.click(screen.getByRole('checkbox', { name: 'הצהרה: יש לי ההכשרה והרישיון הנדרשים בתחום שבחרתי' }));
    await u.click(screen.getByRole('button', { name: 'המשך' }));
    await screen.findByRole('checkbox', { name: CONSENT_LABEL });
    expect(hasCredentialFields()).toBe(false);
    await finish(u);
    await waitFor(() => expect(fetchSpy.mock.calls.some(([target]) => urlOf(target).includes('/api/register/professional'))).toBe(true));
    const [, init] = fetchSpy.mock.calls.find(([target]) => urlOf(target).includes('/api/register/professional')) ?? [];
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer tok');
    const body: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '');
    expect(body).toMatchObject({ fullName: 'דנה דולה', field: 'doula', yearsExperience: 9, consent: true, qualification: true });
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('password');
    expect(fetchSpy.mock.calls.some(([target]) => urlOf(target).endsWith('/api/register'))).toBe(false);
    expect(m.signUp).not.toHaveBeenCalled();
    m.stop();
  });
});
