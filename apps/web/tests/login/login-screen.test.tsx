// F1.5 part c, component level (the screen side of criteria 5, 6, 8, 11, and 18, 19). Whole <App> over the real session source with
// a fake Auth port. Derived from spec.md and interface.md "part c" only.
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMAIL,
  EXPIRED,
  FAILED,
  GENERIC,
  INVALID,
  RATE,
  STOPPED,
  emailField,
  failureAnswer,
  fillLogin,
  flush,
  mountApp,
  okAnswer,
  onLoginScreen,
  passwordField,
  path,
  submitButton,
  submitLogin,
  user,
  waitAlert,
} from './login-helpers';
import type { SignInAnswer } from './login-helpers';

afterEach(() => vi.restoreAllMocks());

const alerts = () => screen.queryAllByRole('alert');
const messageBox = () => screen.getByRole('alert').parentElement;
// React's generated ids differ between mounts; they are not content.
const mainHtml = () => screen.getByRole('main').innerHTML.replace(/_r_[0-9a-z]+_/g, 'ID');

describe('[F1.5 c5][ERR-001] wrong credentials: one text, identical DOM, nothing leaks', () => {
  it('[c5] the ERR-001 text in a role=alert; no session; /api/me never called; email kept, password cleared, focus on the message', async () => {
    const m = await onLoginScreen({ signIn: failureAnswer({ status: 400, code: 'invalid_credentials', name: 'AuthApiError' }) });
    const u = user();
    await submitLogin(u);
    await waitAlert(INVALID);
    expect(alerts()).toHaveLength(1);
    expect(m.accountState).not.toHaveBeenCalled();
    expect(path()).toBe('/login');
    expect(emailField()).toHaveValue(EMAIL);
    expect(passwordField()).toHaveValue('');
    const box = messageBox();
    expect(box).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(box));
    // The text names neither field.
    expect(screen.getByRole('alert').textContent).not.toMatch(/אימייל בלבד|הסיסמה בלבד/);
    m.stop();
  });

  it('[c5] wrong password, unknown email, unconfirmed, banned: the whole main renders byte-identically', async () => {
    const codes = ['invalid_credentials', 'user_not_found', 'email_not_confirmed', 'user_banned'];
    const htmls: string[] = [];
    for (const code of codes) {
      const m = await onLoginScreen({ signIn: failureAnswer({ status: 400, code, name: 'AuthApiError' }) });
      await submitLogin(user());
      await waitAlert(INVALID);
      await flush();
      htmls.push(mainHtml());
      expect(m.accountState).not.toHaveBeenCalled();
      m.stop();
      m.view.unmount();
    }
    expect(new Set(htmls).size).toBe(1);
  });

  it('[c5] a second wrong attempt still shows exactly one message and keeps the email', async () => {
    const m = await onLoginScreen({ signIn: failureAnswer({ status: 400, code: 'invalid_credentials', name: 'AuthApiError' }) });
    const u = user();
    await submitLogin(u);
    await waitAlert(INVALID);
    await u.type(passwordField(), 'another wrong one');
    await u.click(submitButton());
    await waitFor(() => expect(m.signIn).toHaveBeenCalledTimes(2));
    await flush();
    expect(alerts()).toHaveLength(1);
    expect(emailField()).toHaveValue(EMAIL);
    expect(passwordField()).toHaveValue('');
    m.stop();
  });
});

