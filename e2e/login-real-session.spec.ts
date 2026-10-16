// I1 F1.5 part c (real browser, REAL session source): criteria 10 (no leaks), 14 (logout, Back) and 20 (axe at 375 and 1024, keyboard-only
// login, targets, RTL). The e2e build runs the production wiring when window.nestlyRealSession is set before load (CRITIC F6): the Auth
// endpoint (https://e2e-stub.invalid/auth/v1/**), GET /api/me and POST /api/register are stubbed at the network layer.
// Derived from .work/login-session/spec.md and interface.md "part c" only. No type assertions, no force clicks.
import { expect, test } from '@playwright/test';
import type { Page, Request, Route } from '@playwright/test';
import { DESKTOP, MOBILE, runAxe } from './helpers';
import { APP, MENU_BUTTON, WELCOME_H1, bodyText, pathOf, watch, seen, resetSeen } from './app-helpers';

test.use({ baseURL: APP, viewport: MOBILE });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const EMAIL = 'dana.cohen@example.com';
const PASSWORD = 'Zq-7-unique-pw-marker-91';
const TOKEN = 'e2e-access-token-from-auth';
const INVALID = 'האימייל או הסיסמה שגויים. אפשר לנסות שוב';
const STOPPED = 'הכניסה לחשבון הזה אינה זמינה כרגע';
const STORAGE_KEY = 'nestly-auth';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

type MeState = 'active' | 'unavailable' | 'unregistered';
interface Setup {
  /** Auth's answer to the password grant. */
  login?: 'ok' | 'invalid';
  me?: MeState;
}
interface Seen {
  method: string;
  url: string;
  postData: string | null;
  headers: Record<string, string>;
}
interface Net {
  all: Seen[];
  console: string[];
  tokenCalls: Seen[];
  meCalls: Seen[];
  logoutCalls: Seen[];
}

const seenOf = (r: Request): Seen => ({ method: r.method(), url: r.url(), postData: r.postData(), headers: r.headers() });
const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

const AUTH_SESSION = {
  access_token: TOKEN,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  refresh_token: 'e2e-refresh',
  user: {
    id: 'f0000000-0000-4000-8000-0000000000f1',
    aud: 'authenticated',
    role: 'authenticated',
    email: EMAIL,
    identities: [],
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-10-14T10:00:00Z',
  },
};

async function setup(page: Page, opts: Setup = {}): Promise<Net> {
  const net: Net = { all: [], console: [], tokenCalls: [], meCalls: [], logoutCalls: [] };
  await page.addInitScript(() => {
    Reflect.set(window, 'nestlyRealSession', true);
  });
  page.on('request', (r) => net.all.push(seenOf(r)));
  page.on('console', (m) => net.console.push(m.text()));
  await page.route('https://e2e-stub.invalid/auth/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const url = req.url();
    if (url.includes('/token') && url.includes('grant_type=password')) {
      net.tokenCalls.push(seenOf(req));
      if ((opts.login ?? 'ok') === 'invalid') {
        await json(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'SECRET_RAW_AUTH_MESSAGE' });
        return;
      }
      await json(route, 200, AUTH_SESSION);
      return;
    }
    if (url.includes('/token') && url.includes('grant_type=refresh_token')) {
      await json(route, 200, AUTH_SESSION);
      return;
    }
    if (url.includes('/logout')) {
      net.logoutCalls.push(seenOf(req));
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    // F1.8 c7/c10: completion asks the Auth user to tell a Google user from an email+password orphan; this is the latter.
    if (req.method() === 'GET' && url.includes('/auth/v1/user')) {
      await json(route, 200, { id: 'u-1', email: EMAIL, app_metadata: { provider: 'email' } });
      return;
    }
    await json(route, 404, { error: 'unstubbed' });
  });
  await page.route('**/api/me', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    net.meCalls.push(seenOf(route.request()));
    await json(route, 200, { state: opts.me ?? 'active' });
  });
  await page.route('**/api/register', async (route) => json(route, 201, { status: 'created' }));
  return net;
}

// ---- locators and steps ----------------------------------------------------------------------------------------------
const email = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const password = (page: Page) => page.getByLabel('סיסמה', { exact: true });
const submit = (page: Page) => page.getByRole('button', { name: 'התחברות', exact: true });
const h1Of = (page: Page) => page.getByRole('heading', { level: 1 });

