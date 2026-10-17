// I2 F2.2a journeys and children on the profile page: view, add, edit (real browser, real session source, network stubbed).
// Derived from .work/journeys-children/spec.md only: criteria 1, 2, 3, 4, 6 (the web half), 8, 12, 13. The server and database
// halves (5, 6's 409 and races, 7, 9, 10, 11) are in apps/server/tests and supabase/tests/51_children_write.sql: not repeated here.
// The stub plays the server: GET /api/journeys answers the stored journeys and children; POST /api/children appends the child in
// the next place; PUT /api/children/:id replaces its three fields; a write answers the whole GET shape (BUILDER's ownJourneysResponse,
// packages/shared: a name only, no expected value). Dates leave the stub as YYYY-MM-DD.
// The clock is fixed at 15.06.2026 12:00 local time, so "today" and "tomorrow" are known dates.
import { expect, test } from '@playwright/test';
import type { Locator, Page, Route } from '@playwright/test';
import { MOBILE, runAxe } from './helpers';
import { APP, pathOf } from './app-helpers';

test.use({ baseURL: APP, viewport: MOBILE });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const DESKTOP_1280 = { width: 1280, height: 800 };
const NOW = new Date(2026, 5, 15, 12, 0, 0);
const EMAIL = 'dana.cohen@example.com';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const T = {
  section: 'המסע שלי',
  pregnant: 'בהריון · תאריך לידה משוער: 01.03.2027',
  pregnantNoDate: 'תאריך לידה משוער: לא צוין',
  hasChild: 'יש לנו ילד או ילדה',
  planning: 'מתכננים',
  loadFailed: 'לא הצלחנו לטעון את פרטי המסע. אפשר לנסות שוב',
  saveFailed: 'השמירה לא הצליחה. אפשר לנסות שוב',
  saved: 'הפרטים נשמרו',
  limit: 'אפשר להוסיף עד 10 ילדים',
  nameRequired: 'יש למלא שם',
  nameLength: 'שם צריך להכיל עד 60 תווים',
  sexRequired: 'יש לבחור מין',
  dateRequired: 'יש למלא תאריך לידה',
  dateNotReal: 'התאריך אינו תקין. יש לבדוק יום, חודש ושנה',
  dateFuture: 'תאריך הלידה לא יכול להיות בעתיד',
  dateFloor: 'התאריך צריך להיות מ-1900 ואילך',
  expired: 'ההתחברות פגה. אפשר להתחבר שוב',
} as const;
const SEX = { boy: 'בן', girl: 'בת', unknown: 'עוד לא ידוע' } as const;
type Sex = keyof typeof SEX;

interface Journey { id: string; stage: 'planning' | 'pregnant' | 'has_child'; dueDate: string | null }
interface Kid { id: string; name: string; sex: Sex; birthDate: string }
interface Sent { method: 'POST' | 'PUT'; path: string; body: Record<string, unknown> }
const isSex = (v: unknown): v is Sex => typeof v === 'string' && Object.keys(SEX).includes(v);

const A_JOURNEYS: Journey[] = [
  { id: 'j-1', stage: 'pregnant', dueDate: '2027-03-01' },
  { id: 'j-2', stage: 'has_child', dueDate: null },
];
const A_KIDS: Kid[] = [
  { id: 'c0000001-0000-4000-8000-000000000001', name: 'נועה', sex: 'girl', birthDate: '2023-05-04' },
  { id: 'c0000002-0000-4000-8000-000000000002', name: 'איתי', sex: 'boy', birthDate: '2025-01-10' },
];
const PLANNING: Journey[] = [{ id: 'j-9', stage: 'planning', dueDate: null }];
const tenKids = (): Kid[] => Array.from({ length: 10 }, (_v, i) => ({ id: `c00000${String(i + 10)}-0000-4000-8000-000000000000`, name: `ילד ${i + 1}`, sex: 'boy', birthDate: '2020-01-01' }));

