// F2.1 c1 c5 c7 on the real Preview: sign up, save the recovery questions, open the profile (the name given at sign-up, no gender
// given), edit the name and the parent gender, save, reload: the new values are shown. Derived from .work/profile-view-edit/spec.md.
// It makes its own fresh user (same email pattern as the fixture's, so the cleanup sweep covers it). No recovery attempts are made.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { createAccount, timedResponse } from './support/timed-steps.ts';
import { generateTestUser, type TestUser } from './support/test-user.ts';

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const passwordField = (page: Page) => page.getByLabel('סיסמה', { exact: true });
const pet = (page: Page) => page.getByLabel(/חיית המחמד/);
const nick = (page: Page) => page.getByLabel(/כינו אתכם/);
const saveButton = (page: Page) => page.getByRole('button', { name: 'שמירה', exact: true });
const editButton = (page: Page) => page.getByRole('button', { name: 'עריכה', exact: true });
const nameInput = (page: Page) => page.getByRole('textbox', { name: /^שם מלא/ });
const genderSelect = (page: Page) => page.getByRole('combobox', { name: /מין ההורה/ });
const viewText = async (page: Page) => ((await page.getByRole('main').innerText()).replace(/\s+/g, ' '));

const users = new Map<string, TestUser>();
function userOf(project: string): TestUser {
  let u = users.get(project);
  if (u === undefined) {
    u = generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');
    users.set(project, u);
  }
  return u;
}

test.describe.serial('F2.1 own profile on the Preview [c1 c5 c7]', () => {
  test('[c1] fresh user: sign up with a name, store the two answers, open the profile: the sign-up name and "לא צוין"', async ({ page }, info) => {
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
    await expect(page).toHaveURL(/\/feed$/);
    await timedResponse(page, 'GET /api/profile', (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/profile', () => page.goto('/profile'));
    await expect(editButton(page)).toBeVisible();
    expect(await viewText(page)).toMatch(/שם מלא[:\s]+דנה כהן/);
    expect(await viewText(page)).toMatch(/מין ההורה[:\s]+לא צוין/);
  });

  test('[c5 c7] edit the name and the parent gender, save, reload: the new values are shown', async ({ page }, info) => {
    const u = userOf(info.project.name);
    await page.goto('/login');
    await emailField(page).fill(u.email);
    await passwordField(page).fill(u.password);
    await page.getByRole('button', { name: 'התחברות', exact: true }).click();
    await expect(page).toHaveURL(/\/feed$/);
    await timedResponse(page, 'GET /api/profile', (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/profile', () => page.goto('/profile'));
    await editButton(page).click();
    await expect(nameInput(page)).toHaveValue('דנה כהן');
    await nameInput(page).fill('  רון לוי  ');
    await genderSelect(page).selectOption({ label: 'גבר' });
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/profile'),
      saveButton(page).click(),
    ]);
    expect(response.status(), 'PUT /api/profile status').toBe(200);
    await expect(editButton(page)).toBeVisible();
    expect(await viewText(page)).toMatch(/שם מלא[:\s]+רון לוי/);
    expect(await viewText(page)).toMatch(/מין ההורה[:\s]+גבר/);
    await page.reload();
    await expect(editButton(page)).toBeVisible();
    expect(await viewText(page)).toMatch(/שם מלא[:\s]+רון לוי/);
    expect(await viewText(page)).toMatch(/מין ההורה[:\s]+גבר/);
  });

  test('[c7] clearing the gender is saved as "not answered" and survives a reload', async ({ page }, info) => {
    const u = userOf(info.project.name);
    await page.goto('/login');
    await emailField(page).fill(u.email);
    await passwordField(page).fill(u.password);
    await page.getByRole('button', { name: 'התחברות', exact: true }).click();
    await expect(page).toHaveURL(/\/feed$/);
    await timedResponse(page, 'GET /api/profile', (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/profile', () => page.goto('/profile'));
    await editButton(page).click();
    await genderSelect(page).selectOption({ value: '' });
    await saveButton(page).click();
    await expect(editButton(page)).toBeVisible();
    await page.reload();
    await expect(editButton(page)).toBeVisible();
    expect(await viewText(page)).toMatch(/מין ההורה[:\s]+לא צוין/);
    expect(await viewText(page)).toMatch(/שם מלא[:\s]+רון לוי/);
  });
});
