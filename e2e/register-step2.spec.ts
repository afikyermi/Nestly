// I1 F1.4 part c (real browser): step 2 of /register against the e2e build, Chrome and Edge. Spec Revision 2 criteria 4-8 and
// 11-13 (web side), 16 (axe), 17 (keyboard, targets, focus, title), 18 (RTL, copy), 19 (back), 20 (Auth error mapping).
// Derived from .work/register-account-create/spec.md and interface.md "part c" only. No real Supabase: the Auth sign-up endpoint
// (`<VITE_SUPABASE_URL>/auth/v1/signup`, matched on its path, any origin) and `POST /api/register` are stubbed at the network layer
// with page.route. No type assertions, no force clicks.
// Assumption stated for CI: the e2e build is made with a VITE_SUPABASE_URL (any URL) and VITE_SUPABASE_PUBLISHABLE_KEY, otherwise
// the Auth client answers "not configured" and every journey below shows the fallback text.
import { expect, test } from '@playwright/test';
import type { Page, Request, Route } from '@playwright/test';
import { DESKTOP, MOBILE, runAxe } from './helpers';
import { APP, bodyText, open, pathOf, setState, waitForSeam } from './app-helpers';

test.use({ baseURL: APP, viewport: MOBILE });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const STEP2_H1 = 'פרטי התחברות';
const EMAIL = 'dana.cohen@example.com';
const PASSWORD = 'correct horse 42';
const NAME = 'תמרהייחודית';
const TOKEN = 'e2e-access-token-from-auth';
const TAKEN = 'לא ניתן להשלים את ההרשמה עם הפרטים האלה. אפשר להתחבר או לשחזר סיסמה';
const RETRY = 'השמירה לא הצליחה. אפשר לנסות שוב';
const RATE = 'בוצעו יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות';
const GENERIC = 'משהו השתבש. אפשר לנסות שוב';
const PW_SHORT = 'הסיסמה צריכה להכיל לפחות 8 תווים';
const NO_CONSENT = 'יש לאשר את התנאים ואת הצהרת הגיל כדי להמשיך';
const CONSENT_LABEL = 'אישור תנאי השימוש ומדיניות הפרטיות, והצהרה על גיל 18 ומעלה';

// ---- the network stubs ------------------------------------------------------------------------------------------------

