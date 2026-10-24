// F1.6 on the real Preview (preview-e2e criteria 6 and 7). Expected routes come from .work/password-recovery/spec.md
// criteria 9, 16-18 and its amendments (an active account without answers is held on the questions screen). The spec fixes
// no wording for the mismatch, confirmation or invalid-credentials texts, so those are asserted by role (alert / status),
// by count, and by comparing texts with each other.
// Success is asserted only after the request settles with 200 (change: PUT /api/recovery-questions, spec c4; reset:
// POST /api/recovery/reset, spec c9). A status region also exists while busy, so "a status is visible" alone would pass
// while the request is still in flight; after the response, exactly one non-empty status must remain.
// One serial journey per project, one user per project. Failed recovery attempts per user: 2 (limit 4). IP-level failures
// in the whole run: 2 projects x (1 wrong change + 1 wrong reset) = 4 (limit 10).
import type { Page, Response } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { createAccount } from './support/timed-steps.ts';

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const passwordField = (page: Page) => page.getByLabel('סיסמה', { exact: true });
const newPassword = (page: Page) => page.getByLabel('סיסמה חדשה', { exact: true });
const pet = (page: Page) => page.getByLabel(/חיית המחמד/);
const nick = (page: Page) => page.getByLabel(/כינו אתכם/);
const street = (page: Page) => page.getByLabel(/רחוב/);
const saveButton = (page: Page) => page.getByRole('button', { name: 'שמירה', exact: true });
const resetSubmit = (page: Page) => page.getByRole('button', { name: 'עדכון הסיסמה', exact: true });
const statuses = (page: Page) => page.getByRole('status').filter({ hasText: /\S/ });
const alertText = async (page: Page) => (await page.getByRole('alert').first().innerText()).trim();

const WRONG = 'wronganswer1';
const reversed = (s: string) => s.split('').reverse().join('');
let mismatchOnChange = '';

const answered = (method: string, path: string, status: number) => (r: Response): boolean =>
  r.request().method() === method && new URL(r.url()).pathname === path && r.status() === status;

/** A slow Preview took over 10 s from "התחברות" to the next screen (preview-e2e 24.10): Auth's token answer, then /api/me. */
const SIGN_IN_MS = 45_000;
const isAuthToken = (r: Response) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/auth/v1/token';

/** Signs in and waits for Auth's answer (a refusal too); the caller asserts where it lands. */
async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await emailField(page).fill(email);
  await passwordField(page).fill(password);
  await Promise.all([
    page.waitForResponse(isAuthToken, { timeout: SIGN_IN_MS }),
    page.getByRole('button', { name: 'התחברות', exact: true }).click(),
  ]);
}

async function logOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'פתיחת התפריט' }).click();
  await page.getByRole('button', { name: 'התנתקות', exact: true }).click();
  await expect(page).not.toHaveURL(/\/(feed|home|recovery-questions)$/);
}

