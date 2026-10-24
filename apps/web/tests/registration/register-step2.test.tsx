// I1 F1.4 part c, step 2 (web), component level: the logic the E2E cannot express. Spec Revision 2 criteria 4, 5, 6, 7, 11,
// 12 (web side), 13 (web side), 19, 20 (Auth error mapping). Derived from spec.md and interface.md "part c" only.
//   - the Auth port is injected (AuthPortContext), the session entry too (SessionEntryContext); fetch is stubbed.
//   - flow: step 1 is filled (planning + a name), "המשך", then step 2 is driven.
// The Auth failure shape the mapping reads is { status, code, name } only (interface): a raw library message cannot reach the DOM.
// (Helpers are shared with register-step2-held-token.test.tsx: step2-helpers.tsx.)
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthPort, SignUpResponse } from '@/services/auth/auth-client';
import {
  BAD_EMAIL,
  EMAIL,
  GENERIC,
  NO_CONSENT,
  NO_EMAIL,
  PASSWORD,
  PW_SHORT,
  RATE,
  RETRY,
  TAKEN,
  TOKEN,
  alertWith,
  bodyOf,
  consentBox,
  emailField,
  fail,
  fillStep2,
  makePort,
  ok,
  passwordField,
  retryButton,
  stageBox,
  stubRoute,
  submit,
  submitValid,
  toStep2,
  urlOf,
  user,
  waitAlert,
} from './step2-helpers';

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------------------------------------------------
describe('F1.4 criterion 4 [FR-REG-004 · AC-084 · AC-088 · BR-068] step 2 fields and consent', () => {
  it('[FR-REG-004][AC-084] the email, password, consent and submit controls carry the specified attributes and texts', async () => {
    const { port } = makePort(ok());
    await toStep2(user(), port);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטי התחברות');
    expect(emailField()).toHaveAttribute('type', 'email');
    expect(emailField()).toHaveAttribute('autocomplete', 'email');
    expect(emailField()).toHaveAttribute('dir', 'ltr');
    expect(passwordField()).toHaveAttribute('type', 'password');
    expect(passwordField()).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByText('לפחות 8 תווים')).toBeInTheDocument();
    expect(passwordField().getAttribute('aria-describedby') ?? '').not.toBe('');
    expect(submit()).toBeInTheDocument();
  });

  it('[BR-068][AC-084] ONE required checkbox for terms, privacy and 18+, with links to the public documents that open in a new tab', async () => {
    const { port } = makePort(ok());
    await toStep2(user(), port);
    expect(consentBox()).not.toBeChecked();
    const label = consentBox().closest('label') ?? consentBox().parentElement;
    const terms = within(label ?? document.body).getByRole('link', { name: 'תנאי השימוש' });
    const privacy = within(label ?? document.body).getByRole('link', { name: 'מדיניות הפרטיות' });
    expect(terms).toHaveAttribute('href', '/terms');
    expect(privacy).toHaveAttribute('href', '/privacy');
    for (const link of [terms, privacy]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel') ?? '').toMatch(/noopener/);
      expect(link.getAttribute('rel') ?? '').toMatch(/noreferrer/);
    }
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('[AC-088][FR-REG-004] no phone, parent birth date or second password field', async () => {
    const { port } = makePort(ok());
    const { view } = await toStep2(user(), port);
    expect(view.container.querySelectorAll('input[type="password"]')).toHaveLength(1);
    expect(view.container.querySelector('input[type="tel"], input[type="date"]')).toBeNull();
    expect(screen.queryByLabelText(/טלפון|נייד|תאריך לידה|אימות סיסמה|סיסמה שנייה|הסיסמה שוב/)).toBeNull();
    expect(view.container.querySelectorAll('input[type="email"]')).toHaveLength(1);
  });

  it('[BR-068][AC-084] submitting with the box unticked stays on step 2, marks the box invalid, shows the consent text, and sends NO request', async () => {
    const u = user();
    const { port, signUp } = makePort(ok());
    const route = stubRoute(201);
    await toStep2(u, port);
    await fillStep2(u, { consent: false });
    await u.click(submit());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטי התחברות');
    expect(consentBox()).toHaveAttribute('aria-invalid', 'true');
    expect(alertWith(NO_CONSENT)).toBeDefined();
    expect(consentBox().getAttribute('aria-describedby') ?? '').not.toBe('');
    expect(signUp).not.toHaveBeenCalled();
    expect(route).not.toHaveBeenCalled();
    // ticking it clears the message
    await u.click(consentBox());
    await waitFor(() => expect(alertWith(NO_CONSENT)).toBeUndefined());
    expect(consentBox()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('[BR-068] the box is unticked on arrival (consent is never pre-ticked)', async () => {
    const { port } = makePort(ok());
    await toStep2(user(), port);
    expect(consentBox()).not.toBeChecked();
  });

  it('[NFR-SEC-001] the show/hide control toggles the password field type and reports aria-pressed', async () => {
    const u = user();
    const { port } = makePort(ok());
    await toStep2(u, port);
    const toggle = screen.getByRole('button', { name: 'הצגת הסיסמה' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await u.click(toggle);
    expect(passwordField()).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'הצגת הסיסמה' })).toHaveAttribute('aria-pressed', 'true');
    await u.click(screen.getByRole('button', { name: 'הצגת הסיסמה' }));
    expect(passwordField()).toHaveAttribute('type', 'password');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('F1.4 criterion 5 [AC-003] errors on submit', () => {
  it('[AC-003] nothing is shown before the first submit; then all three fields show their text, linked, with focus on the first invalid field', async () => {
    const u = user();
    const { port, signUp } = makePort(ok());
    await toStep2(u, port);
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    for (const el of [emailField(), passwordField(), consentBox()]) expect(el).not.toHaveAttribute('aria-invalid', 'true');

    await u.click(submit());
    expect(alertWith(NO_EMAIL)).toBeDefined();
    expect(alertWith(PW_SHORT)).toBeDefined();
    expect(alertWith(NO_CONSENT)).toBeDefined();
    for (const el of [emailField(), passwordField(), consentBox()]) {
      expect(el).toHaveAttribute('aria-invalid', 'true');
      const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
      expect(ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ')).not.toBe('');
    }
    await waitFor(() => expect(emailField()).toHaveFocus());
    expect(signUp).not.toHaveBeenCalled();
  });

  it.each([
    ['empty', '', NO_EMAIL],
    ['spaces only', '   ', NO_EMAIL],
    ['a@b (no dot in the domain)', 'a@b', BAD_EMAIL],
    ['a b@c.com (a space)', 'a b@c.com', BAD_EMAIL],
    ['no @', 'dana.example.com', BAD_EMAIL],
    ['two @', 'a@@b.co', BAD_EMAIL],
  ])('[AC-003][VAL-002] email %s -> its text and no request', async (_label, email, text) => {
    const u = user();
    const { port, signUp } = makePort(ok());
    await toStep2(u, port);
    if (email !== '') await u.type(emailField(), email);
    await u.type(passwordField(), PASSWORD);
    await u.click(consentBox());
    await u.click(submit());
    expect(alertWith(text)).toBeDefined();
    expect(emailField()).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(emailField()).toHaveFocus());
    expect(signUp).not.toHaveBeenCalled();
  });

  it('[AC-003][VAL-003] a 7-character password is refused with its text; 8 is accepted; eight spaces are accepted', async () => {
    const u = user();
    const { port, signUp } = makePort(ok());
    stubRoute(201);
    await toStep2(u, port);
    await u.type(emailField(), EMAIL);
    await u.type(passwordField(), 'abcdefg');
    await u.click(consentBox());
    await u.click(submit());
    expect(alertWith(PW_SHORT)).toBeDefined();
    expect(passwordField()).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(passwordField()).toHaveFocus());
    expect(signUp).not.toHaveBeenCalled();

    await u.type(passwordField(), 'h'); // 8 now: the message clears as the field becomes valid
    await waitFor(() => expect(alertWith(PW_SHORT)).toBeUndefined());
    await u.click(submit());
    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(signUp.mock.calls[0]?.[0]).toEqual({ email: EMAIL, password: 'abcdefgh' });
  });

  it('[VAL-003] a password of eight spaces is sent as is (not trimmed)', async () => {
    const u = user();
    const { port, signUp } = makePort(ok());
    stubRoute(201);
    await toStep2(u, port);
    await fillStep2(u, { password: '        ' });
    await u.click(submit());
    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(signUp.mock.calls[0]?.[0].password).toBe('        ');
  });

  it('[VAL-002] the email is trimmed before it is sent to Auth', async () => {
    const u = user();
    const { port, signUp } = makePort(ok());
    stubRoute(201);
    await toStep2(u, port);
    await fillStep2(u, { email: `  ${EMAIL}  ` });
    await u.click(submit());
    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(signUp.mock.calls[0]?.[0].email).toBe(EMAIL);
  });

  it('[AC-003] no Zod, Auth or server text reaches the DOM after failed submits', async () => {
    const u = user();
    const { port } = makePort(ok());
    await toStep2(u, port);
    await u.click(submit());
    expect(document.body.textContent ?? '').not.toMatch(/Invalid|Required|Expected|String must|Too (small|big)|issue|email_invalid|password_length|consent_required|unrecognized/i);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('F1.4 criterion 6/7 [ERR-002 · AC-055 · NFR-SEC-006] Auth says the email exists: one generic message, the route is not called', () => {
  const REGULAR = fail({ status: 422, code: 'user_already_exists', name: 'AuthApiError' });
  const PROFESSIONAL = fail({ status: 400, code: 'email_exists', name: 'AuthApiError' });

  async function taken(response: SignUpResponse) {
    const u = user();
    const { port, signUp } = makePort(response);
    const route = stubRoute(201);
    const { signIn } = await toStep2(u, port);
    await fillStep2(u);
    await u.click(submit());
    await waitAlert(TAKEN);
    return { signUp, route, signIn };
  }

  it('[ERR-002][AC-055] the message, with links to login and recovery; sign-up called once, the route 0 times, nobody signed in', async () => {
    const { signUp, route, signIn } = await taken(REGULAR);
    expect(alertWith(TAKEN)).toBeDefined();
    expect(screen.getByRole('link', { name: 'התחברות' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'שחזור סיסמה' })).toHaveAttribute('href', '/recovery');
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(route).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('[NFR-SEC-006] the message names no account and no account type', async () => {
    await taken(REGULAR);
    expect(alertWith(TAKEN)?.textContent ?? '').not.toMatch(/מקצועי|מקצוע|רגיל|הורה|נרשם|קיים|כבר רשום|אימייל זה/);
    expect(document.body.textContent ?? '').not.toContain(EMAIL.replace('@example.com', '')); // the address is not echoed in the message
  });

  it('[AC-055] the answer for an existing Professional email and for an existing Regular one gives the same DOM and the same absence of calls', async () => {
    const first = await taken(REGULAR);
    const regularAlert = alertWith(TAKEN)?.outerHTML ?? '';
    const regularCalls = [first.signUp.mock.calls.length, first.route.mock.calls.length];
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    const second = await taken(PROFESSIONAL);
    const professionalAlert = alertWith(TAKEN)?.outerHTML ?? '';
    expect(professionalAlert).toBe(regularAlert);
    expect([second.signUp.mock.calls.length, second.route.mock.calls.length]).toEqual(regularCalls);
  });

  it('[ERR-002] the entered data stays: email kept, step 2 still shown, the box still ticked', async () => {
    await taken(REGULAR);
    expect(emailField()).toHaveValue(EMAIL);
    expect(consentBox()).toBeChecked();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטי התחברות');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('F1.4 criterion 20 [VAL-003 · Addendum 1] Auth error mapping: fixed texts, never a raw message', () => {
  async function submitWith(response: SignUpResponse | Error) {
    const u = user();
    const { port, signUp } = makePort(response);
    const route = stubRoute(201);
    await toStep2(u, port);
    await fillStep2(u);
    await u.click(submit());
    return { u, signUp, route };
  }

  it.each([
    ['code weak_password', fail({ status: 422, code: 'weak_password', name: 'AuthApiError' })],
    ['name AuthWeakPasswordError', fail({ status: 422, code: undefined, name: 'AuthWeakPasswordError' })],
  ])('[VAL-003] a weak password from Auth (%s) -> the password field error, focus on the password, route not called', async (_label, response) => {
    const { signUp, route } = await submitWith(response);
    await waitAlert(PW_SHORT);
    expect(passwordField()).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(passwordField()).toHaveFocus());
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(route).not.toHaveBeenCalled();
    expect(alertWith(GENERIC)).toBeUndefined();
    expect(alertWith(TAKEN)).toBeUndefined();
  });

  it('[VAL-003] the weak-password error goes away when the password changes', async () => {
    const { u } = await submitWith(fail({ status: 422, code: 'weak_password' }));
    await waitAlert(PW_SHORT);
    await u.type(passwordField(), 'x');
    await waitFor(() => expect(alertWith(PW_SHORT)).toBeUndefined());
    expect(passwordField()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it.each([
    ['status 429', fail({ status: 429, code: undefined, name: 'AuthApiError' })],
    ['code over_request_rate_limit', fail({ status: 400, code: 'over_request_rate_limit' })],
    ['code over_email_send_rate_limit', fail({ status: 400, code: 'over_email_send_rate_limit' })],
  ])('[Q6][AC-055] rate limit (%s) -> the "too many attempts" text; the route is not called', async (_label, response) => {
    const { signUp, route } = await submitWith(response);
    await waitAlert(RATE);
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(route).not.toHaveBeenCalled();
    expect(alertWith(TAKEN)).toBeUndefined();
  });

  it.each([
    ['status 422, an unmapped code', fail({ status: 422, code: 'unexpected_failure', name: 'AuthApiError' })],
    ['status 400, an unknown code', fail({ status: 400, code: 'something_new' })],
    ['nothing known at all', fail({})],
    ['an SDK not-configured failure', fail({ name: 'AuthNotConfigured' })],
    ['a name that looks like a message', fail({ name: 'RAW_LIBRARY_MESSAGE_DO_NOT_SHOW', code: 'RAW_CODE_DO_NOT_SHOW' })],
  ])('[criterion 20] an unknown Auth failure (%s) -> the fallback text, no retry control, never the raw text', async (_label, response) => {
    const { route } = await submitWith(response);
    await waitAlert(GENERIC);
    expect(retryButton()).toBeNull();
    expect(route).not.toHaveBeenCalled();
    expect(document.body.textContent ?? '').not.toMatch(/RAW_|AuthApiError|unexpected_failure|something_new|AuthNotConfigured/);
  });

  it.each([
    ['500 (what auth-js reports for an HTTP 500)', fail({ status: 500, code: undefined, name: 'AuthRetryableFetchError' })],
    ['503', fail({ status: 503, code: undefined, name: 'AuthRetryableFetchError' })],
    ['507 as AuthApiError (any status >= 500, whatever the name: CRITIC part c 1)', fail({ status: 507, name: 'AuthApiError' })],
    ['505 with an unmapped code', fail({ status: 505, code: 'unexpected_failure', name: 'AuthApiError' })],
    ['599', fail({ status: 599, name: 'AuthApiError' })],
    ['status 0 (a fetch that never answered)', fail({ status: 0, code: undefined, name: 'AuthRetryableFetchError' })],
  ])('[criterion 20][ERR-004][Q8] an Auth 5xx / network failure %s -> the retry text with "ניסיון חוזר"; the retry calls sign-up again, then the route once', async (_label, response) => {
    const u = user();
    const { port, signUp } = makePort(response, ok());
    const route = stubRoute(201);
    const { signIn } = await toStep2(u, port);
    await fillStep2(u);
    await u.click(submit());
    await waitAlert(RETRY);
    expect(retryButton()).not.toBeNull();
    expect(alertWith(GENERIC)).toBeUndefined();
    expect(route).not.toHaveBeenCalled();
    await u.click(retryButton() ?? submit());
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(signUp).toHaveBeenCalledTimes(2);
    expect(route).toHaveBeenCalledTimes(1);
  });

  it('[ERR-004][Q8] a rejected sign-up promise (the network) -> the retry text with "ניסיון חוזר", data kept; the retry calls sign-up AGAIN', async () => {
    const u = user();
    const { port, signUp } = makePort(new TypeError('Failed to fetch'), ok());
    const route = stubRoute(201);
    const { signIn } = await toStep2(u, port);
    await fillStep2(u);
    await u.click(submit());
    await waitAlert(RETRY);
    expect(retryButton()).not.toBeNull();
    expect(emailField()).toHaveValue(EMAIL);
    expect(route).not.toHaveBeenCalled();
    expect(document.body.textContent ?? '').not.toContain('Failed to fetch');

    await u.click(retryButton() ?? submit());
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(signUp).toHaveBeenCalledTimes(2); // no token was held, so sign-up is called again
    expect(route).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('F1.4 criterion 8/11/12/13 the route call after a successful sign-up', () => {
  it('[AC-091][FR-REG-004] 201 -> the session entry signs the user in once; one Auth call, one route call', async () => {
    const u = user();
    const { port, signUp } = makePort(ok());
    const route = stubRoute(201);
    const { signIn } = await submitValid(u, port);
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledTimes(1);
    expect(alertWith(TAKEN)).toBeUndefined();
  });

  it('[NFR-PRIV-001][criterion 13] the route call: POST /api/register, Bearer token, JSON, consent true, and NO email and NO password anywhere in it', async () => {
    const u = user();
    const { port } = makePort(ok());
    const route = stubRoute(201);
    await submitValid(u, port);
    await waitFor(() => expect(route).toHaveBeenCalledTimes(1));
    const [input, init] = route.mock.calls[0] ?? [];
    expect(urlOf(input)).toBe('/api/register');
    expect(init?.method).toBe('POST');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(headers.get('content-type')).toMatch(/application\/json/);
    const body = bodyOf(init?.body);
    expect(body, 'the route body is a JSON string').not.toBe('');
    const parsed: unknown = JSON.parse(body);
    expect(parsed).toMatchObject({ stages: ['planning'], fullName: 'דנה כהן', consent: true });
    expect(Object.keys(typeof parsed === 'object' && parsed !== null ? parsed : {}).sort()).toEqual(['children', 'consent', 'dueDate', 'fullName', 'stages']);
    for (const secret of [EMAIL, PASSWORD, 'password', 'email']) {
      expect(body).not.toContain(secret);
      expect(urlOf(input)).not.toContain(secret);
    }
  });

  it('[NFR-PRIV-001] after a successful registration nothing is in localStorage, sessionStorage or cookies, and the console is silent about the secrets', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const u = user();
    const { port } = makePort(ok());
    stubRoute(201);
    const { signIn } = await submitValid(u, port);
    await waitFor(() => expect(signIn).toHaveBeenCalled());
    const dump = (s: Storage) => JSON.stringify(Object.fromEntries(Object.keys(s).map((k) => [k, s.getItem(k)])));
    for (const blob of [dump(localStorage), dump(sessionStorage), document.cookie]) {
      for (const secret of [EMAIL, PASSWORD, TOKEN, 'דנה כהן']) expect(blob).not.toContain(secret);
    }
    for (const spy of consoleSpies) {
      for (const secret of [EMAIL, PASSWORD, TOKEN, 'דנה כהן']) expect(JSON.stringify(spy.mock.calls)).not.toContain(secret);
    }
  });

  it.each([
    [409, TAKEN, 'the route says already registered'],
    [401, TAKEN, 'the token was refused (Q8)'],
  ])('[AC-055][Q8] route %i -> the generic taken message with the links (%s); nobody is signed in', async (status, text) => {
    const u = user();
    const { port, signUp } = makePort(ok());
    stubRoute(status);
    const { signIn } = await submitValid(u, port);
    await waitAlert(text);
    expect(screen.getByRole('link', { name: 'שחזור סיסמה' })).toHaveAttribute('href', '/recovery');
    expect(screen.getByRole('link', { name: 'התחברות' })).toHaveAttribute('href', '/login');
    expect(signIn).not.toHaveBeenCalled();
    expect(signUp).toHaveBeenCalledTimes(1);
  });

  it('[ERR-004][criterion 11] route 503 -> the retry text with "ניסיון חוזר"; step 2 and all data and the session stay', async () => {
    const u = user();
    const { port } = makePort(ok());
    stubRoute(503);
    const { signIn } = await submitValid(u, port);
    await waitAlert(RETRY);
    expect(retryButton()).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטי התחברות');
    expect(emailField()).toHaveValue(EMAIL);
    expect(consentBox()).toBeChecked();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('[ERR-004][criterion 11] the retry skips sign-up: the route is called again with the SAME token and an equal body; one sign-up call in total; then signed in', async () => {
    const u = user();
    const { port, signUp } = makePort(ok());
    const route = stubRoute(503, 201);
    const { signIn } = await submitValid(u, port);
    await waitAlert(RETRY);
    await u.click(retryButton() ?? submit());
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledTimes(2);
    const [a, b] = route.mock.calls;
    expect(new Headers(a?.[1]?.headers).get('authorization')).toBe(new Headers(b?.[1]?.headers).get('authorization'));
    expect(bodyOf(a?.[1]?.body)).not.toBe('');
    expect(bodyOf(a?.[1]?.body)).toBe(bodyOf(b?.[1]?.body));
    await waitFor(() => expect(alertWith(RETRY)).toBeUndefined());
  });

  it('[criterion 11] pressing "יצירת חשבון" again (not the retry button) also skips sign-up when a token is held', async () => {
    const u = user();
    const { port, signUp } = makePort(ok());
    const route = stubRoute(503, 201);
    const { signIn } = await submitValid(u, port);
    await waitAlert(RETRY);
    await u.click(submit());
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledTimes(2);
  });

  it('[ERR-004][criterion 12] the route unreachable (fetch rejects) -> the retry text; the retry calls the route again, not sign-up; one account', async () => {
    const u = user();
    const { port, signUp } = makePort(ok());
    const route = stubRoute('throw', 201);
    const { signIn } = await submitValid(u, port);
    await waitAlert(RETRY);
    expect(retryButton()).not.toBeNull();
    expect(emailField()).toHaveValue(EMAIL);
    await u.click(retryButton() ?? submit());
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledTimes(2);
  });

  it('[criterion 11] two 503s in a row keep the retry control; the third try succeeds with one sign-up in total', async () => {
    const u = user();
    const { port, signUp } = makePort(ok());
    const route = stubRoute(503, 503, 201);
    const { signIn } = await submitValid(u, port);
    for (let i = 0; i < 2; i += 1) {
      await waitFor(() => expect(route.mock.calls.length).toBe(i + 1));
      await waitAlert(RETRY);
      await u.click(retryButton() ?? submit());
    }
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledTimes(3);
  });

  it.each([500, 400, 413, 418])('[criterion 11 · Finding 3] route %i -> the fallback text, NO retry control, the data kept', async (status) => {
    const u = user();
    const { port } = makePort(ok());
    stubRoute(status);
    const { signIn } = await submitValid(u, port);
    await waitAlert(GENERIC);
    expect(retryButton()).toBeNull();
    expect(emailField()).toHaveValue(EMAIL);
    expect(consentBox()).toBeChecked();
    expect(signIn).not.toHaveBeenCalled();
    expect(alertWith(RETRY)).toBeUndefined();
    expect(document.body.textContent ?? '').not.toMatch(/\b(internal|invalid_request|bad_request)\b/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('F1.4 criterion 17 [NFR-USAB-004] a double activation sends one request', () => {
  function deferred<T>() {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it('[NFR-USAB-004] while sign-up runs the button is aria-disabled and busy with a status text; a second click and Enter send nothing; sign-up is called once', async () => {
    const u = user();
    const gate = deferred<SignUpResponse>();
    const signUp = vi.fn<AuthPort['signUp']>(() => gate.promise);
    const route = stubRoute(201);
    const { signIn } = await toStep2(u, { signUp });
    await fillStep2(u);
    await u.click(submit());
    await waitFor(() => expect(submit()).toHaveAttribute('aria-disabled', 'true'));
    expect(submit()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('יוצרים את החשבון');
    await u.click(submit());
    await u.click(submit());
    submit().focus();
    await u.keyboard('{Enter}');
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(route).not.toHaveBeenCalled();

    gate.resolve(ok());
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledTimes(1);
  });

  it('[NFR-USAB-004] while the route call runs, extra activations send no second route call', async () => {
    const u = user();
    const gate = deferred<Response>();
    const { port, signUp } = makePort(ok());
    const route = vi.spyOn(globalThis, 'fetch').mockImplementation(() => gate.promise);
    const { signIn } = await submitValid(u, port);
    await waitFor(() => expect(route).toHaveBeenCalledTimes(1));
    expect(submit()).toHaveAttribute('aria-disabled', 'true');
    await u.click(submit());
    await u.click(submit());
    expect(route).toHaveBeenCalledTimes(1);
    expect(signUp).toHaveBeenCalledTimes(1);
    gate.resolve(new Response('{"status":"created"}', { status: 201 }));
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(route).toHaveBeenCalledTimes(1);
  });

  it('[NFR-USAB-004] after a failure the button is usable again (not left disabled)', async () => {
    const u = user();
    const { port } = makePort(fail({ status: 400, code: 'something_new' })); // an unmapped 4xx: the fallback, not the retry state
    await toStep2(u, port);
    await fillStep2(u);
    await u.click(submit());
    await waitAlert(GENERIC);
    expect(submit()).not.toHaveAttribute('aria-disabled', 'true');
    expect(submit()).not.toHaveAttribute('aria-busy', 'true');
  });
});

// (The retry/fallback boundary, the held-token lock and the markup check are in register-step2-held-token.test.tsx.)

describe('F1.4 criterion 19 [F1.3 criterion 13] back from step 2', () => {
  it('[F1.3 c13] "חזרה" returns to step 1 with all values intact; back on step 2 the email is kept and the password is empty', async () => {
    const u = user();
    const { port } = makePort(ok());
    await toStep2(u, port);
    await u.type(emailField(), EMAIL);
    await u.type(passwordField(), PASSWORD);
    await u.click(screen.getByRole('button', { name: 'חזרה' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטים אישיים');
    expect(stageBox('מתכננים')).toBeChecked();
    expect(screen.getByLabelText(/^שם מלא/)).toHaveValue('דנה כהן');
    await u.click(screen.getByRole('button', { name: 'המשך' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטי התחברות');
    expect(emailField()).toHaveValue(EMAIL);
    expect(passwordField()).toHaveValue('');
  });

  it('[F1.3 c13][NFR-PRIV-001] the password is not recoverable from the DOM after going back (it is not in any attribute either)', async () => {
    const u = user();
    const { port } = makePort(ok());
    const { view } = await toStep2(u, port);
    await u.type(passwordField(), PASSWORD);
    await u.click(screen.getByRole('button', { name: 'חזרה' }));
    await u.click(screen.getByRole('button', { name: 'המשך' }));
    expect(view.container.innerHTML).not.toContain(PASSWORD);
  });
});