interface Reply {
  status: number;
  body?: unknown;
  /** milliseconds to wait before answering */
  delay?: number;
  /** abort the request instead of answering (a network failure) */
  abort?: boolean;
}
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const AUTH_OK: Reply = {
  status: 200,
  body: {
    access_token: TOKEN,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 4102444800,
    refresh_token: 'e2e-refresh',
    user: { id: 'f0000000-0000-4000-8000-0000000000f1', aud: 'authenticated', role: 'authenticated', email: EMAIL, identities: [{ identity_id: 'f0000000-0000-4000-8000-0000000000f2', id: 'f0000000-0000-4000-8000-0000000000f1', provider: 'email' }], app_metadata: {}, user_metadata: {}, created_at: '2026-10-14T10:00:00Z' },
  },
};
const AUTH_TAKEN: Reply = { status: 422, body: { code: 422, error_code: 'user_already_exists', msg: 'User already registered' } };
const AUTH_TAKEN_PRO: Reply = { status: 400, body: { code: 400, error_code: 'email_exists', msg: 'A user with this email address has already been registered' } };
const AUTH_WEAK: Reply = { status: 422, body: { code: 422, error_code: 'weak_password', msg: 'Password should be at least 8 characters', weak_password: { reasons: ['length'] } } };
const AUTH_429: Reply = { status: 429, body: { code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' } };
// An unknown Auth failure that is not a transient server error (auth-js turns an HTTP 5xx into AuthRetryableFetchError, which the
// screen treats as retryable): a 400 with a code nobody maps.
const AUTH_500: Reply = { status: 400, body: { code: 400, error_code: 'something_new', msg: 'SECRET_RAW_AUTH_MESSAGE' } };
const ROUTE_201: Reply = { status: 201, body: { status: 'created' } };

interface Seen {
  method: string;
  url: string;
  postData: string | null;
  headers: Record<string, string>;
}
interface Stubs {
  authCalls: Seen[];
  registerCalls: Seen[];
  all: Seen[];
}

const seenOf = (r: Request): Seen => ({ method: r.method(), url: r.url(), postData: r.postData(), headers: r.headers() });

async function answer(route: Route, reply: Reply | undefined): Promise<void> {
  if (reply?.abort) {
    await route.abort('connectionreset');
    return;
  }
  if (reply?.delay) await new Promise((resolve) => setTimeout(resolve, reply.delay));
  await route.fulfill({ status: reply?.status ?? 500, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(reply?.body ?? { error: 'x' }) });
}

/** Stubs sign-up and the route. Replies are used in order; the last one repeats. */
async function stub(page: Page, auth: Reply[], register: Reply[]): Promise<Stubs> {
  const stubs: Stubs = { authCalls: [], registerCalls: [], all: [] };
  page.on('request', (r) => stubs.all.push(seenOf(r)));
  const next = (queue: Reply[]): Reply | undefined => (queue.length > 1 ? queue.shift() : queue[0]);
  await page.route(/\/auth\/v1\/signup(\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    stubs.authCalls.push(seenOf(route.request()));
    await answer(route, next(auth));
  });
  await page.route('**/api/register', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    stubs.registerCalls.push(seenOf(route.request()));
    await answer(route, next(register));
  });
  return stubs;
}

// ---- locators and steps ----------------------------------------------------------------------------------------------

const h1Of = (page: Page) => page.getByRole('heading', { level: 1 });
const email = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const password = (page: Page) => page.getByLabel('סיסמה', { exact: true });
const consent = (page: Page) => page.getByRole('checkbox', { name: CONSENT_LABEL });
const submit = (page: Page) => page.getByRole('button', { name: 'יצירת חשבון', exact: true });
const retry = (page: Page) => page.getByRole('button', { name: 'ניסיון חוזר', exact: true });
const alertWith = (page: Page, text: string) => page.getByRole('alert').filter({ hasText: text });

async function toStep2(page: Page): Promise<void> {
  await open(page, '/register', 'signed-out');
  await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
  await page.getByLabel(/^שם מלא/).fill(NAME);
  await page.getByRole('button', { name: 'המשך', exact: true }).click();
  await expect(h1Of(page)).toHaveText(STEP2_H1);
}
/** The box may be visually hidden behind a styled label: it is ticked from the keyboard, like a user without a mouse. */
async function tickConsent(page: Page): Promise<void> {
  await consent(page).focus();
  await page.keyboard.press('Space');
  await expect(consent(page)).toBeChecked();
}
async function fillStep2(page: Page): Promise<void> {
  await email(page).fill(EMAIL);
  await password(page).fill(PASSWORD);
  await tickConsent(page);
}
async function fillAndSubmit(page: Page): Promise<void> {
  await fillStep2(page);
  await submit(page).click();
}

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F1.4 criteria 8, 11, 12 (web) [AC-091 · ERR-004] the journey', () => {
  test('[F1.4 c8][precondition] the e2e build is configured for Auth: submitting step 2 sends a sign-up request to <url>/auth/v1/signup', async ({ page }) => {
    const stubs = await stub(page, [AUTH_OK], [ROUTE_201]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect.poll(() => stubs.authCalls.length, 'no sign-up request: the e2e build has no VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY').toBe(1);
  });

  test('[F1.4 c8][AC-091] a valid registration: one Auth call, one route call with the session, then /feed with focus on main', async ({ page }) => {
    const stubs = await stub(page, [AUTH_OK], [ROUTE_201]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect(h1Of(page)).toHaveText('פיד');
    expect(pathOf(page)).toBe('/feed');
    await expect(page).toHaveTitle('פיד · Nestly');
    await expect(page.locator('main')).toBeFocused();

    expect(stubs.authCalls).toHaveLength(1);
    expect(stubs.authCalls[0]?.method).toBe('POST');
    expect(stubs.registerCalls).toHaveLength(1);
    expect(stubs.registerCalls[0]?.method).toBe('POST');
    expect(stubs.registerCalls[0]?.headers['authorization']).toBe(`Bearer ${TOKEN}`);
    const body: unknown = JSON.parse(stubs.registerCalls[0]?.postData ?? 'null');
    expect(body).toMatchObject({ stages: ['planning'], fullName: NAME, consent: true });
  });

  test('[F1.4 c11][ERR-004] the route says 503: the retry text and control, the data and the page stay; the retry calls the route again, NOT sign-up; then /feed', async ({ page }) => {
    const stubs = await stub(page, [AUTH_OK], [{ status: 503, body: { error: 'profile_write_failed' } }, ROUTE_201]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect(alertWith(page, RETRY)).toBeVisible();
    await expect(retry(page)).toBeVisible();
    await expect(h1Of(page)).toHaveText(STEP2_H1);
    await expect(email(page)).toHaveValue(EMAIL);
    await expect(consent(page)).toBeChecked();

    await retry(page).click();
    await expect(h1Of(page)).toHaveText('פיד');
    expect(stubs.authCalls, 'one sign-up in total').toHaveLength(1);
    expect(stubs.registerCalls).toHaveLength(2);
    expect(stubs.registerCalls[1]?.headers['authorization']).toBe(stubs.registerCalls[0]?.headers['authorization']);
    expect(stubs.registerCalls[1]?.postData).toBe(stubs.registerCalls[0]?.postData);
  });

  test('[F1.4 c12][ERR-004] the route call does not reach the server: the same text and control; the retry creates no second sign-up', async ({ page }) => {
    const stubs = await stub(page, [AUTH_OK], [{ status: 0, abort: true }, ROUTE_201]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect(alertWith(page, RETRY)).toBeVisible();
    await expect(email(page)).toHaveValue(EMAIL);
    await retry(page).click();
    await expect(h1Of(page)).toHaveText('פיד');
    expect(stubs.authCalls).toHaveLength(1);
    expect(stubs.registerCalls).toHaveLength(2);
  });

  test('[F1.4 c12][Q8] the Auth call itself fails on the network: the same text; the retry calls sign-up AGAIN', async ({ page }) => {
    const stubs = await stub(page, [{ status: 0, abort: true }, AUTH_OK], [ROUTE_201]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect(alertWith(page, RETRY)).toBeVisible();
    expect(stubs.registerCalls).toHaveLength(0);
    await retry(page).click();
    await expect(h1Of(page)).toHaveText('פיד');
    expect(stubs.authCalls).toHaveLength(2);
    expect(stubs.registerCalls).toHaveLength(1);
  });

  test('[F1.4 c11][CRITIC part c 2] with the sign-up token held (route 503) the email and password are read-only with the note; the retry reuses the token: ONE sign-up', async ({ page }) => {
    const stubs = await stub(page, [AUTH_OK], [{ status: 503, body: { error: 'profile_write_failed' } }, ROUTE_201]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect(alertWith(page, RETRY)).toBeVisible();
    await expect(email(page)).toHaveAttribute('readonly', '');
    await expect(password(page)).toHaveAttribute('readonly', '');
    await expect(page.getByText('האימייל והסיסמה נשמרו ואי אפשר לשנות אותם כעת')).toBeVisible();
    await email(page).focus();
    await page.keyboard.type('zzz');
    await expect(email(page)).toHaveValue(EMAIL);
    await retry(page).click();
    await expect(h1Of(page)).toHaveText('פיד');
    expect(stubs.authCalls, 'one sign-up in total').toHaveLength(1);
    expect(stubs.registerCalls).toHaveLength(2);
  });

  test('[F1.4 c11][CRITIC part c 2] with the token held, step 1 stays editable through "חזרה"', async ({ page }) => {
    await stub(page, [AUTH_OK], [{ status: 503, body: { error: 'profile_write_failed' } }]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect(alertWith(page, RETRY)).toBeVisible();
    await page.getByRole('button', { name: 'חזרה', exact: true }).click();
    await expect(h1Of(page)).toHaveText('פרטים אישיים');
    await expect(page.getByLabel(/^שם מלא/)).toBeEditable();
  });

  for (const vp of [MOBILE, DESKTOP]) {
    test(`[F1.4 c17][CRITIC part c 3][WCAG 2.4.3] after a failed retry focus is on a stable element (the submit button), not on body @${vp.width}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await stub(page, [AUTH_OK], [{ status: 503, body: { error: 'profile_write_failed' } }]);
      await toStep2(page);
      await fillAndSubmit(page);
      await expect(retry(page)).toBeVisible();
      await retry(page).click();
      await expect.poll(() => page.evaluate(() => document.activeElement?.tagName ?? ''), 'focus is not lost to body').not.toBe('BODY');
      await expect(retry(page)).toBeVisible(); // the second failure shows the retry state again
      await expect(submit(page)).toBeFocused();
      await expect(submit(page)).not.toHaveAttribute('aria-disabled', 'true');
    });
  }

  test('[F1.4 c20][ERR-004][Q8] Auth sign-up answers HTTP 500: the retry text and control; the retry calls sign-up again (now succeeding), then the route once -> /feed', async ({ page }) => {
    const stubs = await stub(page, [{ status: 500, body: { code: 500, error_code: 'unexpected_failure', msg: 'SECRET_RAW_AUTH_MESSAGE' } }, AUTH_OK], [ROUTE_201]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect(alertWith(page, RETRY)).toBeVisible();
    await expect(retry(page)).toBeVisible();
    expect(await bodyText(page)).not.toContain('SECRET_RAW_AUTH_MESSAGE');
    expect(stubs.registerCalls).toHaveLength(0);
    await retry(page).click();
    await expect(h1Of(page)).toHaveText('פיד');
    expect(stubs.authCalls, 'sign-up called twice').toHaveLength(2);
    expect(stubs.registerCalls, 'one account request').toHaveLength(1);
  });

  test('[F1.4 c11][Finding 3] the route says 500: the fallback text, no retry control, the data kept', async ({ page }) => {
    const stubs = await stub(page, [AUTH_OK], [{ status: 500, body: { error: 'internal' } }]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect(alertWith(page, GENERIC)).toBeVisible();
    await expect(retry(page)).toHaveCount(0);
    await expect(email(page)).toHaveValue(EMAIL);
    expect(await bodyText(page)).not.toMatch(/internal|invalid_request/);
    expect(stubs.registerCalls).toHaveLength(1);
  });
});

test.describe('F1.4 criteria 6, 7, 20 [ERR-002 · AC-055 · NFR-SEC-006 · VAL-003] Auth answers', () => {
  test('[F1.4 c6][AC-055] the email exists: the generic message with login and recovery links; the route is called 0 times; the page stays', async ({ page }) => {
    const stubs = await stub(page, [AUTH_TAKEN], [ROUTE_201]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect(alertWith(page, TAKEN)).toBeVisible();
    await expect(page.getByRole('link', { name: 'התחברות', exact: true })).toHaveAttribute('href', '/login');
    await expect(page.getByRole('link', { name: 'שחזור סיסמה', exact: true })).toHaveAttribute('href', '/recovery');
    expect(stubs.registerCalls).toHaveLength(0);
    expect(stubs.authCalls).toHaveLength(1);
    expect(pathOf(page)).toBe('/register');
    expect(await bodyText(page)).not.toMatch(/מקצועי|SECRET_RAW|already registered/i);
  });

  test('[F1.4 c7][AC-055] a Professional email and a Regular one produce the same visible text and the same calls', async ({ page }) => {
    const texts: string[] = [];
    for (const reply of [AUTH_TAKEN, AUTH_TAKEN_PRO]) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      const stubs = await stub(page, [reply], [ROUTE_201]);
      await toStep2(page);
      await fillAndSubmit(page);
      await expect(alertWith(page, TAKEN)).toBeVisible();
      texts.push(await page.locator('main').innerText());
      expect(stubs.registerCalls).toHaveLength(0);
    }
    expect(texts[1]).toBe(texts[0]);
  });

  test('[F1.4 c20][VAL-003] a weak password from Auth: the password field error, focus on the password, the route not called', async ({ page }) => {
    const stubs = await stub(page, [AUTH_WEAK], [ROUTE_201]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect(alertWith(page, PW_SHORT)).toBeVisible();
    await expect(password(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(password(page)).toBeFocused();
    expect(stubs.registerCalls).toHaveLength(0);
  });

  test('[F1.4 c20][Q6] a 429 from Auth: the "too many attempts" text', async ({ page }) => {
    const stubs = await stub(page, [AUTH_429], [ROUTE_201]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect(alertWith(page, RATE)).toBeVisible();
    expect(stubs.registerCalls).toHaveLength(0);
  });

  test('[F1.4 c20] an unknown Auth failure: the fallback text, no retry control, and the raw message never reaches the page', async ({ page }) => {
    await stub(page, [AUTH_500], [ROUTE_201]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect(alertWith(page, GENERIC)).toBeVisible();
    await expect(retry(page)).toHaveCount(0);
    expect(await bodyText(page)).not.toContain('SECRET_RAW_AUTH_MESSAGE');
  });
});

test.describe('F1.4 criterion 4, 5 [FR-REG-004 · AC-003 · BR-068] consent and errors, in the browser', () => {
  test('[F1.4 c4][BR-068] submit with the box unticked: stays on step 2, aria-invalid, the consent text, and NO request at all', async ({ page }) => {
    const stubs = await stub(page, [AUTH_OK], [ROUTE_201]);
    await toStep2(page);
    await email(page).fill(EMAIL);
    await password(page).fill(PASSWORD);
    await submit(page).click();
    await expect(h1Of(page)).toHaveText(STEP2_H1);
    await expect(consent(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(alertWith(page, NO_CONSENT)).toBeVisible();
    expect(stubs.authCalls).toHaveLength(0);
    expect(stubs.registerCalls).toHaveLength(0);
  });

  test('[F1.4 c4] the fields carry the specified attributes; the consent links open the placeholder pages in a new tab', async ({ page }) => {
    await toStep2(page);
    await expect(email(page)).toHaveAttribute('type', 'email');
    await expect(email(page)).toHaveAttribute('autocomplete', 'email');
    await expect(password(page)).toHaveAttribute('type', 'password');
    await expect(password(page)).toHaveAttribute('autocomplete', 'new-password');
    await expect(page.getByText('לפחות 8 תווים')).toBeVisible();
    for (const [name, href] of [['תנאי השימוש', '/terms'], ['מדיניות הפרטיות', '/privacy']] as const) {
      const link = page.getByRole('link', { name, exact: true });
      await expect(link).toHaveAttribute('href', href);
      await expect(link).toHaveAttribute('target', '_blank');
      expect(await link.getAttribute('rel')).toMatch(/noopener/);
    }
    expect(await page.locator('input[type="tel"], input[type="date"]').count()).toBe(0);
    expect(await page.locator('input[type="password"]').count()).toBe(1);
  });

  test('[F1.4 c5][AC-003] an empty submit: all three errors linked, focus on the email; a message clears when its field is valid', async ({ page }) => {
    await toStep2(page);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await submit(page).click();
    await expect(alertWith(page, 'יש למלא כתובת אימייל')).toBeVisible();
    await expect(alertWith(page, PW_SHORT)).toBeVisible();
    await expect(alertWith(page, NO_CONSENT)).toBeVisible();
    await expect(email(page)).toBeFocused();
    for (const field of [email(page), password(page), consent(page)]) {
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(await field.getAttribute('aria-describedby')).toBeTruthy();
    }
    await email(page).fill('not-an-email');
    await expect(alertWith(page, 'כתובת האימייל אינה תקינה')).toBeVisible();
    await email(page).fill(EMAIL);
    await expect(alertWith(page, 'כתובת האימייל אינה תקינה')).toHaveCount(0);
    await expect(email(page)).not.toHaveAttribute('aria-invalid', 'true');
  });
});

test.describe('F1.4 criterion 13 [NFR-PRIV-001 · NFR-SEC-001] the password goes toward Auth only; nothing is stored', () => {
  test('[F1.4 c13][F1.5 c10][NFR-SEC-001] network log, storage (only the nestly-auth key), IndexedDB, cookies and console after a successful registration', async ({ page }) => {
    const consoleText: string[] = [];
    page.on('console', (m) => consoleText.push(m.text()));
    page.on('pageerror', (e) => consoleText.push(e.message));
    const stubs = await stub(page, [AUTH_OK], [ROUTE_201]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect(h1Of(page)).toHaveText('פיד');
    await page.waitForTimeout(300);

    // the password and the email leave the browser only in the sign-up call to Auth
    const carrying = stubs.all.filter((r) => `${r.url}${r.postData ?? ''}${JSON.stringify(r.headers)}`.includes(PASSWORD));
    expect(carrying.map((r) => new URL(r.url).pathname)).toEqual([expect.stringMatching(/\/auth\/v1\/signup$/)]);
    const emailCarrying = stubs.all.filter((r) => `${r.url}${r.postData ?? ''}`.includes(EMAIL));
    expect(emailCarrying.map((r) => new URL(r.url).pathname)).toEqual([expect.stringMatching(/\/auth\/v1\/signup$/)]);
    for (const call of stubs.registerCalls) {
      expect(new URL(call.url).origin).toBe(APP);
      expect(`${call.url}${call.postData ?? ''}`).not.toContain(PASSWORD);
      expect(`${call.url}${call.postData ?? ''}`).not.toContain(EMAIL);
    }
    // Auth is the only third-party origin that was contacted, and only POST /signup
    const foreign = stubs.all.filter((r) => !r.url.startsWith('data:') && new URL(r.url).origin !== APP);
    expect(foreign.every((r) => /\/auth\/v1\/signup$/.test(new URL(r.url).pathname))).toBe(true);

    const stored = await page.evaluate(async () => {
      const dump = (s: Storage) => JSON.stringify(Object.fromEntries(Object.keys(s).map((k) => [k, s.getItem(k)])));
      const dbs = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
      return { local: dump(localStorage), session: dump(sessionStorage), cookie: document.cookie, dbCount: dbs.length, localKeys: Object.keys(localStorage) };
    });
    // F1.5 criterion 10 (replaces F1.4 "no web storage at all"): the only thing our app may hold is the Auth session, under one key
    // (DR-3), with no email and no password. The token itself belongs to that key, so it is excluded from the secrets below.
    for (const blob of [stored.local, stored.session, stored.cookie]) {
      for (const secret of [PASSWORD, EMAIL, NAME]) expect(blob).not.toContain(secret);
    }
    for (const blob of [stored.session, stored.cookie]) {
      for (const secret of [TOKEN, 'e2e-refresh']) expect(blob).not.toContain(secret);
    }
    expect(stored.dbCount, 'no IndexedDB database exists').toBe(0);
    expect(stored.localKeys.filter((k) => k !== 'nestly-auth'), 'localStorage holds nothing but the Auth session key').toEqual([]);
    expect(stored.session, 'sessionStorage is empty').toBe('{}');
    const localParsed: unknown = JSON.parse(stored.local);
    const authValue: unknown = typeof localParsed === 'object' && localParsed !== null ? Reflect.get(localParsed, 'nestly-auth') : undefined;
    if (typeof authValue === 'string') {
      const parsed: unknown = JSON.parse(authValue);
      const fields = typeof parsed === 'object' && parsed !== null ? Object.keys(parsed) : [];
      expect(fields.sort(), 'the stored Auth session has tokens and expiry only: no user, no email').toEqual(['access_token', 'expires_at', 'expires_in', 'refresh_token', 'token_type']);
    }
    for (const line of consoleText) {
      for (const secret of [PASSWORD, EMAIL, TOKEN, NAME]) expect(line).not.toContain(secret);
    }
    expect(await page.context().cookies()).toEqual([]);
  });

  test('[F1.5 c10][c17][DR-3] after registration the session is persisted under the one key "nestly-auth": tokens and expiry only, no user, no email, no name', async ({ page }) => {
    await stub(page, [AUTH_OK], [ROUTE_201]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect(h1Of(page)).toHaveText('פיד');
    await page.waitForTimeout(300);
    const raw = await page.evaluate(() => localStorage.getItem('nestly-auth'));
    expect(raw, 'the Auth session is persisted under nestly-auth').not.toBeNull();
    const parsed: unknown = JSON.parse(raw ?? 'null');
    const fields = typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).sort() : [];
    expect(fields).toEqual(['access_token', 'expires_at', 'expires_in', 'refresh_token', 'token_type']);
    for (const secret of [PASSWORD, EMAIL, NAME]) expect(raw).not.toContain(secret);
  });

  test('[F1.4 c13] the password is not in the URL, the history state or the page markup after a failed attempt', async ({ page }) => {
    await stub(page, [AUTH_500], [ROUTE_201]);
    await toStep2(page);
    await fillAndSubmit(page);
    await expect(alertWith(page, GENERIC)).toBeVisible();
    expect(page.url()).not.toContain(PASSWORD);
    // CRITIC part c 4: the password input is uncontrolled, so React never mirrors it into the value attribute: nothing is stripped here.
    const markup = await page.evaluate(() => JSON.stringify(history.state) + document.documentElement.outerHTML);
    expect(markup).not.toContain(PASSWORD);
    await expect(password(page)).toHaveValue(PASSWORD); // it is in the field as a property, as it must be
    expect(await password(page).getAttribute('value')).toBeNull();
    await page.getByRole('button', { name: 'הצגת הסיסמה', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.outerHTML)).not.toContain(PASSWORD);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F1.4 criterion 16 [NFR-A11Y-001] axe', () => {
  const STATES: { name: string; auth: Reply[]; register: Reply[]; run: (page: Page) => Promise<void> }[] = [
    { name: 'step 2 empty', auth: [AUTH_OK], register: [ROUTE_201], run: () => Promise.resolve() },
    {
      name: 'step 2 with all errors',
      auth: [AUTH_OK],
      register: [ROUTE_201],
      run: async (page) => {
        await submit(page).click();
        await expect(alertWith(page, NO_CONSENT)).toBeVisible();
      },
    },
    {
      name: 'step 2 in the retry state',
      auth: [AUTH_OK],
      register: [{ status: 503, body: { error: 'profile_write_failed' } }],
      run: async (page) => {
        await fillAndSubmit(page);
        await expect(retry(page)).toBeVisible();
      },
    },
    {
      name: 'step 2 in the taken-email state',
      auth: [AUTH_TAKEN],
      register: [ROUTE_201],
      run: async (page) => {
        await fillAndSubmit(page);
        await expect(alertWith(page, TAKEN)).toBeVisible();
      },
    },
  ];
  for (const vp of [MOBILE, DESKTOP]) {
    for (const state of STATES) {
      test(`[F1.4 c16][NFR-A11Y-001] axe finds zero violations on ${state.name} @${vp.width}`, async ({ page }) => {
        await page.setViewportSize(vp);
        await stub(page, state.auth, state.register);
        await toStep2(page);
        await state.run(page);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const result = await runAxe(page, { tags: AXE_TAGS });
        expect(result.passes, 'axe actually evaluated rules').toBeGreaterThan(0);
        expect(result.violations).toEqual([]);
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------------
interface Focused {
  label: string;
  x: number;
  y: number;
}
const focusedInfo = (page: Page): Promise<Focused> =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (a === null) return { label: '', x: 0, y: 0 };
    const labelled = a instanceof HTMLInputElement ? (a.labels?.[0]?.textContent ?? '') : '';
    const label = (a.getAttribute('aria-label') ?? (labelled || (a.textContent ?? ''))).replace(/\s+/g, ' ').trim();
    const target = a instanceof HTMLInputElement && a.type === 'checkbox' ? (a.closest('label') ?? a) : a;
    const r = target.getBoundingClientRect();
    return { label, x: r.left + window.scrollX + r.width / 2, y: r.top + window.scrollY + r.height / 2 };
  });
async function tabTo(page: Page, name: RegExp, trail: Focused[], max = 25): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    const f = await focusedInfo(page);
    if (name.test(f.label)) {
      trail.push(f);
      return;
    }
  }
  throw new Error(`Tab did not reach ${String(name)} within ${max} presses`);
}

test.describe('F1.4 criterion 17 [WCAG 2.1.1 · 2.4.3 · 2.5.8 · NFR-USAB-004] keyboard, targets, focus, title', () => {
  for (const vp of [MOBILE, DESKTOP]) {
    test(`[F1.4 c17][WCAG 2.1.1] step 2 is completed by keyboard alone, in visual order, and lands on /feed with focus on main @${vp.width}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await stub(page, [AUTH_OK], [ROUTE_201]);
      await toStep2(page);
      const trail: Focused[] = [];
      await tabTo(page, /^אימייל/, trail);
      await page.keyboard.type(EMAIL);
      await tabTo(page, /^סיסמה/, trail);
      await page.keyboard.type(PASSWORD);
      await tabTo(page, /אישור תנאי השימוש/, trail);
      await page.keyboard.press('Space');
      await expect(consent(page)).toBeChecked();
      await tabTo(page, /^יצירת חשבון$/, trail);
      for (let i = 1; i < trail.length; i += 1) {
        const a = trail[i - 1];
        const b = trail[i];
        if (a === undefined || b === undefined) throw new Error('trail hole');
        expect(b.y > a.y + 2 || (Math.abs(b.y - a.y) <= 2 && b.x < a.x), `"${a.label}" -> "${b.label}" follows the visual order`).toBe(true);
      }
      await page.keyboard.press('Enter');
      await expect(h1Of(page)).toHaveText('פיד');
      await expect(page.locator('main')).toBeFocused();
    });
  }

  test('[F1.4 c17][WCAG 2.5.8 · NFR-USAB-004] every control is at least 24x24 CSS px, and "יצירת חשבון" at least 44x44', async ({ page }) => {
    await stub(page, [AUTH_OK], [ROUTE_201]);
    for (const vp of [MOBILE, DESKTOP]) {
      await page.setViewportSize(vp);
      await toStep2(page);
      const small = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll('input, select, button, a[href]')) {
          let r = el.getBoundingClientRect();
          if (el instanceof HTMLInputElement && (r.width <= 1 || r.height <= 1)) {
            const label = el.labels?.[0] ?? el.closest('label');
            if (label !== null && label !== undefined) r = label.getBoundingClientRect();
          }
          if (r.width === 0 && r.height === 0) continue;
          // an inline link inside running text is exempt under WCAG 2.5.8; every other control is measured
          const inline = el instanceof HTMLAnchorElement && el.closest('label, p, span') !== null && getComputedStyle(el).display === 'inline';
          if (!inline && (r.width < 24 || r.height < 24)) out.push(`${el.tagName} ${el.getAttribute('aria-label') ?? el.textContent ?? ''} ${r.width}x${r.height}`);
        }
        return out;
      });
      expect(small, `controls under 24x24 @${vp.width}`).toEqual([]);
      const box = await submit(page).boundingBox();
      expect(box?.width ?? 0, `submit width @${vp.width}`).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0, `submit height @${vp.width}`).toBeGreaterThanOrEqual(44);
    }
  });

  test('[F1.4 c17][WCAG 2.4.2] the title of step 2 is "פרטי התחברות · Nestly"', async ({ page }) => {
    await stub(page, [AUTH_OK], [ROUTE_201]);
    await toStep2(page);
    await expect(page).toHaveTitle('פרטי התחברות · Nestly');
  });

  test('[F1.4 c17][NFR-USAB-004] while the request runs the button is aria-disabled; a double activation sends one sign-up', async ({ page }) => {
    const stubs = await stub(page, [{ ...AUTH_OK, delay: 800 }], [ROUTE_201]);
    await toStep2(page);
    await fillStep2(page);
    await submit(page).click();
    await expect(submit(page)).toHaveAttribute('aria-disabled', 'true');
    // Playwright treats aria-disabled as not actionable, so further activations are dispatched directly
    await submit(page).dispatchEvent('click');
    await submit(page).dispatchEvent('click');
    await submit(page).focus();
    await page.keyboard.press('Enter');
    await expect(h1Of(page)).toHaveText('פיד');
    expect(stubs.authCalls).toHaveLength(1);
    expect(stubs.registerCalls).toHaveLength(1);
  });

  test('[F1.4 c5][WCAG 2.4.3] after an empty submit focus is on the first invalid field (the email)', async ({ page }) => {
    await toStep2(page);
    await submit(page).click();
    await expect(email(page)).toBeFocused();
  });
});

const SLASH_FORMS = [/[א-ת]\/[א-ת]/, /\/(?:ה|י|ית|ת)(?![א-ת])/];

test.describe('F1.4 criterion 18 [NFR-USAB-003 · rtl-hebrew] RTL and copy', () => {
  test('[F1.4 c18] dir="rtl"; the email input is dir="ltr" with its label right-aligned; no horizontal scroll at 375 with every error shown', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await toStep2(page);
    await submit(page).click();
    await expect(alertWith(page, NO_CONSENT)).toBeVisible();
    const info = await page.evaluate(() => {
      const input = document.querySelector('input[type="email"]');
      const label = input instanceof HTMLInputElement ? input.labels?.[0] : undefined;
      const lr = label?.getBoundingClientRect();
      const ir = input?.getBoundingClientRect();
      return {
        lang: document.documentElement.getAttribute('lang'),
        dir: document.documentElement.getAttribute('dir'),
        inputDir: input?.getAttribute('dir') ?? '',
        labelAlign: label ? getComputedStyle(label).textAlign : '',
        labelRight: lr?.right ?? -1,
        inputRight: ir?.right ?? -1,
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      };
    });
    expect(info.lang).toBe('he');
    expect(info.dir).toBe('rtl');
    expect(info.inputDir).toBe('ltr');
    expect(['right', 'start']).toContain(info.labelAlign);
    expect(info.labelRight, 'the label ends at the right edge of the field').toBeGreaterThanOrEqual(info.inputRight - 2);
    expect(info.sw).toBeLessThanOrEqual(info.cw);
  });

  test('[F1.4 c18] no slash gender form in the rendered step 2 text, with and without errors; actions are nouns', async ({ page }) => {
    await toStep2(page);
    const before = await bodyText(page);
    await submit(page).click();
    await expect(alertWith(page, NO_CONSENT)).toBeVisible();
    const after = await bodyText(page);
    for (const text of [before, after]) for (const re of SLASH_FORMS) expect(text).not.toMatch(re);
    const names = await page.getByRole('button').evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').replace(/\s+/g, ' ').trim()));
    expect(names.sort()).toEqual(['הצגת הסיסמה', 'חזרה', 'יצירת חשבון'].sort());
  });
});

