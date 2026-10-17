// Shared by e2e/journeys.spec.ts (I2 F2.2a) and e2e/journeys-pregnancy.spec.ts (I2 F2.2b): the "המסע שלי" stub, its texts, locators
// and steps. Derived from .work/journeys-children/spec.md only (expected texts are the spec's; route names from interface.md).
// The stub plays the server: GET /api/journeys answers the stored journeys and children; POST /api/children appends the child in
// the next place; PUT /api/children/:id replaces its three fields; POST /api/journeys adds a pregnancy (JOURNEY_STAGES order:
// planning, pregnant, has_child; 409 stage_conflict when planning or pregnant exists); PUT /api/journeys/:id sets a pregnancy's due
// date. A write answers the whole GET shape. Dates leave the stub as YYYY-MM-DD. F2.2b2 (spec c17-c23): DELETE /api/children/:id
// removes the child (the last one takes has_child with it, c19); DELETE /api/journeys/:id ends a pregnancy (404 for any other
// stage, c20); POST /api/journeys/:id/birth adds the child and ends the pregnancy (409 children_too_many at 10, c22); POST
// /api/journeys with `endPlanning: true` (interface.md) ends planning first (c23). An id already gone answers 404 not_found.
// The clock is fixed at 15.06.2026 12:00 local time, so "today" and "tomorrow" are known dates.
import { expect } from '@playwright/test';
import type { Locator, Page, Route } from '@playwright/test';
import { MOBILE, runAxe } from '../helpers';
import { pathOf } from '../app-helpers';

export { MOBILE };

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
export const DESKTOP_1280 = { width: 1280, height: 800 };
export const NOW = new Date(2026, 5, 15, 12, 0, 0);
export const EMAIL = 'dana.cohen@example.com';
export const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
export const T = {
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
  dueGroup: 'תאריך לידה משוער (לא חובה)',
  duePartial: 'יש להשלים את התאריך או להשאיר אותו ריק',
  dueRange: 'התאריך צריך להיות בין 16.5.2026 ל-11.4.2027',
  stopped: 'הכניסה לחשבון הזה אינה זמינה כרגע',
} as const;
export const SEX = { boy: 'בן', girl: 'בת', unknown: 'עוד לא ידוע' } as const;
export type Sex = keyof typeof SEX;

export interface Journey { id: string; stage: 'planning' | 'pregnant' | 'has_child'; dueDate: string | null }
export interface Kid { id: string; name: string; sex: Sex; birthDate: string }
export interface Sent { method: 'POST' | 'PUT' | 'DELETE'; path: string; body: Record<string, unknown>; raw?: string | null }
export const STAGE_ORDER: Journey['stage'][] = ['planning', 'pregnant', 'has_child'];
export const isSex = (v: unknown): v is Sex => typeof v === 'string' && Object.keys(SEX).includes(v);

export const A_JOURNEYS: Journey[] = [
  { id: 'j-1', stage: 'pregnant', dueDate: '2027-03-01' },
  { id: 'j-2', stage: 'has_child', dueDate: null },
];
export const A_KIDS: Kid[] = [
  { id: 'c0000001-0000-4000-8000-000000000001', name: 'נועה', sex: 'girl', birthDate: '2023-05-04' },
  { id: 'c0000002-0000-4000-8000-000000000002', name: 'איתי', sex: 'boy', birthDate: '2025-01-10' },
];
export const PLANNING: Journey[] = [{ id: 'j-9', stage: 'planning', dueDate: null }];
export const tenKids = (): Kid[] => Array.from({ length: 10 }, (_v, i) => ({ id: `c00000${String(i + 10)}-0000-4000-8000-000000000000`, name: `ילד ${i + 1}`, sex: 'boy', birthDate: '2020-01-01' }));

export interface Net {
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
  me: 'active' | 'unavailable' | 401;
}

export const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

export function session(expiresAt: number) {
  return {
    access_token: 'e2e-access-token', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, refresh_token: 'e2e-refresh',
    user: { id: 'f0000000-0000-4000-8000-0000000000f1', aud: 'authenticated', role: 'authenticated', email: EMAIL, identities: [], app_metadata: {}, user_metadata: {}, created_at: '2026-01-14T10:00:00Z' },
  };
}

/** YYYY-MM-DD of the three typed parts, as the stub stores it. */
export function isoFrom(body: Record<string, unknown>, field = 'birthDate'): string {
  const d: unknown = body[field];
  if (typeof d !== 'object' || d === null) return String(d);
  const part = (k: string, w: number) => String(Reflect.get(d, k) ?? '').trim().padStart(w, '0');
  return `${part('year', 4)}-${part('month', 2)}-${part('day', 2)}`;
}

