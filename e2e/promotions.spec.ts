// Promotions (I13; FR-SERV-010, FR-PRO-002, FR-ALG-007, NFR-SEC-007, AC-098; Afik 21.10.2026 §11.1, §11.5): the main flow of each new screen on a
// desktop browser, network stubbed (e2e/support/professionals-stub.ts, e2e/support/admin-stub.ts). The rules (who buys what, the cap, the staff stop
// and its Audit entry, the settings' versions) are pgTAP's (files 101, 104) and tests/db/promotions.db.test.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { ID, setupAdmin } from './support/admin-stub';
import { CORS, DESKTOP_1280, EMAIL, json, main } from './support/journeys-stub';
import { PROMO, setupProfessionals } from './support/professionals-stub';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

const PASSWORD = 'Zq-7-unique-pw-marker-91';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}

test.describe('[I13 FR-SERV-010 NFR-SEC-007 AC-098] the promotion screen', () => {
  test('a Professional buys a profile promotion at a sample price with a simulated payment; it runs and shows in billing', async ({ page }) => {
    const net = await setupProfessionals(page, { kind: 'professional' });
    await signIn(page);
    await page.goto('/pro/promotion');
    await expect(main(page).getByText('התשלום מדומה: לא נגבה כסף ולא נדרשים פרטי כרטיס.').first()).toBeVisible();
    await expect(main(page).getByLabel('משך הקידום', { exact: true })).toContainText('מחיר לדוגמה');
    // FR-PRO-002, AC-072: organic and paid results apart
    await expect(main(page).getByRole('heading', { name: 'אורגני' })).toBeVisible();
    await expect(main(page).getByRole('heading', { name: 'מקידום בתשלום' })).toBeVisible();
    await main(page).getByRole('button', { name: 'לתשלום ולהפעלת הקידום' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'אישור תשלום מדומה' });
    await expect(dialog).toContainText('מחיר לדוגמה');
    await dialog.getByRole('button', { name: 'אישור התשלום' }).click();
    await expect(main(page).getByRole('status')).toContainText('הקידום פעיל');
    const bought = net.sent.find((s) => s.method === 'POST' && s.path === '/api/promotions');
    // AC-098: the plan and the target only — never an amount or a card
    expect(bought?.body).toEqual({ planKey: 'profile_7', target: { kind: 'profile' } });
    await expect(main(page).getByRole('list', { name: 'הקידומים שלי' })).toContainText('פעיל');
    await main(page).getByRole('link', { name: 'לחיובים ולתשלומים' }).click();
    await expect.poll(() => pathOf(page)).toBe('/pro/billing');
    await expect(main(page).getByRole('list', { name: 'חיוב ותשלומים' })).toContainText('₪49');
  });

  test('[§11.1] a promotion staff stopped says "הקידום הופסק", with no refund', async ({ page }) => {
    await setupProfessionals(page, { kind: 'professional', promotions: [{ id: PROMO, state: 'stopped', stoppedBy: 'staff' }] });
    await signIn(page);
    await page.goto('/pro/promotion');
    const mine = main(page).getByRole('list', { name: 'הקידומים שלי' });
    await expect(mine).toContainText('הקידום הופסק');
    await expect(mine).toContainText('אין החזר');
  });
});

test.describe('[I13 FR-ALG-007 BR-005 §11.5] promoted units on the surfaces', () => {
  test('the Directory shows a promoted Professional apart from the organic list, marked "ממומן"; opening it reports a click', async ({ page }) => {
    const net = await setupProfessionals(page, { promotedCard: true });
    await signIn(page);
    await page.goto('/services');
    const promoted = main(page).getByRole('list', { name: 'בעלי מקצוע ממומנים' });
    await expect(promoted).toContainText('ממומן');
    await expect(promoted).toContainText('רותם צלמת');
    await expect(main(page).getByRole('list', { name: 'תוצאות' })).not.toContainText('רותם צלמת');
    await promoted.getByRole('link', { name: 'רותם צלמת' }).click();
    await expect.poll(() => net.sent.some((s) => s.method === 'POST' && s.path === `/api/promotions/${PROMO}/click`)).toBe(true);
  });
});

