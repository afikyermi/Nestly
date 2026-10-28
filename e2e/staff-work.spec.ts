// The staff's work (I14 completion, Afik 21.10.2026, decisions-in-force.md §9): the main flow of each new screen on a desktop browser, network
// stubbed (e2e/support/admin-stub.ts). The Admin's home (red bar, needs attention, the week, the team, the children's trends); a Moderator's
// "my work" ("next in queue" opens the item; escalation to the Admin); /home by role; the review feed (no composer, no like). The rules are
// pgTAP's (file 100) and tests/db/staff-work.db.test.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { CORS, DESKTOP_1280, EMAIL, json } from './support/journeys-stub';
import { POST_CHILD, setupAdmin } from './support/admin-stub';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

const PASSWORD = 'Zq-7-unique-pw-marker-91';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}

/** /api/account/kind answers a staff account (the home and the menu follow it). */
async function stubStaffKind(page: Page): Promise<void> {
  await page.route('**/api/account/kind', (route) => (route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { kind: 'staff' })));
}

test.describe('[F14.2-b] the staff homes', () => {
  test('[F14.2-b c1 §9.6 §9.10 AC-157] the Admin\'s /home leads to its home: the red bar, what needs attention, the week, the team and the children\'s trends', async ({ page }) => {
    const net = await setupAdmin(page);
    await stubStaffKind(page);
    await signIn(page);
    await page.goto('/home');
    await expect.poll(() => pathOf(page)).toBe('/admin');
    await expect(page.getByRole('heading', { level: 2, name: 'בית הניהול' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'תוכן שמסכן ילד' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'דורש תשומת לב' })).toBeVisible();
    await expect(page.getByText(/קפיצה בדיווחים: 6 ביממה האחרונה/)).toBeVisible();
    await expect(page.getByText('מדריכים שממתינים לאישור: 9')).toBeVisible();
    // I14 completion B (AC-157, OP-057, Afik 21.10.2026 §11.8): no "expiring invitations" card
    await expect(page.getByText(/הזמנות שפגות בקרוב/)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'השבוע לעומת השבוע הקודם' })).toBeVisible();
    // AC-216: the community's last 30 days as daily charts, each with its numbers as a table, and a link to all the data
    await expect(page.getByRole('heading', { name: 'הקהילה ב-30 הימים האחרונים' })).toBeVisible();
    for (const name of ['הרשמות ליום', 'חשבונות שנכנסו', 'פוסטים ליום', 'דיווחים ליום']) await expect(page.getByRole('img', { name, exact: true })).toBeVisible();
    await expect(page.getByText('150 בתקופה · 5 ביום בממוצע')).toBeVisible();
    await expect(page.getByRole('table', { name: 'הרשמות ליום · הנתונים בטבלה' }).getByRole('row')).toHaveCount(31);
    await expect(page.getByRole('link', { name: 'לכל הנתונים' })).toHaveAttribute('href', '/admin/analytics');
    await expect(page.getByText('נועה לוי')).toBeVisible();
    // the children's trends: closed lists, cells only, a small cell hidden with no number
    await page.getByRole('combobox', { name: 'מעקב' }).selectOption('bottle');
    await page.getByRole('combobox', { name: 'מדד' }).selectOption('amount_ml');
    await page.getByRole('combobox', { name: 'חלוקה לפי' }).selectOption('child_sex');
    // I14 completion B (AC-153, OP-056): calendar periods only, and no week or month split
    await expect(page.getByRole('combobox', { name: 'חלוקה לפי' }).getByRole('option')).toHaveText(['—', 'גיל הילד', 'מין הילד']);
    await page.getByRole('combobox', { name: 'תקופה' }).selectOption('this_week');
    const asked = page.waitForRequest((request) => request.url().includes('/api/admin/child-trends'));
    await page.getByRole('button', { name: 'הצגה', exact: true }).click();
    expect(new URL((await asked).url()).searchParams.get('period')).toBe('this_week');
    const table = page.getByRole('table', { name: 'הנתונים בטבלה', exact: true });
    await expect(table.getByRole('row', { name: /בנות/ })).toContainText('125');
    await expect(table.getByRole('row', { name: /בנים/ })).toContainText('מוסתר');
    expect(net.sent.some((s) => s.path.includes('child-trends'))).toBe(false); // a GET, not recorded as a write
    // the sensitive events are one press away
    await page.getByRole('link', { name: 'אירועים רגישים ביומן' }).click();
    await expect.poll(() => pathOf(page)).toBe('/admin/audit');
    await expect(page.getByRole('checkbox', { name: 'רק אירועים רגישים' })).toBeChecked();
  });

  test('[F14.2-b c2 §9.9] a Moderator\'s "my work": counters by key, "next in queue" opens the item, and it escalates to the Admin with a note', async ({ page }) => {
    const net = await setupAdmin(page, { role: 'moderator', permissions: ['REPORTS_VIEW', 'CONTENT_MODERATE'] });
    await stubStaffKind(page);
    await signIn(page);
    await page.goto('/home');
    await expect.poll(() => pathOf(page)).toBe('/admin');
    await expect(page.getByRole('heading', { level: 2, name: 'העבודה שלי' })).toBeVisible();
    await expect(page.locator('dt', { hasText: 'דיווחים פתוחים' })).toBeVisible();
    await expect(page.getByText('הוותיק ביותר שממתין')).toBeVisible();
    await page.getByRole('link', { name: 'הבא בתור' }).click();
    await expect.poll(() => new URL(page.url()).search).toContain(POST_CHILD);
    await expect(page.getByRole('heading', { name: 'ההקשר' })).toBeVisible();
    await expect(page.getByText('תגובה בשרשור')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'כרטיס המחבר' })).toBeVisible();
    await page.getByLabel('מה צריך מהמנהל').fill('נא להחליט על החסימה');
    await page.getByRole('button', { name: 'שליחה למנהל' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'הדיווח הועבר למנהל' })).toBeVisible();
    expect(net.sent.filter((s) => s.path === '/api/admin/reports/escalate').map((s) => s.body)).toEqual([
      { targetKind: 'post', targetId: POST_CHILD, note: 'נא להחליט על החסימה' },
    ]);
  });

  test('[F14.2-b c3 §9.7] the review feed: no composer and no like for a staff account, and no personal profile in the navigation', async ({ page }) => {
    await setupAdmin(page);
    await stubStaffKind(page);
    await signIn(page);
    await page.goto('/feed');
    await expect(page.getByText(/צפייה לבדיקה בלבד/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: /מה תרצו לשתף/ })).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: 'ניווט ראשי' });
    await expect(nav.getByRole('link', { name: 'פרופיל' })).toHaveCount(0);
    await page.goto('/profile');
    await expect.poll(() => pathOf(page)).toBe('/admin');
  });
});