test.describe('F1.4 criterion 19 [F1.3 criterion 13] back from step 2', () => {
  test('[F1.4 c19] "חזרה" returns to step 1 with the values; on step 2 again the email is kept and the password is empty', async ({ page }) => {
    await toStep2(page);
    await email(page).fill(EMAIL);
    await password(page).fill(PASSWORD);
    await page.getByRole('button', { name: 'חזרה', exact: true }).click();
    await expect(h1Of(page)).toHaveText('פרטים אישיים');
    await expect(page.getByLabel(/^שם מלא/)).toHaveValue(NAME);
    await page.getByRole('button', { name: 'המשך', exact: true }).click();
    await expect(h1Of(page)).toHaveText(STEP2_H1);
    await expect(email(page)).toHaveValue(EMAIL);
    await expect(password(page)).toHaveValue('');
  });

  test('[F1.4 c19] the browser Back button does the same, and a reload on step 2 lands on an empty step 1', async ({ page }) => {
    await toStep2(page);
    await email(page).fill(EMAIL);
    await page.goBack();
    await expect(h1Of(page)).toHaveText('פרטים אישיים');
    await expect(page.getByLabel(/^שם מלא/)).toHaveValue(NAME);
    await page.getByRole('button', { name: 'המשך', exact: true }).click();
    await expect(h1Of(page)).toHaveText(STEP2_H1);
    await page.reload();
    // the e2e session seam is a controllable source that starts in "loading" after every reload (F1.5 keeps it for the build under
    // test; the production source restores from storage): put it back to signed-out
    await waitForSeam(page);
    await setState(page, 'signed-out');
    await expect(h1Of(page)).toHaveText('פרטים אישיים');
    await expect(page.getByLabel(/^שם מלא/)).toHaveValue('');
  });
});

test.describe('F1.4 criterion 4 the placeholder pages the consent links lead to', () => {
  for (const [path, h1] of [['/terms', 'תנאי השימוש'], ['/privacy', 'מדיניות הפרטיות']] as const) {
    // /recovery stopped being a placeholder in F1.6 c16; recovery-web.spec.ts covers it
    test(`[F1.4 c4] ${path} is a Guest placeholder page "${h1}" with the "בקרוב" line`, async ({ page }) => {
      await open(page, path, 'signed-out');
      await expect(h1Of(page)).toHaveText(h1);
      await expect(page.getByText('המסך הזה ייפתח בקרוב.')).toBeVisible();
      expect(pathOf(page)).toBe(path);
    });
  }
});
