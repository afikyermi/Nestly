// Marketplace (I12; FR-MKT-001/002/003/005, FR-ADMIN-009, BR-005, AC-008, AC-019, AC-020, AC-058, AC-059, AC-097): the main flow of each new screen on
// a desktop browser, network stubbed (e2e/support/marketplace-stub.ts; the staff screens add e2e/support/admin-stub.ts). The rules (who publishes,
// reads, edits, hides, contacts; the Admin alone for Sponsored Products) are pgTAP's (file 99) and tests/db/marketplace.db.test.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { KEYS, setupAdmin } from './support/admin-stub';
import { DESKTOP_1280, EMAIL, main } from './support/journeys-stub';
import { CONV, MINE, STROLLER, setupMarketplace } from './support/marketplace-stub';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

const PASSWORD = 'Zq-7-unique-pw-marker-91';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}

test.describe('[I12 FR-MKT-001 FR-MKT-003 AC-008 AC-020] the Marketplace', () => {
  test('from "חנות": listings and a sponsored unit marked apart; a category filter; a card opens its listing', async ({ page }) => {
    const net = await setupMarketplace(page);
    await signIn(page);
    await page.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('link', { name: 'חנות' }).click();
    await expect.poll(() => pathOf(page)).toBe('/marketplace');
    const results = main(page).getByRole('list', { name: 'מודעות' });
    await expect(results).toContainText('עגלת תינוק כחולה');
    await expect(results).toContainText('מיטת תינוק');
    await expect(results).toContainText('למסירה');
    const sponsored = main(page).getByRole('region', { name: 'מוצרים ממומנים' });
    await expect(sponsored).toContainText('ממומן');
    await expect(sponsored).toContainText('מטעם בייבי סטור');
    await main(page).getByLabel('קטגוריה', { exact: true }).selectOption('furniture');
    await main(page).getByRole('button', { name: 'הצגה', exact: true }).click();
    await expect(results).not.toContainText('עגלת תינוק כחולה');
    expect(net.sent).toContainEqual(expect.objectContaining({ method: 'POST', path: '/api/marketplace', body: expect.objectContaining({ category: 'furniture' }) }));
    await main(page).getByRole('button', { name: 'ניקוי', exact: true }).click();
    await results.getByRole('link', { name: 'עגלת תינוק כחולה' }).click();
    await expect.poll(() => pathOf(page)).toBe(`/marketplace/${STROLLER}`);
  });
});

test.describe('[I12 FR-MKT-005 AC-059 AC-097] a listing page', () => {
  test('no purchase action; the reader writes to the seller and lands in the Marketplace conversation', async ({ page }) => {
    const net = await setupMarketplace(page);
    await signIn(page);
    await page.goto(`/marketplace/${STROLLER}`);
    await expect(main(page).getByRole('heading', { level: 1, name: 'עגלת תינוק כחולה' })).toBeVisible();
    await expect(main(page).getByText('₪450')).toBeVisible();
    await expect(main(page).getByText('אין קנייה או תשלום דרך Nestly')).toBeVisible();
    await expect(main(page).getByRole('button', { name: /קנייה|תשלום|רכישה/ })).toHaveCount(0);
    const message = main(page).getByLabel('ההודעה', { exact: true });
    await expect(message).toHaveValue(/עגלת תינוק כחולה/);
    await message.fill('שלום, אפשר לאסוף מחר?');
    await main(page).getByRole('button', { name: 'שליחת הודעה' }).click();
    await expect.poll(() => pathOf(page)).toBe(`/chat/${CONV}`);
    expect(net.sent).toContainEqual(expect.objectContaining({ method: 'POST', path: `/api/marketplace/listings/${STROLLER}/contact`, body: { text: 'שלום, אפשר לאסוף מחר?' } }));
  });
});