describe('[F1.5 c6][ERR-001] the other sign-in failures: three texts, never an Auth or server string', () => {
  const AUTH_SECRETS = ['over_request_rate_limit', 'weird_code', 'AuthApiError', 'AuthRetryableFetchError', 'SECRET_RAW', 'fetch'];
  const cases: Array<[string, SignInAnswer | (() => Promise<SignInAnswer>), string]> = [
    ['429', failureAnswer({ status: 429, name: 'AuthApiError' }), RATE],
    ['over_request_rate_limit on a 400', failureAnswer({ status: 400, code: 'over_request_rate_limit', name: 'AuthApiError' }), RATE],
    ['a network error', failureAnswer({ status: 0, name: 'AuthRetryableFetchError' }), FAILED],
    ['a 500', failureAnswer({ status: 500, code: 'unexpected_failure', name: 'AuthApiError' }), FAILED],
    ['a 503', failureAnswer({ status: 503, name: 'AuthRetryableFetchError' }), FAILED],
    ['a rejected promise', () => Promise.reject(new Error('SECRET_RAW fetch exploded')), FAILED],
    ['an unknown 4xx code', failureAnswer({ status: 400, code: 'weird_code', name: 'AuthApiError' }), GENERIC],
  ];
  it.each(cases)('[c6] %s', async (_label, signIn, text) => {
    const m = await onLoginScreen({ signIn });
    await submitLogin(user());
    await waitAlert(text);
    expect(alerts()).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(text);
    const body = document.body.textContent ?? '';
    for (const secret of AUTH_SECRETS) expect(body).not.toContain(secret);
    expect(path()).toBe('/login');
    expect(m.accountState).not.toHaveBeenCalled();
    m.stop();
  });

  it.each(['unauthenticated', 'unreachable', 'failed'] as const)('[c9 screen] /api/me %s after Auth accepted: the sign-in-failed text, still on /login', async (bad) => {
    const m = await onLoginScreen({ signIn: okAnswer, outcomes: [bad] });
    await submitLogin(user());
    await waitAlert(FAILED);
    expect(path()).toBe('/login');
    expect(m.seen).toEqual([]);
    m.stop();
  });
});

describe('[F1.5 c8][FR-MOD-002] a stopped account at sign-in', () => {
  it('[c8] the stopped text in a role=alert, the session ended, still on /login, no shell or protected heading ever rendered', async () => {
    const m = await onLoginScreen({ signIn: okAnswer, outcomes: ['unavailable'] });
    await submitLogin(user());
    await waitAlert(STOPPED);
    expect(screen.getByRole('alert')).toHaveTextContent(STOPPED);
    expect(m.signOut).toHaveBeenCalled();
    expect(path()).toBe('/login');
    expect(m.seen).toEqual([]);
    expect(screen.queryByRole('navigation', { name: 'ניווט ראשי' })).not.toBeInTheDocument();
    m.stop();
  });

  it('[c8] suspended and banned give the same DOM (the server answers one state)', async () => {
    const htmls: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const m = await onLoginScreen({ signIn: okAnswer, outcomes: ['unavailable'] });
      await submitLogin(user());
      await waitAlert(STOPPED);
      await flush();
      htmls.push(mainHtml());
      m.stop();
      m.view.unmount();
    }
    expect(htmls[0]).toBe(htmls[1]);
  });

  it('[c8] a wrong password never reaches the stopped text, even when the account is stopped', async () => {
    const m = await onLoginScreen({ signIn: failureAnswer({ status: 400, code: 'invalid_credentials' }), outcomes: ['unavailable'] });
    await submitLogin(user());
    await waitAlert(INVALID);
    expect(document.body.textContent).not.toContain(STOPPED);
    m.stop();
  });

  it('[c8][c13 screen] a stopped account noticed on a visible tab: /login with the stopped text; nothing protected afterwards', async () => {
    const m = mountApp('/feed', { restore: 'session', outcomes: ['active', 'unavailable'] });
    await screen.findByRole('heading', { level: 1, name: 'הפיד' });
    m.advance(61_000);
    await m.tabVisible();
    await waitFor(() => expect(path()).toBe('/login'));
    await waitAlert(STOPPED);
    expect(screen.queryByRole('navigation', { name: 'ניווט ראשי' })).not.toBeInTheDocument();
    m.stop();
  });

  it('[c8] the last attempt wins over an older notice: stopped, then wrong password shows only ERR-001', async () => {
    const m = mountApp('/feed', { restore: 'session', outcomes: ['active', 'unavailable'], signIn: failureAnswer({ status: 400, code: 'invalid_credentials' }) });
    await screen.findByRole('heading', { level: 1, name: 'הפיד' });
    m.advance(61_000);
    await m.tabVisible();
    await waitAlert(STOPPED);
    await submitLogin(user());
    await waitAlert(INVALID);
    expect(alerts()).toHaveLength(1);
    expect(document.body.textContent).not.toContain(STOPPED);
    m.stop();
  });
});

