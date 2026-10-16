// F2.0 part (b): criteria c14 (forced new-password screen) and c15 (password change screen and menu entry). Derived from
// .work/account-takeover-close/spec.md and the SRS texts ERR-042/043/044. Real session source, network stubbed (as recovery-web.spec.ts).
// Copy Q-3 may be refined by ux-copy-he "without changing meaning", so only its fixed fragments are asserted.
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { runAxe } from './helpers';
import { APP, MENU_BUTTON, pathOf } from './app-helpers';

test.use({ baseURL: APP, viewport: { width: 375, height: 812 } });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const EMAIL = 'dana.cohen@example.com';
const PASSWORD = 'Zq-7-unique-pw-marker-91';
const NEW_PASSWORD = 'Nw-8-fresh-pw-marker-42';
const A1 = 'רקסמארקר';
const A2 = 'דובימארקר';
// SRS 10-errors-edge-cases.md.
const ERR_042 = 'הפרטים שהוזנו אינם תואמים. אפשר לנסות שוב';
const ERR_043 = 'בוצעו יותר מדי ניסיונות. אפשר לנסות שוב מאוחר יותר';
const ERR_044 = 'לא הצלחנו להשלים את הפעולה כרגע. אפשר לנסות שוב מאוחר יותר';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const SESSION = {
  access_token: 'e2e-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  refresh_token: 'e2e-refresh',
  user: { id: 'f0000000-0000-4000-8000-0000000000f1', aud: 'authenticated', role: 'authenticated', email: EMAIL, identities: [], app_metadata: {}, user_metadata: {}, created_at: '2026-10-14T10:00:00Z' },
};

