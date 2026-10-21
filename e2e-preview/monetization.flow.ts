// I13 Monetization on the real Preview (FR-MKT-004, FR-ALG-007, NFR-SEC-007, AC-098; Afik 21.10.2026 §11.3, §11.5): a fresh Regular publishes a
// listing and promotes it from "המודעות שלי" with a simulated payment of a sample price; a second fresh Regular searches the Marketplace and finds it
// at the top, apart from the organic list, marked "מודעה מקודמת" (the action checked from another user's side). The staff stop and the settings
// are covered by tests/db/promotions.db.test.ts and pgTAP 104. Users are made through the app (the cleanup covers their listings, promotions,
// payments and events). No recovery attempts are made.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { generateTestUser, type TestUser } from './support/test-user.ts';

const main = (page: Page) => page.getByRole('main');
const fresh = (): TestUser => generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');

async function signUp(page: Page, u: TestUser, fullName: string): Promise<void> {
  await page.goto('/register');
  await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
  await page.getByLabel(/^שם מלא/).fill(fullName);
  await page.getByRole('button', { name: 'המשך', exact: true }).click();
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(u.email);
  await page.getByLabel('סיסמה', { exact: true }).fill(u.password);
  const box = page.getByRole('checkbox', { name: /אישור תנאי השימוש/ });
  await box.focus();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
  await page.getByRole('button', { name: 'יצירת חשבון', exact: true }).click();
  await expect(page).toHaveURL(/\/recovery-questions$/);
  await page.getByLabel(/חיית המחמד/).fill(u.answers.pet);
  await page.getByLabel(/כינו אתכם/).fill(u.answers.nickname);
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/);
}

test.describe.serial('I13 Monetization on the Preview [FR-MKT-004 FR-ALG-007 NFR-SEC-007]', () => {
  test('a Regular promotes its listing with a simulated payment; another Regular finds it at the top, marked "מודעה מקודמת"', async ({ page }, info) => {
    const seller = fresh();
    const title = `מנשא לקידום ${/-([0-9a-f]{16})@/.exec(seller.email)?.[1] ?? info.project.name}`;
    await signUp(page, seller, 'שירה מקדמת');

    await page.goto('/marketplace/new');
    await main(page).getByLabel('כותרת', { exact: true }).fill(title);
    await main(page).getByLabel('קטגוריה', { exact: true }).selectOption('feeding');
    await main(page).getByLabel('מצב', { exact: true }).selectOption('good');
    await main(page).getByRole('checkbox', { name: 'למסירה, בלי מחיר' }).check();
    await main(page).getByLabel('עיר או אזור', { exact: true }).selectOption('center');
    const [created] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/marketplace/listings'),
      main(page).getByRole('button', { name: 'פרסום', exact: true }).click(),
    ]);
    expect(created.status(), 'POST /api/marketplace/listings status').toBe(201);

    await page.goto('/marketplace/mine');
    const mine = main(page).getByRole('list', { name: 'המודעות שלי' });
    await mine.getByRole('button', { name: 'קידום המודעה' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'קידום המודעה' });
    await expect(dialog).toContainText('התשלום מדומה');
    const [bought] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/promotions'),
      dialog.getByRole('button', { name: 'אישור התשלום' }).click(),
    ]);
    expect(bought.status(), 'POST /api/promotions status').toBe(201);
    // AC-098: the request names the plan and the target only, never an amount or a card
    const sentBody: unknown = bought.request().postDataJSON();
    expect(typeof sentBody === 'object' && sentBody !== null ? Object.keys(sentBody).sort() : []).toEqual(['planKey', 'target']);
    await expect(mine).toContainText('המודעה מקודמת');

    // the other side: a second fresh Regular (the seller's session is dropped from this browser first)
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await signUp(page, fresh(), 'ורד מחפשת');
    await page.goto('/marketplace');
    await main(page).getByLabel('חיפוש מוצר', { exact: true }).fill(title);
    await main(page).getByRole('button', { name: 'הצגה', exact: true }).click();
    const promoted = main(page).getByRole('list', { name: 'מודעות מקודמות' });
    await expect(promoted.getByRole('link', { name: title })).toBeVisible();
    await expect(promoted).toContainText('מודעה מקודמת');
  });
});
