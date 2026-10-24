// F2.0 c10/c14/c15 on the real Preview: change the password with the two saved answers, then sign in with the new one; the old
// one is refused. Derived from .work/account-takeover-close/spec.md (c10, c15) and the SRS texts ERR-042.
// It makes its own fresh user (the shared fixture user is already registered and has changed its password in
// password-recovery.flow.ts). Same email pattern as the fixture's, so the sweep covers it. Failed attempts per user: 1 (limit 5);
// IP-level failures added to the run: 1 per project (limit 10; the recovery flow uses 2 per project).
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { AFTER_ANSWERS_MS, createAccount, SIGN_IN_MS, submitSignIn } from './support/timed-steps.ts';
import { generateTestUser, type TestUser } from './support/test-user.ts';

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const passwordField = (page: Page) => page.getByLabel('סיסמה', { exact: true });
const newPassword = (page: Page) => page.getByLabel('סיסמה חדשה', { exact: true });
const pet = (page: Page) => page.getByLabel(/חיית המחמד/);
const nick = (page: Page) => page.getByLabel(/כינו אתכם/);
const saveButton = (page: Page) => page.getByRole('button', { name: 'שמירה', exact: true });
const statuses = (page: Page) => page.getByRole('status').filter({ hasText: /\S/ });
const submit = (page: Page) => page.locator('form button[type="submit"]').first();

const users = new Map<string, TestUser>();
function userOf(project: string): TestUser {
  let u = users.get(project);
  if (u === undefined) {
    u = generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');
    users.set(project, u);
  }
  return u;
}

/** Signs in and waits for Auth's answer (a refusal too); the caller asserts where it lands. */
async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await emailField(page).fill(email);
  await passwordField(page).fill(password);
  await submitSignIn(page);
}
async function logOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'פתיחת התפריט' }).click();
  await page.getByRole('button', { name: 'התנתקות', exact: true }).click();
  await expect(page).not.toHaveURL(/\/(feed|home|recovery-questions|change-password)$/);
}
async function openChange(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'פתיחת התפריט' }).click();
  await page.getByRole('link', { name: 'החלפת סיסמה', exact: true }).click();
  await expect(page).toHaveURL(/\/change-password$/);
}

test.describe.serial('F2.0 password change on the Preview [c10 c15]', () => {
  test('[c10 c15] fresh user: sign up, store the two answers', async ({ page }, info) => {
    const u = userOf(info.project.name);
    await page.goto('/register');
    await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
    await page.getByLabel(/^שם מלא/).fill('דנה כהן');
    await page.getByRole('button', { name: 'המשך', exact: true }).click();
    await emailField(page).fill(u.email);
    await passwordField(page).fill(u.password);
    const box = page.getByRole('checkbox', { name: /אישור תנאי השימוש/ });
    await box.focus();
    await page.keyboard.press('Space');
    await expect(box).toBeChecked();
    await createAccount(page);
    await expect(page).toHaveURL(/\/recovery-questions$/);
    await pet(page).fill(u.answers.pet);
    await nick(page).fill(u.answers.nickname);
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/feed$/, { timeout: AFTER_ANSWERS_MS });
  });

  test('[c10 c15] a wrong answer shows an error and leaves the password; the right answers change it', async ({ page, recoveryAttempts }, info) => {
    const u = userOf(info.project.name);
    await signIn(page, u.email, u.password);
    await expect(page).toHaveURL(/\/feed$/, { timeout: SIGN_IN_MS });
    await openChange(page);
    recoveryAttempts.recordFailedAttempt(u.email);
    await pet(page).fill('wronganswer1');
    await nick(page).fill(u.answers.nickname);
    await newPassword(page).fill(`${u.password}-new`);
    await submit(page).click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    expect((await page.getByRole('alert').first().innerText()).trim(), 'wrong-answer alert text (ERR-042)').toContain('הפרטים שהוזנו אינם תואמים. אפשר לנסות שוב');
    await expect(newPassword(page)).toHaveValue('');
    await pet(page).fill(u.answers.pet);
    await newPassword(page).fill(`${u.password}-new`);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/password/change'),
      submit(page).click(),
    ]);
    expect(response.status(), 'change status').toBe(200);
    // Gate 2 A6 / DR-E: the change ends every session (the caller's included), so the user is sent to sign in again.
    await expect(page).toHaveURL(/\/login$/);
    await expect(statuses(page)).toContainText(/הסיסמה הוחלפה/); // DR-E addendum: the sign-in screen carries the c15 success text
  });

  test('[c10] the new password signs in; the old one is refused', async ({ page }, info) => {
    const u = userOf(info.project.name);
    await signIn(page, u.email, `${u.password}-new`);
    await expect(page).toHaveURL(/\/feed$/, { timeout: SIGN_IN_MS });
    await logOut(page);
    await signIn(page, u.email, u.password);
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page).toHaveURL(/\/login$/);
  });
});