interface Net {
  mustSet: boolean;
  questions: 'missing' | 'set';
  /** Status of the next POST /api/password/forced and /api/password/change. */
  forced: number;
  change: number;
  hold: Promise<void> | null;
  forcedBodies: unknown[];
  changeBodies: unknown[];
  urls: string[];
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const bodyOf = (route: Route): unknown => JSON.parse(route.request().postData() ?? 'null');
const errorBody = (status: number) => ({ error: status === 401 ? 'invalid_recovery' : status === 429 ? 'rate_limited' : 'unavailable' });

async function setup(page: Page, opts: { mustSet?: boolean; questions?: 'missing' | 'set' } = {}): Promise<Net> {
  const net: Net = { mustSet: opts.mustSet ?? false, questions: opts.questions ?? 'set', forced: 200, change: 200, hold: null, forcedBodies: [], changeBodies: [], urls: [] };
  await page.addInitScript(() => {
    Reflect.set(window, 'nestlyRealSession', true);
  });
  page.on('request', (r) => net.urls.push(r.url()));
  await page.route('https://e2e-stub.invalid/auth/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.url().includes('/token')) return json(route, 200, SESSION);
    if (req.url().includes('/logout')) return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET' && req.url().includes('/auth/v1/user')) return json(route, 200, { id: 'u-1', email: 'x@example.com', app_metadata: { provider: 'email' } });
    return json(route, 404, { error: 'unstubbed' });
  });
  await page.route('**/api/me', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, { state: 'active', mustSetPassword: net.mustSet, recoveryQuestions: net.questions });
  });
  await page.route('**/api/password/forced', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    net.forcedBodies.push(bodyOf(route));
    if (net.hold !== null) await net.hold;
    if (net.forced === 200) {
      net.mustSet = false;
      net.questions = 'missing';
      return json(route, 200, { ok: true });
    }
    return json(route, net.forced, errorBody(net.forced));
  });
  await page.route('**/api/password/change', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    net.changeBodies.push(bodyOf(route));
    if (net.hold !== null) await net.hold;
    return net.change === 200 ? json(route, 200, { ok: true }) : json(route, net.change, errorBody(net.change));
  });
  return net;
}

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const newPassword = (page: Page) => page.getByLabel('סיסמה חדשה', { exact: true });
const showHide = (page: Page) => page.getByRole('button', { name: 'הצגת הסיסמה', exact: true });
const pet = (page: Page) => page.getByLabel(/חיית המחמד/);
const nick = (page: Page) => page.getByLabel(/כינו אתכם/);
const submit = (page: Page) => page.locator('main form button[type="submit"], form button[type="submit"]').first();
const statuses = (page: Page) => page.getByRole('status').filter({ hasText: /\S/ });
const alertText = async (page: Page) => (await page.getByRole('alert').first().innerText()).trim();
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const stored = (page: Page) => page.evaluate(() => JSON.stringify([window.localStorage, window.sessionStorage, window.history.state, location.href]));

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await emailField(page).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
}
async function openChangePassword(page: Page): Promise<void> {
  await signIn(page);
  await expect(page).toHaveURL(/\/feed$/);
  await page.getByRole('button', { name: MENU_BUTTON }).click();
  await page.getByRole('link', { name: 'החלפת סיסמה', exact: true }).click();
  await expect(page).toHaveURL(/\/change-password$/);
}
async function fillChange(page: Page, answers: string[] = [A1, A2]): Promise<void> {
  const fields = [pet(page), nick(page)];
  for (const [i, a] of answers.entries()) await fields[i]?.fill(a);
  await newPassword(page).fill(NEW_PASSWORD);
}

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.0 c14 forced new-password screen', () => {
  test('[F2.0 c14] while "must set password" holds, sign-in shows the screen: heading, the explanation, a hidden new password with show/hide, submit', async ({ page }) => {
    await setup(page, { mustSet: true, questions: 'missing' });
    await signIn(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/הסיסמה הקודמת בוטלה/)).toBeVisible();
    await expect(page.getByText(/כל המכשירים האחרים נותקו/)).toBeVisible();
    await expect(newPassword(page)).toHaveAttribute('type', 'password');
    await showHide(page).click();
    await expect(newPassword(page)).toHaveAttribute('type', 'text');
    await expect(submit(page)).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
  });

  test('[F2.0 c14] it comes before PG-052, and every other route returns to it', async ({ page }) => {
    await setup(page, { mustSet: true, questions: 'missing' });
    await signIn(page);
    await expect(newPassword(page)).toBeVisible();
    const here = pathOf(page);
    expect(here).not.toBe('/recovery-questions');
    for (const to of ['/feed', '/home', '/profile', '/settings', '/recovery-questions', '/change-password']) {
      await page.goto(to);
      await expect(newPassword(page)).toBeVisible();
      expect(pathOf(page)).toBe(here);
    }
  });

  test('[F2.0 c14] submit sends exactly the password once and success leads to the PG-052 setup', async ({ page }) => {
    const net = await setup(page, { mustSet: true, questions: 'missing' });
    await signIn(page);
    await newPassword(page).fill(NEW_PASSWORD);
    await submit(page).click();
    await expect(page).toHaveURL(/\/recovery-questions$/);
    await expect(pet(page)).toBeVisible();
    expect(net.forcedBodies).toEqual([{ password: NEW_PASSWORD }]);
    expect(net.urls.join('\n')).not.toContain(encodeURIComponent(NEW_PASSWORD));
  });

  test('[F2.0 c14] a failure shows the ERR-044 text and empties the password field', async ({ page }) => {
    const net = await setup(page, { mustSet: true, questions: 'missing' });
    net.forced = 503;
    await signIn(page);
    await newPassword(page).fill(NEW_PASSWORD);
    await submit(page).click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    expect(await alertText(page)).toContain(ERR_044);
    await expect(newPassword(page)).toHaveValue('');
    expect(pathOf(page)).not.toBe('/recovery-questions');
  });

  test('[F2.0 c14] no double submit: a second click and Enter while the first is in flight send nothing', async ({ page }) => {
    const net = await setup(page, { mustSet: true, questions: 'missing' });
    let release: () => void = () => undefined;
    net.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await signIn(page);
    await newPassword(page).fill(NEW_PASSWORD);
    await submit(page).click();
    await expect.poll(() => net.forcedBodies.length).toBe(1);
    await submit(page).click({ timeout: 2000 }).catch(() => undefined);
    await page.keyboard.press('Enter');
    release();
    await expect(page).toHaveURL(/\/recovery-questions$/);
    expect(net.forcedBodies).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.0 c15 password-change screen and menu entry', () => {
  test('[F2.0 c15] the menu has "החלפת סיסמה" right after "שאלות לשחזור סיסמה" and it opens /change-password', async ({ page }) => {
    await setup(page);
    await signIn(page);
    await expect(page).toHaveURL(/\/feed$/);
    await page.getByRole('button', { name: MENU_BUTTON }).click();
    const names = (await page.getByRole('link').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    const at = names.indexOf('שאלות לשחזור סיסמה');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(names[at + 1]).toBe('החלפת סיסמה');
    await page.getByRole('link', { name: 'החלפת סיסמה', exact: true }).click();
    await expect(page).toHaveURL(/\/change-password$/);
  });

  test('[F2.0 c15] the answer fields come first and then "סיסמה חדשה" with show/hide and submit', async ({ page }) => {
    await setup(page);
    await openChangePassword(page);
    await expect(pet(page)).toHaveCount(1);
    const answer = await pet(page).boundingBox();
    const password = await newPassword(page).boundingBox();
    expect(answer?.y ?? 0).toBeLessThan(password?.y ?? 0);
    await expect(newPassword(page)).toHaveAttribute('type', 'password');
    await showHide(page).click();
    await expect(newPassword(page)).toHaveAttribute('type', 'text');
    await expect(submit(page)).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
  });

  test('[F2.0 c15] success: one request with two answers and the password, the confirmation, no alert, nothing kept in storage, URL or history', async ({ page }) => {
    const net = await setup(page);
    await openChangePassword(page);
    await fillChange(page);
    await submit(page).click();
    await expect(statuses(page)).toContainText(/הסיסמה הוחלפה/);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(net.changeBodies).toHaveLength(1);
    const sent = net.changeBodies[0];
    expect(JSON.stringify(sent)).toContain(NEW_PASSWORD);
    expect(typeof sent === 'object' && sent !== null && 'current' in sent && Array.isArray(sent.current) ? sent.current.length : -1).toBe(2);
    const kept = await stored(page);
    for (const secret of [A1, A2, NEW_PASSWORD]) {
      expect(kept).not.toContain(secret);
      expect(net.urls.join('\n')).not.toContain(encodeURIComponent(secret));
    }
  });

  test('[F2.0 c15] ERR-042, ERR-043 and ERR-044 each show their SRS text and empty the new password', async ({ page }) => {
    const net = await setup(page);
    await openChangePassword(page);
    for (const [status, text] of [[401, ERR_042], [429, ERR_043], [503, ERR_044]] as const) {
      net.change = status;
      await fillChange(page);
      await submit(page).click();
      await expect(page.getByRole('alert')).toHaveCount(1);
      expect(await alertText(page)).toContain(text);
      await expect(newPassword(page)).toHaveValue('');
    }
  });

  test('[F2.0 c15] answers missing: a field error and nothing is sent', async ({ page }) => {
    const net = await setup(page);
    await openChangePassword(page);
    await newPassword(page).fill(NEW_PASSWORD);
    await submit(page).click();
    expect(await page.locator('[aria-invalid="true"]').count()).toBeGreaterThan(0);
    expect(net.changeBodies).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
for (const vp of [{ name: '375', size: { width: 375, height: 812 } }, { name: '1280', size: { width: 1280, height: 800 } }]) {
  test.describe(`F2.0 c14 c15 [WCAG 2.1 AA] axe at ${vp.name}`, () => {
    test.use({ viewport: vp.size });
    const scan = async (page: Page): Promise<void> => {
      const result = await runAxe(page, { tags: AXE_TAGS });
      expect(result.checked).toBeGreaterThan(0);
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
    };

    test(`[F2.0 c14] forced new-password screen: empty and failed (${vp.name})`, async ({ page }) => {
      const net = await setup(page, { mustSet: true, questions: 'missing' });
      net.forced = 503;
      await signIn(page);
      await expect(newPassword(page)).toBeVisible();
      await scan(page);
      await newPassword(page).fill(NEW_PASSWORD);
      await submit(page).click();
      await expect(page.getByRole('alert')).toHaveCount(1);
      await scan(page);
    });

    test(`[F2.0 c15] side menu open, password-change screen: empty, error, success (${vp.name})`, async ({ page }) => {
      const net = await setup(page);
      await signIn(page);
      await expect(page).toHaveURL(/\/feed$/);
      await page.getByRole('button', { name: MENU_BUTTON }).click();
      await expect(page.getByRole('link', { name: 'החלפת סיסמה', exact: true })).toBeVisible();
      await scan(page);
      await page.getByRole('link', { name: 'החלפת סיסמה', exact: true }).click();
      await expect(newPassword(page)).toBeVisible();
      await scan(page);
      net.change = 401;
      await fillChange(page);
      await submit(page).click();
      await expect(page.getByRole('alert')).toHaveCount(1);
      await scan(page);
      net.change = 200;
      await fillChange(page);
      await submit(page).click();
      await expect(statuses(page)).toContainText(/הסיסמה הוחלפה/);
      await scan(page);
    });
  });
}
