// F2.2a c1 c2 c3 c7 c8 on the real Preview: sign up as planning, open the profile ("מתכננים", no child), add the first child,
// reload (the child and "יש לנו ילד או ילדה"), edit it, reload (the new values, same place). Derived from
// .work/journeys-children/spec.md. It makes its own fresh user (same email pattern as the fixture's, so the cleanup sweep covers
// it). No recovery attempts are made.
// F2.2b1 c14 c15: a second fresh user registers with has_child only (neither planning nor pregnant), adds a pregnancy with a due date
// (POST /api/journeys), edits it (PUT /api/journeys/:id), clears it, each surviving a reload. Dates are relative to the real clock
// (the Preview server's date), well inside VAL-044's window so the server's own check cannot differ from the browser's.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { AFTER_ANSWERS_MS, createAccount, SIGN_IN_MS, submitSignIn } from './support/timed-steps.ts';
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
  await submitSignIn(page);
  await expect(page).toHaveURL(/\/feed$/, { timeout: SIGN_IN_MS });
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
    await createAccount(page);
    await expect(page).toHaveURL(/\/recovery-questions$/);
    await page.getByLabel(/חיית המחמד/).fill(u.answers.pet);
    await page.getByLabel(/כינו אתכם/).fill(u.answers.nickname);
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/feed$/, { timeout: AFTER_ANSWERS_MS });
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

// ---------------------------------------------------------------------------------------------------------------------
const usersB1 = new Map<string, TestUser>();
function b1UserOf(project: string): TestUser {
  let u = usersB1.get(project);
  if (u === undefined) {
    u = generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');
    usersB1.set(project, u);
  }
  return u;
}
/** Today + n days (UTC) as the three typed parts and as the view shows it (dd.mm.yyyy). */
function inDays(n: number): { parts: [string, string, string]; shown: string } {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  return { parts: [String(day), String(m), String(y)], shown: `${String(day).padStart(2, '0')}.${String(m).padStart(2, '0')}.${String(y)}` };
}
const dueGroup = (page: Page) => page.getByRole('group', { name: 'תאריך לידה משוער (לא חובה)', exact: true });
const addPregnancy = (page: Page) => page.getByRole('button', { name: 'הוספת הריון', exact: true });
async function fillDue(page: Page, [d, m, y]: [string, string, string]): Promise<void> {
  await dueGroup(page).getByLabel('יום', { exact: true }).fill(d);
  await dueGroup(page).getByLabel('חודש', { exact: true }).fill(m);
  await dueGroup(page).getByLabel('שנה', { exact: true }).fill(y);
}

test.describe.serial('F2.2b1 pregnancy add and due-date edit on the Preview [c14 c15]', () => {
  test('[F2.2b c15] a fresh has_child user: "הוספת הריון" adds a pregnancy with a due date (POST 201); after a reload it shows, before has_child, and the action is gone', async ({ page }, info) => {
    const u = b1UserOf(info.project.name);
    await page.goto('/register');
    await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /יש לנו ילד או ילדה/ }).click();
    await page.getByLabel(/^שם מלא/).fill('דנה כהן');
    const card = page.getByRole('group', { name: 'ילד או ילדה 1', exact: true });
    await card.getByLabel('שם', { exact: true }).fill('נועה');
    await page.getByRole('group', { name: 'נועה', exact: true }).getByLabel('מין', { exact: true }).selectOption({ label: 'בת' });
    const birth = page.getByRole('group', { name: 'נועה', exact: true }).getByRole('group', { name: 'תאריך לידה', exact: true });
    await birth.getByLabel('יום', { exact: true }).fill('4');
    await birth.getByLabel('חודש', { exact: true }).fill('5');
    await birth.getByLabel('שנה', { exact: true }).fill('2023');
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
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/feed$/, { timeout: AFTER_ANSWERS_MS });
    await page.goto('/profile');
    await addPregnancy(page).click();
    const due = inDays(100);
    await fillDue(page, due.parts);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/journeys'),
      saveButton(page).click(),
    ]);
    expect(response.status(), 'POST /api/journeys status').toBe(201);
    await page.reload();
    const line = `בהריון · תאריך לידה משוער: ${due.shown}`;
    await expect(page.getByRole('main').getByText(line)).toBeVisible();
    const text = await viewText(page);
    expect(text.indexOf(line)).toBeLessThan(text.indexOf('יש לנו ילד או ילדה'));
    await expect(addPregnancy(page)).toHaveCount(0);
  });

  test('[F2.2b c14] edit the due date (PUT 200), reload: the new date; clear all three, reload: "לא צוין"', async ({ page }, info) => {
    await signIn(page, b1UserOf(info.project.name));
    const later = inDays(200);
    await childEdit(page, 'בהריון').click();
    await expect(dueGroup(page)).toBeVisible();
    await fillDue(page, later.parts);
    const [put] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname.startsWith('/api/journeys/')),
      saveButton(page).click(),
    ]);
    expect(put.status(), 'PUT /api/journeys/:id status').toBe(200);
    await page.reload();
    await expect(page.getByRole('main').getByText(`בהריון · תאריך לידה משוער: ${later.shown}`)).toBeVisible();
    await childEdit(page, 'בהריון').click();
    await fillDue(page, ['', '', '']);
    await saveButton(page).click();
    await expect(page.getByRole('main').getByText('תאריך לידה משוער: לא צוין')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('main').getByText('תאריך לידה משוער: לא צוין')).toBeVisible();
  });
});
