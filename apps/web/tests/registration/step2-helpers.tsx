// Shared by the step-2 component tests (register-step2.test.tsx, register-step2-held-token.test.tsx): the Auth port and route stubs and
// the drivers for step 1 -> step 2. Derived from interface.md "part c" only.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { RegistrationFlow } from '@/features/registration/RegistrationFlow';
import { AuthPortContext } from '@/hooks/use-auth-port';
import { SessionEntryContext } from '@/hooks/use-session-entry';
import type { AuthPort, SignUpResponse } from '@/services/auth/auth-client';

export const TODAY = '2026-10-14';
export const EMAIL = 'dana.cohen@example.com';
export const PASSWORD = 'correct horse 42';
export const TAKEN = 'לא ניתן להשלים את ההרשמה עם הפרטים האלה. אפשר להתחבר או לשחזר סיסמה';
export const RETRY = 'השמירה לא הצליחה. אפשר לנסות שוב';
export const RATE = 'בוצעו יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות';
export const GENERIC = 'משהו השתבש. אפשר לנסות שוב';
export const PW_SHORT = 'הסיסמה צריכה להכיל לפחות 8 תווים';
export const NO_EMAIL = 'יש למלא כתובת אימייל';
export const BAD_EMAIL = 'כתובת האימייל אינה תקינה';
export const NO_CONSENT = 'יש לאשר את התנאים ואת הצהרת הגיל כדי להמשיך';
export const CONSENT_LABEL = 'אישור תנאי השימוש ומדיניות הפרטיות, והצהרה על גיל 18 ומעלה';
export const TOKEN = 'access-token-from-auth';

/** The URL text of a fetch input, narrowed (no default stringification of an object). */
export const urlOf = (input: RequestInfo | URL | undefined): string => (typeof input === 'string' ? input : input instanceof URL ? input.href : input instanceof Request ? input.url : '');
/** The request body as text: the web sends a JSON string, anything else reads as empty and fails the test that expects JSON. */
export const bodyOf = (body: BodyInit | null | undefined): string => (typeof body === 'string' ? body : '');

type Failure = { status: number | undefined; code: string | undefined; name: string | undefined };
export const ok = (accessToken = TOKEN): SignUpResponse => ({ accessToken, failure: null });
export const fail = (failure: Partial<Failure>): SignUpResponse => ({ accessToken: null, failure: { status: undefined, code: undefined, name: undefined, ...failure } });

export function makePort(...answers: Array<SignUpResponse | Error>) {
  const queue = [...answers];
  const signUp = vi.fn<AuthPort['signUp']>(() => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next === undefined) return Promise.resolve(ok());
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const port: AuthPort = { signUp };
  return { port, signUp };
}

export function stubRoute(...statuses: Array<number | 'throw'>) {
  const queue = [...statuses];
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next === 'throw') return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(new Response(next === 201 ? '{"status":"created"}' : '{"error":"x"}', { status: next ?? 201 }));
  });
}

export const user = () => userEvent.setup();
export const stageBox = (n: string) => within(screen.getByRole('group', { name: 'השלב במסע' })).getByRole('checkbox', { name: new RegExp(n) });
export const emailField = () => screen.getByRole('textbox', { name: 'אימייל' });
export const passwordField = () => screen.getByLabelText('סיסמה', { exact: true });
export const consentBox = () => screen.getByRole('checkbox', { name: CONSENT_LABEL });
export const submit = () => screen.getByRole('button', { name: 'יצירת חשבון' });
export const retryButton = () => screen.queryByRole('button', { name: 'ניסיון חוזר' });
export const alertWith = (text: string) => screen.queryAllByRole('alert').find((a) => (a.textContent ?? '').includes(text));
export const waitAlert = (text: string) => waitFor(() => expect(alertWith(text), `no alert says "${text}"`).toBeDefined());

export async function toStep2(u: ReturnType<typeof user>, port: AuthPort, signIn = vi.fn()) {
  const view = render(
    <MemoryRouter initialEntries={['/register']}>
      <AuthPortContext value={port}>
        <SessionEntryContext value={{ signIn }}>
          <RegistrationFlow today={TODAY} />
        </SessionEntryContext>
      </AuthPortContext>
    </MemoryRouter>,
  );
  await u.click(stageBox('מתכננים'));
  await u.type(screen.getByLabelText(/^שם מלא/), 'דנה כהן');
  await u.click(screen.getByRole('button', { name: 'המשך' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטי התחברות');
  return { view, signIn };
}
export async function fillStep2(u: ReturnType<typeof user>, over: { email?: string; password?: string; consent?: boolean } = {}) {
  await u.type(emailField(), over.email ?? EMAIL);
  await u.type(passwordField(), over.password ?? PASSWORD);
  if (over.consent !== false) await u.click(consentBox());
}
export async function submitValid(u: ReturnType<typeof user>, port: AuthPort, signIn = vi.fn()) {
  const ctx = await toStep2(u, port, signIn);
  await fillStep2(u);
  await u.click(submit());
  return ctx;
}
