// F1.2 app-shell-guard: helpers for the app specs. Derived from .work/app-shell-guard/spec.md only.
// The session is driven through window.nestlyTestSession, which exists only in the e2e build.
// The app server (build:e2e + preview:e2e on 4174) is started by the webServer entry in playwright.config.ts.
import type { Locator, Page } from '@playwright/test';

export const APP = 'http://127.0.0.1:4174';

/** 'signed-in-needs-recovery' = signed in, and the account still has no recovery questions (the questions screen opens in setup mode). */
export type SessionState = 'loading' | 'signed-in' | 'signed-in-needs-recovery' | 'signed-out';

export const WELCOME_H1 = 'הצטרפות ל-Nestly';
export const LEAD = 'קהילה חמה להורים ולהורים לעתיד, במקום אחד.';
export const LINE = 'המסך הזה ייפתח בקרוב.';
export const LOADING = 'בטעינה';
export const NAV = 'ניווט ראשי';
export const MENU_BUTTON = 'פתיחת התפריט';
export const DRAWER_TITLE = 'תפריט';
export const CLOSE = 'סגירת התפריט';

export const CREATE = 'יצירת חשבון חדש';
export const GOOGLE = 'המשך עם Google';
export const HAVE_ACCOUNT = 'כבר יש לי חשבון';

export interface Route {
  path: string;
  h1: string;
  title: string;
}

/** The four Guest routes (Q2). */
export const GUEST_ROUTES: Route[] = [
  { path: '/', h1: WELCOME_H1, title: 'Nestly' },
  { path: '/login', h1: 'התחברות', title: 'התחברות · Nestly' },
  { path: '/register', h1: 'פרטים אישיים', title: 'פרטים אישיים · Nestly' },
  { path: '/auth/google', h1: GOOGLE, title: 'המשך עם Google · Nestly' },
];

/** The four protected placeholders (Q2). */
export const PROTECTED_ROUTES: Route[] = [
  { path: '/home', h1: 'בית', title: 'בית · Nestly' },
  { path: '/feed', h1: 'פיד', title: 'פיד · Nestly' },
  { path: '/profile', h1: 'פרופיל', title: 'פרופיל · Nestly' },
  { path: '/settings', h1: 'הגדרות', title: 'הגדרות · Nestly' },
];

type DriveMethod = 'set' | 'fail' | 'rejectSignOut' | 'signOutCalls' | 'setNeedsRecoveryQuestions';

/** Calls a method of window.nestlyTestSession and returns its result. */
export async function drive(page: Page, method: DriveMethod, arg?: unknown): Promise<unknown> {
  return page.evaluate(
    ({ method: m, arg: a }) => {
      const session: unknown = Reflect.get(window, 'nestlyTestSession');
      if (typeof session !== 'object' || session === null) {
        throw new Error('window.nestlyTestSession is missing: this is not the e2e build');
      }
      const fn: unknown = Reflect.get(session, m);
      if (typeof fn !== 'function') throw new Error(`nestlyTestSession.${m} is not a function`);
      const out: unknown = Reflect.apply(fn, session, a === undefined ? [] : [a]);
      return out;
    },
    { method, arg },
  );
}

export async function setState(page: Page, state: SessionState): Promise<unknown> {
  if (state !== 'signed-in-needs-recovery') return drive(page, 'set', state);
  // The questions screen fixes its mode when it opens, so the flag is raised before the session becomes signed-in.
  await drive(page, 'setNeedsRecoveryQuestions', true);
  return drive(page, 'set', 'signed-in');
}

export async function signOutCalls(page: Page): Promise<number> {
  const n = await drive(page, 'signOutCalls');
  return typeof n === 'number' ? n : -1;
}

export const waitForSeam = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => Reflect.get(window, 'nestlyTestSession') !== undefined);

/** Loads a path (the session starts in `loading`), then moves the seam to `state` (null = leave it loading). */
export async function open(page: Page, route: string, state: SessionState | null): Promise<void> {
  await page.goto(APP + route);
  await waitForSeam(page);
  if (state !== null) await setState(page, state);
}

/** Records, from before the app boots, every time one of the texts or selectors is added to the DOM, even for one render. */
export async function watch(page: Page, needles: { texts?: string[]; selectors?: string[] }): Promise<void> {
  await page.addInitScript(
    (n) => {
      const seen: string[] = [];
      Reflect.set(window, '__nestlySeen', seen);
      const check = (node: Node): void => {
        const text = node.textContent ?? '';
        for (const t of n.texts) if (text.includes(t)) seen.push(`text:${t}`);
        if (node instanceof Element) {
          for (const s of n.selectors) if (node.matches(s) || node.querySelector(s) !== null) seen.push(`selector:${s}`);
        }
      };
      new MutationObserver((records) => {
        for (const r of records) {
          r.addedNodes.forEach(check);
          if (r.type === 'characterData') check(r.target);
        }
      }).observe(document, { subtree: true, childList: true, characterData: true });
    },
    { texts: needles.texts ?? [], selectors: needles.selectors ?? [] },
  );
}

export const seen = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const s: unknown = Reflect.get(window, '__nestlySeen');
    return Array.isArray(s) ? s.map(String) : ['__nestlySeen is missing: watch() was not installed'];
  });

export const resetSeen = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const s: unknown = Reflect.get(window, '__nestlySeen');
    if (Array.isArray(s)) s.length = 0;
  });

/** Collects every request URL the page makes. */
export function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  return urls;
}

/** Collects uncaught page errors (uncaught exceptions and unhandled rejections). */
export function recordErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export const historyLength = (page: Page): Promise<number> => page.evaluate(() => window.history.length);

export const setMarker = (page: Page): Promise<void> =>
  page.evaluate(() => {
    Reflect.set(window, '__nestlyMarker', 'alive');
  });

/** True if the marker set by setMarker survives, i.e. there was no document reload. */
export const markerAlive = (page: Page): Promise<boolean> =>
  page.evaluate(() => Reflect.get(window, '__nestlyMarker') === 'alive');

export const pathOf = (page: Page): string => new URL(page.url()).pathname;

/** The Logo: an image or a link named "Nestly". */
export const logoOf = (page: Page): Locator =>
  page.getByRole('img', { name: 'Nestly' }).or(page.getByRole('link', { name: 'Nestly' })).first();

/** A Welcome action is a link or a button. */
export const actionOf = (page: Page, name: string): Locator =>
  page.getByRole('link', { name, exact: true }).or(page.getByRole('button', { name, exact: true }));

/** The accessible-ish name of the focused element. */
export const focusedName = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (a === null) return '';
    return a.getAttribute('aria-label') ?? (a.textContent ?? '').replace(/\s+/g, ' ').trim();
  });

/** Presses Tab n times and returns the focused names, in order. */
export async function tabNames(page: Page, n: number): Promise<string[]> {
  const names: string[] = [];
  for (let i = 0; i < n; i += 1) {
    await page.keyboard.press('Tab');
    names.push(await focusedName(page));
  }
  return names;
}

/** True if every locator follows the one before it in DOM order. */
export async function inDomOrder(locators: Locator[]): Promise<boolean> {
  for (let i = 1; i < locators.length; i += 1) {
    const prev = locators[i - 1];
    const next = locators[i];
    if (prev === undefined || next === undefined) throw new Error('inDomOrder needs defined locators');
    const handle = await next.elementHandle();
    if (handle === null) throw new Error(`element ${i} not found`);
    const ok = await prev.evaluate(
      (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      handle,
    );
    if (!ok) return false;
  }
  return true;
}

export const bodyText = (page: Page): Promise<string> => page.evaluate(() => document.body.innerText);
