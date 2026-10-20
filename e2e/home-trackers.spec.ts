// I6 home and trackers: the main flow of each new screen (desktop, real session source, network stubbed). The server and database
// halves are in apps/server/tests/trackers-route.test.ts, packages/shared/tests/trackers.test.ts and supabase/tests/86_trackers_cycle_guides.sql.
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { A_KIDS, CORS, DESKTOP_1280, EMAIL, json, main, setup } from './support/journeys-stub';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

interface StoredEvent { id: string; childId: string; kind: string; occurredAt: string; endedAt: string | null; [key: string]: unknown }
interface Net { events: StoredEvent[]; cycle: { id: string; startDate: string; cycleLengthDays: number }[]; posts: string[] }

const GUIDE = { id: 'g-1', stageKind: 'pregnancy', title: 'השליש השני: הזמן לנשום', body: 'בשליש השני רבות מהנשים מרגישות טוב יותר.', source: 'משרד הבריאות' };

async function stubApi(page: Page): Promise<Net> {
  const net: Net = { events: [], cycle: [], posts: [] };
  const body = (route: Route): Record<string, unknown> => {
    const parsed: unknown = JSON.parse(route.request().postData() ?? 'null');
    return typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
  };
  const pre = (route: Route): boolean => route.request().method() === 'OPTIONS';
  await page.route('**/api/home', async (route) => {
    if (pre(route)) return route.fulfill({ status: 204, headers: CORS });
    const latest = net.cycle[0];
    const cycle = latest ? { cycleStart: latest.startDate, ovulationDay: '2026-06-20', windowStart: '2026-06-15', windowEnd: '2026-06-21', nextCycleStart: '2026-07-04', expectedNextStart: '2026-07-04' } : null;
    return json(route, 200, {
      contexts: [
        { kind: 'pregnancy', dueDate: '2027-03-01', week: 27, trimester: 2 },
        { kind: 'parenting', childId: A_KIDS[0]?.id ?? '', childName: 'נועה', ageMonths: 37 },
      ],
      guides: [GUIDE],
      cycle,
    });
  });
  await page.route(/\/api\/trackers\/events(\/[^/?]+)?(\?.*)?$/, async (route) => {
    const req = route.request();
    if (pre(route)) return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    const id = url.pathname.split('/')[4];
    if (req.method() === 'GET') {
      const kind = url.searchParams.get('kind');
      return json(route, 200, { truncated: false, events: net.events.filter((e) => e.kind === kind).map((e) => ({ amountMl: null, choice: null, name: null, dosage: null, weightKg: null, heightCm: null, headCm: null, note: null, ...e })) });
    }
    net.posts.push(`${req.method()} ${url.pathname}`);
    if (req.method() === 'DELETE') {
      net.events = net.events.filter((e) => e.id !== id);
      return json(route, 200, { saved: true });
    }
    const data = body(route);
    if (req.method() === 'PUT') net.events = net.events.map((e) => (e.id === id ? { ...e, ...data, id: e.id, childId: e.childId } : e));
    else net.events.push({ ...data, id: `e-${net.events.length + 1}`, childId: String(data['childId']), kind: String(data['kind']), occurredAt: String(data['occurredAt']), endedAt: typeof data['endedAt'] === 'string' ? data['endedAt'] : null });
    return json(route, req.method() === 'PUT' ? 200 : 201, { saved: true });
  });
  await page.route(/\/api\/cycle(\/[^/?]+)?(\?.*)?$/, async (route) => {
    const req = route.request();
    if (pre(route)) return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') {
      const latest = net.cycle[0];
      const window = latest ? { cycleStart: latest.startDate, ovulationDay: '2026-06-20', windowStart: '2026-06-15', windowEnd: '2026-06-21', nextCycleStart: '2026-07-04', expectedNextStart: '2026-07-04' } : null;
      return json(route, 200, { entries: net.cycle, window });
    }
    const data = body(route);
    if (req.method() === 'POST') net.cycle.unshift({ id: `y-${net.cycle.length + 1}`, startDate: String(data['startDate']), cycleLengthDays: Number(data['cycleLengthDays']) });
    return json(route, 201, { saved: true });
  });
  return net;
}

async function signIn(page: Page, path: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.goto(path);
  expect(pathOf(page)).toBe(path);
}