export async function setup(page: Page, start: { journeys?: Journey[]; kids?: Kid[] } = {}, shortSession = false): Promise<Net> {
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
    if (net.me === 'unavailable') return json(route, 200, { state: 'unavailable' });
    return json(route, 200, { state: 'active', recoveryQuestions: 'set', mustSetPassword: false });
  });
  await page.route('**/api/profile', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, { fullName: 'דנה כהן', parentGender: 'woman' });
  });
  await page.route(/\/api\/journeys\/[^/?]+(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const parsed: unknown = JSON.parse(req.postData() ?? 'null');
    const body: Record<string, unknown> = typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
    const path = new URL(req.url()).pathname;
    const isDelete = req.method() === 'DELETE';
    net.sent.push({ method: isDelete ? 'DELETE' : 'PUT', path, body, raw: req.postData() });
    if (net.holdWrite !== null) await net.holdWrite;
    if (net.write === 'abort') return route.abort('connectionreset');
    if (net.write !== 200) return json(route, net.write, { error: writeError(net.write) });
    const at = net.journeys.findIndex((j) => j.id === path.split('/').pop() && j.stage === 'pregnant');
    if (isDelete) {
      if (at < 0) return json(route, 404, { error: 'not_found' });
      net.journeys.splice(at, 1);
      return json(route, 200, { journeys: net.journeys, children: net.kids });
    }
    if (at < 0) return json(route, 404, { error: 'not_found' });
    net.journeys[at] = { id: net.journeys[at]?.id ?? '', stage: 'pregnant', dueDate: dueFrom(body) };
    return json(route, 200, { journeys: net.journeys, children: net.kids });
  });
  await page.route('**/api/journeys', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (route.request().method() === 'POST') {
      const parsed: unknown = JSON.parse(route.request().postData() ?? 'null');
      const body: Record<string, unknown> = typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
      net.sent.push({ method: 'POST', path: '/api/journeys', body });
      if (net.holdWrite !== null) await net.holdWrite;
      if (net.write === 'abort') return route.abort('connectionreset');
      if (net.write !== 200) return json(route, net.write, { error: writeError(net.write) });
      if (body.endPlanning === true && !net.journeys.some((j) => j.stage === 'pregnant')) net.journeys = net.journeys.filter((j) => j.stage !== 'planning');
      if (net.journeys.some((j) => j.stage === 'pregnant' || j.stage === 'planning')) return json(route, 409, { error: 'stage_conflict' });
      net.journeys.push({ id: 'j-new', stage: 'pregnant', dueDate: dueFrom(body) });
      net.journeys.sort((x, y) => STAGE_ORDER.indexOf(x.stage) - STAGE_ORDER.indexOf(y.stage));
      return json(route, 201, { journeys: net.journeys, children: net.kids });
    }
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
    const method = req.method() === 'PUT' ? 'PUT' : req.method() === 'DELETE' ? 'DELETE' : 'POST';
    net.sent.push({ method, path, body, raw: req.postData() });
    if (net.holdWrite !== null) await net.holdWrite;
    if (net.write === 'abort') return route.abort('connectionreset');
    if (net.write !== 200) return json(route, net.write, { error: writeError(net.write) });
    if (method === 'DELETE') {
      const gone = net.kids.findIndex((k) => k.id === path.split('/').pop());
      if (gone < 0) return json(route, 404, { error: 'not_found' });
      net.kids.splice(gone, 1);
      if (net.kids.length === 0) net.journeys = net.journeys.filter((j) => j.stage !== 'has_child');
      return json(route, 200, { journeys: net.journeys, children: net.kids });
    }
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
  await page.route(/\/api\/journeys\/[^/?]+\/birth(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const parsed: unknown = JSON.parse(req.postData() ?? 'null');
    const body: Record<string, unknown> = typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
    const path = new URL(req.url()).pathname;
    net.sent.push({ method: 'POST', path, body, raw: req.postData() });
    if (net.holdWrite !== null) await net.holdWrite;
    if (net.write === 'abort') return route.abort('connectionreset');
    if (net.write !== 200) return json(route, net.write, { error: writeError(net.write) });
    const at = net.journeys.findIndex((j) => j.id === path.split('/')[3] && j.stage === 'pregnant');
    if (at < 0) return json(route, 404, { error: 'not_found' });
    if (net.kids.length >= 10) return json(route, 409, { error: 'children_too_many' });
    net.journeys.splice(at, 1);
    net.kids.push({ id: `c00000${String(90 + net.kids.length)}-0000-4000-8000-000000000098`, name: typeof body.name === 'string' ? body.name.trim() : '', sex: isSex(body.sex) ? body.sex : 'unknown', birthDate: isoFrom(body) });
    if (!net.journeys.some((j) => j.stage === 'has_child')) net.journeys.push({ id: 'j-hc', stage: 'has_child', dueDate: null });
    return json(route, 201, { journeys: net.journeys, children: net.kids });
  });
  return net;
}

