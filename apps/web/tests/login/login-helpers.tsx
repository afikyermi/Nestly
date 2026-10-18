// F1.5 part c helpers (component level): the whole <App> over the real session source with a fake Auth port and a stubbed account
// state. Derived from spec.md (criteria 5, 6, 8, 11, 16, 18, 19) and interface.md "part c" only.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, vi } from 'vitest';
import { App } from '@/app/App';
import type { AuthPort } from '@/services/auth/auth-client';
import { createAuthSessionSource } from '@/services/session/auth-session-source';

type Deps = Parameters<typeof createAuthSessionSource>[0];
export type Auth = Deps['auth'];
export type Outcome = Awaited<ReturnType<Deps['accountState']>>;
export type Restore = Awaited<ReturnType<Auth['restore']>>;
export type SignInAnswer = Awaited<ReturnType<Auth['signIn']>>;

export const EMAIL = 'dana.cohen@example.com';
export const PASSWORD = 'correct horse 42 zq';

export const INVALID = 'האימייל או הסיסמה שגויים. אפשר לנסות שוב';
export const RATE = 'בוצעו יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות';
export const FAILED = 'ההתחברות לא הצליחה. אפשר לנסות שוב';
export const GENERIC = 'משהו השתבש. אפשר לנסות שוב';
export const STOPPED = 'הכניסה לחשבון הזה אינה זמינה כרגע';
export const EXPIRED = 'ההתחברות פגה. אפשר להתחבר שוב';
export const WELCOME = 'הצטרפות ל-Nestly';
export const PROTECTED_H1 = ['בית', 'פיד', 'הפיד', 'פרופיל', 'הגדרות'];

export const okAnswer: SignInAnswer = { accessToken: 'tok', failure: null };
export const failureAnswer = (failure: { status?: number; code?: string; name?: string }): SignInAnswer => ({
  accessToken: null,
  failure: { status: failure.status, code: failure.code, name: failure.name },
});

export interface MountOptions {
  restore?: Restore;
  outcomes?: Outcome[];
  /** One answer for every call, or a function for full control (e.g. a promise that never settles). */
  signIn?: SignInAnswer | (() => Promise<SignInAnswer>);
  signOut?: boolean;
}

export function mountApp(path: string, over: MountOptions = {}) {
  const visible: Array<() => void> = [];
  const removed: Array<() => void> = [];
  const outcomes: Outcome[] = [...(over.outcomes ?? ['active'])];
  let clock = 1_000_000;
  const signInOption = over.signIn ?? okAnswer;
  const signIn = vi.fn((): Promise<SignInAnswer> => (typeof signInOption === 'function' ? signInOption() : Promise.resolve(signInOption)));
  // Like the real client: once the session is ended (sign-out here, or another tab removed it) Auth holds no token.
  let tokenHeld = true;
  const signOut = vi.fn((): Promise<boolean> => {
    tokenHeld = false;
    return Promise.resolve(over.signOut ?? true);
  });
  const auth: Auth = {
    signIn,
    restore: vi.fn((): Promise<Restore> => Promise.resolve(over.restore ?? 'none')),
    getAccessToken: vi.fn(() => Promise.resolve(tokenHeld ? 'tok' : null)),
    signOut,
    subscribe: vi.fn(() => () => undefined),
  };
  const accountState = vi.fn((token: string): Promise<Outcome> => {
    void token;
    return Promise.resolve(outcomes.length > 1 ? (outcomes.shift() ?? 'active') : (outcomes[0] ?? 'active'));
  });
  const source = createAuthSessionSource({
    auth,
    accountState,
    now: () => clock,
    events: {
      onTabVisible: (l) => (visible.push(l), () => undefined),
      onSessionRemovedElsewhere: (l) => (removed.push(l), () => undefined),
    },
  });
  const signUp = vi.fn<AuthPort['signUp']>(() => Promise.resolve({ accessToken: 'never', failure: null }));
  // Everything protected that is ever added to the DOM, even for one render.
  const seen: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const r of records)
      r.addedNodes.forEach((n) => {
        if (!(n instanceof Element)) return;
        if (n.matches('nav[aria-label="ניווט ראשי"]') || n.querySelector('nav[aria-label="ניווט ראשי"]')) seen.push('shell-nav');
        const heads = n.matches('h1') ? [n] : Array.from(n.querySelectorAll('h1'));
        for (const h of heads) if (PROTECTED_H1.includes((h.textContent ?? '').trim())) seen.push(`protected-h1:${h.textContent}`);
      });
  });
  act(() => {
    window.history.replaceState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  observer.observe(document.body, { subtree: true, childList: true });
  const view = render(<App sessionSource={source} authPort={{ signUp }} />);
  return {
    view,
    source,
    signIn,
    signOut,
    signUp,
    accountState,
    seen,
    stop: () => observer.disconnect(),
    advance: (ms: number) => void (clock += ms),
    /** Another tab removed the stored session (a storage event with a null new value). */
    removedElsewhere: () =>
      act(async () => {
        tokenHeld = false;
        removed.forEach((l) => l());
        await Promise.resolve();
      }),
    tabVisible: () =>
      act(async () => {
        visible.forEach((l) => l());
        await Promise.resolve();
      }),
  };
}

export const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
export const path = () => window.location.pathname;
export const user = () => userEvent.setup();

export const emailField = () => screen.getByRole('textbox', { name: 'אימייל' });
export const passwordField = () => screen.getByLabelText('סיסמה', { exact: true });
export const submitButton = () => screen.getByRole('button', { name: 'התחברות' });

export async function onLoginScreen(opts: MountOptions = {}, at = '/login') {
  const m = mountApp(at, { restore: 'none', ...opts });
  await screen.findByRole('heading', { level: 1, name: 'התחברות' });
  return m;
}

export async function fillLogin(u: ReturnType<typeof user>, over: { email?: string; password?: string } = {}) {
  await u.type(emailField(), over.email ?? EMAIL);
  await u.type(passwordField(), over.password ?? PASSWORD);
}

export async function submitLogin(u: ReturnType<typeof user>, over: { email?: string; password?: string } = {}) {
  await fillLogin(u, over);
  await u.click(submitButton());
}

export const waitAlert = (text: string) =>
  waitFor(() => expect(screen.queryAllByRole('alert').some((a) => (a.textContent ?? '').includes(text)), `no alert says "${text}"`).toBe(true));