async function openLogin(page: Page): Promise<void> {
  await page.goto('/login');
  await expect(h1Of(page)).toHaveText('התחברות');
}
async function fillLogin(page: Page): Promise<void> {
  await email(page).fill(EMAIL);
  await password(page).fill(PASSWORD);
}
async function login(page: Page): Promise<void> {
  await openLogin(page);
  await fillLogin(page);
  await submit(page).click();
}
const storageKeys = (page: Page): Promise<string[]> => page.evaluate(() => Object.keys(window.localStorage));
const sessionKeys = (page: Page): Promise<string[]> => page.evaluate(() => Object.keys(window.sessionStorage));
const storedAuth = (page: Page): Promise<string | null> => page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY);

async function logoutFromMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: MENU_BUTTON }).click();
  await page.getByRole('button', { name: 'התנתקות', exact: true }).click();
}

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F1.5 c10 [NFR-SEC-001] no leaks, against the real session source', () => {
  test('[F1.5 c10][precondition] the real source is running: window.nestlyTestSession is absent and sign-in calls the Auth URL', async ({ page }) => {
    const net = await setup(page);
    await login(page);
    await expect(h1Of(page)).toHaveText('פיד');
    expect(await page.evaluate(() => Reflect.has(window, 'nestlyTestSession'))).toBe(false);
    expect(net.tokenCalls).toHaveLength(1);
    expect(net.meCalls).toHaveLength(1);
    expect(net.meCalls[0]?.headers['authorization']).toBe(`Bearer ${TOKEN}`);
  });

  test('[F1.5 c10] the password is only in the body of the Auth password-grant request: no URL, header, other body, console line or the DOM', async ({ page }) => {
    const net = await setup(page);
    await login(page);
    await expect(h1Of(page)).toHaveText('פיד');
    expect(net.tokenCalls[0]?.postData ?? '').toContain(PASSWORD);
    for (const r of net.all) {
      const isTokenCall = net.tokenCalls.some((t) => t.url === r.url && t.postData === r.postData && t.method === r.method);
      expect(r.url, `url ${r.url}`).not.toContain(PASSWORD);
      expect(JSON.stringify(r.headers), `headers of ${r.url}`).not.toContain(PASSWORD);
      if (!isTokenCall) expect(r.postData ?? '', `body of ${r.method} ${r.url}`).not.toContain(PASSWORD);
    }
    expect(net.console.join('\n')).not.toContain(PASSWORD);
    expect(await page.content()).not.toContain(PASSWORD);
    expect(await page.evaluate(() => document.cookie)).not.toContain(PASSWORD);
  });

  test('[F1.5 c10][F1.4 c13 changed] after login the web storage holds only nestly-auth, with the session fields and neither email nor password', async ({ page }) => {
    await setup(page);
    await login(page);
    await expect(h1Of(page)).toHaveText('פיד');
    expect(await storageKeys(page)).toEqual([STORAGE_KEY]);
    expect(await sessionKeys(page)).toEqual([]);
    const raw = await storedAuth(page);
    expect(raw).not.toBeNull();
    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toContain(EMAIL);
    const value: unknown = JSON.parse(raw ?? 'null');
    expect(value).not.toBeNull();
    expect(typeof value === 'object' && value !== null ? Object.keys(value).sort() : []).toEqual(['access_token', 'expires_at', 'expires_in', 'refresh_token', 'token_type']);
  });

  test('[F1.5 c10] a wrong password leaves the storage empty and the password nowhere but the Auth request', async ({ page }) => {
    const net = await setup(page, { login: 'invalid' });
    await login(page);
    await expect(page.getByRole('alert').filter({ hasText: INVALID })).toBeVisible();
    expect(await storageKeys(page)).toEqual([]);
    expect(net.meCalls).toHaveLength(0);
    expect(await page.content()).not.toContain('SECRET_RAW_AUTH_MESSAGE');
    expect(await password(page).inputValue()).toBe('');
  });

  test('[F1.5 c10][c8] a stopped-account sign-in leaves the storage empty, ends the Auth session, and shows the stopped text on /login', async ({ page }) => {
    const net = await setup(page, { me: 'unavailable' });
    const guard = await seenNavAndShell(page);
    await login(page);
    await expect(page.getByRole('alert').filter({ hasText: STOPPED })).toBeVisible();
    expect(pathOf(page)).toBe('/login');
    expect(await storageKeys(page)).toEqual([]);
    expect(net.logoutCalls.length).toBeGreaterThanOrEqual(1);
    expect(await seen(page), 'a protected screen was rendered for a stopped account').toEqual([]);
    expect(guard).toBe(true);
  });

  test('[F1.5 c10] after logout the web storage is empty', async ({ page }) => {
    const net = await setup(page);
    await login(page);
    await expect(h1Of(page)).toHaveText('פיד');
    await logoutFromMenu(page);
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
    expect(await storageKeys(page)).toEqual([]);
    expect(await sessionKeys(page)).toEqual([]);
    expect(net.logoutCalls).toHaveLength(1);
    expect(net.logoutCalls[0]?.url).toContain('scope=local');
  });

  test('[F1.5 c10][c11] a reload with a stored session stays signed in without the login screen, and the storage is unchanged in shape', async ({ page }) => {
    await setup(page);
    await login(page);
    await expect(h1Of(page)).toHaveText('פיד');
    await page.reload();
    await expect(h1Of(page)).toHaveText('פיד');
    expect(pathOf(page)).toBe('/feed');
    expect(await storageKeys(page)).toEqual([STORAGE_KEY]);
  });
});