describe('[F1.5 c11] an expired session ends on /login with its text', () => {
  it('[c11] a stored session whose refresh Auth refuses, opened on a protected path: /login, the expired text in a role=alert, no protected render', async () => {
    const m = mountApp('/feed', { restore: 'refused' });
    await waitFor(() => expect(path()).toBe('/login'));
    await waitAlert(EXPIRED);
    expect(m.seen).toEqual([]);
    m.stop();
  });

  it('[c11] opened directly on /login the same text shows', async () => {
    const m = mountApp('/login', { restore: 'refused' });
    await waitAlert(EXPIRED);
    expect(path()).toBe('/login');
    m.stop();
  });

  it('[c11] no stored session at all: no expired text', async () => {
    const m = await onLoginScreen({ restore: 'none' });
    expect(alerts()).toHaveLength(0);
    m.stop();
  });

  it('[c11] after the expired notice a new sign-in lands on /feed', async () => {
    const m = mountApp('/login', { restore: 'refused', signIn: okAnswer, outcomes: ['active'] });
    await waitAlert(EXPIRED);
    await submitLogin(user());
    expect(await screen.findByRole('heading', { level: 1, name: 'הפיד' })).toBeInTheDocument();
    expect(path()).toBe('/feed');
    m.stop();
  });
});

describe('[F1.5 c18][FR-AUTH-002][VAL-002] the fields', () => {
  it('[c18] h1, title, controls and their attributes; links to /recovery and /register', async () => {
    const m = await onLoginScreen();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('התחברות');
    expect(document.title).toBe('התחברות · Nestly');
    expect(emailField()).toHaveAttribute('type', 'email');
    expect(emailField()).toHaveAttribute('dir', 'ltr');
    expect(emailField()).toHaveAttribute('autocomplete', 'username');
    expect(passwordField()).toHaveAttribute('type', 'password');
    expect(passwordField()).toHaveAttribute('dir', 'ltr');
    expect(passwordField()).toHaveAttribute('autocomplete', 'current-password');
    expect(submitButton()).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('link', { name: 'שכחתי סיסמה' })).toHaveAttribute('href', '/recovery');
    expect(screen.getByRole('link', { name: 'יצירת חשבון חדש' })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'חזרה' })).toHaveAttribute('href', '/');
    m.stop();
  });

  it('[c18] the password toggle has aria-pressed and flips the input type', async () => {
    const m = await onLoginScreen();
    const u = user();
    const toggle = screen.getByRole('button', { name: 'הצגת הסיסמה' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await u.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(passwordField()).toHaveAttribute('type', 'text');
    await u.click(toggle);
    expect(passwordField()).toHaveAttribute('type', 'password');
    m.stop();
  });

  it('[c18][NFR-USAB-003] DOM order is the visual and focus order', async () => {
    const m = await onLoginScreen();
    const order = [
      screen.getByRole('link', { name: 'חזרה' }),
      emailField(),
      passwordField(),
      screen.getByRole('button', { name: 'הצגת הסיסמה' }),
      screen.getByRole('link', { name: 'שכחתי סיסמה' }),
      submitButton(),
      screen.getByRole('link', { name: 'יצירת חשבון חדש' }),
    ];
    for (let i = 1; i < order.length; i += 1) {
      const a = order[i - 1];
      const b = order[i];
      expect(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0, `element ${i} follows ${i - 1}`).toBe(true);
    }
    m.stop();
  });

  it('[c18] no error text before the first submit, even after focusing and leaving a field', async () => {
    const m = await onLoginScreen();
    const u = user();
    await u.click(emailField());
    await u.tab();
    await u.tab();
    expect(screen.queryByText('יש למלא כתובת אימייל')).not.toBeInTheDocument();
    expect(screen.queryByText('יש למלא סיסמה')).not.toBeInTheDocument();
    expect(emailField()).not.toHaveAttribute('aria-invalid', 'true');
    m.stop();
  });

  it('[c18] an empty submit: both required errors, linked by aria-describedby, focus on the first invalid field, no request', async () => {
    const m = await onLoginScreen();
    await user().click(submitButton());
    const e1 = (await screen.findByText('יש למלא כתובת אימייל')).closest('[id]') ?? document.body;
    const e2 = (await screen.findByText('יש למלא סיסמה')).closest('[id]') ?? document.body;
    expect(emailField()).toHaveAttribute('aria-invalid', 'true');
    expect(passwordField()).toHaveAttribute('aria-invalid', 'true');
    expect(emailField().getAttribute('aria-describedby') ?? '').toContain(e1.id);
    expect(passwordField().getAttribute('aria-describedby') ?? '').toContain(e2.id);
    expect(e1.id).not.toBe('');
    expect(emailField()).toHaveFocus();
    expect(m.signIn).not.toHaveBeenCalled();
    m.stop();
  });

  it('[c18] a malformed email: the invalid-email text; with a valid email and an empty password focus goes to the password', async () => {
    const m = await onLoginScreen();
    const u = user();
    await u.type(emailField(), 'not-an-email');
    await u.type(passwordField(), 'x');
    await u.click(submitButton());
    expect(await screen.findByText('כתובת האימייל אינה תקינה')).toBeInTheDocument();
    expect(emailField()).toHaveFocus();
    expect(m.signIn).not.toHaveBeenCalled();
    await u.clear(emailField());
    await u.type(emailField(), EMAIL_OK);
    await u.clear(passwordField());
    await u.click(submitButton());
    expect(await screen.findByText('יש למלא סיסמה')).toBeInTheDocument();
    expect(passwordField()).toHaveFocus();
    expect(m.signIn).not.toHaveBeenCalled();
    m.stop();
  });

  it('[c18][Q4] the password is not length-checked: a one-character password reaches Auth', async () => {
    const m = await onLoginScreen({ signIn: failureAnswer({ status: 400, code: 'invalid_credentials' }) });
    await submitLogin(user(), { password: 'a' });
    await waitFor(() => expect(m.signIn).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/8 תווים/)).not.toBeInTheDocument();
    m.stop();
  });

  it('[c18] a very long email does not crash the screen', async () => {
    const m = await onLoginScreen({ signIn: failureAnswer({ status: 400, code: 'invalid_credentials' }) });
    const u = user();
    await u.click(emailField());
    await u.paste(`${'a'.repeat(5000)}@example.com`);
    await u.type(passwordField(), 'x');
    await u.click(submitButton());
    await flush();
    expect(screen.getByRole('heading', { level: 1, name: 'התחברות' })).toBeInTheDocument();
    m.stop();
  });
});

