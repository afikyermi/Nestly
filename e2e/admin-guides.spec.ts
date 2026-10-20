// I6 the Admin's guide management (FR-ADMIN-012, BR-070): the main flow of the screen (desktop, real session source, network stubbed).
// Who may write, and the Audit entries, are pgTAP (supabase/tests/87_status_guides_admin.sql) and apps/server/tests/db/guides-admin.db.test.ts.
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { CORS, DESKTOP_1280, EMAIL, json, main, setup } from './support/journeys-stub';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

interface Guide { id: string; stageKind: string; rangeFrom: number | null; rangeTo: number | null; title: string; body: string; source: string; sourceCheckedOn: string | null; status: string; publishedAt: string | null }

const seed = (): Guide[] => [
  { id: 'g-1', stageKind: 'planning', rangeFrom: null, rangeTo: null, title: 'מתכננים הריון: איך מתחילים', body: 'טקסט', source: 'משרד הבריאות', sourceCheckedOn: null, status: 'draft', publishedAt: null },
  { id: 'g-2', stageKind: 'pregnancy', rangeFrom: 14, rangeTo: 27, title: 'השליש השני', body: 'טקסט', source: 'ACOG', sourceCheckedOn: '2026-10-20', status: 'draft', publishedAt: null },
];

async function stubGuides(page: Page, mode: 'admin' | 'forbidden' = 'admin'): Promise<Guide[]> {
  const guides = seed();
  await page.route(/\/api\/guides\/manage(\/[^/?]+)?(\?.*)?$/, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (mode === 'forbidden') return json(route, 403, { error: 'forbidden' });
    if (req.method() === 'GET') return json(route, 200, { guides });
    const parsed: unknown = JSON.parse(req.postData() ?? 'null');
    const data: Record<string, unknown> = typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
    if (req.method() === 'POST') {
      guides.push({ id: `g-${guides.length + 1}`, stageKind: String(data['stageKind']), rangeFrom: null, rangeTo: null, title: String(data['title']), body: String(data['body']), source: String(data['source']), sourceCheckedOn: null, status: 'draft', publishedAt: null });
      return json(route, 201, { saved: true });
    }
    const id = new URL(req.url()).pathname.split('/')[4];
    const found = guides.find((g) => g.id === id);
    if (found) Object.assign(found, { status: String(data['status']), title: String(data['title']), publishedAt: data['status'] === 'published' ? '2026-06-15T10:00:00Z' : null });
    return json(route, 200, { saved: true });
  });
  return guides;
}

/** GET /api/admin/access: the staff role the shell shows tabs by (the Guides tab is the Admin's only). */
async function stubAccess(page: Page, role: 'admin' | 'moderator'): Promise<void> {
  await page.route('**/api/admin/access', (route) => json(route, 200, { staff: true, role, permissions: role === 'admin' ? ['AUDIT_LOG_VIEW'] : ['REPORTS_VIEW'] }));
}

async function signIn(page: Page, path: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.goto(path);
  await expect.poll(() => pathOf(page)).toContain(path);
}

test.describe('I6 admin guides [FR-ADMIN-012 BR-070 AC-095]', () => {
  test('the Admin sees drafts awaiting approval, adds a draft, and publishes and hides a guide with a confirmation', async ({ page }) => {
    await setup(page);
    const guides = await stubGuides(page);
    await stubAccess(page, 'admin');
    await signIn(page, '/admin');
    const m = main(page);
    await m.getByRole('navigation', { name: 'מסכי הניהול' }).getByRole('link', { name: 'מדריכים', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/admin/guides');
    await expect(m.getByRole('heading', { name: 'ניהול', level: 1 })).toBeVisible();
    await expect(m.getByRole('heading', { name: 'ניהול מדריכים', level: 2 })).toBeVisible();
    await expect(m.getByText('המידע אינו מחליף ייעוץ רפואי').first()).toBeVisible();
    const list = m.getByRole('list', { name: 'המדריכים' });
    await expect(list.getByText('טיוטה, ממתין לאישור')).toHaveCount(2);

    await m.getByRole('button', { name: 'מדריך חדש', exact: true }).click();
    await m.getByRole('combobox', { name: 'שלב' }).selectOption({ label: 'תכנון הריון' });
    await m.getByLabel('כותרת', { exact: true }).fill('מדריך לבדיקה');
    await m.getByLabel('טקסט', { exact: true }).fill('גוף המדריך');
    await m.getByLabel('מקורות', { exact: true }).fill('משרד הבריאות');
    await m.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(list.getByText('מדריך לבדיקה')).toBeVisible();
    expect(guides).toHaveLength(3);

    // without a source check date a guide cannot be published
    await list.getByRole('listitem').filter({ hasText: 'מדריך לבדיקה' }).getByRole('button', { name: 'פרסום', exact: true }).click();
    await expect(m.getByText('כדי לפרסם יש להזין תאריך בדיקת מקורות.')).toBeVisible();

    const second = list.getByRole('listitem').filter({ hasText: 'השליש השני' });
    await second.getByRole('button', { name: 'פרסום', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'פרסום', exact: true }).click();
    await expect(second.getByText('פורסם', { exact: true })).toBeVisible();
    expect(guides.find((g) => g.id === 'g-2')?.status).toBe('published');

    await second.getByRole('button', { name: 'הסתרה', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'הסתרה', exact: true }).click();
    await expect(second.getByText('מוסתר', { exact: true })).toBeVisible();
  });

  test('a Moderator has no Guides tab, and at the address is told it has no permission', async ({ page }) => {
    await setup(page);
    await stubGuides(page, 'forbidden');
    await stubAccess(page, 'moderator');
    await signIn(page, '/admin/guides');
    await expect(main(page).getByRole('navigation', { name: 'מסכי הניהול' }).getByRole('link', { name: 'מדריכים' })).toHaveCount(0);
    await expect(main(page).getByText('אין הרשאה לניהול מדריכים.')).toBeVisible();
  });
});