/** Installs the "protected screen ever rendered" watcher; returns true so it can be asserted for being installed. */
async function seenNavAndShell(page: Page): Promise<boolean> {
  await watch(page, { selectors: ['nav[aria-label="ניווט ראשי"]', 'button[aria-label="פתיחת התפריט"]'] });
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F1.5 c14 [FR-MENU-001] logout and Back, against the real session source', () => {
  test('[F1.5 c14] menu "התנתקות": storage cleared, URL /, Welcome; browser Back never renders a protected screen', async ({ page }) => {
    const net = await setup(page);
    await login(page);
    await expect(h1Of(page)).toHaveText('פיד');
    await page.goto('/profile');
    await expect(h1Of(page)).toHaveText('פרופיל');
    await watch(page, { selectors: ['nav[aria-label="ניווט ראשי"]'] });
    await logoutFromMenu(page);
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
    expect(pathOf(page)).toBe('/');
    expect(await storageKeys(page)).toEqual([]);
    await resetSeen(page);
    await page.goBack();
    await page.waitForLoadState('domcontentloaded');
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
    expect(pathOf(page)).toBe('/');
    expect(await bodyText(page)).not.toContain('המסך הזה ייפתח בקרוב');
    expect(await storageKeys(page)).toEqual([]);
    expect(await seen(page)).toEqual([]);
    expect(net.logoutCalls).toHaveLength(1);
  });

  test('[F1.5 c14] a protected URL typed after logout leads to Welcome, not to the page', async ({ page }) => {
    await setup(page);
    await login(page);
    await expect(h1Of(page)).toHaveText('פיד');
    await logoutFromMenu(page);
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
    await page.goto('/settings');
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
    expect(pathOf(page)).toBe('/');
  });

  test('[F1.5 c14] the Auth sign-out call failing still signs the user out and clears the storage', async ({ page }) => {
    await setup(page);
    await page.route('https://e2e-stub.invalid/auth/v1/logout**', (route) => route.abort('connectionreset'));
    await login(page);
    await expect(h1Of(page)).toHaveText('פיד');
    await logoutFromMenu(page);
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
    expect(await storageKeys(page)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
const VIEWPORTS = [
  { name: '375', size: MOBILE },
  { name: '1024', size: DESKTOP },
];

for (const vp of VIEWPORTS) {
  test.describe(`F1.5 c20 [WCAG 2.1.1/2.4.3/2.5.8 · NFR-USAB-004] axe at ${vp.name}`, () => {
    test.use({ viewport: vp.size });

    const scan = async (page: Page): Promise<void> => {
      const result = await runAxe(page, { tags: AXE_TAGS });
      expect(result.checked).toBeGreaterThan(0);
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
    };

    test(`[F1.5 c20] empty login screen (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openLogin(page);
      await scan(page);
    });

    test(`[F1.5 c20] field errors (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openLogin(page);
      await submit(page).click();
      await expect(page.getByText('יש למלא כתובת אימייל')).toBeVisible();
      await expect(page.getByText('יש למלא סיסמה')).toBeVisible();
      await scan(page);
    });

    test(`[F1.5 c20] ERR-001 (${vp.name})`, async ({ page }) => {
      await setup(page, { login: 'invalid' });
      await login(page);
      await expect(page.getByRole('alert').filter({ hasText: INVALID })).toBeVisible();
      await scan(page);
    });

    test(`[F1.5 c20] stopped account (${vp.name})`, async ({ page }) => {
      await setup(page, { me: 'unavailable' });
      await login(page);
      await expect(page.getByRole('alert').filter({ hasText: STOPPED })).toBeVisible();
      await scan(page);
    });

    test(`[F1.5 c20] completion screen, step 1 and the consent step (${vp.name})`, async ({ page }) => {
      await setup(page, { me: 'unregistered' });
      await login(page);
      await expect(h1Of(page)).toHaveText('השלמת ההרשמה');
      expect(pathOf(page)).toBe('/register');
      await scan(page);
      await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
      await page.getByLabel(/^שם מלא/).fill('תמרהייחודית');
      await page.getByRole('button', { name: 'המשך', exact: true }).click();
      await expect(page.getByRole('checkbox', { name: /אישור תנאי השימוש/ })).toBeAttached();
      await scan(page);
    });

    test(`[F1.5 c20] menu open on a protected screen (${vp.name})`, async ({ page }) => {
      await setup(page);
      await login(page);
      await expect(h1Of(page)).toHaveText('פיד');
      await page.getByRole('button', { name: MENU_BUTTON }).click();
      await expect(page.getByRole('button', { name: 'התנתקות', exact: true })).toBeVisible();
      await scan(page);
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F1.5 c20 keyboard, targets, RTL', () => {
  test('[F1.5 c20][WCAG 2.1.1 · 2.4.3] login by keyboard alone; the focus order is the visual order', async ({ page }) => {
    const net = await setup(page);
    await openLogin(page);
    const order = [
      page.getByRole('link', { name: 'חזרה', exact: true }),
      email(page),
      password(page),
      page.getByRole('button', { name: 'הצגת הסיסמה', exact: true }),
      page.getByRole('link', { name: 'שכחתי סיסמה', exact: true }),
      submit(page),
      page.getByRole('button', { name: 'המשך עם Google', exact: true }), // F1.8 c16: between the submit and the register link
      page.getByRole('link', { name: 'יצירת חשבון חדש', exact: true }),
    ];
    // The first Tab from a fresh load lands on the first control in order; typing happens in the fields on the way.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'חזרה', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(email(page)).toBeFocused();
    await page.keyboard.type(EMAIL);
    await page.keyboard.press('Tab');
    await expect(password(page)).toBeFocused();
    await page.keyboard.type(PASSWORD);
    for (const next of order.slice(3)) {
      await page.keyboard.press('Tab');
      await expect(next).toBeFocused();
    }
    // Back to the submit button (past the Google button) and activate it from the keyboard.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(submit(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(h1Of(page)).toHaveText('פיד');
    expect(net.tokenCalls).toHaveLength(1);
    expect(net.tokenCalls[0]?.postData ?? '').toContain(EMAIL);
  });

  test('[F1.5 c20][WCAG 2.5.8] targets are at least 24x24 and the button at least 44x44', async ({ page }) => {
    await setup(page);
    await openLogin(page);
    const small = [
      page.getByRole('link', { name: 'חזרה', exact: true }),
      email(page),
      password(page),
      page.getByRole('button', { name: 'הצגת הסיסמה', exact: true }),
      page.getByRole('link', { name: 'שכחתי סיסמה', exact: true }),
      page.getByRole('link', { name: 'יצירת חשבון חדש', exact: true }),
    ];
    for (const l of small) {
      const box = await l.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
    }
    const button = await submit(page).boundingBox();
    expect(button?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(button?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test('[F1.5 c20][NFR-USAB-004] RTL, no horizontal scroll at 375, title, no slash gender forms', async ({ page }) => {
    await setup(page);
    await openLogin(page);
    expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl');
    await expect(page).toHaveTitle('התחברות · Nestly');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await bodyText(page)).not.toMatch(/\p{Script=Hebrew}+\/\p{Script=Hebrew}+/u);
  });

  test('[F1.5 c20] the error states also fit at 375 without horizontal scroll', async ({ page }) => {
    await setup(page, { login: 'invalid' });
    await login(page);
    await expect(page.getByRole('alert').filter({ hasText: INVALID })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
