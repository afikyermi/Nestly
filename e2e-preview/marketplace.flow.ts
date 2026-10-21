// I12 Marketplace on the real Preview (FR-MKT-001/002/005; decisions §3 item 11): a fresh Regular publishes a listing for free (no image: the
// background check is not part of this flow), finds it in the Marketplace by its title, opens it, marks it sold/given and back, and deletes it.
// A second fresh Regular is not needed: contacting a seller is covered by tests/db/marketplace.db.test.ts and pgTAP file 99. The user is made
// through the app (same email pattern as the fixture's, so the cleanup sweep covers it, listings included). No recovery attempts are made.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { generateTestUser, type TestUser } from './support/test-user.ts';

const main = (page: Page) => page.getByRole('main');
const users = new Map<string, TestUser>();
function userOf(project: string): TestUser {
  let u = users.get(project);
  if (u === undefined) {
    u = generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');
    users.set(project, u);
  }
  return u;
}

async function signUp(page: Page, u: TestUser): Promise<void> {
  await page.goto('/register');
  await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
  await page.getByLabel(/^שם מלא/).fill('מאיה מוכרת');
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

test.describe.serial('I12 Marketplace on the Preview [FR-MKT-001 FR-MKT-002 FR-MKT-005]', () => {
  test('a fresh Regular publishes a listing, finds it in the Marketplace, marks it sold/given and back, and deletes it', async ({ page }, info) => {
    const u = userOf(info.project.name);
    const title = `עגלה לבדיקה ${u.email.slice(0, 12)}`.slice(0, 60);
    await signUp(page, u);

    await page.goto('/marketplace/new');
    await main(page).getByLabel('כותרת', { exact: true }).fill(title);
    await main(page).getByLabel('קטגוריה', { exact: true }).selectOption('strollers');
    await main(page).getByLabel('מצב', { exact: true }).selectOption('good');
    await main(page).getByRole('checkbox', { name: 'למסירה, בלי מחיר' }).check();
    await main(page).getByLabel('עיר או אזור', { exact: true }).selectOption('center');
    const [created] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/marketplace/listings'),
      main(page).getByRole('button', { name: 'פרסום', exact: true }).click(),
    ]);
    expect(created.status(), 'POST /api/marketplace/listings status').toBe(201);
    await expect(page).toHaveURL(/\/marketplace\/[0-9a-f-]{36}$/);
    const listingUrl = new URL(page.url()).pathname;
    await expect(main(page).getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(main(page).getByText('למסירה').first()).toBeVisible();

    await page.goto('/marketplace');
    await main(page).getByLabel('חיפוש מוצר', { exact: true }).fill(title);
    await main(page).getByRole('button', { name: 'הצגה', exact: true }).click();
    const results = main(page).getByRole('list', { name: 'מודעות' });
    await expect(results.getByRole('link', { name: title })).toBeVisible();

    await page.goto(listingUrl);
    await main(page).getByRole('button', { name: 'סימון "נמכר/נמסר"' }).click();
    await expect(main(page).getByRole('button', { name: 'החזרה למכירה' })).toBeVisible();
    await page.goto('/marketplace/mine');
    await expect(main(page).getByRole('list', { name: 'המודעות שלי' })).toContainText('נמכר/נמסר');
    await page.goto(listingUrl);
    await main(page).getByRole('button', { name: 'החזרה למכירה' }).click();
    await expect(main(page).getByRole('button', { name: 'סימון "נמכר/נמסר"' })).toBeVisible();

    await main(page).getByRole('button', { name: 'מחיקת המודעה' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'מחיקת המודעה' }).click();
    await expect(page).toHaveURL(/\/marketplace\/mine$/);
    await expect(main(page).getByText(title)).toHaveCount(0);
  });
});
