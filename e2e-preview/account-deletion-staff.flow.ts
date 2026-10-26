// I9 §22.4 on the real Preview (BR-085, AC-188, AC-189; decisions-in-force §22.4): a suspension wins over a scheduled deletion, checked
// from the staff's side and then from the account's own.
//   A signs up and schedules its deletion from Settings (the box and the password). The run's temporary Preview Moderator (`staffUser`,
//   written by the trusted-main CI step, USER_VIEW + USER_SUSPEND since §22.4) finds A on the accounts screen, sees "ממתין למחיקה" and the
//   note that a suspension cancels the deletion, and suspends A for 24 hours. A then signs in: refused with "the account is not available"
//   (ERR-037), never held on PG-050 — there is no deletion left to cancel, and no screen to request a new one.
// One sign-up only (the Preview is slow); the ban (AC-189) and every refusal are pgTAP's (file 114) and tests/db/account-deletion.db.test.ts.
import type { BrowserContext, Page } from '@playwright/test';
import { createBypassRouteHandler } from './support/bypass.ts';
import { expect, test } from './support/fixtures.ts';
import { generateTestUser, type TestUser } from './support/test-user.ts';
import { AFTER_ANSWERS_MS, createAccount, SIGN_IN_MS, submitSignIn, timedResponse } from './support/timed-steps.ts';

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const passwordField = (page: Page) => page.getByLabel('סיסמה', { exact: true });
/** A Preview can take 10 s or more to sign in (a cold server function). */
const SLOW = 45_000;

/** A name no other account of this run carries, so the staff's search by name finds A alone (Hebrew letters only, as VAL requires). */
function uniqueName(): string {
  const letters = 'אבגדהוזחטיכלמנסעפצקרשת';
  const tail = Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)] ?? 'א').join('');
  return `שירה ${tail}`;
}

/** Signs a fresh Regular user up through /register. */
async function signUp(page: Page, fullName: string): Promise<TestUser> {
  const user = generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');
  await page.goto('/register');
  await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
  await page.getByLabel(/^שם מלא/).fill(fullName);
  await page.getByRole('button', { name: 'המשך', exact: true }).click();
  await emailField(page).fill(user.email);
  await passwordField(page).fill(user.password);
  const box = page.getByRole('checkbox', { name: /אישור תנאי השימוש/ });
  await box.focus();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
  await createAccount(page);
  await expect(page).toHaveURL(/\/recovery-questions$/);
  await page.getByLabel(/חיית המחמד/).fill(user.answers.pet);
  await page.getByLabel(/כינו אתכם/).fill(user.answers.nickname);
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/, { timeout: AFTER_ANSWERS_MS });
  return user;
}

/** Signs the run's temporary Moderator in and opens `path`; the first sign-in of the run meets the recovery-question gate (as staff-rules.flow). */
async function openAsStaff(page: Page, staff: TestUser, path: string, ready: (page: Page) => ReturnType<Page['getByRole']>): Promise<void> {
  await page.goto('/login');
  await emailField(page).fill(staff.email);
  await passwordField(page).fill(staff.password);
  await submitSignIn(page);
  await expect(page).not.toHaveURL(/\/login$/, { timeout: SIGN_IN_MS });
  await page.goto(path);
  const gate = page.getByLabel(/חיית המחמד/);
  await expect(ready(page).or(gate)).toBeVisible({ timeout: SLOW });
  if (await gate.isVisible()) {
    await gate.fill(staff.answers.pet);
    await page.getByLabel(/כינו אתכם/).fill(staff.answers.nickname);
    await page.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(page).not.toHaveURL(/\/recovery-questions$/, { timeout: SLOW });
    await page.goto(path);
    await expect(ready(page)).toBeVisible({ timeout: SLOW });
  }
}

test('[I9 §22.4 BR-085 AC-188] staff suspend an account scheduled for deletion: the deletion is gone and the account cannot undo it', async ({ page, browser, baseURL, bypassSecret, staffUser }) => {
  test.setTimeout(300_000); // one sign-up, the password check, the staff sign-in and A's sign-in on a cold Preview
  if (baseURL === undefined) throw new Error('preview-e2e: no baseURL');
  const origin = new URL(baseURL).origin;
  const contexts: BrowserContext[] = [];
  try {
    // A schedules its deletion from Settings
    const name = uniqueName();
    const a = await signUp(page, name);
    await page.goto('/settings#account');
    await page.getByRole('link', { name: 'מחיקת חשבון', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'מחיקת חשבון' })).toBeVisible({ timeout: SLOW });
    await page.getByRole('checkbox', { name: /החשבון וכל התוכן יימחקו לצמיתות/ }).check();
    await passwordField(page).fill(a.password);
    const [requested] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/account/deletion', { timeout: SLOW }),
      page.getByRole('button', { name: 'מחיקת החשבון', exact: true }).click(),
    ]);
    expect(requested.status(), 'the deletion request').toBe(200);
    await expect(page).toHaveURL(/\/login$/, { timeout: SLOW });

    // the staff side: the run's temporary Moderator finds A, scheduled, and suspends it (decision §10.1; §22.4)
    const context = await browser.newContext({ baseURL });
    await context.route(`${origin}/**`, createBypassRouteHandler(origin, bypassSecret));
    contexts.push(context);
    const pageM = await context.newPage();
    await openAsStaff(pageM, staffUser, '/admin/users', (p) => p.getByLabel('חיפוש לפי שם'));
    await pageM.getByLabel('חיפוש לפי שם').fill(name);
    await pageM.getByRole('button', { name: 'חיפוש', exact: true }).click();
    const row = pageM.getByRole('listitem').filter({ hasText: name });
    await expect(row).toContainText('ממתין למחיקה', { timeout: SLOW });
    await row.getByRole('button', { name: `פתיחה החשבון של ${name}` }).click();
    const panel = pageM.getByRole('region', { name: 'אכיפה' });
    await expect(panel.getByText(/השעיה או חסימה יבטלו את המחיקה/)).toBeVisible({ timeout: SLOW });
    await panel.getByLabel('פעולה').selectOption({ label: 'השעיה' });
    await panel.getByLabel('משך ההשעיה').selectOption({ label: '24 שעות' });
    await panel.getByLabel('סיבה (נרשמת ביומן)').fill('בדיקה אוטומטית: השעיה גוברת על מחיקה');
    await timedResponse(
      pageM,
      'POST /api/admin/enforcements',
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/admin/enforcements',
      () => panel.getByRole('button', { name: 'ביצוע הפעולה' }).click(),
    );
    await expect(pageM.getByText('הפעולה בוצעה')).toBeVisible({ timeout: SLOW });
    await expect(panel).toContainText('מושעה');
    await expect(panel.getByText(/השעיה או חסימה יבטלו את המחיקה/)).toHaveCount(0);

    // A's side: no PG-050, no cancel, no way to a new request — the sign-in is refused as unavailable (ERR-037)
    await page.goto('/login');
    await emailField(page).fill(a.email);
    await passwordField(page).fill(a.password);
    await submitSignIn(page);
    await expect(page.getByText('הכניסה לחשבון הזה אינה זמינה כרגע')).toBeVisible({ timeout: SIGN_IN_MS });
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'ביטול המחיקה', exact: true })).toHaveCount(0);
    await page.goto('/account/scheduled-deletion');
    await expect(page).not.toHaveURL(/\/account\/scheduled-deletion$/, { timeout: SLOW });
  } finally {
    for (const context of contexts) await context.close();
  }
});