test.describe('I6 home [FR-HOME-001..004 AC-006 AC-095 AC-069]', () => {
  test('[AC-006] the home shows a card for the pregnancy and for the child, the tracker grid and a guide with the disclaimer', async ({ page }) => {
    await setup(page);
    await stubApi(page);
    await signIn(page, '/home');
    const m = main(page);
    await expect(m.getByRole('heading', { name: 'בית', level: 1 })).toBeVisible();
    await expect(m.getByText('שבוע 27, שליש 2')).toBeVisible();
    await expect(m.getByText('נועה', { exact: true })).toBeVisible();
    for (const label of ['הנקה', 'בקבוק', 'שינה', 'חיתול', 'תרופה', 'גדילה', 'חיסון', 'אמבטיה']) {
      await expect(m.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
    await m.getByText(GUIDE.title).click();
    await expect(m.getByText(GUIDE.body)).toBeVisible();
    await expect(m.getByText('המידע אינו מחליף ייעוץ רפואי')).toBeVisible(); // AC-095
  });

  test('a tracker tile opens its page', async ({ page }) => {
    await setup(page);
    await stubApi(page);
    await signIn(page, '/home');
    await main(page).getByRole('link', { name: 'בקבוק', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/trackers/bottle');
    await expect(main(page).getByRole('heading', { name: 'בקבוק', level: 1 })).toBeVisible();
  });
});

test.describe('I6 trackers [FR-TRACK-001/002 AC-007 AC-023]', () => {
  test('[AC-007] a bottle is saved, shows in the history and the chart, can be edited and deleted', async ({ page }) => {
    await setup(page, { journeys: [], kids: A_KIDS.slice(0, 1) });
    const net = await stubApi(page);
    await signIn(page, '/trackers/bottle');
    const m = main(page);
    await m.getByLabel('כמות במ״ל').fill('120');
    await m.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(m.getByText('הרישום נשמר.')).toBeVisible();
    await expect(m.getByRole('list', { name: 'היסטוריה' }).getByText('120 מ״ל')).toBeVisible();
    await expect(m.getByRole('img', { name: /בקבוק/ })).toBeVisible();
    expect(net.events).toHaveLength(1);

    await m.getByRole('button', { name: 'עריכה', exact: true }).click();
    await m.getByLabel('כמות במ״ל').fill('150');
    await m.getByRole('button', { name: 'שמירת השינויים', exact: true }).click();
    await expect(m.getByRole('list', { name: 'היסטוריה' }).getByText('150 מ״ל')).toBeVisible();

    await m.getByRole('button', { name: 'מחיקה', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'מחיקה', exact: true }).click();
    await expect(m.getByText('עדיין אין רישומים בתקופה שנבחרה.').first()).toBeVisible();
    expect(net.events).toHaveLength(0);
  });

  test('[AC-023 ERR-015] a breastfeeding whose end is before its start is not sent', async ({ page }) => {
    await setup(page, { journeys: [], kids: A_KIDS.slice(0, 1) });
    const net = await stubApi(page);
    await signIn(page, '/trackers/breastfeeding');
    const m = main(page);
    await m.getByRole('combobox', { name: 'צד' }).selectOption({ label: 'שמאל' });
    await m.getByLabel('שעה, התחלה').fill('10:00');
    await m.getByLabel('שעה, סיום').fill('09:00');
    await m.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(m.getByText('זמן הסיום לא יכול להיות מוקדם מזמן ההתחלה.')).toBeVisible();
    expect(net.posts).toEqual([]);
    await m.getByLabel('שעה, סיום').fill('10:20');
    await m.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(m.getByRole('list', { name: 'היסטוריה' }).getByText(/שמאל · 20 דקות/)).toBeVisible();
  });

  test('[FR-TRACK-002] the timer stamps the start and the end of a sleep', async ({ page }) => {
    await setup(page, { journeys: [], kids: A_KIDS.slice(0, 1) });
    await stubApi(page);
    await signIn(page, '/trackers/sleep');
    const m = main(page);
    await m.getByRole('button', { name: 'התחלת טיימר', exact: true }).click();
    await expect(m.getByRole('timer')).toBeVisible();
    await m.getByRole('button', { name: 'עצירת טיימר', exact: true }).click();
    await expect(m.getByRole('timer')).toHaveCount(0);
    await m.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(m.getByRole('list', { name: 'היסטוריה' }).getByText(/דקות/)).toBeVisible();
  });

  test('a period can be picked: the history and the chart load for it', async ({ page }) => {
    await setup(page, { journeys: [], kids: A_KIDS.slice(0, 1) });
    await stubApi(page);
    await signIn(page, '/trackers/bath');
    const m = main(page);
    await m.getByRole('combobox', { name: 'תקופה' }).selectOption({ label: '7 ימים' });
    await expect(m.getByText('עדיין אין רישומים בתקופה שנבחרה.').first()).toBeVisible();
    await m.getByRole('combobox', { name: 'תקופה' }).selectOption({ label: 'טווח אחר' });
    await expect(m.getByRole('group', { name: 'מתאריך' })).toBeVisible();
  });
});

test.describe('I6 cycle [FR-TRACK-001]', () => {
  test('a cycle start and length are saved and the ovulation window is shown as an estimate', async ({ page }) => {
    await setup(page);
    await stubApi(page);
    await signIn(page, '/trackers/cycle');
    const m = main(page);
    await expect(m.getByText('אחרי שמירת מחזור יוצג כאן חלון ביוץ משוער.')).toBeVisible();
    const start = m.getByRole('group', { name: 'תאריך התחלת המחזור' });
    await start.getByLabel('יום').fill('1');
    await start.getByLabel('חודש').fill('6');
    await start.getByLabel('שנה').fill('2026');
    await m.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(m.getByTestId('ovulation-window')).toBeVisible();
    await expect(m.getByText('זו הערכה בלבד', { exact: false })).toBeVisible();
  });
});
