// F2.3a c1 c2 c6 on the real Preview: sign up (registration sends no privacy setting), open the settings from the side menu ("פרטיות ואבטחה", F2.5 c2; the profile page's temporary link is gone, F2.5 c10),
// see the defaults (open, both switches on), save restricted / off / off, reload (the three survive), save the defaults back,
// reload. Derived from .work/profile-privacy/spec.md; route and names from interface.md. It makes its own fresh user (same
// email pattern as the fixture's, so the cleanup sweep covers it). No recovery attempts are made.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { createAccount } from './support/timed-steps.ts';
import { generateTestUser, type TestUser } from './support/test-user.ts';

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const passwordField = (page: Page) => page.getByLabel('סיסמה', { exact: true });
const main = (page: Page) => page.getByRole('main');
const saveButton = (page: Page) => main(page).getByRole('button', { name: 'שמירה', exact: true });
const openRadio = (page: Page) => main(page).getByRole('radio', { name: /^פרופיל פתוח/ });
const restrictedRadio = (page: Page) => main(page).getByRole('radio', { name: /^פרופיל מוגבל/ });
const sentenceBox = (page: Page) => main(page).getByRole('checkbox', { name: 'הצגת המשפט כשאין ילדים והריון', exact: true });
const birthdayBox = (page: Page) => main(page).getByRole('checkbox', { name: 'יום הולדת של ילד בהתראות לחברים', exact: true });
/** The settings screen reads several sections before it shows the privacy choice; a slow Preview took over 10 s (preview-e2e 24.10). */
const SETTINGS_LOAD = 30_000;
const isPut = (r: { request: () => { method: () => string }; url: () => string }) =>
  r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/privacy';

const users = new Map<string, TestUser>();
function userOf(project: string): TestUser {
  let u = users.get(project);
  if (u === undefined) {
    u = generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');
    users.set(project, u);
  }
  return u;
}
async function signIn(page: Page, u: TestUser): Promise<void> {
  await page.goto('/login');
  await emailField(page).fill(u.email);
  await passwordField(page).fill(u.password);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/);
  await page.goto('/settings');
  await expect(openRadio(page)).toBeVisible({ timeout: SETTINGS_LOAD });
}

test.describe.serial('F2.3a privacy settings on the Preview [c1 c2 c6]', () => {
  test('[F2.3a c6 c1 DR-2] a fresh user: the menu item "פרטיות ואבטחה" opens /settings#privacy with open selected and both switches on', async ({ page }, info) => {
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
    await page.getByLabel(/חיית המחמד/).fill(u.answers.pet);
    await page.getByLabel(/כינו אתכם/).fill(u.answers.nickname);
    await page.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(page).toHaveURL(/\/feed$/);
    await page.getByRole('button', { name: 'פתיחת התפריט', exact: true }).click();
    await page.getByRole('dialog', { name: 'תפריט' }).getByRole('link', { name: 'פרטיות ואבטחה', exact: true }).click();
    await expect(page).toHaveURL(/\/settings#privacy$/);
    await expect(openRadio(page)).toBeVisible({ timeout: SETTINGS_LOAD });
    await expect(openRadio(page)).toBeChecked();
    await expect(restrictedRadio(page)).not.toBeChecked();
    await expect(sentenceBox(page)).toBeChecked();
    await expect(birthdayBox(page)).toBeChecked();
  });

  test('[F2.3a c2] restricted, sentence off, birthday off: one PUT answers 200; after a reload the three are shown', async ({ page }, info) => {
    await signIn(page, userOf(info.project.name));
    await main(page).getByText('פרופיל מוגבל', { exact: true }).click();
    await main(page).getByText('הצגת המשפט כשאין ילדים והריון', { exact: true }).click();
    await main(page).getByText('יום הולדת של ילד בהתראות לחברים', { exact: true }).click();
    const [response] = await Promise.all([page.waitForResponse(isPut), saveButton(page).click()]);
    expect(response.status(), 'PUT /api/privacy status').toBe(200);
    await expect(main(page).getByRole('status').filter({ hasText: 'הפרטים נשמרו' })).toBeVisible();
    await page.reload();
    await expect(restrictedRadio(page)).toBeChecked();
    await expect(openRadio(page)).not.toBeChecked();
    await expect(sentenceBox(page)).not.toBeChecked();
    await expect(birthdayBox(page)).not.toBeChecked();
  });

  test('[F2.3a c2] back to the defaults: saved, and a reload shows open and both switches on', async ({ page }, info) => {
    await signIn(page, userOf(info.project.name));
    await expect(restrictedRadio(page)).toBeChecked();
    await main(page).getByText('פרופיל פתוח', { exact: true }).click();
    await main(page).getByText('הצגת המשפט כשאין ילדים והריון', { exact: true }).click();
    await main(page).getByText('יום הולדת של ילד בהתראות לחברים', { exact: true }).click();
    const [response] = await Promise.all([page.waitForResponse(isPut), saveButton(page).click()]);
    expect(response.status(), 'PUT /api/privacy status').toBe(200);
    await page.reload();
    await expect(openRadio(page)).toBeChecked();
    await expect(sentenceBox(page)).toBeChecked();
    await expect(birthdayBox(page)).toBeChecked();
  });
});