interface Net {
  journeys: Journey[];
  kids: Kid[];
  get: number | 'abort';
  write: number | 'abort';
  holdGet: Promise<void> | null;
  holdWrite: Promise<void> | null;
  gets: number;
  sent: Sent[];
  refreshOk: boolean;
  shortSession: boolean;
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

/** YYYY-MM-DD of the three typed parts, as the stub stores it. */
function isoFrom(body: Record<string, unknown>): string {
  const d: unknown = body.birthDate;
  if (typeof d !== 'object' || d === null) return String(d);
  const part = (k: string, w: number) => String(Reflect.get(d, k) ?? '').trim().padStart(w, '0');
  return `${part('year', 4)}-${part('month', 2)}-${part('day', 2)}`;
}

async function setup(page: Page, start: { journeys?: Journey[]; kids?: Kid[] } = {}, shortSession = false): Promise<Net> {
  const net: Net = {
    journeys: [...(start.journeys ?? A_JOURNEYS)], kids: [...(start.kids ?? A_KIDS)], get: 200, write: 200, holdGet: null, holdWrite: null,
    gets: 0, sent: [], refreshOk: true, shortSession, me: 'active',
  };
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => {
    Reflect.set(window, 'nestlyRealSession', true);
  });
  const far = Math.floor(new Date(2100, 0, 1).getTime() / 1000);
  await page.route('https://e2e-stub.invalid/auth/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const refresh = req.url().includes('/token') && req.url().includes('grant_type=refresh_token');
    if (refresh && !net.refreshOk) return json(route, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'refused' });
    if (refresh && net.shortSession) return json(route, 200, session(Math.floor(NOW.getTime() / 1000) - 60));
    if (req.url().includes('/token')) return json(route, 200, session(net.shortSession ? Math.floor(NOW.getTime() / 1000) + 10 : far));
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
  await page.route('**/api/journeys', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    net.gets += 1;
    if (net.holdGet !== null) await net.holdGet;
    if (net.get === 'abort') return route.abort('connectionreset');
    if (net.get !== 200) return json(route, net.get, { error: 'internal' });
    return json(route, 200, { journeys: net.journeys, children: net.kids });
  });
  await page.route(/\/api\/children(\/[^/?]+)?(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const parsed: unknown = JSON.parse(req.postData() ?? 'null');
    const body: Record<string, unknown> = typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
    const path = new URL(req.url()).pathname;
    const method = req.method() === 'PUT' ? 'PUT' : 'POST';
    net.sent.push({ method, path, body });
    if (net.holdWrite !== null) await net.holdWrite;
    if (net.write === 'abort') return route.abort('connectionreset');
    if (net.write !== 200) return json(route, net.write, { error: net.write === 401 ? 'unauthenticated' : 'internal' });
    const fields = { name: typeof body.name === 'string' ? body.name.trim() : '', sex: isSex(body.sex) ? body.sex : 'unknown', birthDate: isoFrom(body) };
    if (method === 'POST') {
      const kid: Kid = { id: `c00000${String(90 + net.kids.length)}-0000-4000-8000-000000000099`, ...fields };
      net.kids.push(kid);
      if (!net.journeys.some((j) => j.stage === 'has_child')) net.journeys.push({ id: 'j-hc', stage: 'has_child', dueDate: null });
      return json(route, 201, { journeys: net.journeys, children: net.kids });
    }
    const id = path.split('/').pop() ?? '';
    const at = net.kids.findIndex((k) => k.id === id);
    if (at < 0) return json(route, 404, { error: 'not_found' });
    net.kids[at] = { id, ...fields };
    return json(route, 200, { journeys: net.journeys, children: net.kids });
  });
  return net;
}

// ---- locators and steps ----------------------------------------------------------------------------------------------
const main = (page: Page) => page.getByRole('main');
const viewText = async (page: Page) => (await main(page).innerText()).replace(/\s+/g, ' ');
const addButton = (page: Page) => page.getByRole('button', { name: 'הוספת ילד', exact: true });
const retryButton = (page: Page) => page.getByRole('button', { name: 'נסו שוב', exact: true });
const saveButton = (page: Page) => page.getByRole('button', { name: 'שמירה', exact: true });
const cancelButton = (page: Page) => page.getByRole('button', { name: 'ביטול', exact: true });
const nameInput = (page: Page) => page.getByLabel('שם', { exact: true });
const sexSelect = (page: Page) => page.getByLabel('מין', { exact: true });
const dateGroup = (page: Page) => page.getByRole('group', { name: /^תאריך לידה/ });
const dayInput = (page: Page) => dateGroup(page).getByLabel('יום', { exact: true });
const monthInput = (page: Page) => dateGroup(page).getByLabel('חודש', { exact: true });
const yearInput = (page: Page) => dateGroup(page).getByLabel('שנה', { exact: true });
/** The innermost element that holds the child's line and an "עריכה" button: that child's row. */
const childRow = (page: Page, text: string): Locator =>
  main(page).locator('*').filter({ hasText: text }).filter({ has: page.getByRole('button', { name: /עריכה/ }) }).last();