const EMAIL_OK = 'dana.cohen@example.com';

describe('[F1.5 c19][NFR-A11Y-001] states', () => {
  it('[c19] while the request runs: aria-busy and aria-disabled on the button, the "מתחברים" status, and a double activation sends one sign-in', async () => {
    let release: (a: SignInAnswer) => void = () => undefined;
    const pending = new Promise<SignInAnswer>((resolve) => (release = resolve));
    const m = await onLoginScreen({ signIn: () => pending });
    const u = user();
    await fillLogin(u);
    await u.click(submitButton());
    await waitFor(() => expect(submitButton()).toHaveAttribute('aria-busy', 'true'));
    expect(submitButton()).toHaveAttribute('aria-disabled', 'true');
    expect(within(screen.getByRole('main')).getAllByRole('status').some((s) => s.textContent === 'מתחברים')).toBe(true);
    await u.click(submitButton());
    await u.type(passwordField(), '{Enter}');
    expect(m.signIn).toHaveBeenCalledTimes(1);
    await act(async () => {
      release(failureAnswer({ status: 400, code: 'invalid_credentials' }));
      await Promise.resolve();
    });
    await waitAlert(INVALID);
    expect(submitButton()).not.toHaveAttribute('aria-busy', 'true');
    expect(within(screen.getByRole('main')).queryAllByRole('status').some((s) => (s.textContent ?? '') === 'מתחברים')).toBe(false);
    m.stop();
  });

  it('[c19] server-side messages come one at a time: rate limit replaces ERR-001', async () => {
    const answers = [failureAnswer({ status: 400, code: 'invalid_credentials' }), failureAnswer({ status: 429 })];
    const m = await onLoginScreen({ signIn: () => Promise.resolve(answers.shift() ?? okAnswer) });
    const u = user();
    await submitLogin(u);
    await waitAlert(INVALID);
    await u.type(passwordField(), 'again');
    await u.click(submitButton());
    await waitAlert(RATE);
    expect(alerts()).toHaveLength(1);
    expect(document.body.textContent).not.toContain(INVALID);
    m.stop();
  });
});