test.describe('[I12 FR-MKT-002 AC-019] a new listing', () => {
  test('the form checks the fields, then publishes and opens the listing', async ({ page }) => {
    const net = await setupMarketplace(page);
    await signIn(page);
    await page.goto('/marketplace/new');
    await expect(main(page).getByRole('heading', { level: 1, name: 'מודעה חדשה' })).toBeVisible();
    await main(page).getByRole('button', { name: 'פרסום', exact: true }).click();
    await expect(main(page).getByText('כותרת של 2 עד 80 תווים')).toBeVisible();
    expect(net.sent.some((s) => s.path === '/api/marketplace/listings')).toBe(false);
    await main(page).getByLabel('כותרת', { exact: true }).fill('כיסא אוכל');
    await main(page).getByLabel('קטגוריה', { exact: true }).selectOption('feeding');
    await main(page).getByLabel('מצב', { exact: true }).selectOption('good');
    await main(page).getByLabel(/^מחיר/).fill('120');
    await main(page).getByLabel('עיר או אזור', { exact: true }).selectOption('center');
    await main(page).getByRole('button', { name: 'פרסום', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe(`/marketplace/${MINE}`);
    expect(net.sent).toContainEqual(
      expect.objectContaining({ method: 'POST', path: '/api/marketplace/listings', body: { title: 'כיסא אוכל', description: null, category: 'feeding', condition: 'good', price: 120, city: 'center', imageIds: [] } }),
    );
  });
});

test.describe('[I12 FR-MKT-002 decisions §3.11] my listings', () => {
  test('the owner opens its listing from "המודעות שלי", marks it sold/given and deletes it', async ({ page }) => {
    const net = await setupMarketplace(page);
    await signIn(page);
    await page.goto('/marketplace/mine');
    await main(page).getByRole('list', { name: 'המודעות שלי' }).getByRole('link', { name: 'כיסא אוכל' }).click();
    await expect.poll(() => pathOf(page)).toBe(`/marketplace/${MINE}`);
    await main(page).getByRole('button', { name: 'סימון "נמכר/נמסר"' }).click();
    await expect(main(page).getByRole('status').filter({ hasText: 'סומנה "נמכר/נמסר"' })).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'החזרה למכירה' })).toBeVisible();
    expect(net.sent).toContainEqual(expect.objectContaining({ method: 'POST', path: `/api/marketplace/listings/${MINE}/status`, body: { status: 'sold' } }));
    // deleted at once, after the confirmation (the shared ConfirmDialog, role alertdialog)
    await main(page).getByRole('button', { name: 'מחיקת המודעה' }).click();
    await page.getByRole('alertdialog', { name: 'למחוק את המודעה?' }).getByRole('button', { name: 'מחיקת המודעה' }).click();
    await expect.poll(() => pathOf(page)).toBe('/marketplace/mine');
    expect(net.sent).toContainEqual(expect.objectContaining({ method: 'DELETE', path: `/api/marketplace/listings/${MINE}` }));
  });
});

test.describe('[I12 §3.2 MARKETPLACE_MODERATE] the staff listings screen', () => {
  test('a listing is hidden with a reason (the reason is required)', async ({ page }) => {
    await setupAdmin(page, { permissions: [...KEYS, 'MARKETPLACE_MODERATE'] });
    const net = await setupMarketplace(page, {}, false);
    await signIn(page);
    await page.goto('/admin/marketplace');
    await expect(main(page).getByRole('heading', { level: 2, name: 'מודעות החנות' })).toBeVisible();
    await main(page).getByRole('button', { name: 'הסתרת המודעה' }).click();
    await expect(main(page).getByText('צריך לכתוב סיבה')).toBeVisible();
    await main(page).getByLabel('סיבה (נרשמת ביומן)').fill('ספאם');
    await main(page).getByRole('button', { name: 'הסתרת המודעה' }).click();
    await expect(main(page).getByText('המודעה הוסתרה.')).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'החזרת המודעה' })).toBeVisible();
    expect(net.sent).toContainEqual(expect.objectContaining({ method: 'POST', path: `/api/admin/listings/${STROLLER}/visibility`, body: { hidden: true, reason: 'ספאם' } }));
  });
});

test.describe('[I12 FR-ADMIN-009 AC-058] Sponsored Products (Admin)', () => {
  test('the Admin creates a draft and publishes it; it carries the sponsored mark', async ({ page }) => {
    await setupAdmin(page);
    const net = await setupMarketplace(page, {}, false);
    await signIn(page);
    await page.goto('/admin/sponsored');
    await expect(main(page).getByRole('heading', { level: 2, name: 'מוצרים ממומנים' })).toBeVisible();
    await main(page).getByLabel('שם המפרסם', { exact: true }).fill('בייבי סטור');
    await main(page).getByLabel('כותרת', { exact: true }).fill('קופון 10% לעגלות');
    await main(page).getByLabel(/^תיאור/).fill('דוגמה: קופון לדוגמה בלבד');
    await main(page).getByLabel('קטגוריה', { exact: true }).selectOption('strollers');
    await main(page).getByLabel(/^קישור לאתר המפרסם/).fill('https://example.com/coupon');
    await main(page).getByRole('button', { name: 'שמירה כטיוטה' }).click();
    const card = main(page).getByRole('article').filter({ hasText: 'קופון 10% לעגלות' });
    await expect(card).toContainText('ממומן');
    await expect(card).toContainText('טיוטה');
    await card.getByRole('button', { name: 'פרסום', exact: true }).click();
    await expect(card).toContainText('מפורסם');
    expect(net.sent).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/api/admin/sponsored',
        body: { sponsorName: 'בייבי סטור', title: 'קופון 10% לעגלות', description: 'דוגמה: קופון לדוגמה בלבד', category: 'strollers', linkUrl: 'https://example.com/coupon', imageId: null },
      }),
    );
  });
});

