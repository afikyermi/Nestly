// I1 F1.4 part c, CRITIC part c findings 1, 2 and 4 (web, component level): the boundary between the retry state and the fallback
// (any Auth status >= 500 retries), the email and password read-only while the sign-up token is held, and the typed password
// never appearing in the markup. Split from register-step2.test.tsx (file-size budget); same helpers (step2-helpers.tsx).
// Derived from spec.md criteria 11, 13, 20 and interface.md "CRITIC part c fixes" only.
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMAIL,
  GENERIC,
  PASSWORD,
  RETRY,
  TAKEN,
  alertWith,
  consentBox,
  emailField,
  fail,
  fillStep2,
  makePort,
  ok,
  passwordField,
  retryButton,
  stubRoute,
  submit,
  submitValid,
  toStep2,
  user,
  waitAlert,
} from './step2-helpers';

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------------------------------------------------
describe('F1.4 criterion 11/20 (CRITIC part c 1) the boundary between retry and fallback', () => {
  it.each([
    ['499 (a 4xx, unmapped)', fail({ status: 499, name: 'AuthApiError' })],
    ['400', fail({ status: 400, name: 'AuthApiError' })],
    ['418', fail({ status: 418, name: 'AuthApiError' })],
  ])('[criterion 20] an Auth %s -> the fallback text, no retry control', async (_label, response) => {
    const u = user();
    const { port } = makePort(response);
    stubRoute(201);
    await toStep2(u, port);
    await fillStep2(u);
    await u.click(submit());
    await waitAlert(GENERIC);
    expect(retryButton()).toBeNull();
  });
});

describe('F1.4 criterion 11 (CRITIC part c 2) while the sign-up token is held the email and password are read-only', () => {
  const NOTE = 'האימייל והסיסמה נשמרו ואי אפשר לשנות אותם כעת';

  it.each([
    ['route 503', 503],
    ['route unreachable', 'throw' as const],
    ['route 500', 500],
  ])('[criterion 11] after %s: both fields are read-only (still focusable) with the note; the show-password toggle still works', async (_label, outcome) => {
    const u = user();
    const { port } = makePort(ok());
    stubRoute(outcome);
    await submitValid(u, port);
    await waitFor(() => expect(emailField()).toHaveAttribute('readonly'));
    expect(passwordField()).toHaveAttribute('readonly');
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    emailField().focus();
    expect(emailField()).toHaveFocus();
    const toggle = screen.getByRole('button', { name: 'הצגת הסיסמה' });
    await u.click(toggle);
    expect(passwordField()).toHaveAttribute('type', 'text');
    expect(passwordField()).toHaveValue(PASSWORD);
  });

  it('[criterion 11] typing into a locked field changes nothing, and the retry reuses the held token: ONE sign-up, the same Bearer, an equal body, the first email never replaced', async () => {
    const u = user();
    const { port, signUp } = makePort(ok());
    const route = stubRoute(503, 201);
    const { signIn } = await submitValid(u, port);
    await waitAlert(RETRY);
    await u.type(emailField(), 'other@example.com');
    await u.type(passwordField(), 'zzzzzzzz');
    expect(emailField()).toHaveValue(EMAIL);
    expect(passwordField()).toHaveValue(PASSWORD);
    await u.click(retryButton() ?? submit());
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(signUp.mock.calls[0]?.[0]).toEqual({ email: EMAIL, password: PASSWORD });
    expect(new Headers(route.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(new Headers(route.mock.calls[1]?.[1]?.headers).get('authorization'));
  });

  it('[criterion 11] step 1 stays editable: "חזרה" shows step 1 with its fields writable', async () => {
    const u = user();
    const { port } = makePort(ok());
    stubRoute(503);
    await submitValid(u, port);
    await waitAlert(RETRY);
    await u.click(screen.getByRole('button', { name: 'חזרה' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטים אישיים');
    const name = screen.getByLabelText(/^שם מלא/);
    expect(name).not.toHaveAttribute('readonly');
    expect(name).not.toBeDisabled();
    await u.type(name, 'ה');
    expect(name).toHaveValue('דנה כהןה');
  });

  it('[criterion 11] the lock is lifted when the route answers 409 or 401 (the token is dropped): the fields are writable again, the note is gone', async () => {
    for (const status of [409, 401]) {
      const u = user();
      const { port } = makePort(ok());
      stubRoute(503, status);
      const view = (await submitValid(u, port)).view;
      await waitAlert(RETRY);
      expect(emailField()).toHaveAttribute('readonly');
      await u.click(retryButton() ?? submit());
      await waitAlert(TAKEN);
      await waitFor(() => expect(emailField()).not.toHaveAttribute('readonly'));
      expect(passwordField()).not.toHaveAttribute('readonly');
      expect(screen.queryByText(NOTE)).toBeNull();
      view.unmount();
      vi.restoreAllMocks();
    }
  });

  it.each([
    ['Auth 500 retryable', fail({ status: 500, name: 'AuthRetryableFetchError' })],
    ['network failure', new TypeError('Failed to fetch')],
    ['Auth 400 unknown code', fail({ status: 400, code: 'something_new' })],
    ['Auth 422 weak_password', fail({ status: 422, code: 'weak_password' })],
  ])('[criterion 11] the fields are NOT locked when no token is held: after %s they stay editable and without the note', async (_label, response) => {
    const u = user();
    const { port } = makePort(response);
    stubRoute(201);
    await toStep2(u, port);
    await fillStep2(u);
    await u.click(submit());
    await waitFor(() => expect(submit()).not.toHaveAttribute('aria-disabled', 'true'));
    expect(emailField()).not.toHaveAttribute('readonly');
    expect(passwordField()).not.toHaveAttribute('readonly');
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('[criterion 11] pressing "יצירת חשבון" again (not the retry button) also reuses the held token after a route 500', async () => {
    const u = user();
    const { port, signUp } = makePort(ok());
    const route = stubRoute(500, 201);
    const { signIn } = await submitValid(u, port);
    await waitAlert(GENERIC);
    expect(emailField()).toHaveAttribute('readonly');
    await u.click(submit());
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledTimes(2);
  });
});

describe('F1.4 criterion 13 (CRITIC part c 4) the typed password is nowhere in the markup while step 2 is open', () => {
  it('[NFR-PRIV-001] outerHTML holds no password (the input is uncontrolled: React never writes the value attribute), typed, shown, after an error and in the retry state', async () => {
    const u = user();
    const { port } = makePort(ok());
    stubRoute(503);
    const { view } = await toStep2(u, port);
    const everywhere = () => document.documentElement.outerHTML + view.container.outerHTML;
    await u.type(passwordField(), PASSWORD);
    expect(passwordField()).toHaveValue(PASSWORD); // it IS in the field as a property
    expect(everywhere()).not.toContain(PASSWORD);
    expect(passwordField().getAttribute('value')).toBeNull();

    await u.click(screen.getByRole('button', { name: 'הצגת הסיסמה' }));
    expect(everywhere()).not.toContain(PASSWORD);
    expect(passwordField().getAttribute('value')).toBeNull();

    await u.type(emailField(), EMAIL);
    await u.click(consentBox());
    await u.click(submit());
    await waitAlert(RETRY);
    expect(everywhere()).not.toContain(PASSWORD);
    expect(passwordField().getAttribute('value')).toBeNull();
    expect(alertWith(GENERIC)).toBeUndefined();
  });
});