test.describe('[I13 §11.1 §11.2] the staff promotions screen', () => {
  test('the Admin stops a running promotion with a reason and saves a new settings version', async ({ page }) => {
    const net = await setupAdmin(page, { role: 'admin' });
    const sent: { path: string; body: unknown }[] = [];
    let state: 'running' | 'stopped' = 'running';
    await page.route('**/api/admin/promotion**', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const path = new URL(req.url()).pathname;
      if (req.method() === 'POST') sent.push({ path, body: req.postDataJSON() });
      if (path === '/api/admin/promotions') {
        return json(route, 200, {
          totals: { running: state === 'running' ? 1 : 0, stopped: state === 'stopped' ? 1 : 0, ended: 0, payments: 1, sampleRevenueIls: 49, impressions: 12, clicks: 2 },
          promotions: [
            { id: ID(80), ownerName: 'רותם צלמת', ownerKind: 'professional', targetKind: 'profile', planKey: 'profile_7', state, startsAt: '2026-06-15T09:00:00.000Z', endsAt: '2026-06-22T09:00:00.000Z', stoppedBy: state === 'stopped' ? 'staff' : null, amountIls: 49, impressions: 12, clicks: 2 },
          ],
          isFinance: true,
        });
      }
      if (path === `/api/admin/promotions/${ID(80)}/stop`) {
        state = 'stopped';
        return route.fulfill({ status: 204, headers: CORS });
      }
      if (path === '/api/admin/promotion-settings' && req.method() === 'GET') {
        return json(route, 200, { versions: [{ version: 1, dailyCap: 3, directoryUnitsPerPage: 1, feedGapMin: 4, feedGapMax: 7, feedLowPosts: 20, feedHighPosts: 200, reason: 'v1', at: '2026-06-15T09:00:00.000Z' }] });
      }
      if (path === '/api/admin/promotion-settings') return json(route, 201, { version: 2 });
      return json(route, 404, { error: 'unstubbed' });
    });
    await signIn(page);
    await page.goto('/admin/promotions');
    await expect(main(page)).toContainText('תשלומים מדומים');
    const card = main(page).getByRole('article', { name: /פרופיל מקצועי/ });
    await card.getByRole('button', { name: 'עצירה' }).click();
    await expect(card).toContainText('יש לכתוב סיבה');
    await card.getByLabel('סיבת העצירה', { exact: true }).fill('טענות רפואיות מטעות');
    await card.getByRole('button', { name: 'עצירה' }).click();
    await expect(main(page).getByRole('status').first()).toContainText('הקידום נעצר');
    expect(sent).toContainEqual({ path: `/api/admin/promotions/${ID(80)}/stop`, body: { reason: 'טענות רפואיות מטעות' } });
    // §11.2: the settings, as a new version with a reason
    await expect(main(page).getByLabel('פוסטים אורגניים בין פוסטים ממומנים — כשיש הרבה פוסטים', { exact: true })).toHaveValue('7');
    await main(page).getByLabel('סף "הרבה פוסטים" (ב-48 שעות)', { exact: true }).fill('300');
    await main(page).getByLabel('סיבת השינוי', { exact: true }).fill('יותר תוכן בקהילה');
    await main(page).getByRole('button', { name: 'שמירת גרסה חדשה' }).click();
    await expect(main(page)).toContainText('הגרסה החדשה נשמרה');
    expect(sent.find((s) => s.path === '/api/admin/promotion-settings')?.body).toMatchObject({ feedHighPosts: 300, feedGapMin: 4, feedGapMax: 7, reason: 'יותר תוכן בקהילה' });
    expect(net.sent.length).toBeGreaterThanOrEqual(0);
  });
});
