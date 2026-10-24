// I2 F2.1 own profile, view and edit (real browser, real session source, network stubbed). Derived from
// .work/profile-view-edit/spec.md only: criteria 1-7, 15, 16, 17 (the journey, the five states, keyboard, axe at 375 and 1280).
// Criteria 8-14 are server and database behaviour (apps/server/tests, supabase/tests/50_profile_update.sql): not repeated here.
// The stub plays the server: GET /api/profile answers the stored profile, PUT stores the trimmed values and answers them.
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { MOBILE, runAxe } from './helpers';
import { APP, pathOf } from './app-helpers';

test.use({ baseURL: APP, viewport: MOBILE });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const DESKTOP_1280 = { width: 1280, height: 800 };
const EMAIL = 'dana.cohen@example.com';
const PASSWORD = 'Zq-7-unique-pw-marker-91';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const LABELS = { woman: 'אישה', man: 'גבר', other: 'אחר', prefer_not_to_say: 'מעדיפים לא לציין' } as const;
const LOAD_FAILED = 'לא הצלחנו לטעון את הפרופיל. אפשר לנסות שוב';
const SAVE_FAILED = 'השמירה לא הצליחה. אפשר לנסות שוב';
const SAVED = 'הפרטים נשמרו';
const NAME_REQUIRED = 'יש למלא שם מלא';
const NAME_LENGTH = 'שם מלא צריך להכיל 2 עד 60 תווים';
const EXPIRED = 'ההתחברות פגה. אפשר להתחבר שוב';

type Gender = keyof typeof LABELS | null;
const isGender = (v: unknown): v is keyof typeof LABELS => typeof v === 'string' && Object.keys(LABELS).includes(v);
interface Stored {
  fullName: string;
  parentGender: Gender;
}

function session(expiresAt: number) {
  return {
    access_token: 'e2e-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: 'e2e-refresh',
    user: { id: 'f0000000-0000-4000-8000-0000000000f1', aud: 'authenticated', role: 'authenticated', email: EMAIL, identities: [], app_metadata: {}, user_metadata: {}, created_at: '2026-10-14T10:00:00Z' },
  };
}