test.describe.serial('F1.6 on the Preview [preview-e2e c6 c7 · F1.6 c9 c16 c17 c18]', () => {
  test('[c6.1 · F1.6 c17] sign-up opens the questions screen at once and holds the user there', async ({ page, testUser }) => {
    await page.goto('/register');
    await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
    await page.getByLabel(/^שם מלא/).fill('דנה כהן');
    await page.getByRole('button', { name: 'המשך', exact: true }).click();
    await emailField(page).fill(testUser.email);
    await passwordField(page).fill(testUser.password);
    const box = page.getByRole('checkbox', { name: /אישור תנאי השימוש/ });
    await box.focus();
    await page.keyboard.press('Space');
    await expect(box).toBeChecked();
    await createAccount(page);
    await expect(page).toHaveURL(/\/recovery-questions$/);
    await expect(pet(page)).toBeVisible();
    await page.goto('/feed');
    await expect(page).toHaveURL(/\/recovery-questions$/);
    await page.reload();
    await expect(page).toHaveURL(/\/recovery-questions$/);
    await expect(pet(page)).toBeVisible();
  });

  test('[c6.2 · F1.6 c17] choosing two of three, answering and "שמירה" lands on /feed', async ({ page, testUser }) => {
    await signIn(page, testUser.email, testUser.password);
    await expect(page).toHaveURL(/\/recovery-questions$/);
    await pet(page).fill(testUser.answers.pet);
    await nick(page).fill(testUser.answers.nickname);
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/feed$/);
  });

  test('[c6.3 · F1.6 c17] after log-out and sign-in the questions screen does not appear', async ({ page, testUser }) => {
    await signIn(page, testUser.email, testUser.password);
    await expect(page).toHaveURL(/\/feed$/, { timeout: SIGN_IN_MS });
    await logOut(page);
    await signIn(page, testUser.email, testUser.password);
    await expect(page).toHaveURL(/\/feed$/, { timeout: SIGN_IN_MS });
    await expect(pet(page)).toHaveCount(0);
  });

  test('[c6.4 · F1.6 c18] menu: wrong current answers show the mismatch text, correct ones a confirmation', async ({ page, testUser, recoveryAttempts }) => {
    await signIn(page, testUser.email, testUser.password);
    await expect(page).toHaveURL(/\/feed$/, { timeout: SIGN_IN_MS });
    await page.getByRole('button', { name: 'פתיחת התפריט' }).click();
    await page.getByRole('link', { name: 'שאלות לשחזור סיסמה', exact: true }).click();
    await expect(page).toHaveURL(/\/recovery-questions$/);
    await expect(pet(page)).toHaveCount(2);
    // New answers: the same pet plus a fresh street answer, so the recovery step below uses pet + street.
    const fillNew = async (): Promise<void> => {
      await pet(page).last().fill(testUser.answers.pet);
      await street(page).last().fill(reversed(testUser.answers.nickname));
    };
    recoveryAttempts.recordFailedAttempt(testUser.email);
    await pet(page).first().fill(WRONG);
    await nick(page).first().fill(testUser.answers.nickname);
    await fillNew();
    await saveButton(page).click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    mismatchOnChange = await alertText(page);
    expect(mismatchOnChange.length).toBeGreaterThan(0);
    await pet(page).first().fill(testUser.answers.pet);
    await fillNew();
    await Promise.all([page.waitForResponse(answered('PUT', '/api/recovery-questions', 200)), saveButton(page).click()]);
    await expect(statuses(page)).toHaveCount(1);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('[c7 · F1.6 c16] /recovery with a wrong answer shows the single mismatch text and the new password is empty', async ({ page, testUser, recoveryAttempts }) => {
    await page.goto('/recovery');
    await emailField(page).fill(testUser.email);
    await pet(page).fill(testUser.answers.pet);
    await street(page).fill(WRONG);
    await newPassword(page).fill('Never-Applied-1-pw-xyz');
    recoveryAttempts.recordFailedAttempt(testUser.email);
    await resetSubmit(page).click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(newPassword(page)).toHaveValue('');
    const text = await alertText(page);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain(testUser.email);
    expect(text).toBe(mismatchOnChange); // F1.6 c18: the same mismatch text as on the menu screen
  });

  test('[c6.5 · F1.6 c9 c16] log out, /recovery with email, both answers and a new password shows success', async ({ page, testUser }) => {
    await signIn(page, testUser.email, testUser.password);
    await expect(page).toHaveURL(/\/feed$/, { timeout: SIGN_IN_MS });
    await logOut(page);
    await page.goto('/recovery');
    await emailField(page).fill(testUser.email);
    await pet(page).fill(testUser.answers.pet);
    await street(page).fill(reversed(testUser.answers.nickname));
    await newPassword(page).fill(`${testUser.password}-new`);
    await Promise.all([page.waitForResponse(answered('POST', '/api/recovery/reset', 200)), resetSubmit(page).click()]);
    await expect(statuses(page)).toHaveCount(1);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('[c6.6 · F1.6 c9] the new password signs in to /feed and the old one gets the invalid-credentials text', async ({ page, testUser }) => {
    await signIn(page, testUser.email, `${testUser.password}-new`);
    await expect(page).toHaveURL(/\/feed$/, { timeout: SIGN_IN_MS });
    await logOut(page);
    await signIn(page, testUser.email, testUser.password);
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page).toHaveURL(/\/login$/);
    expect((await alertText(page)).length).toBeGreaterThan(0);
  });
});