const childEdit = (page: Page, text: string) => childRow(page, text).getByRole('button', { name: /עריכה/ });

async function openProfile(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.goto('/profile');
  expect(pathOf(page)).toBe('/profile');
}
async function openLoaded(page: Page): Promise<void> {
  await openProfile(page);
  await expect(main(page).getByText(T.section)).toBeVisible();
  await expect(addButton(page)).toBeVisible();
}
async function fillChild(page: Page, name: string | null, sex: Sex | null, date: [string, string, string] | null): Promise<void> {
  if (name !== null) await nameInput(page).fill(name);
  if (sex !== null) await sexSelect(page).selectOption({ label: SEX[sex] });
  if (date !== null) {
    await dayInput(page).fill(date[0]);
    await monthInput(page).fill(date[1]);
    await yearInput(page).fill(date[2]);
  }
}
async function openAdd(page: Page): Promise<void> {
  await openLoaded(page);
  await addButton(page).click();
  await expect(nameInput(page)).toBeVisible();
}
/** The texts that aria-describedby of the element and of its enclosing group point to. */
async function describedBy(target: Locator): Promise<string> {
  return target.evaluate((el) => {
    const ids: string[] = [];
    for (let node: Element | null = el; node !== null; node = node.parentElement) {
      ids.push(...(node.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
      if (node.tagName === 'FIELDSET' || node.getAttribute('role') === 'group') break;
    }
    return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
  });
}
const focused = (page: Page) => page.locator('*:focus');
const order = (text: string, parts: string[]) => parts.map((p) => text.indexOf(p));

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2a c1 c2 [FR-PROFILE-002 PG-012] the view', () => {
  test('[F2.2a c1] pregnant with a due date, has_child, two children by slot, each with "עריכה"', async ({ page }) => {
    await setup(page);
    await openLoaded(page);
    const text = await viewText(page);
    const at = order(text, [T.section, T.pregnant, T.hasChild, 'נועה · בת · 04.05.2023', 'איתי · בן · 10.01.2025']);
    for (const i of at) expect(i, text).toBeGreaterThanOrEqual(0);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    await expect(childEdit(page, 'נועה · בת · 04.05.2023')).toHaveCount(1);
    await expect(childEdit(page, 'איתי · בן · 10.01.2025')).toHaveCount(1);
    expect(text).toMatch(/שם מלא[:\s]+דנה כהן/);
  });

  test('[F2.2a c2] a due date null reads "תאריך לידה משוער: לא צוין"', async ({ page }) => {
    await setup(page, { journeys: [{ id: 'j-1', stage: 'pregnant', dueDate: null }], kids: [] });
    await openLoaded(page);
    expect(await viewText(page)).toContain(T.pregnantNoDate);
  });

  test('[F2.2a c2] planning only: "מתכננים", no child rows, and "הוספת ילד"', async ({ page }) => {
    await setup(page, { journeys: PLANNING, kids: [] });
    await openLoaded(page);
    expect(await viewText(page)).toContain(T.planning);
    await expect(main(page).getByRole('button', { name: /עריכה/ })).toHaveCount(1); // the F2.1 profile's own
    await expect(addButton(page)).toBeEnabled();
  });

  test('[F2.2a c2] while GET is pending: a loading state, no rows, no add or edit control', async ({ page }) => {
    const net = await setup(page);
    let release: () => void = () => undefined;
    net.holdGet = new Promise<void>((resolve) => { release = resolve; });
    await openProfile(page);
    await expect.poll(() => net.gets).toBeGreaterThan(0);
    const text = await viewText(page);
    for (const absent of ['נועה', 'איתי', T.pregnant, T.hasChild]) expect(text).not.toContain(absent);
    await expect(addButton(page)).toHaveCount(0);
    release();
    await expect(addButton(page)).toBeVisible();
    await expect(childEdit(page, 'נועה · בת · 04.05.2023')).toHaveCount(1);
  });

  for (const failure of [500, 503, 'abort'] as const) {
    test(`[F2.2a c2 ERR-004] GET ${String(failure)}: the load-failed text and "נסו שוב", which repeats the GET; the F2.1 fields still render`, async ({ page }) => {
      const net = await setup(page);
      net.get = failure;
      await openProfile(page);
      await expect(main(page).getByText(T.loadFailed)).toBeVisible();
      expect(await viewText(page)).toMatch(/שם מלא[:\s]+דנה כהן/);
      expect(await viewText(page)).not.toContain('נועה');
      await expect(addButton(page)).toHaveCount(0);
      const before = net.gets;
      net.get = 200;
      await retryButton(page).click();
      await expect.poll(() => net.gets).toBeGreaterThan(before);
      await expect(childEdit(page, 'נועה · בת · 04.05.2023')).toHaveCount(1);
      await expect(main(page).getByText(T.loadFailed)).toHaveCount(0);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2a c3 [FR-REG-003 VAL-043 VAL-006 VAL-005] adding a child', () => {
  test('[F2.2a c3] the form: "שם", "מין" with בן / בת / עוד לא ידוע, "תאריך לידה" in day, month, year', async ({ page }) => {
    await setup(page);
    await openAdd(page);
    await expect(nameInput(page)).toHaveValue('');
    const options = (await sexSelect(page).locator('option').allTextContents()).map((o) => o.trim());
    for (const label of Object.values(SEX)) expect(options).toContain(label);
    for (const field of [dayInput(page), monthInput(page), yearInput(page)]) await expect(field).toHaveValue('');
  });

  test('[F2.2a c3] "ביטול" closes the form and sends nothing', async ({ page }) => {
    const net = await setup(page);
    await openAdd(page);
    await fillChild(page, 'מיכל', 'girl', ['1', '2', '2024']);
    await cancelButton(page).click();
    await expect(nameInput(page)).toHaveCount(0);
    await expect(addButton(page)).toBeVisible();
    expect(net.sent).toHaveLength(0);
    expect(await viewText(page)).not.toContain('מיכל');
  });

  test('[F2.2a c3] a valid save: one POST with the three fields; the child appears last, also after a full reload', async ({ page }) => {
    const net = await setup(page);
    await openAdd(page);
    await fillChild(page, 'מיכל', 'unknown', ['7', '3', '2026']);
    await saveButton(page).click();
    await expect(childEdit(page, 'מיכל · עוד לא ידוע · 07.03.2026')).toHaveCount(1);
    expect(net.sent).toHaveLength(1);
    expect(net.sent[0]?.method).toBe('POST');
    expect(net.sent[0]?.path).toBe('/api/children');
    expect(String(net.sent[0]?.body.name).trim()).toBe('מיכל');
    expect(net.sent[0]?.body.sex).toBe('unknown');
    expect(isoFrom(net.sent[0]?.body ?? {})).toBe('2026-03-07');
    for (const forbidden of ['userId', 'user_id', 'slot', 'id']) expect(Object.keys(net.sent[0]?.body ?? {})).not.toContain(forbidden);
    const check = async () => {
      const text = await viewText(page);
      const at = order(text, ['נועה · בת · 04.05.2023', 'איתי · בן · 10.01.2025', 'מיכל · עוד לא ידוע · 07.03.2026']);
      expect([...at].sort((x, y) => x - y)).toEqual(at);
      expect(at[0]).toBeGreaterThanOrEqual(0);
    };
    await check();
    await page.reload();
    await expect(childEdit(page, 'מיכל · עוד לא ידוע · 07.03.2026')).toHaveCount(1);
    await check();
  });

  test('[F2.2a c3 c7] planning only: adding the first child shows it, and after a reload "יש לנו ילד או ילדה" too', async ({ page }) => {
    await setup(page, { journeys: PLANNING, kids: [] });
    await openAdd(page);
    await fillChild(page, 'נועה', 'girl', ['4', '5', '2023']);
    await saveButton(page).click();
    await expect(childEdit(page, 'נועה · בת · 04.05.2023')).toHaveCount(1);
    await page.reload();
    await expect(childEdit(page, 'נועה · בת · 04.05.2023')).toHaveCount(1);
    expect(await viewText(page)).toContain(T.hasChild);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2a c4 [VAL-043 VAL-006 VAL-005 ERR-003] validation in the browser, nothing sent', () => {
  type Case = [string, string | null, Sex | null, [string, string, string] | null, string, (page: Page) => Locator];
  const CASES: Case[] = [
    ['name empty', '', 'girl', ['4', '5', '2023'], T.nameRequired, nameInput],
    ['name of spaces', '    ', 'girl', ['4', '5', '2023'], T.nameRequired, nameInput],
    ['61 characters after trim', ` ${'נ'.repeat(61)} `, 'girl', ['4', '5', '2023'], T.nameLength, nameInput],
    ['no sex', 'נועה', null, ['4', '5', '2023'], T.sexRequired, sexSelect],
    ['date empty', 'נועה', 'girl', null, T.dateRequired, dayInput],
    ['date partial', 'נועה', 'girl', ['4', '', '2023'], T.dateRequired, dayInput],
    ['31.02.2024', 'נועה', 'girl', ['31', '2', '2024'], T.dateNotReal, dayInput],
    ['tomorrow (16.06.2026)', 'נועה', 'girl', ['16', '6', '2026'], T.dateFuture, dayInput],
    ['31.12.1899', 'נועה', 'girl', ['31', '12', '1899'], T.dateFloor, dayInput],
  ];
  for (const [label, name, sex, date, message, field] of CASES) {
    test(`[F2.2a c4] ${label}: "${message}", no request, focus on the field, tied by aria-describedby`, async ({ page }) => {
      const net = await setup(page);
      await openAdd(page);
      await fillChild(page, name, sex, date);
      await saveButton(page).click();
      await expect(main(page).getByText(message)).toBeVisible();
      expect(net.sent).toHaveLength(0);
      const target = field === dayInput ? focused(page) : field(page);
      if (field === dayInput) await expect(dateGroup(page).locator('*:focus')).toHaveCount(1);
      else await expect(target).toBeFocused();
      expect(await describedBy(target)).toContain(message);
    });
  }

  test('[F2.2a c4] all three missing: three messages, focus on the first invalid field (the name)', async ({ page }) => {
    const net = await setup(page);
    await openAdd(page);
    await saveButton(page).click();
    for (const m of [T.nameRequired, T.sexRequired, T.dateRequired]) await expect(main(page).getByText(m)).toBeVisible();
    await expect(nameInput(page)).toBeFocused();
    expect(net.sent).toHaveLength(0);
  });

  test('[F2.2a c4] messages appear only after the first Save, not while typing or on blur', async ({ page }) => {
    await setup(page);
    await openAdd(page);
    await nameInput(page).fill('');
    await page.keyboard.press('Tab');
    await dayInput(page).fill('31');
    await monthInput(page).fill('2');
    await page.keyboard.press('Tab');
    for (const m of [T.nameRequired, T.sexRequired, T.dateRequired, T.dateNotReal]) await expect(main(page).getByText(m)).toHaveCount(0);
  });

  for (const [label, name, date, shown] of [
    ['1 character, today (15.06.2026)', 'א', ['15', '6', '2026'], 'א · בת · 15.06.2026'],
    ['60 characters, 01.01.1900', 'נ'.repeat(60), ['1', '1', '1900'], `${'נ'.repeat(60)} · בת · 01.01.1900`],
    ['a name between spaces is stored trimmed', '  רוני  ', ['29', '2', '2024'], 'רוני · בת · 29.02.2024'],
  ] as const) {
    test(`[F2.2a c4] accepted: ${label}`, async ({ page }) => {
      const net = await setup(page);
      await openAdd(page);
      await fillChild(page, name, 'girl', [date[0], date[1], date[2]]);
      await saveButton(page).click();
      await expect(childEdit(page, shown)).toHaveCount(1);
      expect(net.sent).toHaveLength(1);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2a c6 [VAL-040 AC-090] ten children', () => {
  test('[F2.2a c6] with 10 children "הוספת ילד" is disabled and "אפשר להוסיף עד 10 ילדים" shows', async ({ page }) => {
    const net = await setup(page, { kids: tenKids() });
    await openProfile(page);
    await expect(childEdit(page, 'ילד 10 · בן · 01.01.2020')).toHaveCount(1);
    await expect(addButton(page)).toBeDisabled();
    await expect(main(page).getByText(T.limit)).toBeVisible();
    await addButton(page).click({ force: true, timeout: 2000 }).catch(() => undefined);
    await expect(nameInput(page)).toHaveCount(0);
    expect(net.sent).toHaveLength(0);
  });

  test('[F2.2a c6] with 9 children "הוספת ילד" is enabled and the limit text is absent', async ({ page }) => {
    await setup(page, { kids: tenKids().slice(0, 9) });
    await openLoaded(page);
    await expect(addButton(page)).toBeEnabled();
    await expect(main(page).getByText(T.limit)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2a c8 [FR-PROFILE-002 DR-5] editing a child', () => {
  test('[F2.2a c8] "עריכה" opens the form filled with the child\'s values', async ({ page }) => {
    await setup(page);
    await openLoaded(page);
    await childEdit(page, 'איתי · בן · 10.01.2025').click();
    await expect(nameInput(page)).toHaveValue('איתי');
    await expect(sexSelect(page).locator('option:checked')).toHaveText(SEX.boy);
    expect(Number(await dayInput(page).inputValue())).toBe(10);
    expect(Number(await monthInput(page).inputValue())).toBe(1);
    expect(await yearInput(page).inputValue()).toBe('2025');
  });

  test('[F2.2a c8] a save sends one PUT for that child; the order is unchanged and the new values survive a reload', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await childEdit(page, 'נועה · בת · 04.05.2023').click();
    await fillChild(page, 'נועה רות', 'unknown', ['5', '6', '2023']);
    await saveButton(page).click();
    await expect(childEdit(page, 'נועה רות · עוד לא ידוע · 05.06.2023')).toHaveCount(1);
    expect(net.sent).toHaveLength(1);
    expect(net.sent[0]?.method).toBe('PUT');
    expect(net.sent[0]?.path).toBe(`/api/children/${A_KIDS[0]?.id ?? ''}`);
    expect(net.kids.map((k) => k.name)).toEqual(['נועה רות', 'איתי']);
    for (const forbidden of ['userId', 'user_id', 'slot', 'id']) expect(Object.keys(net.sent[0]?.body ?? {})).not.toContain(forbidden);
    await page.reload();
    await expect(childEdit(page, 'נועה רות · עוד לא ידוע · 05.06.2023')).toHaveCount(1);
    const text = await viewText(page);
    expect(text.indexOf('נועה רות · עוד לא ידוע · 05.06.2023')).toBeLessThan(text.indexOf('איתי · בן · 10.01.2025'));
  });

  test('[F2.2a c8] "ביטול" sends nothing and the view keeps the stored values; reopening shows them again', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await childEdit(page, 'איתי · בן · 10.01.2025').click();
    await fillChild(page, 'שם אחר', 'girl', ['1', '1', '2020']);
    await cancelButton(page).click();
    expect(net.sent).toHaveLength(0);
    await expect(childEdit(page, 'איתי · בן · 10.01.2025')).toHaveCount(1);
    await childEdit(page, 'איתי · בן · 10.01.2025').click();
    await expect(nameInput(page)).toHaveValue('איתי');
  });

  test('[F2.2a c8 c4] the edit form validates like the add form: an emptied name is refused, nothing sent', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await childEdit(page, 'איתי · בן · 10.01.2025').click();
    await nameInput(page).fill('');
    await saveButton(page).click();
    await expect(main(page).getByText(T.nameRequired)).toBeVisible();
    await expect(nameInput(page)).toBeFocused();
    expect(net.sent).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2a c12 [ERR-004 ERR-038] saving: failure, in flight, success', () => {
  for (const failure of [500, 'abort'] as const) {
    test(`[F2.2a c12] POST ${String(failure)}: the form keeps its input, the text in role="alert"; a second Save succeeds`, async ({ page }) => {
      const net = await setup(page);
      await openAdd(page);
      net.write = failure;
      await fillChild(page, 'מיכל', 'girl', ['7', '3', '2024']);
      await saveButton(page).click();
      await expect(page.getByRole('alert').filter({ hasText: T.saveFailed })).toBeVisible();
      await expect(nameInput(page)).toHaveValue('מיכל');
      await expect(sexSelect(page).locator('option:checked')).toHaveText(SEX.girl);
      expect(Number(await dayInput(page).inputValue())).toBe(7);
      await expect(saveButton(page)).toBeEnabled();
      net.write = 200;
      await saveButton(page).click();
      await expect(childEdit(page, 'מיכל · בת · 07.03.2024')).toHaveCount(1);
      expect(net.sent).toHaveLength(2);
    });
  }

  test('[F2.2a c12] PUT 500: the edit form keeps its input and shows the alert', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await childEdit(page, 'איתי · בן · 10.01.2025').click();
    net.write = 500;
    await nameInput(page).fill('איתי חדש');
    await saveButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: T.saveFailed })).toBeVisible();
    await expect(nameInput(page)).toHaveValue('איתי חדש');
  });

  test('[F2.2a c12] while a save is in flight Save is disabled; pressing it twice sends one request', async ({ page }) => {
    const net = await setup(page);
    await openAdd(page);
    let release: () => void = () => undefined;
    net.holdWrite = new Promise<void>((resolve) => { release = resolve; });
    await fillChild(page, 'מיכל', 'girl', ['7', '3', '2024']);
    await saveButton(page).click();
    await expect.poll(() => net.sent.length).toBe(1);
    await expect(saveButton(page)).toBeDisabled();
    await saveButton(page).click({ force: true, timeout: 2000 }).catch(() => undefined);
    await page.keyboard.press('Enter');
    release();
    await expect(childEdit(page, 'מיכל · בת · 07.03.2024')).toHaveCount(1);
    expect(net.sent).toHaveLength(1);
  });

  test('[F2.2a c12] an add succeeds: "הפרטים נשמרו" in role="status", focus back on "הוספת ילד"', async ({ page }) => {
    await setup(page);
    await openAdd(page);
    await fillChild(page, 'מיכל', 'girl', ['7', '3', '2024']);
    await saveButton(page).click();
    await expect(page.getByRole('status').filter({ hasText: T.saved })).toBeVisible();
    await expect(addButton(page)).toBeFocused();
  });

  test('[F2.2a c12] an edit succeeds: the status, and focus back on that child\'s "עריכה"', async ({ page }) => {
    await setup(page);
    await openLoaded(page);
    await childEdit(page, 'איתי · בן · 10.01.2025').click();
    await nameInput(page).fill('איתן');
    await saveButton(page).click();
    await expect(page.getByRole('status').filter({ hasText: T.saved })).toBeVisible();
    await expect(childEdit(page, 'איתן · בן · 10.01.2025')).toBeFocused();
  });

  test('[F2.2a c12 ERR-038] a save whose token refresh is refused: the session ends, login with the expired text', async ({ page }) => {
    const net = await setup(page, {}, true);
    await openAdd(page);
    net.refreshOk = false;
    await fillChild(page, 'מיכל', 'girl', ['7', '3', '2024']);
    await saveButton(page).click();
    await expect.poll(() => pathOf(page)).toBe('/login');
    await expect(page.getByText(T.expired)).toBeVisible();
  });

  test('[F2.2a c12 ERR-038] a write the server refuses with 401: login with the expired text', async ({ page }) => {
    const net = await setup(page);
    await openAdd(page);
    net.write = 401;
    net.me = 401;
    await fillChild(page, 'מיכל', 'girl', ['7', '3', '2024']);
    await saveButton(page).click();
    await expect.poll(() => pathOf(page)).toBe('/login');
    await expect(page.getByText(T.expired)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2a c13 [S3 NFR-A11Y-001] keyboard only', () => {
  test('[F2.2a c13] add by keyboard: Enter on "הוספת ילד", type, choose, fill the date, Enter on "שמירה"', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await addButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(nameInput(page)).toBeVisible();
    await nameInput(page).focus();
    await page.keyboard.type('מיכל');
    await page.keyboard.press('Tab');
    await expect(sexSelect(page)).toBeFocused();
    await sexSelect(page).selectOption({ label: SEX.girl });
    await page.keyboard.press('Tab');
    await expect(dateGroup(page).locator('*:focus')).toHaveCount(1);
    await page.keyboard.type('7');
    await page.keyboard.press('Tab');
    await page.keyboard.type('3');
    await page.keyboard.press('Tab');
    await page.keyboard.type('2024');
    await saveButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(childEdit(page, 'מיכל · בת · 07.03.2024')).toHaveCount(1);
    expect(net.sent).toHaveLength(1);
  });

  test('[F2.2a c13] edit and cancel by keyboard: Enter on a child\'s "עריכה", Enter on "ביטול" sends nothing', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await childEdit(page, 'איתי · בן · 10.01.2025').focus();
    await page.keyboard.press('Enter');
    await expect(nameInput(page)).toHaveValue('איתי');
    await cancelButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(nameInput(page)).toHaveCount(0);
    expect(net.sent).toHaveLength(0);
  });

  test('[F2.2a c13] Tab from the page start reaches "הוספת ילד" and every child\'s "עריכה"', async ({ page }) => {
    await setup(page);
    await openLoaded(page);
    const reached = new Set<string>();
    const targets: Array<[string, Locator]> = [
      ['add', addButton(page)],
      ['noa', childEdit(page, 'נועה · בת · 04.05.2023')],
      ['itai', childEdit(page, 'איתי · בן · 10.01.2025')],
    ];
    for (let i = 0; i < 60 && reached.size < targets.length; i += 1) {
      await page.keyboard.press('Tab');
      for (const [label, target] of targets) {
        if (await target.evaluate((el) => el === document.activeElement)) reached.add(label);
      }
    }
    expect([...reached].sort()).toEqual(['add', 'itai', 'noa']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
for (const vp of [{ name: '375', size: MOBILE }, { name: '1280', size: DESKTOP_1280 }]) {
  test.describe(`F2.2a c13 [S3 NFR-A11Y-001] axe at ${vp.name}, RTL`, () => {
    test.use({ viewport: vp.size });
    const scan = async (page: Page): Promise<void> => {
      expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl');
      const result = await runAxe(page, { tags: AXE_TAGS });
      expect(result.checked).toBeGreaterThan(0);
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(0);
    };

    test(`[F2.2a c13 c1] journey-view (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openLoaded(page);
      await scan(page);
    });
    test(`[F2.2a c13 c2] journey-view-empty (${vp.name})`, async ({ page }) => {
      await setup(page, { journeys: PLANNING, kids: [] });
      await openLoaded(page);
      await scan(page);
    });
    test(`[F2.2a c13 c2] journey-load-failed (${vp.name})`, async ({ page }) => {
      const net = await setup(page);
      net.get = 500;
      await openProfile(page);
      await expect(main(page).getByText(T.loadFailed)).toBeVisible();
      await scan(page);
    });
    test(`[F2.2a c13 c3] child-form (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openAdd(page);
      await scan(page);
    });
    test(`[F2.2a c13 c4] child-form-errors (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openAdd(page);
      await saveButton(page).click();
      await expect(main(page).getByText(T.nameRequired)).toBeVisible();
      await scan(page);
    });
    test(`[F2.2a c13 c6] children-limit (${vp.name})`, async ({ page }) => {
      await setup(page, { kids: tenKids() });
      await openProfile(page);
      await expect(main(page).getByText(T.limit)).toBeVisible();
      await scan(page);
    });
    test(`[F2.2a c13 c12] journey-save-failed (${vp.name})`, async ({ page }) => {
      const net = await setup(page);
      await openAdd(page);
      net.write = 500;
      await fillChild(page, 'מיכל', 'girl', ['7', '3', '2024']);
      await saveButton(page).click();
      await expect(page.getByRole('alert').filter({ hasText: T.saveFailed })).toBeVisible();
      await scan(page);
    });
  });
}