interface Net {
  profile: Stored;
  /** What the next GETs answer: 200, a 5xx, or 'abort' (the network fails). */
  get: number | 'abort';
  /** What the next PUTs answer. */
  put: number | 'abort';
  holdGet: Promise<void> | null;
  holdPut: Promise<void> | null;
  gets: number;
  puts: unknown[];
  /** Whether the Auth refresh endpoint answers (a refused refresh ends the session). */
  refreshOk: boolean;
  /** Seconds until the stub session expires (long = never refreshed during a test). */
  shortSession: boolean;
  /** What GET /api/me answers: the account state, or 401 (the token is no longer accepted). */
  me: 'active' | 'unavailable' | 401;
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function setup(page: Page, profile: Stored = { fullName: 'דנה כהן', parentGender: 'woman' }, shortSession = false): Promise<Net> {
  const net: Net = { profile: { ...profile }, get: 200, put: 200, holdGet: null, holdPut: null, gets: 0, puts: [], refreshOk: true, shortSession, me: 'active' };
  await page.addInitScript(() => {
    Reflect.set(window, 'nestlyRealSession', true);
  });
  const sess = () => session(net.shortSession ? Math.floor(Date.now() / 1000) + 10 : 4102444800);
  await page.route('https://e2e-stub.invalid/auth/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.url().includes('/token') && req.url().includes('grant_type=refresh_token') && !net.refreshOk) {
      return json(route, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'refused' });
    }
    if (req.url().includes('/token') && req.url().includes('grant_type=refresh_token') && net.shortSession) return json(route, 200, session(Math.floor(Date.now() / 1000) - 60));
    if (req.url().includes('/token')) return json(route, 200, sess());
    if (req.url().includes('/logout')) return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET' && req.url().includes('/auth/v1/user')) {
      return json(route, 200, { id: 'u-1', email: EMAIL, app_metadata: { provider: 'email' } });
    }
    return json(route, 404, { error: 'unstubbed' });
  });
  await page.route('**/api/me', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (net.me === 401) return route.fulfill({ status: 401, headers: { ...CORS, 'content-type': 'application/json', 'www-authenticate': 'Bearer' }, body: '{"error":"unauthenticated"}' });
    if (net.me === 'unavailable') return json(route, 200, { state: 'unavailable' });
    return json(route, 200, { state: 'active', recoveryQuestions: 'set', mustSetPassword: false });
  });
  // F2.2a: the profile page also loads "המסע שלי". A planning journey with no children adds no "עריכה" or "נסו שוב" of its own,
  // so the F2.1 locators below stay unique (.work/journeys-children/spec.md c1, c2).
  await page.route('**/api/journeys', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, { journeys: [{ id: 'j-1', stage: 'planning', dueDate: null }], children: [] });
  });
  await page.route('**/api/profile', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') {
      net.gets += 1;
      if (net.holdGet !== null) await net.holdGet;
      if (net.get === 'abort') return route.abort('connectionreset');
      if (net.get !== 200) return json(route, net.get, { error: net.get === 403 ? 'account_unavailable' : 'internal' });
      return json(route, 200, net.profile);
    }
    if (req.method() === 'PUT') {
      const body: unknown = JSON.parse(req.postData() ?? 'null');
      net.puts.push(body);
      if (net.holdPut !== null) await net.holdPut;
      if (net.put === 'abort') return route.abort('connectionreset');
      if (net.put !== 200) return json(route, net.put, { error: 'internal' });
      if (typeof body === 'object' && body !== null) {
        const name: unknown = Reflect.get(body, 'fullName');
        const gender: unknown = Reflect.get(body, 'parentGender');
        net.profile = { fullName: typeof name === 'string' ? name.trim() : net.profile.fullName, parentGender: isGender(gender) ? gender : null };
      }
      return json(route, 200, net.profile);
    }
    return json(route, 405, { error: 'method_not_allowed' });
  });
  return net;
}

