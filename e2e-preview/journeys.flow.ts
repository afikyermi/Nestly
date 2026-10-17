// F2.2a c1 c2 c3 c7 c8 on the real Preview: sign up as planning, open the profile ("מתכננים", no child), add the first child,
// reload (the child and "יש לנו ילד או ילדה"), edit it, reload (the new values, same place). Derived from
// .work/journeys-children/spec.md. It makes its own fresh user (same email pattern as the fixture's, so the cleanup sweep covers
// it). No recovery attempts are made.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { generateTestUser, type TestUser } from './support/test-user.ts';

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const passwordField = (page: Page) => page.getByLabel('סיסמה', { exact: true });
const saveButton = (page: Page) => page.getByRole('button', { name: 'שמירה', exact: true });
const addButton = (page: Page) => page.getByRole('button', { name: 'הוספת ילד', exact: true });
const nameInput = (page: Page) => page.getByLabel('שם', { exact: true });
const sexSelect = (page: Page) => page.getByLabel('מין', { exact: true });
const dateGroup = (page: Page) => page.getByRole('group', { name: /^תאריך לידה/ });
const viewText = async (page: Page) => (await page.getByRole('main').innerText()).replace(/\s+/g, ' ');
const childEdit = (page: Page, text: string) =>
  page.getByRole('main').locator('*').filter({ hasText: text }).filter({ has: page.getByRole('button', { name: /עריכה/ }) }).last()
    .getByRole('button', { name: /עריכה/ });

async function fillChild(page: Page, name: string, sex: string, [d, m, y]: [string, string, string]): Promise<void> {
  await nameInput(page).fill(name);
  await sexSelect(page).selectOption({ label: sex });
  await dateGroup(page).getByLabel('יום', { exact: true }).fill(d);
  await dateGroup(page).getByLabel('חודש', { exact: true }).fill(m);
  await dateGroup(page).getByLabel('שנה', { exact: true }).fill(y);
}

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
  await page.goto('/profile');
}

test.describe.serial('F2.2a journeys and children on the Preview [c1 c2 c3 c7 c8]', () => {
  test('[F2.2a c2] fresh planning user: "המסע שלי" reads "מתכננים", no child, and "הוספת ילד"', async ({ page }, info) => {
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
    await page.getByRole('button', { name: 'יצירת חשבון', exact: true }).click();
    await expect(page).toHaveURL(/\/recovery-questions$/);
    await page.getByLabel(/חיית המחמד/).fill(u.answers.pet);
    await page.getByLabel(/כינו אתכם/).fill(u.answers.nickname);
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/feed$/);
    await page.goto('/profile');
    await expect(addButton(page)).toBeVisible();
    const text = await viewText(page);
    expect(text).toContain('המסע שלי');
    expect(text).toContain('מתכננים');
    expect(text).not.toContain('יש לנו ילד או ילדה');
  });

  test('[F2.2a c3 c7] add the first child: POST answers 2xx; after a reload the child and "יש לנו ילד או ילדה" are shown', async ({ page }, info) => {
    await signIn(page, userOf(info.project.name));
    await addButton(page).click();
    await fillChild(page, 'נועה', 'בת', ['4', '5', '2023']);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/children'),
      saveButton(page).click(),
    ]);
    expect([200, 201], 'POST /api/children status').toContain(response.status());
    await expect(childEdit(page, 'נועה · בת · 04.05.2023')).toHaveCount(1);
    await page.reload();
    await expect(childEdit(page, 'נועה · בת · 04.05.2023')).toHaveCount(1);
    expect(await viewText(page)).toContain('יש לנו ילד או ילדה');
  });

  test('[F2.2a c8 c3] edit it and add a second: the edit survives a reload in the same place, the new child is last', async ({ page }, info) => {
    await signIn(page, userOf(info.project.name));
    await childEdit(page, 'נועה · בת · 04.05.2023').click();
    await expect(nameInput(page)).toHaveValue('נועה');
    await fillChild(page, 'נועה רות', 'עוד לא ידוע', ['5', '6', '2023']);
    const [put] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname.startsWith('/api/children/')),
      saveButton(page).click(),
    ]);
    expect([200, 201], 'PUT /api/children/:id status').toContain(put.status());
    await addButton(page).click();
    await fillChild(page, 'איתי', 'בן', ['10', '1', '2025']);
    await saveButton(page).click();
    await expect(childEdit(page, 'איתי · בן · 10.01.2025')).toHaveCount(1);
    await page.reload();
    await expect(childEdit(page, 'איתי · בן · 10.01.2025')).toHaveCount(1);
    const text = await viewText(page);
    const first = text.indexOf('נועה רות · עוד לא ידוע · 05.06.2023');
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(text.indexOf('איתי · בן · 10.01.2025'));
  });
});
