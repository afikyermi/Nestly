// F1.6 part c (real browser, real session source, network stubbed): criteria 16, 17, 18 (journey, keyboard, axe at 375 and 1024)
// and 19. Derived from .work/password-recovery/spec.md (Amendment: no "later", an active account without answers is held on the
// questions screen). Wording that the spec does not fix is not asserted; the error texts are compared with each other instead.
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { DESKTOP, MOBILE, runAxe } from './helpers';
import { APP, MENU_BUTTON, pathOf } from './app-helpers';

test.use({ baseURL: APP, viewport: MOBILE });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const EMAIL = 'dana.cohen@example.com';
const PASSWORD = 'Zq-7-unique-pw-marker-91';
const NEW_PASSWORD = 'Nw-8-fresh-pw-marker-42';
const A1 = 'רקסמארקר';
const A2 = 'דובימארקר';
const A3 = 'הרצלמארקר';
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
  /** What GET /api/me answers. `broken` answers 500 with a body that is not JSON. */
  me: { state: 'active' | 'unregistered'; questions: 'missing' | 'set'; broken: boolean };
  /** The status of the next reset / save / change answer. */
  reset: number;
  save: number;
  change: number;
  hold: Promise<void> | null;
  resets: unknown[];
  saves: unknown[];
  changes: unknown[];
  urls: string[];
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const bodyOf = (route: Route): unknown => JSON.parse(route.request().postData() ?? 'null');

async function setup(page: Page, questions: 'missing' | 'set' = 'set', state: 'active' | 'unregistered' = 'active'): Promise<Net> {
  const net: Net = { me: { state, questions, broken: false }, reset: 200, save: 201, change: 200, hold: null, resets: [], saves: [], changes: [], urls: [] };
  await page.addInitScript(() => {
    Reflect.set(window, 'nestlyRealSession', true);
  });
  page.on('request', (r) => net.urls.push(r.url()));
  await page.route('https://e2e-stub.invalid/auth/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.url().includes('/token')) return json(route, 200, SESSION);
    if (req.url().includes('/logout')) return route.fulfill({ status: 204, headers: CORS });
    // F1.8 c7/c10: completion asks the Auth user to tell a Google user from an email+password orphan; this is the latter.
    if (req.method() === 'GET' && req.url().includes('/auth/v1/user')) {
      return json(route, 200, { id: 'u-1', email: 'x@example.com', app_metadata: { provider: 'email' } });
    }
    return json(route, 404, { error: 'unstubbed' });
  });
  await page.route('**/api/me', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (net.me.broken) return route.fulfill({ status: 500, headers: { ...CORS, 'content-type': 'text/plain' }, body: 'not json' });
    return json(route, 200, { state: net.me.state, ...(net.me.state === 'active' ? { recoveryQuestions: net.me.questions } : {}) });
  });
  await page.route('**/api/register', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    net.me.state = 'active';
    net.me.questions = 'missing';
    return json(route, 201, { status: 'created' });
  });
  await page.route('**/api/recovery/reset', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    net.resets.push(bodyOf(route));
    if (net.hold !== null) await net.hold;
    return net.reset === 200 ? json(route, 200, { ok: true }) : json(route, net.reset, { error: net.reset === 401 ? 'invalid_recovery' : net.reset === 429 ? 'rate_limited' : 'unavailable' });
  });
  await page.route('**/api/recovery-questions', async (route) => {
    const method = route.request().method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (method === 'POST') {
      net.saves.push(bodyOf(route));
      if (net.save === 201) net.me.questions = 'set';
      return net.save === 201 ? json(route, 201, { ok: true }) : json(route, net.save, { error: 'unavailable' });
    }
    net.changes.push(bodyOf(route));
    return net.change === 200 ? json(route, 200, { ok: true }) : json(route, net.change, { error: net.change === 401 ? 'invalid_recovery' : 'unavailable' });
  });
  return net;
}

