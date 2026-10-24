// A Regular user's first minutes on the real Preview (SRS audit 21.10.2026): sign up, store the recovery answers, open the home (FR-HOME-001,
// PG-009): its content loads (the journey chosen at sign-up) and no load-failure state is shown; open the profile (FR-PROFILE-001, PG-012): the
// name given at sign-up is shown and no load-failure state. Then Settings (FR-SET-001): the Regular account's sections, the edit-profile link
// to /profile and the privacy form loaded. It makes its own fresh user (same email pattern as the fixture's, so the cleanup sweep covers it).
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { createAccount } from './support/timed-steps.ts';
import { generateTestUser } from './support/test-user.ts';

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const passwordField = (page: Page) => page.getByLabel('סיסמה', { exact: true });
const main = (page: Page) => page.getByRole('main');
const HOME_FAILED = 'לא הצלחנו לטעון את דף הבית. אפשר לנסות שוב.';
const PROFILE_FAILED = 'לא הצלחנו לטעון את הפרופיל. אפשר לנסות שוב';

test('[FR-HOME-001 FR-PROFILE-001 FR-SET-001] a new Regular user: home and profile load their data, no error state', async ({ page }) => {
  const u = generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');
  await page.goto('/register');
  await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
  await page.getByLabel(/^שם מלא/).fill('נגה בית');
  await page.getByRole('button', { name: 'המשך', exact: true }).click();
  await emailField(page).fill(u.email);
  await passwordField(page).fill(u.password);
  const box = page.getByRole('checkbox', { name: /אישור תנאי השימוש/ });
  await box.focus();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
  await createAccount(page);
  await expect(page).toHaveURL(/\/recovery-questions$/);
  await page.getByLabel(/חיית המחמד/).fill(u.answers.pet);
  await page.getByLabel(/כינו אתכם/).fill(u.answers.nickname);
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/);

  // the home: GET /api/home answers 200 and its content is drawn (the journey chosen at sign-up), never the failure state
  const [home] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/home'),
    page.goto('/home'),
  ]);
  expect(home.status(), 'GET /api/home status').toBe(200);
  await expect(main(page).getByRole('heading', { level: 1, name: 'בית' })).toBeVisible();
  await expect(main(page).getByText('מתכננים הריון').first()).toBeVisible();
  await expect(main(page).getByText(HOME_FAILED)).toHaveCount(0);

  // the profile: the name given at sign-up, never the failure state
  await page.goto('/profile');
  await expect(main(page).getByRole('button', { name: 'עריכה', exact: true })).toBeVisible();
  expect((await main(page).innerText()).replace(/\s+/g, ' ')).toMatch(/שם מלא[:\s]+נגה בית/);
  await expect(main(page).getByText(PROFILE_FAILED)).toHaveCount(0);

  // Settings for a Regular account: the edit-profile link leads to /profile and the privacy form loads (no error)
  await page.goto('/settings');
  await expect(main(page).getByRole('radio', { name: /^פרופיל פתוח/ })).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'עריכת פרופיל', exact: true })).toHaveAttribute('href', '/profile');
  await expect(main(page).getByRole('button', { name: 'נסו שוב' })).toHaveCount(0);
});
