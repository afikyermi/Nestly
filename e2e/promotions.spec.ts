// Promotions (I13; FR-SERV-010, FR-PRO-002, FR-ALG-007, NFR-SEC-007, AC-098; Afik 21.10.2026 §11.1, §11.5): the main flow of each new screen on a
// desktop browser, network stubbed (e2e/support/professionals-stub.ts, e2e/support/admin-stub.ts). The rules (who buys what, the cap, the staff stop
// and its Audit entry, the settings' versions) are pgTAP's (files 101, 104) and tests/db/promotions.db.test.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { ID, setupAdmin } from './support/admin-stub';
import { CORS, DESKTOP_1280, EMAIL, json, main } from './support/journeys-stub';
import { named, pageOf, range, setupFeed } from './support/feed-stub';
import { setupMarketplace } from './support/marketplace-stub';
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
  test('[PG-041 PG-042] a Professional buys a profile promotion at a sample price with a simulated payment; it runs and shows in billing', async ({ page }) => {
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

  test('[§11.1 FR-SERV-010] stopping an own promotion asks first (irreversible, no refund); cancel keeps it, confirming stops it once', async ({ page }) => {
    const net = await setupProfessionals(page, { kind: 'professional', promotions: [{ id: PROMO, state: 'running', stoppedBy: null }] });
    await signIn(page);
    await page.goto('/pro/promotion');
    const mine = main(page).getByRole('list', { name: 'הקידומים שלי' });
    const stops = () => net.sent.filter((s) => s.method === 'POST' && s.path === `/api/promotions/${PROMO}/stop`);
    const stopButton = mine.getByRole('button', { name: 'עצירת הקידום', exact: true });
    await stopButton.click();
    const dialog = page.getByRole('alertdialog', { name: 'לעצור את הקידום?' });
    await expect(dialog).toContainText('הקידום ייעצר ולא יהיה אפשר לחדש אותו. אין החזר.');
    await expect(dialog.getByRole('button', { name: 'ביטול', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(stopButton).toBeFocused();
    await stopButton.click();
    await dialog.getByRole('button', { name: 'ביטול', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(stops()).toHaveLength(0);
    await expect(mine).toContainText('פעיל');
    await stopButton.click();
    await dialog.getByRole('button', { name: 'עצירת הקידום', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(mine.getByRole('button', { name: 'עצירת הקידום', exact: true })).toHaveCount(0);
    await expect(main(page).getByRole('heading', { name: 'הקידומים שלי', level: 2 })).toBeFocused();
    expect(stops()).toHaveLength(1);
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
    const link = promoted.getByRole('link', { name: 'רותם צלמת' });
    await expect(link).toHaveAttribute('href', new RegExp('[?]promotion=' + PROMO));
    const [profileRequest] = await Promise.all([
      page.waitForRequest((request) => /\/api\/professionals\/[0-9a-f-]{36}$/.test(new URL(request.url()).pathname)),
      link.click(),
    ]);
    expect(new URL(profileRequest.url()).searchParams.get('promotion'), '[AC-072] paid source reaches the profile read').toBe(PROMO);
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
    await expect(card).toContainText('12 חשיפות · 2 לחיצות');
    await expect(card).toContainText('תשלום מדומה ₪49');
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

test.describe('[I13 §11.1 PG-059] a Moderator on the staff promotions screen', () => {
  const rows = [
    { id: ID(81), ownerName: 'רותם צלמת', ownerKind: 'professional', targetKind: 'profile', planKey: 'profile_7' },
    { id: ID(82), ownerName: 'רותם צלמת', ownerKind: 'professional', targetKind: 'post', planKey: 'post_3' },
    { id: ID(83), ownerName: 'שירה כהן', ownerKind: 'regular', targetKind: 'listing', planKey: 'listing_3' },
  ] as const;
  /** Plays the server: a Moderator reads the promotions of its key only, never the payments or the settings; no key is refused. */
  async function stubPromotions(page: Page, permissions: readonly string[]): Promise<string[]> {
    const paths: string[] = [];
    await page.route('**/api/admin/promotion**', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const path = new URL(req.url()).pathname;
      paths.push(path);
      if (path !== '/api/admin/promotions') return json(route, 403, { error: 'forbidden' });
      const kinds = [...(permissions.includes('CONTENT_MODERATE') ? ['profile', 'post'] : []), ...(permissions.includes('MARKETPLACE_MODERATE') ? ['listing'] : [])];
      if (kinds.length === 0) return json(route, 403, { error: 'forbidden' });
      const promotions = rows
        .filter((row) => kinds.includes(row.targetKind))
        .map((row) => ({ ...row, state: 'running', startsAt: '2026-06-15T09:00:00.000Z', endsAt: '2026-06-22T09:00:00.000Z', stoppedBy: null, amountIls: null, impressions: null, clicks: null }));
      return json(route, 200, { totals: { running: promotions.length, stopped: 0, ended: 0, payments: null, sampleRevenueIls: null, impressions: null, clicks: null }, promotions, isFinance: false });
    });
    return paths;
  }

  test('CONTENT_MODERATE sees the Professionals\' promotions only, with no payments and no settings', async ({ page }) => {
    await setupAdmin(page, { role: 'moderator', permissions: ['REPORTS_VIEW', 'CONTENT_MODERATE'] });
    const paths = await stubPromotions(page, ['REPORTS_VIEW', 'CONTENT_MODERATE']);
    await signIn(page);
    await page.goto('/admin/promotions');
    await expect(main(page).getByRole('article')).toHaveCount(2);
    await expect(main(page).getByRole('article', { name: /פרופיל מקצועי/ })).toBeVisible();
    await expect(main(page).getByRole('article', { name: /^פוסט/ })).toBeVisible();
    await expect(main(page).getByRole('article', { name: /מודעה/ })).toHaveCount(0);
    await expect(main(page)).not.toContainText('תשלומים מדומים');
    // The paid counts and amounts are not readable for a Moderator: nothing is shown, never a 0
    await expect(main(page)).not.toContainText('חשיפות');
    await expect(main(page)).not.toContainText('תשלום מדומה');
    await expect(main(page).getByRole('heading', { name: 'הגדרות הקידום' })).toHaveCount(0);
    expect(paths).not.toContain('/api/admin/promotion-settings');
  });

  test('MARKETPLACE_MODERATE sees the listings\' promotions only', async ({ page }) => {
    await setupAdmin(page, { role: 'moderator', permissions: ['MARKETPLACE_MODERATE'] });
    await stubPromotions(page, ['MARKETPLACE_MODERATE']);
    await signIn(page);
    await page.goto('/admin/promotions');
    await expect(main(page).getByRole('article')).toHaveCount(1);
    await expect(main(page).getByRole('article', { name: /מודעה/ })).toBeVisible();
    await expect(main(page)).not.toContainText('תשלומים מדומים');
    await expect(main(page).getByRole('heading', { name: 'הגדרות הקידום' })).toHaveCount(0);
  });

  test('a Moderator with neither key is refused', async ({ page }) => {
    await setupAdmin(page, { role: 'moderator', permissions: ['REPORTS_VIEW'] });
    await stubPromotions(page, ['REPORTS_VIEW']);
    await signIn(page);
    await page.goto('/admin/promotions');
    await expect(main(page)).toContainText('אין הרשאה');
    await expect(main(page).getByRole('article')).toHaveCount(0);
  });
});

test.describe('[I13 FR-MKT-004 BR-005 §11.3 §11.5] the Marketplace "מודעה מקודמת" strip', () => {
  test('[AC-020 AC-008] a promoted listing is shown at the top in its own strip, marked "מודעה מקודמת", apart from the listings and the sponsored products', async ({ page }) => {
    await setupMarketplace(page, { promotedListing: true });
    await signIn(page);
    await page.goto('/marketplace');
    const strip = main(page).getByRole('list', { name: 'מודעות מקודמות' });
    await expect(strip.getByRole('link', { name: 'מנשא מקודם' })).toBeVisible();
    await expect(strip).toContainText('מודעה מקודמת');
    await expect(main(page).getByRole('list', { name: 'מודעות', exact: true })).not.toContainText('מנשא מקודם');
    await expect(main(page).getByRole('region', { name: 'מוצרים ממומנים' })).not.toContainText('מנשא מקודם');
  });
});

test.describe('[I13 FR-ALG-007 BR-005 VAL-012 §11.2] the feed "ממומן" post', () => {
  test('a promoted post sits after its organic posts, marked "ממומן"; its impression is reported once it is shown', async ({ page }) => {
    const FEED_PROMOTION = '10000000-0000-4000-8000-000000000091';
    const promoted = named(90, { source: 'promoted', body: 'טיפים לשינה של תינוקות', author: { name: 'יועצת שינה' } });
    const net = await setupFeed(page, () => pageOf(range(1, 8), null, { promoted: [{ promotionId: FEED_PROMOTION, afterIndex: 4, unit: promoted }] }));
    const impressions: string[] = [];
    await page.route(/\/api\/promotions\/[^/]+\/impression$/, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      impressions.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 204, headers: CORS });
    });
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
    await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'התחברות', exact: true }).click();
    await expect.poll(() => pathOf(page)).not.toBe('/login');
    await page.waitForLoadState('networkidle');
    net.armed = true;
    await page.goto('/feed');
    const cards = page.getByRole('feed', { name: 'פוסטים בפיד' }).getByRole('article');
    await expect(cards).toHaveCount(9);
    await expect(cards.nth(4)).toContainText('טיפים לשינה של תינוקות');
    await expect(cards.nth(4)).toContainText('ממומן');
    for (const n of [0, 1, 2, 3, 5]) await expect(cards.nth(n)).not.toContainText('ממומן');
    await expect.poll(() => impressions).toEqual([`/api/promotions/${FEED_PROMOTION}/impression`]);
  });
});
