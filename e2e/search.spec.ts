// FR-SEARCH-001 / AC-039: global search (PG-017) from the top bar, main flow, desktop (network stubbed: e2e/support/notifications-stub.ts).
// Permissions, ranking and the hourly limit are the database's: apps/server/tests/db/notifications.db.test.ts and supabase/tests/90_*.sql.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP_1280, EMAIL, main } from './support/journeys-stub';
import { NID, setupNotifications } from './support/notifications-stub';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}
const field = (page: Page) => page.getByRole('searchbox', { name: 'חיפוש אנשים ופוסטים' }).first();

test.describe('[AC-039 FR-SEARCH-001] the top bar search', () => {
  test('[AC-039] typing shows a dropdown by kind (People, Groups, Posts) and "הצגת כל התוצאות"; a result opens its page', async ({ page }) => {
    const net = await setupNotifications(page);
    await signIn(page);
    await field(page).fill('שינה');
    const dropdown = page.getByRole('search').first();
    await expect(dropdown.getByRole('heading', { name: 'אנשים' })).toBeVisible();
    await expect(dropdown.getByRole('heading', { name: 'קבוצות' })).toBeVisible();
    await expect(dropdown.getByRole('heading', { name: 'פוסטים' })).toBeVisible();
    await expect(dropdown.getByRole('link', { name: /מי מכירה יועצת שינה טובה/ })).toHaveAttribute('href', `/posts/${NID(21)}`);
    expect(net.searches).toEqual(['שינה|all']);
    await dropdown.getByRole('link', { name: 'הצגת כל התוצאות' }).click();
    await expect.poll(() => pathOf(page)).toBe('/search');
    // the typed text never reaches an address (Afik 20.10.2026: it is never stored; addresses reach server logs)
    expect(decodeURIComponent(page.url())).not.toContain('שינה');
    expect(net.searchUrls.every((u) => !decodeURIComponent(u).includes('שינה'))).toBe(true);
    await expect(main(page).getByRole('link', { name: /מי מכירה יועצת שינה טובה/ })).toBeVisible();
  });

  test('[AC-039] fast typing searches once, after the pause', async ({ page }) => {
    const net = await setupNotifications(page);
    await signIn(page);
    await field(page).pressSequentially('יועצת שינה', { delay: 30 });
    await expect.poll(() => net.searches.length).toBe(1);
    await page.waitForTimeout(900);
    expect(net.searches).toEqual(['יועצת שינה|all']);
  });

  test('[AC-039] a query under two characters does not search', async ({ page }) => {
    const net = await setupNotifications(page);
    await signIn(page);
    await field(page).fill('ש');
    await page.waitForTimeout(900);
    expect(net.searches).toEqual([]);
  });
});

test.describe('[AC-039 PG-017] the results screen', () => {
  test('[AC-039] Enter opens the results with the tabs All / People / Groups / Posts; a tab narrows to one kind; the same text is searched once', async ({ page }) => {
    const net = await setupNotifications(page);
    await signIn(page);
    await field(page).fill('יוסי');
    await field(page).press('Enter');
    await expect.poll(() => pathOf(page)).toBe('/search');
    await expect(main(page).getByRole('heading', { name: 'אנשים' })).toBeVisible();
    await expect(main(page).getByRole('link', { name: 'לפרופיל של יוסי כהן' })).toHaveAttribute('href', `/u/${NID(12)}`);
    await main(page).getByRole('button', { name: 'פוסטים', exact: true }).click();
    await expect(main(page).getByRole('heading', { name: 'אנשים' })).toHaveCount(0);
    await expect(main(page).getByRole('link', { name: /מי מכירה יועצת שינה טובה/ })).toBeVisible();
    await main(page).getByRole('button', { name: 'קבוצות', exact: true }).click();
    await expect(main(page).getByText('לא נמצאו קבוצות')).toBeVisible();
    expect(net.searches.filter((s) => s === 'יוסי|all').length).toBeLessThanOrEqual(1);
  });

  test('[FR-SEARCH-001] right after the feed loads, the top bar field and Enter open the results, where a Professional is marked and opens its page', async ({ page }) => {
    await setupNotifications(page);
    await signIn(page);
    await page.goto('/feed');
    await field(page).fill('דנה מילר');
    await field(page).press('Enter');
    await expect.poll(() => pathOf(page)).toBe('/search');
    const link = main(page).getByRole('link', { name: 'לעמוד המקצועי של דנה מילר' });
    await expect(link).toBeVisible();
    await expect(link).toContainText('חשבון מקצועי');
    await expect(link).toHaveAttribute('href', `/pros/${NID(13)}`);
  });

  test('[AC-078] at the People Search limit the screen says so and still shows the posts', async ({ page }) => {
    const net = await setupNotifications(page);
    net.limited = true;
    await signIn(page);
    await field(page).fill('שינה');
    await field(page).press('Enter');
    await expect.poll(() => pathOf(page)).toBe('/search');
    await expect(main(page).getByText('הגעתם למספר החיפושים לשעה')).toBeVisible();
    await expect(main(page).getByRole('link', { name: /מי מכירה יועצת שינה טובה/ })).toBeVisible();
  });
});