export const writeError = (status: number): string => (status === 401 ? 'unauthenticated' : status === 403 ? 'account_unavailable' : 'internal');
/** The stored due date of a pregnancy write: YYYY-MM-DD, or null when all three parts are empty. */
export function dueFrom(body: Record<string, unknown>): string | null {
  const d: unknown = body.dueDate;
  if (typeof d !== 'object' || d === null) return null;
  const empty = ['day', 'month', 'year'].every((k) => String(Reflect.get(d, k) ?? '').trim() === '');
  return empty ? null : isoFrom(body, 'dueDate');
}

// ---- locators and steps ----------------------------------------------------------------------------------------------
export const main = (page: Page) => page.getByRole('main');
export const viewText = async (page: Page) => (await main(page).innerText()).replace(/\s+/g, ' ');
export const addButton = (page: Page) => page.getByRole('button', { name: 'הוספת ילד', exact: true });
export const retryButton = (page: Page) => page.getByRole('button', { name: 'נסו שוב', exact: true });
export const saveButton = (page: Page) => page.getByRole('button', { name: 'שמירה', exact: true });
export const cancelButton = (page: Page) => page.getByRole('button', { name: 'ביטול', exact: true });
export const nameInput = (page: Page) => page.getByLabel('שם', { exact: true });
export const sexSelect = (page: Page) => page.getByLabel('מין', { exact: true });
export const dateGroup = (page: Page) => page.getByRole('group', { name: /^תאריך לידה/ });
export const dayInput = (page: Page) => dateGroup(page).getByLabel('יום', { exact: true });
export const monthInput = (page: Page) => dateGroup(page).getByLabel('חודש', { exact: true });
export const yearInput = (page: Page) => dateGroup(page).getByLabel('שנה', { exact: true });
/** The innermost element that holds the child's line and an "עריכה" button: that child's row. */
export const childRow = (page: Page, text: string): Locator =>
  main(page).locator('*').filter({ hasText: text }).filter({ has: page.getByRole('button', { name: /עריכה/ }) }).last();
export const childEdit = (page: Page, text: string) => childRow(page, text).getByRole('button', { name: /עריכה/ });

export async function openProfile(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.goto('/profile');
  expect(pathOf(page)).toBe('/profile');
}
export async function openLoaded(page: Page): Promise<void> {
  await openProfile(page);
  await expect(main(page).getByText(T.section)).toBeVisible();
  await expect(addButton(page)).toBeVisible();
}
export async function fillChild(page: Page, name: string | null, sex: Sex | null, date: [string, string, string] | null): Promise<void> {
  if (name !== null) await nameInput(page).fill(name);
  if (sex !== null) await sexSelect(page).selectOption({ label: SEX[sex] });
  if (date !== null) {
    await dayInput(page).fill(date[0]);
    await monthInput(page).fill(date[1]);
    await yearInput(page).fill(date[2]);
  }
}
export async function openAdd(page: Page): Promise<void> {
  await openLoaded(page);
  await addButton(page).click();
  await expect(nameInput(page)).toBeVisible();
}
/** The texts that aria-describedby of the element and of its enclosing group point to. */
export async function describedBy(target: Locator): Promise<string> {
  return target.evaluate((el) => {
    const ids: string[] = [];
    for (let node: Element | null = el; node !== null; node = node.parentElement) {
      ids.push(...(node.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
      if (node.tagName === 'FIELDSET' || node.getAttribute('role') === 'group') break;
    }
    return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
  });
}
export const focused = (page: Page) => page.locator('*:focus');
export const order = (text: string, parts: string[]) => parts.map((p) => text.indexOf(p));
/** axe (zero violations), RTL, no horizontal scroll: c13 on every listed screen. */
export const scan = async (page: Page): Promise<void> => {
  expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl');
  const result = await runAxe(page, { tags: AXE_TAGS });
  expect(result.checked).toBeGreaterThan(0);
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(0);
};