// I12 part B (Afik §10.5–§10.6): the form's new fields, the description on the page, a sold listing past its 60 days, and a Professional's "חנות".
test.describe('[I12-B FR-MKT-002 VAL-013 AC-200 AC-201 AC-204] the listing form', () => {
  test('"מכשירי חשמל", a description of up to 1,000 characters, and a price of 0 shown as "למסירה"', async ({ page }) => {
    const net = await setupMarketplace(page);
    await signIn(page);
    await page.goto('/marketplace/new');
    await main(page).getByLabel('כותרת', { exact: true }).fill('מחמם בקבוקים');
    await main(page).getByLabel('קטגוריה', { exact: true }).selectOption({ label: 'מכשירי חשמל' });
    await main(page).getByLabel('מצב', { exact: true }).selectOption('like_new');
    const price = main(page).getByLabel(/^מחיר/);
    await price.fill('0');
    await expect(main(page).getByText('המודעה תוצג "למסירה"')).toBeVisible();
    await main(page).getByLabel('עיר או אזור', { exact: true }).selectOption('haifa');
    const description = main(page).getByLabel(/^תיאור/);
    await description.fill('ש'.repeat(1001));
    await main(page).getByRole('button', { name: 'פרסום', exact: true }).click();
    await expect(main(page).getByText('תיאור עד 1,000 תווים')).toBeVisible();
    expect(net.sent.some((s) => s.path === '/api/marketplace/listings')).toBe(false);
    await description.fill('עובד מצוין, עם קופסה');
    await main(page).getByRole('button', { name: 'פרסום', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe(`/marketplace/${MINE}`);
    expect(net.sent).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/api/marketplace/listings',
        body: { title: 'מחמם בקבוקים', description: 'עובד מצוין, עם קופסה', category: 'electrical', condition: 'like_new', price: null, city: 'haifa', imageIds: [] },
      }),
    );
  });

  test('a reader sees the description on the listing page', async ({ page }) => {
    await setupMarketplace(page);
    await signIn(page);
    await page.goto(`/marketplace/${STROLLER}`);
    await expect(main(page).getByRole('region', { name: 'תיאור' })).toContainText('מתקפלת, עם גגון. איסוף מתל אביב.');
  });
});

test.describe('[I12-B AC-202 BR-091 ERR-054] a sold listing past its 60 days', () => {
  test('stays sold: no "החזרה למכירה", and the seller is told why', async ({ page }) => {
    await setupMarketplace(page, { mineStatus: 'sold', mineExpired: true });
    await signIn(page);
    await page.goto(`/marketplace/${MINE}`);
    await expect(main(page).getByText('אי אפשר להחזיר את המודעה למכירה')).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'החזרה למכירה' })).toHaveCount(0);
    await page.goto('/marketplace/mine');
    const mine = main(page).getByRole('list', { name: 'המודעות שלי' });
    await expect(mine).toContainText('נמכר/נמסר');
    await expect(mine).not.toContainText('פגה');
  });
});

test.describe('[I12-B AC-205 FR-MKT-001 FR-MENU-001 §10.5] a Professional\'s "חנות"', () => {
  test('opens from its menu, views and contacts, and is never offered to publish', async ({ page }) => {
    const net = await setupMarketplace(page, { accountKind: 'professional' });
    await signIn(page);
    await expect(page.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('link', { name: 'חנות' })).toHaveCount(0);
    await page.getByRole('button', { name: 'פתיחת התפריט' }).click();
    await page.getByRole('dialog', { name: 'תפריט' }).getByRole('link', { name: 'חנות', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/marketplace');
    await expect(main(page).getByRole('list', { name: 'מודעות' })).toContainText('עגלת תינוק כחולה');
    await expect(main(page).getByText('פרסום מודעות פתוח לחשבונות הורים בלבד')).toBeVisible();
    await expect(main(page).getByRole('link', { name: 'פרסום מודעה' })).toHaveCount(0);
    await expect(main(page).getByRole('link', { name: 'המודעות שלי' })).toHaveCount(0);
    await main(page).getByRole('list', { name: 'מודעות' }).getByRole('link', { name: 'עגלת תינוק כחולה' }).click();
    await main(page).getByRole('button', { name: 'שליחת הודעה' }).click();
    await expect.poll(() => pathOf(page)).toBe(`/chat/${CONV}`);
    expect(net.sent).toContainEqual(expect.objectContaining({ method: 'POST', path: `/api/marketplace/listings/${STROLLER}/contact` }));
    await page.goto('/marketplace/new');
    await expect(main(page).getByText('רק חשבון הורה יכול לפרסם מודעה')).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'פרסום', exact: true })).toHaveCount(0);
  });
});

test.describe('[I12-B AC-205 FR-MKT-001 §3.2] a staff account on the Marketplace', () => {
  test('reviews the listings and is never offered to publish', async ({ page }) => {
    await setupAdmin(page, { permissions: [...KEYS, 'MARKETPLACE_MODERATE'] });
    await setupMarketplace(page, {}, false);
    await signIn(page);
    await page.goto('/marketplace');
    await expect(main(page).getByRole('list', { name: 'מודעות' })).toContainText('עגלת תינוק כחולה');
    await expect(main(page).getByRole('link', { name: 'פרסום מודעה' })).toHaveCount(0);
    await page.goto('/marketplace/new');
    await expect(main(page).getByText('חשבון צוות לא מפרסם מודעות')).toBeVisible();
    await page.goto('/marketplace/mine');
    await expect(main(page).getByText('חשבון צוות לא מפרסם מודעות')).toBeVisible();
  });
});