// ---- locators and steps ----------------------------------------------------------------------------------------------
const h1Of = (page: Page) => page.getByRole('heading', { level: 1 });
const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const newPassword = (page: Page) => page.getByLabel('סיסמה חדשה', { exact: true });
const pet = (page: Page) => page.getByLabel(/חיית המחמד/);
const nick = (page: Page) => page.getByLabel(/כינו אתכם/);
const street = (page: Page) => page.getByLabel(/רחוב/);
const resetSubmit = (page: Page) => page.getByRole('button', { name: 'עדכון הסיסמה', exact: true });
const saveButton = (page: Page) => page.getByRole('button', { name: 'שמירה', exact: true });
const alertText = async (page: Page) => (await page.getByRole('alert').first().innerText()).trim();
const invalidCount = (page: Page) => page.locator('[aria-invalid="true"]').count();

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await emailField(page).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
}
async function fillReset(page: Page, answers: string[] = [A1, A2]): Promise<void> {
  await emailField(page).fill(EMAIL);
  const fields = [pet(page), nick(page), street(page)];
  for (const [i, a] of answers.entries()) await fields[i]?.fill(a);
  await newPassword(page).fill(NEW_PASSWORD);
}
async function openReset(page: Page): Promise<void> {
  await page.goto('/recovery');
  await expect(h1Of(page)).toBeVisible();
}
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F1.6 c16 [FR-AUTH-003] /recovery', () => {
  test('[F1.6 c16] the form: h1, email in ltr, the three questions as fields, the show/hide of the new password, submit', async ({ page }) => {
    await setup(page);
    await openReset(page);
    expect(pathOf(page)).toBe('/recovery');
    await expect(emailField(page)).toHaveAttribute('dir', 'ltr');
    await expect(page.getByText('ענו על השתיים שבחרתם בהרשמה')).toBeVisible();
    for (const f of [pet(page), nick(page), street(page)]) await expect(f).toBeVisible();
    await expect(newPassword(page)).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'הצגת הסיסמה', exact: true }).click();
    await expect(newPassword(page)).toHaveAttribute('type', 'text');
    await expect(resetSubmit(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl');
    expect(await noHorizontalScroll(page)).toBe(true);
  });

  for (const [label, answers] of [['one answer', [A1]], ['no answer', []], ['three answers', [A1, A2, A3]]] as const) {
    test(`[F1.6 c16] ${label}: a field error, focus on the first invalid field, and nothing is sent`, async ({ page }) => {
      const net = await setup(page);
      await openReset(page);
      await fillReset(page, [...answers]);
      await resetSubmit(page).click();
      expect(await invalidCount(page)).toBeGreaterThan(0);
      await expect(page.locator('[aria-invalid="true"]').first()).toBeFocused();
      expect(net.resets).toHaveLength(0);
    });
  }

  test('[F1.6 c16] success: exactly the two filled answers go in the body, one confirmation, no alert, answers and password gone from the page', async ({ page }) => {
    const net = await setup(page);
    await openReset(page);
    await fillReset(page);
    await resetSubmit(page).click();
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(net.resets).toHaveLength(1);
    const sent = net.resets[0];
    expect(JSON.stringify(sent)).toContain(NEW_PASSWORD);
    expect(typeof sent === 'object' && sent !== null && 'answers' in sent && Array.isArray(sent.answers) ? sent.answers.length : -1).toBe(2);
    for (const secret of [A1, A2, NEW_PASSWORD]) {
      expect(net.urls.join('\n')).not.toContain(encodeURIComponent(secret));
      expect(await page.evaluate(() => JSON.stringify([window.localStorage, window.sessionStorage, window.history.state]))).not.toContain(secret);
    }
  });

  test('[F1.6 c16] mismatch, lock and unavailable each show one text, three different texts; the password is emptied after each failure', async ({ page }) => {
    const net = await setup(page);
    await openReset(page);
    const texts: string[] = [];
    for (const status of [401, 429, 503]) {
      net.reset = status;
      await fillReset(page);
      await resetSubmit(page).click();
      await expect(page.getByRole('alert')).toHaveCount(1);
      texts.push(await alertText(page));
      await expect(newPassword(page)).toHaveValue('');
    }
    expect(texts.every((t) => t.length > 0)).toBe(true);
    expect(new Set(texts).size).toBe(3);
    expect(texts.join('\n')).not.toContain(EMAIL);
    expect(texts.join('\n')).not.toMatch(/\d/);
  });

  test('[NFR-SEC-010 AC-113 ERR-043] the permanent lock of the ladder shows its own text, which points to support and gives no time', async ({ page }) => {
    await setup(page);
    // registered after setup, so it answers first: the 9th failure locked recovery for good
    await page.route('**/api/recovery/reset', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      return json(route, 429, { error: 'recovery_locked' });
    });
    await openReset(page);
    await fillReset(page);
    await resetSubmit(page).click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    expect(await alertText(page)).toBe('השחזור לחשבון הזה נחסם. לשחרור אפשר לפנות לתמיכה');
    await expect(newPassword(page)).toHaveValue('');
  });

  test('[F1.6 c16] busy: a second submit while the first is in flight sends nothing', async ({ page }) => {
    const net = await setup(page);
    let release: () => void = () => undefined;
    net.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await openReset(page);
    await fillReset(page);
    await resetSubmit(page).click();
    await expect.poll(() => net.resets.length).toBe(1);
    await resetSubmit(page).click({ timeout: 2000 }).catch(() => undefined);
    await page.keyboard.press('Enter');
    release();
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toBeVisible();
    expect(net.resets).toHaveLength(1);
  });

  test('[F1.6 c16] keyboard alone: tab through the fields in visual order, type, submit with Enter', async ({ page }) => {
    const net = await setup(page);
    await openReset(page);
    await emailField(page).focus();
    await page.keyboard.type(EMAIL);
    for (const [i, f] of [pet(page), nick(page), street(page)].entries()) {
      await page.keyboard.press('Tab');
      await expect(f).toBeFocused();
      if (i < 2) await page.keyboard.type(i === 0 ? A1 : A2);
    }
    await page.keyboard.press('Tab');
    await expect(newPassword(page)).toBeFocused();
    await page.keyboard.type(NEW_PASSWORD);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'הצגת הסיסמה', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(resetSubmit(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toBeVisible();
    expect(net.resets).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F1.6 c17 [FR-AUTH-003] the questions screen, held until saved', () => {
  test('[F1.6 c17] sign-in with answers missing lands on the questions screen, not the feed; nothing offers to skip; the feed is unreachable', async ({ page }) => {
    await setup(page, 'missing');
    await signIn(page);
    await expect(page).toHaveURL(/\/recovery-questions$/);
    await expect(page.getByRole('button', { name: /אחר כך/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /אחר כך/ })).toHaveCount(0);
    for (const to of ['/feed', '/profile', '/settings', '/home']) {
      await page.goto(to);
      await expect(page).toHaveURL(/\/recovery-questions$/);
      await expect(pet(page)).toBeVisible();
    }
    await page.reload();
    await expect(pet(page)).toBeVisible();
    expect(pathOf(page)).toBe('/recovery-questions');
  });

  test('[F1.6 c17] saving two chosen answers sends exactly two entries, leads to /feed, and nothing is kept in storage, URL or history state', async ({ page }) => {
    const net = await setup(page, 'missing');
    await signIn(page);
    await expect(pet(page)).toBeVisible();
    await pet(page).fill(A1);
    await street(page).fill(A3);
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/feed$/);
    expect(net.saves).toHaveLength(1);
    const sent = net.saves[0];
    expect(typeof sent === 'object' && sent !== null && 'answers' in sent && Array.isArray(sent.answers) ? sent.answers.length : -1).toBe(2);
    const kept = await page.evaluate(() => JSON.stringify([window.localStorage, window.sessionStorage, window.history.state, location.href]));
    for (const secret of [A1, A3]) {
      expect(kept).not.toContain(secret);
      expect(net.urls.join('\n')).not.toContain(encodeURIComponent(secret));
    }
    expect(await page.evaluate(() => Object.keys(window.localStorage))).toEqual(['nestly-auth']);
    await page.reload();
    await expect(page).toHaveURL(/\/feed$/);
  });

  for (const [label, filled] of [['one answer', 1], ['no answer', 0], ['three answers', 3]] as const) {
    test(`[F1.6 c17] ${label}: a field error and nothing is sent; the user stays on the screen`, async ({ page }) => {
      const net = await setup(page, 'missing');
      await signIn(page);
      await expect(pet(page)).toBeVisible();
      for (const [i, f] of [pet(page), nick(page), street(page)].entries()) if (i < filled) await f.fill([A1, A2, A3][i] ?? A1);
      await saveButton(page).click();
      expect(await invalidCount(page)).toBeGreaterThan(0);
      expect(net.saves).toHaveLength(0);
      expect(pathOf(page)).toBe('/recovery-questions');
    });
  }

  test('[F1.6 c17] a failed save shows one alert, stores nothing, and the user is still held on the screen', async ({ page }) => {
    const net = await setup(page, 'missing');
    net.save = 503;
    await signIn(page);
    await pet(page).fill(A1);
    await nick(page).fill(A2);
    await saveButton(page).click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    expect(pathOf(page)).toBe('/recovery-questions');
    await page.goto('/feed');
    await expect(page).toHaveURL(/\/recovery-questions$/);
    await expect(pet(page)).toBeVisible();
  });

  test('[F1.6 c17] it reappears at the next sign-in while missing, and never when set', async ({ page }) => {
    const net = await setup(page, 'missing');
    await signIn(page);
    await expect(page).toHaveURL(/\/recovery-questions$/);
    await pet(page).fill(A1);
    await nick(page).fill(A2);
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/feed$/);
    await page.getByRole('button', { name: MENU_BUTTON }).click();
    await page.getByRole('button', { name: 'התנתקות', exact: true }).click();
    await signIn(page);
    await expect(page).toHaveURL(/\/feed$/);
    net.me.questions = 'missing';
    await page.getByRole('button', { name: MENU_BUTTON }).click();
    await page.getByRole('button', { name: 'התנתקות', exact: true }).click();
    await signIn(page);
    await expect(page).toHaveURL(/\/recovery-questions$/);
  });

  test('[F1.6 c17][c19] right after registration the questions screen opens; if /api/me cannot be read then, the feed opens instead', async ({ page, browser }) => {
    for (const broken of [false, true]) {
      const p = broken ? await (await browser.newContext({ viewport: MOBILE, baseURL: APP })).newPage() : page;
      const net = await setup(p, 'missing', 'unregistered');
      await signIn(p);
      await expect(p.getByRole('heading', { level: 1 })).toHaveText('השלמת ההרשמה');
      await p.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
      await p.getByLabel(/^שם מלא/).fill('תמרהייחודית');
      await p.getByRole('button', { name: 'המשך', exact: true }).click();
      const box = p.getByRole('checkbox', { name: /אישור תנאי השימוש/ });
      await box.focus();
      await p.keyboard.press('Space');
      await expect(box).toBeChecked();
      net.me.broken = broken;
      await p.getByRole('button', { name: 'יצירת חשבון', exact: true }).click();
      await expect(p).toHaveURL(broken ? /\/feed$/ : /\/recovery-questions$/);
    }
  });

  test('[F1.6 c17] keyboard alone: choose, type and save with Enter', async ({ page }) => {
    const net = await setup(page, 'missing');
    await signIn(page);
    await pet(page).focus();
    await page.keyboard.type(A1);
    await page.keyboard.press('Tab');
    await expect(nick(page)).toBeFocused();
    await page.keyboard.type(A2);
    await page.keyboard.press('Tab');
    await expect(street(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(saveButton(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/feed$/);
    expect(net.saves).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F1.6 c18 [FR-AUTH-003] change from the menu', () => {
  async function openChange(page: Page): Promise<void> {
    await signIn(page);
    await expect(page).toHaveURL(/\/feed$/);
    await page.getByRole('button', { name: MENU_BUTTON }).click();
    await page.getByRole('link', { name: 'שאלות לשחזור סיסמה', exact: true }).click();
    await expect(page).toHaveURL(/\/recovery-questions$/);
  }

  test('[F1.6 c18] the menu leads to the screen, which asks for the current answers first and then the new ones', async ({ page }) => {
    await setup(page, 'set');
    await openChange(page);
    await expect(pet(page)).toHaveCount(2);
    const current = await pet(page).first().boundingBox();
    const fresh = await pet(page).last().boundingBox();
    expect(current?.y ?? 0).toBeLessThan(fresh?.y ?? 0);
  });

  test('[F1.6 c18] current and new answers go in one request; success shows a confirmation and no alert', async ({ page }) => {
    const net = await setup(page, 'set');
    await openChange(page);
    await pet(page).first().fill(A1);
    await nick(page).first().fill(A2);
    await street(page).last().fill(A3);
    await pet(page).last().fill(A1);
    await saveButton(page).click();
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(net.changes).toHaveLength(1);
    expect(JSON.stringify(net.changes[0])).toContain('current');
    expect(pathOf(page)).toBe('/recovery-questions');
  });

  test('[F1.6 c18] wrong current answers show the same mismatch text as /recovery', async ({ page, browser }) => {
    const net = await setup(page, 'set');
    net.change = 401;
    await openChange(page);
    await pet(page).first().fill(A1);
    await nick(page).first().fill(A2);
    await street(page).last().fill(A3);
    await pet(page).last().fill(A1);
    await saveButton(page).click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    const here = await alertText(page);
    const other = await (await browser.newContext({ viewport: MOBILE, baseURL: APP })).newPage();
    const net2 = await setup(other);
    net2.reset = 401;
    await openReset(other);
    await fillReset(other);
    await resetSubmit(other).click();
    await expect(other.getByRole('alert')).toHaveCount(1);
    expect(here).toBe(await alertText(other));
    expect(here.length).toBeGreaterThan(0);
  });

  test('[F1.6 c18] current answers missing: a field error and nothing is sent', async ({ page }) => {
    const net = await setup(page, 'set');
    await openChange(page);
    await street(page).last().fill(A3);
    await pet(page).last().fill(A1);
    await saveButton(page).click();
    expect(await invalidCount(page)).toBeGreaterThan(0);
    expect(net.changes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
for (const vp of [{ name: '375', size: MOBILE }, { name: '1024', size: DESKTOP }]) {
  test.describe(`F1.6 c16 c17 c18 [WCAG 2.1 AA] axe at ${vp.name}`, () => {
    test.use({ viewport: vp.size });
    const scan = async (page: Page): Promise<void> => {
      const result = await runAxe(page, { tags: AXE_TAGS });
      expect(result.checked).toBeGreaterThan(0);
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
    };

    test(`[F1.6 c16] /recovery: empty, field errors, mismatch, success (${vp.name})`, async ({ page }) => {
      const net = await setup(page);
      await openReset(page);
      await scan(page);
      await resetSubmit(page).click();
      expect(await invalidCount(page)).toBeGreaterThan(0);
      await scan(page);
      net.reset = 401;
      await fillReset(page);
      await resetSubmit(page).click();
      await expect(page.getByRole('alert')).toHaveCount(1);
      await scan(page);
      net.reset = 200;
      await fillReset(page);
      await resetSubmit(page).click();
      await expect(page.getByRole('status').filter({ hasText: /\S/ })).toBeVisible();
      await scan(page);
      expect(await noHorizontalScroll(page)).toBe(true);
    });

    test(`[F1.6 c17] questions screen held: empty, field errors, failed save (${vp.name})`, async ({ page }) => {
      const net = await setup(page, 'missing');
      await signIn(page);
      await expect(pet(page)).toBeVisible();
      await scan(page);
      await saveButton(page).click();
      expect(await invalidCount(page)).toBeGreaterThan(0);
      await scan(page);
      net.save = 503;
      await pet(page).fill(A1);
      await nick(page).fill(A2);
      await saveButton(page).click();
      await expect(page.getByRole('alert')).toHaveCount(1);
      await scan(page);
      expect(await noHorizontalScroll(page)).toBe(true);
    });

    test(`[F1.6 c18] questions screen in change mode, with the confirmation (${vp.name})`, async ({ page }) => {
      await setup(page, 'set');
      await signIn(page);
      await expect(page).toHaveURL(/\/feed$/);
      await page.goto('/recovery-questions');
      await expect(pet(page)).toHaveCount(2);
      await scan(page);
      await pet(page).first().fill(A1);
      await nick(page).first().fill(A2);
      await street(page).last().fill(A3);
      await pet(page).last().fill(A1);
      await saveButton(page).click();
      await expect(page.getByRole('status').filter({ hasText: /\S/ })).toBeVisible();
      await scan(page);
    });
  });
}
