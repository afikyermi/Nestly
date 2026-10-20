// I2 F2.3a the owner's privacy settings on the Settings page (real browser, real session source, network stubbed).
// Derived from .work/profile-privacy/spec.md only: criteria 1, 2 (the web half), 4, 16, and Gate 1 DR-2 A (own route, linked from
// the profile page). Route, roles and accessible names from interface.md. The server and database halves (2's stored values, 3,
// 5, 6) are in apps/server/tests and supabase/tests/52_privacy_settings.sql: not repeated here.
// The stub plays the server: GET /api/privacy answers the stored three; PUT stores the body and answers it.
import { expect, test } from '@playwright/test';
import type { Locator, Page, Route } from '@playwright/test';
import { MOBILE, runAxe } from './helpers';
import { APP, open, pathOf } from './app-helpers';

test.use({ baseURL: APP, viewport: MOBILE });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const DESKTOP_1280 = { width: 1280, height: 800 };
const NOW = new Date(2026, 5, 15, 12, 0, 0);
const EMAIL = 'dana.cohen@example.com';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const T = {
  open: 'פרופיל פתוח',
  restricted: 'פרופיל מוגבל',
  sentence: 'הצגת המשפט כשאין ילדים והריון',
  birthday: 'יום הולדת של ילד בהתראות לחברים',
  loadFailed: 'לא הצלחנו לטעון את הגדרות הפרטיות. אפשר לנסות שוב',
  saveFailed: 'השמירה לא הצליחה. אפשר לנסות שוב',
  saved: 'הפרטים נשמרו',
  retry: 'נסו שוב',
  save: 'שמירה',
  expired: 'ההתחברות פגה. אפשר להתחבר שוב',
  profileLink: 'הגדרות פרטיות',
} as const;

interface Settings { profileVisibility: 'open' | 'restricted'; isEmptyJourneySentenceShown: boolean; isChildBirthdayShared: boolean }
const DEFAULTS: Settings = { profileVisibility: 'open', isEmptyJourneySentenceShown: true, isChildBirthdayShared: true };

interface Net {
  stored: Settings;
  get: number | 'abort';
  put: number | 'abort';
  holdGet: Promise<void> | null;
  holdPut: Promise<void> | null;
  gets: number;
  sent: Array<Record<string, unknown>>;
  refreshOk: boolean;
  me: 'active' | 401;
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

function session(expiresAt: number) {
  return {
    access_token: 'e2e-access-token', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, refresh_token: 'e2e-refresh',
    user: { id: 'f0000000-0000-4000-8000-0000000000f1', aud: 'authenticated', role: 'authenticated', email: EMAIL, identities: [], app_metadata: {}, user_metadata: {}, created_at: '2026-01-14T10:00:00Z' },
  };
}

function isSettings(v: unknown): v is Settings {
  if (typeof v !== 'object' || v === null) return false;
  const vis: unknown = Reflect.get(v, 'profileVisibility');
  return (vis === 'open' || vis === 'restricted') && typeof Reflect.get(v, 'isEmptyJourneySentenceShown') === 'boolean'
    && typeof Reflect.get(v, 'isChildBirthdayShared') === 'boolean';
}

async function setup(page: Page, start: Settings = DEFAULTS, shortSession = false): Promise<Net> {
  const net: Net = { stored: { ...start }, get: 200, put: 200, holdGet: null, holdPut: null, gets: 0, sent: [], refreshOk: true, me: 'active' };
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => {
    Reflect.set(window, 'nestlyRealSession', true);
  });
  const far = Math.floor(new Date(2100, 0, 1).getTime() / 1000);
  const soon = Math.floor(NOW.getTime() / 1000) + 10;
  await page.route('https://e2e-stub.invalid/auth/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const refresh = req.url().includes('/token') && req.url().includes('grant_type=refresh_token');
    if (refresh && !net.refreshOk) return json(route, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'refused' });
    if (refresh && shortSession) return json(route, 200, session(Math.floor(NOW.getTime() / 1000) - 60));
    if (req.url().includes('/token')) return json(route, 200, session(shortSession ? soon : far));
    if (req.url().includes('/logout')) return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET' && req.url().includes('/auth/v1/user')) return json(route, 200, { id: 'u-1', email: EMAIL, app_metadata: { provider: 'email' } });
    return json(route, 404, { error: 'unstubbed' });
  });
  await page.route('**/api/me', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (net.me === 401) return route.fulfill({ status: 401, headers: { ...CORS, 'content-type': 'application/json', 'www-authenticate': 'Bearer' }, body: '{"error":"unauthenticated"}' });
    return json(route, 200, { state: 'active', recoveryQuestions: 'set', mustSetPassword: false });
  });
  await page.route('**/api/profile', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, { fullName: 'דנה כהן', parentGender: 'woman' });
  });
  // The blocked list in the same Settings section (FR-REL-002): empty, so it adds no control or message to these flows.
  await page.route('**/api/blocks', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, { blocked: [] });
  });
  await page.route('**/api/journeys', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, { journeys: [{ id: 'j-1', stage: 'planning', dueDate: null }], children: [] });
  });
  await page.route('**/api/privacy', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') {
      net.gets += 1;
      if (net.holdGet !== null) await net.holdGet;
      if (net.get === 'abort') return route.abort('connectionreset');
      if (net.get !== 200) return json(route, net.get, { error: 'internal' });
      return json(route, 200, net.stored);
    }
    const parsed: unknown = JSON.parse(req.postData() ?? 'null');
    net.sent.push(typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {});
    if (net.holdPut !== null) await net.holdPut;
    if (net.put === 'abort') return route.abort('connectionreset');
    if (net.put !== 200) return json(route, net.put, { error: net.put === 401 ? 'unauthenticated' : 'internal' });
    if (!isSettings(parsed)) return json(route, 400, { error: 'invalid' });
    net.stored = { ...parsed };
    return json(route, 200, net.stored);
  });
  return net;
}

