// I10 Groups (FR-GRP-001..004): the main flow of each new screen, desktop, network stubbed (e2e/support/groups-stub.ts). Permissions, the Role
// hierarchy and Private content are the database's: supabase/tests/96_groups.sql and apps/server/tests/db/groups.db.test.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP_1280, EMAIL, main } from './support/journeys-stub';
import { GID, setupGroups, WALKS } from './support/groups-stub';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}

test('[PG-033 PG-043 FR-GRP-004 AC-056] the Groups page: from the side menu, create a Private Group in place and land on its page as its Owner', async ({ page }) => {
  const net = await setupGroups(page);
  await signIn(page);
  await page.getByRole('button', { name: 'פתיחת התפריט' }).click();
  await page.getByRole('link', { name: 'הקבוצות שלי' }).click();
  await expect.poll(() => pathOf(page)).toBe('/groups');
  await expect(main(page).getByRole('heading', { name: 'קבוצות', level: 1 })).toBeVisible();
  await expect(main(page).getByText('עדיין לא הצטרפת לקבוצה')).toBeVisible();
  await main(page).getByRole('button', { name: 'יצירת קבוצה' }).click();
  const sheet = page.getByRole('dialog', { name: 'קבוצה חדשה' });
  await sheet.getByRole('button', { name: 'יצירה' }).click();
  await expect(sheet.getByText('שם הקבוצה צריך לכלול לפחות 3 תווים')).toBeVisible();
  await sheet.getByLabel('שם הקבוצה').fill('הורים בשקט');
  await sheet.getByLabel('תיאור').fill('מקום רגוע לשאלות של לילה');
  await sheet.getByText('קבוצה פרטית', { exact: true }).click();
  await sheet.getByRole('button', { name: 'יצירה' }).click();
  await expect.poll(() => pathOf(page)).toMatch(/^\/groups\/e0000000-/);
  await expect(main(page).getByRole('heading', { name: 'הורים בשקט', level: 1 })).toBeVisible();
  await expect(main(page).getByText(/קבוצה פרטית · חבר אחד בקבוצה · בעלים/)).toBeVisible();
  expect(net.writes.find((w) => w.method === 'POST' && w.path === '/api/groups')?.body).toEqual({
    name: 'הורים בשקט',
    description: 'מקום רגוע לשאלות של לילה',
    privacy: 'private',
  });
});

test('[PG-034 PG-035 FR-GRP-001 FR-GRP-002 AC-036] a Group page: discover, Join a Public Group, post in its discussion, see the members', async ({ page }) => {
  const net = await setupGroups(page);
  await signIn(page);
  await page.goto('/groups');
  await main(page).getByRole('tab', { name: 'גילוי קבוצות' }).click();
  await main(page).getByRole('link', { name: WALKS.name }).click();
  await expect.poll(() => pathOf(page)).toBe(`/groups/${GID(1)}`);
  await expect(main(page).getByRole('heading', { name: WALKS.name, level: 1 })).toBeVisible();
  // not a member yet: the discussion is readable (Public), but there is no composer (AC-036)
  await expect(main(page).getByRole('form', { name: /פוסט/ })).toHaveCount(0);
  await main(page).getByRole('button', { name: 'הצטרפות', exact: true }).click();
  await expect(main(page).getByText(/קבוצה ציבורית · 13 חברים בקבוצה · חבר/)).toBeVisible();
  const text = main(page).getByRole('textbox', { name: /מה/ }).first();
  await text.fill('בוקר טוב, מי יוצאת היום ב-8?');
  await main(page).getByRole('button', { name: 'פרסום', exact: true }).click();
  await expect(main(page).getByText('בוקר טוב, מי יוצאת היום ב-8?')).toBeVisible();
  const posted = net.writes.find((w) => w.method === 'POST' && w.path === '/api/posts')?.body;
  expect(posted).toMatchObject({ body: 'בוקר טוב, מי יוצאת היום ב-8?', audience: 'everyone', groupId: GID(1) });
  await main(page).getByRole('tab', { name: 'חברים' }).click();
  await expect(main(page).getByText('יוסי כהן')).toBeVisible();
  await main(page).getByRole('tab', { name: 'על הקבוצה' }).click();
  await expect(main(page).getByText('נעים ומכבד')).toBeVisible();
});

test('[BR-081 FR-GRP-001] a staff account reviews the Groups read-only: the review note, "discover" open, no create, join or request', async ({ page }) => {
  await setupGroups(page);
  await page.route('**/api/admin/access', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ staff: true, role: 'moderator', permissions: ['REPORTS_VIEW'] }) }),
  );
  await signIn(page);
  await page.goto('/groups');
  await expect(main(page).getByText(/צפייה לבדיקה בלבד/)).toBeVisible();
  await expect(main(page).getByRole('tab', { name: 'גילוי קבוצות' })).toHaveAttribute('aria-selected', 'true');
  await expect(main(page).getByRole('link', { name: WALKS.name })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'יצירת קבוצה' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^(הצטרפות|בקשת הצטרפות)$/ })).toHaveCount(0);
});