// ---- locators and steps ----------------------------------------------------------------------------------------------
const h1Of = (page: Page) => page.getByRole('heading', { level: 1 });
const main = (page: Page) => page.getByRole('main');
const editButton = (page: Page) => page.getByRole('button', { name: 'עריכה', exact: true });
const cancelButton = (page: Page) => page.getByRole('button', { name: 'ביטול', exact: true });
const saveButton = (page: Page) => page.getByRole('button', { name: 'שמירה', exact: true });
const retryButton = (page: Page) => page.getByRole('button', { name: 'נסו שוב', exact: true });
const nameInput = (page: Page) => page.getByRole('textbox', { name: /^שם מלא/ });
const genderSelect = (page: Page) => page.getByRole('combobox', { name: /מין ההורה/ });
const sentField = (net: Net, index: number, field: string): unknown => {
  const sent = net.puts[index];
  return typeof sent === 'object' && sent !== null ? Reflect.get(sent, field) : undefined;
};
const viewText = async (page: Page) => (await main(page).innerText()).replace(/\s+/g, ' ');

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}
/** Signed in, then the profile screen (a reload of the stored session: the real source restores it). */
async function openProfile(page: Page): Promise<void> {
  await signIn(page);
  await page.goto('/profile');
  expect(pathOf(page)).toBe('/profile');
}
async function openProfileLoaded(page: Page): Promise<void> {
  await openProfile(page);
  await expect(editButton(page)).toBeVisible();
}
async function openEdit(page: Page): Promise<void> {
  await openProfileLoaded(page);
  await editButton(page).click();
  await expect(nameInput(page)).toBeVisible();
}
async function saveWith(page: Page, name: string, gender?: string): Promise<void> {
  await nameInput(page).fill(name);
  if (gender !== undefined) await genderSelect(page).selectOption({ label: gender });
  await saveButton(page).click();
}

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.1 c1 c2 [FR-PROFILE-001 PG-012 VAL-006] the view', () => {
  test('[F2.1 c1] name, parent gender and an "עריכה" button; one h1', async ({ page }) => {
    await setup(page);
    await openProfileLoaded(page);
    expect(await viewText(page)).toMatch(/שם מלא[:\s]+דנה כהן/);
    expect(await viewText(page)).toMatch(/מין ההורה[:\s]+אישה/);
    await expect(h1Of(page)).toHaveCount(1);
  });

  for (const [gender, text] of [[null, 'לא צוין'], ['prefer_not_to_say', 'מעדיפים לא לציין'], ['man', 'גבר'], ['other', 'אחר']] as const) {
    test(`[F2.1 c1 c2 VAL-006] gender ${String(gender)} reads "${text}"`, async ({ page }) => {
      await setup(page, { fullName: 'דנה כהן', parentGender: gender });
      await openProfileLoaded(page);
      expect(await viewText(page)).toMatch(new RegExp(`מין ההורה[:\\s]+${text}`));
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.1 c3 [ERR-004] loading and load failure', () => {
  test('[F2.1 c3] while GET is pending: a loading state, no field value, no edit control', async ({ page }) => {
    const net = await setup(page);
    let release: () => void = () => undefined;
    net.holdGet = new Promise<void>((resolve) => {
      release = resolve;
    });
    await signIn(page);
    await page.goto('/profile');
    await expect.poll(() => net.gets).toBeGreaterThan(0);
    expect(await viewText(page)).not.toContain('דנה כהן');
    await expect(editButton(page)).toHaveCount(0);
    await expect(nameInput(page)).toHaveCount(0);
    release();
    await expect(editButton(page)).toBeVisible();
  });

  for (const failure of [500, 503, 'abort'] as const) {
    test(`[F2.1 c3 ERR-004] GET ${String(failure)}: the load-failed text and "נסו שוב", which repeats the GET`, async ({ page }) => {
      const net = await setup(page);
      net.get = failure;
      await openProfile(page);
      await expect(main(page).getByText(LOAD_FAILED)).toBeVisible();
      await expect(editButton(page)).toHaveCount(0);
      expect(await viewText(page)).not.toContain('דנה כהן');
      const before = net.gets;
      net.get = 200;
      await retryButton(page).click();
      await expect.poll(() => net.gets).toBeGreaterThan(before);
      await expect(editButton(page)).toBeVisible();
      expect(await viewText(page)).toMatch(/שם מלא[:\s]+דנה כהן/);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.1 c4 [UC-10] opening and cancelling the edit', () => {
  test('[F2.1 c4] the form: the current values, a name input, an optional gender select with the four options and an empty one', async ({ page }) => {
    await setup(page);
    await openEdit(page);
    await expect(nameInput(page)).toHaveValue('דנה כהן');
    await expect(genderSelect(page)).toBeVisible();
    await expect(page.getByLabel(/מין ההורה/)).toContainText('אישה');
    const options = await genderSelect(page).locator('option').allTextContents();
    for (const label of Object.values(LABELS)) expect(options.map((o) => o.trim())).toContain(label);
    expect(options).toHaveLength(5);
    await expect(genderSelect(page).locator('option[value=""]')).toHaveCount(1);
    await expect(genderSelect(page).locator('option:checked')).toHaveText(LABELS.woman);
    // marked optional: the label says so
    expect(await page.locator('label', { hasText: /מין ההורה/ }).innerText()).toContain('(לא חובה)');
  });

  test('[F2.1 c4] "ביטול" returns to the view with nothing sent and the stored values unchanged', async ({ page }) => {
    const net = await setup(page);
    await openEdit(page);
    await nameInput(page).fill('שם אחר לגמרי');
    await genderSelect(page).selectOption({ label: LABELS.man });
    await cancelButton(page).click();
    await expect(editButton(page)).toBeVisible();
    expect(net.puts).toHaveLength(0);
    expect(await viewText(page)).toMatch(/שם מלא[:\s]+דנה כהן/);
    expect(await viewText(page)).toMatch(/מין ההורה[:\s]+אישה/);
    await editButton(page).click();
    await expect(nameInput(page)).toHaveValue('דנה כהן');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.1 c5 c7 [AC-015 VAL-001 VAL-006] saving', () => {
  test('[F2.1 c5 AC-015] "  רון לוי  " and man: one PUT, the view shows the trimmed name and man after the save and after a reload', async ({ page }) => {
    const net = await setup(page);
    await openEdit(page);
    await saveWith(page, '  רון לוי  ', LABELS.man);
    await expect(editButton(page)).toBeVisible();
    expect(net.puts).toHaveLength(1);
    const sent = net.puts[0];
    const sentName: unknown = typeof sent === 'object' && sent !== null ? Reflect.get(sent, 'fullName') : null;
    expect(typeof sentName === 'string' ? sentName.trim() : null).toBe('רון לוי');
    expect(typeof sent === 'object' && sent !== null ? Reflect.get(sent, 'parentGender') : null).toBe('man');
    expect(await viewText(page)).toMatch(/שם מלא[:\s]+רון לוי/);
    expect(await viewText(page)).toMatch(/מין ההורה[:\s]+גבר/);
    await page.reload();
    await expect(editButton(page)).toBeVisible();
    expect(await viewText(page)).toMatch(/שם מלא[:\s]+רון לוי/);
    expect(await viewText(page)).toMatch(/מין ההורה[:\s]+גבר/);
  });

  for (const [value, label] of [['woman', LABELS.woman], ['man', LABELS.man], ['other', LABELS.other], ['prefer_not_to_say', LABELS.prefer_not_to_say]] as const) {
    test(`[F2.1 c7 VAL-006] choosing "${label}" sends exactly ${value}`, async ({ page }) => {
      const net = await setup(page, { fullName: 'דנה כהן', parentGender: value === 'woman' ? 'man' : 'woman' });
      await openEdit(page);
      await genderSelect(page).selectOption({ label });
      await saveButton(page).click();
      await expect(editButton(page)).toBeVisible();
      expect(net.puts).toHaveLength(1);
      expect(sentField(net, 0, 'parentGender')).toBe(value);
    });
  }

  test('[F2.1 c7 Q3] choosing the empty option sends parentGender null, and the view reads "לא צוין"', async ({ page }) => {
    const net = await setup(page);
    await openEdit(page);
    await genderSelect(page).selectOption({ value: '' });
    await saveButton(page).click();
    await expect(editButton(page)).toBeVisible();
    expect(net.puts).toHaveLength(1);
    expect(sentField(net, 0, 'parentGender')).toBeNull();
    expect(net.profile.parentGender).toBeNull();
    expect(await viewText(page)).toMatch(/מין ההורה[:\s]+לא צוין/);
  });

  test('[F2.1 c17] after a successful save "הפרטים נשמרו" is announced in a role="status"', async ({ page }) => {
    await setup(page);
    await openEdit(page);
    await saveWith(page, 'רון לוי');
    await expect(page.getByRole('status').filter({ hasText: SAVED })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.1 c6 [ERR-003 VAL-001] validation before anything is sent', () => {
  for (const [label, value, message] of [
    ['empty', '', NAME_REQUIRED],
    ['spaces only', '     ', NAME_REQUIRED],
    ['1 character', 'א', NAME_LENGTH],
    ['1 character between spaces', '  א  ', NAME_LENGTH],
    ['61 characters', 'א'.repeat(61), NAME_LENGTH],
  ] as const) {
    test(`[F2.1 c6] ${label}: no PUT, the message, focus on the name input tied to it by aria-describedby`, async ({ page }) => {
      const net = await setup(page);
      await openEdit(page);
      await nameInput(page).fill(value);
      await saveButton(page).click();
      await expect(main(page).getByText(message)).toBeVisible();
      expect(net.puts).toHaveLength(0);
      await expect(nameInput(page)).toBeFocused();
      await expect(nameInput(page)).toHaveAttribute('aria-invalid', 'true');
      const ref = await nameInput(page).getAttribute('aria-describedby');
      expect(ref).not.toBeNull();
      const described = await page.evaluate((ids) => ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '), ref ?? '');
      expect(described).toContain(message);
    });
  }

  for (const [label, value] of [['2 characters', 'אב'], ['60 characters', 'א'.repeat(60)]] as const) {
    test(`[F2.1 c6] ${label} are accepted`, async ({ page }) => {
      const net = await setup(page);
      await openEdit(page);
      await saveWith(page, value);
      await expect(editButton(page)).toBeVisible();
      expect(net.puts).toHaveLength(1);
      expect(await viewText(page)).toContain(value);
    });
  }

  test('[F2.1 c6] messages appear only after the first Save: not while typing, not on blur', async ({ page }) => {
    await setup(page);
    await openEdit(page);
    await nameInput(page).fill('');
    await nameInput(page).blur();
    await nameInput(page).pressSequentially('א');
    await page.keyboard.press('Tab');
    await expect(main(page).getByText(NAME_REQUIRED)).toHaveCount(0);
    await expect(main(page).getByText(NAME_LENGTH)).toHaveCount(0);
    await expect(nameInput(page)).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('[F2.1 c6] after the error, fixing the name and saving works', async ({ page }) => {
    const net = await setup(page);
    await openEdit(page);
    await saveWith(page, '');
    await expect(main(page).getByText(NAME_REQUIRED)).toBeVisible();
    await saveWith(page, 'רון לוי');
    await expect(editButton(page)).toBeVisible();
    expect(net.puts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.1 c15 [ERR-004] a failed save', () => {
  for (const failure of [500, 'abort'] as const) {
    test(`[F2.1 c15] PUT ${String(failure)}: the form stays open with its input, the text in a role="alert", Save can be pressed again`, async ({ page }) => {
      const net = await setup(page);
      await openEdit(page);
      net.put = failure;
      await saveWith(page, 'רון לוי', LABELS.other);
      await expect(page.getByRole('alert').filter({ hasText: SAVE_FAILED })).toBeVisible();
      await expect(nameInput(page)).toHaveValue('רון לוי');
      await expect(genderSelect(page).locator('option:checked')).toHaveText(LABELS.other);
      await expect(saveButton(page)).toBeEnabled();
      expect(net.puts).toHaveLength(1);
      net.put = 200;
      await saveButton(page).click();
      await expect(editButton(page)).toBeVisible();
      expect(net.puts).toHaveLength(2);
      expect(await viewText(page)).toMatch(/שם מלא[:\s]+רון לוי/);
    });
  }

  test('[F2.1 c15] while a save is in flight Save is disabled, and pressing it twice sends one PUT', async ({ page }) => {
    const net = await setup(page);
    await openEdit(page);
    let release: () => void = () => undefined;
    net.holdPut = new Promise<void>((resolve) => {
      release = resolve;
    });
    await nameInput(page).fill('רון לוי');
    await saveButton(page).click();
    await expect.poll(() => net.puts.length).toBe(1);
    await expect(saveButton(page)).toBeDisabled();
    await saveButton(page).click({ force: true, timeout: 2000 }).catch(() => undefined);
    await page.keyboard.press('Enter');
    release();
    await expect(editButton(page)).toBeVisible();
    expect(net.puts).toHaveLength(1);
  });

  test('[F2.1 c15 c3] the cancelled-after-failure view still shows the stored values, not the failed input', async ({ page }) => {
    const net = await setup(page);
    await openEdit(page);
    net.put = 500;
    await saveWith(page, 'שם שלא נשמר');
    await expect(page.getByRole('alert').filter({ hasText: SAVE_FAILED })).toBeVisible();
    await cancelButton(page).click();
    await expect(editButton(page)).toBeVisible();
    expect(await viewText(page)).toMatch(/שם מלא[:\s]+דנה כהן/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.1 c16 [ERR-038] a save whose token is refused on refresh', () => {
  test('[F2.1 c16] the session ends and the user lands on login with "ההתחברות פגה. אפשר להתחבר שוב"', async ({ page }) => {
    const net = await setup(page, undefined, true);
    await openEdit(page);
    net.refreshOk = false;
    await saveWith(page, 'רון לוי');
    await expect.poll(() => pathOf(page)).toBe('/login');
    await expect(page.getByText(EXPIRED)).toBeVisible();
  });

  test('[F2.1 c16] a PUT the server refuses with 401 (the token is no longer accepted): login with the expired text', async ({ page }) => {
    const net = await setup(page);
    await openEdit(page);
    net.put = 401;
    net.me = 401;
    await saveWith(page, 'רון לוי');
    await expect.poll(() => pathOf(page)).toBe('/login');
    await expect(page.getByText(EXPIRED)).toBeVisible();
  });
});

test.describe('F2.1 c11 [ERR-037] a stopped account', () => {
  test('[F2.1 c11 A9] GET answers 403 and the account is stopped: no profile data on the page, the ERR-037 text', async ({ page }) => {
    const net = await setup(page);
    await signIn(page);
    // The sign-in lands on /feed, whose own calls (its own-profile GET among them) recheck the account on a 403. The landing page is left
    // before the account is stopped, so no answer of the stopped state reaches it: had it seen one, it would end the session (and remove
    // the stored one) before the reload below, which would then open as a Guest, without the ERR-037 text.
    await page.goto('about:blank');
    net.get = 403;
    net.me = 'unavailable';
    await page.goto('/profile');
    await expect(page.getByText('הכניסה לחשבון הזה אינה זמינה כרגע').first()).toBeVisible();
    expect(await page.evaluate(() => document.body.innerText)).not.toContain('דנה כהן');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.1 keyboard only [NFR-A11Y-001]', () => {
  test('[F2.1 c4 c5 c17] Tab to עריכה, Enter, type, Tab to the select, Tab to שמירה, Enter saves', async ({ page }) => {
    const net = await setup(page);
    await openProfileLoaded(page);
    await editButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(nameInput(page)).toBeVisible();
    await nameInput(page).focus();
    await nameInput(page).fill('רון לוי');
    await page.keyboard.press('Tab');
    await expect(genderSelect(page)).toBeFocused();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    expect(['שמירה', 'ביטול']).toContain(focused);
    await saveButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(editButton(page)).toBeVisible();
    expect(net.puts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
for (const vp of [{ name: '375', size: MOBILE }, { name: '1280', size: DESKTOP_1280 }]) {
  test.describe(`F2.1 c17 [S3 NFR-A11Y-001] axe at ${vp.name}, RTL`, () => {
    test.use({ viewport: vp.size });
    const scan = async (page: Page): Promise<void> => {
      const result = await runAxe(page, { tags: AXE_TAGS });
      expect(result.checked).toBeGreaterThan(0);
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
    };

    test(`[F2.1 c17] profile-view (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openProfileLoaded(page);
      expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl');
      await scan(page);
    });

    test(`[F2.1 c17] profile-edit (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openEdit(page);
      await scan(page);
    });

    test(`[F2.1 c17] profile-edit-errors (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openEdit(page);
      await saveWith(page, '');
      await expect(main(page).getByText(NAME_REQUIRED)).toBeVisible();
      await scan(page);
    });

    test(`[F2.1 c17] profile-load-failed (${vp.name})`, async ({ page }) => {
      const net = await setup(page);
      net.get = 500;
      await openProfile(page);
      await expect(main(page).getByText(LOAD_FAILED)).toBeVisible();
      await scan(page);
    });

    test(`[F2.1 c17] profile-edit-save-failed (${vp.name})`, async ({ page }) => {
      const net = await setup(page);
      await openEdit(page);
      net.put = 500;
      await saveWith(page, 'רון לוי');
      await expect(page.getByRole('alert').filter({ hasText: SAVE_FAILED })).toBeVisible();
      await scan(page);
    });

    test(`[F2.1 c17] after a save, with the status message (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openEdit(page);
      await saveWith(page, 'רון לוי');
      await expect(page.getByRole('status').filter({ hasText: SAVED })).toBeVisible();
      await scan(page);
    });
  });
}