// ---- locators and steps ----------------------------------------------------------------------------------------------
const main = (page: Page) => page.getByRole('main');
const group = (page: Page) => main(page).getByRole('radiogroup');
// The accessible name starts with the option's label; the explanation line may follow it in the name or be its description.
const openRadio = (page: Page) => main(page).getByRole('radio', { name: new RegExp(`^${T.open}`) });
const restrictedRadio = (page: Page) => main(page).getByRole('radio', { name: new RegExp(`^${T.restricted}`) });
const sentenceBox = (page: Page) => main(page).getByRole('checkbox', { name: T.sentence, exact: true });
const birthdayBox = (page: Page) => main(page).getByRole('checkbox', { name: T.birthday, exact: true });
const saveButton = (page: Page) => main(page).getByRole('button', { name: T.save, exact: true });
const retryButton = (page: Page) => main(page).getByRole('button', { name: T.retry, exact: true });

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}
async function openSettings(page: Page): Promise<void> {
  await signIn(page);
  await page.goto('/settings');
  expect(pathOf(page)).toBe('/settings');
}
async function openLoaded(page: Page): Promise<void> {
  await openSettings(page);
  await expect(openRadio(page)).toBeVisible();
}
async function expectShown(page: Page, s: Settings): Promise<void> {
  if (s.profileVisibility === 'open') {
    await expect(openRadio(page)).toBeChecked();
    await expect(restrictedRadio(page)).not.toBeChecked();
  } else {
    await expect(restrictedRadio(page)).toBeChecked();
    await expect(openRadio(page)).not.toBeChecked();
  }
  if (s.isEmptyJourneySentenceShown) await expect(sentenceBox(page)).toBeChecked();
  else await expect(sentenceBox(page)).not.toBeChecked();
  if (s.isChildBirthdayShared) await expect(birthdayBox(page)).toBeChecked();
  else await expect(birthdayBox(page)).not.toBeChecked();
}
/** A pointer user clicks the visible label (the native inputs are visually hidden behind it), as long as the state differs. */
async function setTo(page: Page, control: Locator, label: string, want: boolean): Promise<void> {
  if ((await control.isChecked()) !== want) await main(page).getByText(label, { exact: true }).click();
  if (want) await expect(control).toBeChecked();
  else await expect(control).not.toBeChecked();
}
async function choose(page: Page, s: Settings): Promise<void> {
  await setTo(page, s.profileVisibility === 'open' ? openRadio(page) : restrictedRadio(page), s.profileVisibility === 'open' ? T.open : T.restricted, true);
  await setTo(page, sentenceBox(page), T.sentence, s.isEmptyJourneySentenceShown);
  await setTo(page, birthdayBox(page), T.birthday, s.isChildBirthdayShared);
}
async function chooseChanged(page: Page): Promise<void> {
  await choose(page, CHANGED);
}
const CHANGED: Settings = { profileVisibility: 'restricted', isEmptyJourneySentenceShown: false, isChildBirthdayShared: false };

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.3a c1 [FR-PRIV-001 BR-037 Q1] the screen with the defaults', () => {
  test('[F2.3a c1] "פרופיל פתוח" selected, "פרופיל מוגבל" not; both toggles on', async ({ page }) => {
    await setup(page);
    await openLoaded(page);
    await expectShown(page, DEFAULTS);
  });

  test('[F2.3a c1 Q1] each visibility option carries its own one-line explanation of what a non-Friend sees', async ({ page }) => {
    await setup(page);
    await openLoaded(page);
    // what the radio announces: its label(s) and its aria-describedby targets, less the option's own label
    const explanation = (label: string) => main(page).getByRole('radio', { name: new RegExp(`^${label}`) }).evaluate((el, own) => {
      const input = el instanceof HTMLInputElement ? el : null;
      const labels = input?.labels ? [...input.labels].map((l) => l.textContent ?? '') : [];
      const described = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent ?? '');
      return [...labels, ...described].join(' ').replace(own, '').replace(/\s+/g, ' ').trim();
    }, label);
    const openLine = await explanation(T.open);
    const restrictedLine = await explanation(T.restricted);
    expect(openLine.length, 'the open option has an explanation line').toBeGreaterThan(10);
    expect(restrictedLine.length, 'the restricted option has an explanation line').toBeGreaterThan(10);
    expect(openLine).not.toBe(restrictedLine);
  });

  test('[F2.3a c1 Gate 1 DR-2][F2.5 c10] the temporary profile-page link "הגדרות פרטיות" is gone (Settings is reached from the menu)', async ({ page }) => {
    await setup(page);
    await signIn(page);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'פרופיל', exact: true })).toBeVisible();
    await expect(main(page).getByRole('link', { name: T.profileLink, exact: true })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Takes over what F1.2 c22 guarded on /settings while it was a placeholder (e2e/app-shell-guard-shell.spec.ts): the test session
// seam forces "signed-in" with no access token and no stub answers /api/privacy. The page keeps its h1 and title, shows no setting
// and no control, and nothing it sends to /api/* carries a credential.
test.describe('F2.3a c5 c22 [FR-AUTH-004 NFR-SEC-002] state forced to signed-in, no real session', () => {
  test('[F2.3a c5 F1.2 c22] /settings: h1 "הגדרות" and its title, the load failure, no value and no control; no credential sent', async ({ page }) => {
    const api: Array<{ path: string; authorization: string | undefined }> = [];
    page.on('request', (req) => {
      const path = new URL(req.url()).pathname;
      if (path.startsWith('/api/')) api.push({ path, authorization: req.headers()['authorization'] });
    });
    await open(page, '/settings', 'signed-in');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('הגדרות');
    await expect(page).toHaveTitle('הגדרות · Nestly');
    await expect(main(page).getByText(T.loadFailed)).toBeVisible();
    await expect(main(page).getByRole('radio')).toHaveCount(0);
    await expect(main(page).getByRole('checkbox')).toHaveCount(0);
    await expect(saveButton(page)).toHaveCount(0);
    for (const word of [T.open, T.restricted, T.sentence, T.birthday]) await expect(main(page).getByText(word, { exact: true })).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(api.filter((r) => r.authorization !== undefined && /\S{8,}/.test(r.authorization.replace(/^Bearer\s*/i, ''))),
      'no /api request carries a token').toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.3a c2 [FR-PRIV-001 Q2] saving the three', () => {
  test('[F2.3a c2] restricted, sentence off, birthday off, Save: one PUT carrying exactly the three; a full reload shows them', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await chooseChanged(page);
    expect(net.sent, 'nothing is sent before Save').toHaveLength(0);
    await saveButton(page).click();
    await expect(main(page).getByRole('status').filter({ hasText: T.saved })).toBeVisible();
    expect(net.sent).toEqual([CHANGED]);
    await page.reload();
    await expectShown(page, CHANGED);
  });

  test('[F2.3a c2] from restricted/off/off back to the defaults: one PUT with the defaults; the reload shows them', async ({ page }) => {
    const net = await setup(page, CHANGED);
    await openLoaded(page);
    await expectShown(page, CHANGED);
    await choose(page, DEFAULTS);
    await saveButton(page).click();
    await expect(main(page).getByRole('status').filter({ hasText: T.saved })).toBeVisible();
    expect(net.sent).toEqual([DEFAULTS]);
    await page.reload();
    await expectShown(page, DEFAULTS);
  });

  test('[F2.3a c2] one setting changed: the PUT still carries all three, the others as they were', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await setTo(page, birthdayBox(page), T.birthday, false);
    await saveButton(page).click();
    await expect(main(page).getByRole('status').filter({ hasText: T.saved })).toBeVisible();
    expect(net.sent).toEqual([{ ...DEFAULTS, isChildBirthdayShared: false }]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.3a c4 [ERR-004 ERR-038 Q1] loading, load failure, save failure, in flight, success', () => {
  test('[F2.3a c4] while GET is pending: no value and no control', async ({ page }) => {
    const net = await setup(page);
    let release = (): void => undefined;
    net.holdGet = new Promise<void>((r) => { release = r; });
    await openSettings(page);
    await expect.poll(() => net.gets).toBeGreaterThan(0);
    await expect(main(page).getByRole('radio')).toHaveCount(0);
    await expect(main(page).getByRole('checkbox')).toHaveCount(0);
    await expect(saveButton(page)).toHaveCount(0);
    await expect(main(page).getByText(T.open, { exact: true })).toHaveCount(0);
    release();
    await expect(openRadio(page)).toBeVisible();
  });

  for (const failure of [500, 'abort'] as const) {
    test(`[F2.3a c4 ERR-004] GET ${String(failure)}: the load-failed text and "נסו שוב", no control; the retry loads the settings`, async ({ page }) => {
      const net = await setup(page, CHANGED);
      net.get = failure;
      await openSettings(page);
      await expect(main(page).getByText(T.loadFailed)).toBeVisible();
      await expect(main(page).getByRole('radio')).toHaveCount(0);
      await expect(main(page).getByRole('checkbox')).toHaveCount(0);
      const before = net.gets;
      net.get = 200;
      await retryButton(page).click();
      await expectShown(page, CHANGED);
      expect(net.gets).toBe(before + 1);
      await expect(main(page).getByText(T.loadFailed)).toHaveCount(0);
    });
  }

  for (const failure of [500, 'abort'] as const) {
    test(`[F2.3a c4 ERR-004] PUT ${String(failure)}: the choices are kept and the text is in role="alert"; a second Save succeeds`, async ({ page }) => {
      const net = await setup(page);
      await openLoaded(page);
      net.put = failure;
      await chooseChanged(page);
      await saveButton(page).click();
      await expect(page.getByRole('alert').filter({ hasText: T.saveFailed })).toBeVisible();
      await expectShown(page, CHANGED);
      await expect(page.getByRole('status').filter({ hasText: T.saved })).toHaveCount(0);
      net.put = 200;
      await saveButton(page).click();
      await expect(main(page).getByRole('status').filter({ hasText: T.saved })).toBeVisible();
      expect(net.stored).toEqual(CHANGED);
    });
  }

  test('[F2.3a c4] while a save is in flight Save is disabled; pressing it again sends one request', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    let release = (): void => undefined;
    net.holdPut = new Promise<void>((r) => { release = r; });
    await chooseChanged(page);
    await saveButton(page).click();
    await expect.poll(() => net.sent.length).toBe(1);
    const disabled = await saveButton(page).evaluate((el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true');
    expect(disabled, 'Save is disabled while the PUT is in flight').toBe(true);
    await saveButton(page).click({ force: true });
    await saveButton(page).focus();
    await page.keyboard.press('Enter');
    release();
    await expect(main(page).getByRole('status').filter({ hasText: T.saved })).toBeVisible();
    expect(net.sent).toHaveLength(1);
  });

  test('[F2.3a c4] a save succeeds: "הפרטים נשמרו" in role="status"', async ({ page }) => {
    await setup(page);
    await openLoaded(page);
    await expect(page.getByRole('status').filter({ hasText: T.saved })).toHaveCount(0);
    await chooseChanged(page);
    await saveButton(page).click();
    await expect(page.getByRole('status').filter({ hasText: T.saved })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: T.saveFailed })).toHaveCount(0);
  });

  test('[F2.3a c4 ERR-038] a save whose token refresh is refused: the session ends, login with the expired text', async ({ page }) => {
    const net = await setup(page, DEFAULTS, true);
    await openLoaded(page);
    net.refreshOk = false;
    await chooseChanged(page);
    await saveButton(page).click();
    await expect.poll(() => pathOf(page)).toBe('/login');
    await expect(page.getByText(T.expired)).toBeVisible();
  });

  test('[F2.3a c4 ERR-038] a save the server refuses with 401: login with the expired text', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    net.put = 401;
    net.me = 401;
    await chooseChanged(page);
    await saveButton(page).click();
    await expect.poll(() => pathOf(page)).toBe('/login');
    await expect(page.getByText(T.expired)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.3a c16 [S3 NFR-A11Y-001] labelled controls, keyboard only', () => {
  test('[F2.3a c16] the visibility choice is a labelled radio group holding exactly the two options', async ({ page }) => {
    await setup(page);
    await openLoaded(page);
    await expect(group(page)).toHaveCount(1);
    await expect(group(page)).toHaveAccessibleName(/\S/);
    await expect(group(page).getByRole('radio')).toHaveCount(2);
    await expect(group(page).getByRole('radio', { name: new RegExp(`^${T.open}`) })).toHaveCount(1);
    await expect(group(page).getByRole('radio', { name: new RegExp(`^${T.restricted}`) })).toHaveCount(1);
  });

  test('[F2.3a c16] keyboard only: Tab into the group, an arrow picks "פרופיל מוגבל", Space toggles both switches, Enter on Save', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    let inGroup = false;
    for (let i = 0; i < 60 && !inGroup; i += 1) {
      await page.keyboard.press('Tab');
      inGroup = await openRadio(page).evaluate((el) => el === document.activeElement);
    }
    expect(inGroup, 'Tab reaches the checked radio').toBe(true);
    await page.keyboard.press('ArrowLeft');
    if (!(await restrictedRadio(page).isChecked())) await page.keyboard.press('ArrowRight');
    await expect(restrictedRadio(page)).toBeChecked();
    await expect(restrictedRadio(page)).toBeFocused();
    let onSentence = false;
    for (let i = 0; i < 10 && !onSentence; i += 1) {
      await page.keyboard.press('Tab');
      onSentence = await sentenceBox(page).evaluate((el) => el === document.activeElement);
    }
    expect(onSentence, 'Tab reaches the sentence switch').toBe(true);
    await page.keyboard.press('Space');
    await expect(sentenceBox(page)).not.toBeChecked();
    let onBirthday = false;
    for (let i = 0; i < 10 && !onBirthday; i += 1) {
      await page.keyboard.press('Tab');
      onBirthday = await birthdayBox(page).evaluate((el) => el === document.activeElement);
    }
    expect(onBirthday, 'Tab reaches the birthday switch').toBe(true);
    await page.keyboard.press('Space');
    await expect(birthdayBox(page)).not.toBeChecked();
    let onSave = false;
    for (let i = 0; i < 10 && !onSave; i += 1) {
      await page.keyboard.press('Tab');
      onSave = await saveButton(page).evaluate((el) => el === document.activeElement);
    }
    expect(onSave, 'Tab reaches Save').toBe(true);
    await page.keyboard.press('Enter');
    await expect(main(page).getByRole('status').filter({ hasText: T.saved })).toBeVisible();
    expect(net.sent).toEqual([CHANGED]);
  });

  test('[F2.3a c16 c4] the retry after a load failure is reachable and operable by keyboard', async ({ page }) => {
    const net = await setup(page);
    net.get = 500;
    await openSettings(page);
    await expect(main(page).getByText(T.loadFailed)).toBeVisible();
    net.get = 200;
    let onRetry = false;
    for (let i = 0; i < 60 && !onRetry; i += 1) {
      await page.keyboard.press('Tab');
      onRetry = await retryButton(page).evaluate((el) => el === document.activeElement);
    }
    expect(onRetry, 'Tab reaches "נסו שוב"').toBe(true);
    await page.keyboard.press('Enter');
    await expect(openRadio(page)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
for (const vp of [{ name: '375', size: MOBILE }, { name: '1280', size: DESKTOP_1280 }]) {
  test.describe(`F2.3a c16 [S3 NFR-A11Y-001] axe at ${vp.name}, RTL`, () => {
    test.use({ viewport: vp.size });
    const scan = async (page: Page): Promise<void> => {
      expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl');
      const result = await runAxe(page, { tags: AXE_TAGS });
      expect(result.checked).toBeGreaterThan(0);
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(0);
    };

    test(`[F2.3a c16 c1] privacy-settings (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openLoaded(page);
      await scan(page);
    });
    test(`[F2.3a c16 c4] privacy-settings-load-failed (${vp.name})`, async ({ page }) => {
      const net = await setup(page);
      net.get = 500;
      await openSettings(page);
      await expect(main(page).getByText(T.loadFailed)).toBeVisible();
      await scan(page);
    });
    test(`[F2.3a c16 c4] privacy-settings-save-failed (${vp.name})`, async ({ page }) => {
      const net = await setup(page);
      await openLoaded(page);
      net.put = 500;
      await chooseChanged(page);
      await saveButton(page).click();
      await expect(page.getByRole('alert').filter({ hasText: T.saveFailed })).toBeVisible();
      await scan(page);
    });
  });
}
