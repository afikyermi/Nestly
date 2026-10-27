// I11 follow-ups on the real Preview (Afik 21.10.2026, decisions-in-force.md §9.8; PG-039): a Professional signs up with the required
// qualification declaration, gets its business home in Afik's order, the four tabs (§11.20), "בקשות עזרה" from its home and a menu with no Friends; a Regular
// user then follows it from its page and finds it on "בעלי מקצוע במעקב", and unfollows. Both users are fresh (the cleanup sweep's email pattern).
// No recovery attempts are made.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { AFTER_ANSWERS_MS, createAccount, serverTiming } from './support/timed-steps.ts';
import { generateTestUser, type TestUser } from './support/test-user.ts';

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const passwordField = (page: Page) => page.getByLabel('סיסמה', { exact: true });

const runId = () => process.env['GITHUB_RUN_ID'] ?? '';
const runAttempt = () => process.env['GITHUB_RUN_ATTEMPT'] ?? '';

/** Step 2 (email, password, the consent) and the recovery questions, as every flow signs up. */
async function credentialsAndAnswers(page: Page, u: TestUser): Promise<void> {
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
  await expect(page).toHaveURL(/\/feed$/, { timeout: AFTER_ANSWERS_MS });
}

const pages = new Map<string, string>();

test.describe.serial('[I11 follow-ups] a Professional and a follower on the Preview', () => {
  test('a Professional signs up with the declaration and gets its home, navigation and menu', async ({ page }, info) => {
    const u = generateTestUser(runId(), runAttempt());
    await page.goto('/register');
    await page.getByRole('button', { name: 'נרשמים כבעלי מקצוע? להרשמה לחשבון מקצועי', exact: true }).click();
    await page.getByLabel(/^שם מלא/).fill('דנה דולה');
    await page.getByLabel(/^תחום/).selectOption('doula');
    await page.getByLabel(/^שנות ניסיון/).fill('9');
    await page.getByRole('button', { name: 'המשך', exact: true }).click();
    await expect(page.getByText('יש לאשר את ההצהרה כדי להמשיך')).toBeVisible();
    await page.getByRole('checkbox', { name: 'הצהרה: יש לי ההכשרה והרישיון הנדרשים בתחום שבחרתי' }).check();
    await page.getByRole('button', { name: 'המשך', exact: true }).click();
    await credentialsAndAnswers(page, u);

    // The dashboard's own answer first, so a refusal or a slow answer is named as such and not as missing headings (the function's own limit is
    // 30 seconds, vercel.json)
    const asked = Date.now();
    const homeAnswer = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/professional/home' && r.request().method() === 'GET', { timeout: 30_000 });
    await page.goto('/home');
    const answer = await homeAnswer;
    console.log(`[${info.project.name}] GET /api/professional/home answered ${answer.status()} after ${Date.now() - asked} ms${serverTiming(answer)}`);
    expect(answer.status(), 'GET /api/professional/home').toBe(200);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1, name: 'לוח הבקרה' })).toBeVisible();
    await expect(main.getByRole('heading', { level: 2 })).toHaveText(['מחכה לך', 'פוסטים בתחום שלך', 'הנתונים שלך', 'השלמת הפרופיל', 'תוצאות התוכן', 'קידום']);
    await expect(main.getByText('הצעות עזרה היום: 0 מתוך 100')).toBeVisible();
    const own = await main.getByRole('link', { name: 'צפייה בעמוד שלי' }).getAttribute('href');
    expect(own).toMatch(/^\/pros\/[0-9a-f-]{36}$/);
    pages.set(info.project.name, own ?? '');

    // I11-C (§11.20): בית · פיד · שיחות · פרופיל; "בקשות עזרה" from the home and the menu
    const nav = page.getByRole('navigation', { name: 'ניווט ראשי' });
    // polled: until the account kind loads, the bar shows the community tabs
    await expect.poll(async () => (await nav.getByRole('link').allTextContents()).map((text) => text.split(/[\d,]/)[0])).toEqual(['בית', 'פיד', 'שיחות', 'פרופיל']);
    await main.getByRole('link', { name: 'לכל הפוסטים בתחום שלך' }).click();
    await expect(page).toHaveURL(/\/help-requests$/);
    await expect(main.getByRole('heading', { level: 1, name: 'בקשות עזרה' })).toBeVisible();

    await page.getByRole('button', { name: 'פתיחת התפריט', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'תפריט' });
    await expect(drawer.getByRole('link', { name: 'בקשות עזרה', exact: true })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'בעלי מקצוע במעקב', exact: true })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'חברים', exact: true })).toHaveCount(0);
  });

  test('a Regular user follows it, finds it on "בעלי מקצוע במעקב", and unfollows', async ({ page }, info) => {
    const proPage = pages.get(info.project.name) ?? '';
    expect(proPage, 'the Professional of this viewport was made first').not.toBe('');
    const u = generateTestUser(runId(), runAttempt());
    await page.goto('/register');
    await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
    await page.getByLabel(/^שם מלא/).fill('נועה לוי');
    await page.getByRole('button', { name: 'המשך', exact: true }).click();
    await credentialsAndAnswers(page, u);

    await page.goto(proPage);
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'מעקב', exact: true }).click();
    await expect(main.getByRole('button', { name: 'הפסקת מעקב' })).toBeVisible();
    await page.goto('/following');
    const list = main.getByRole('list', { name: 'בעלי מקצוע במעקב' });
    await expect(list.getByRole('link', { name: 'דנה דולה' })).toHaveAttribute('href', proPage);
    await list.getByRole('button', { name: 'הפסקת מעקב אחרי דנה דולה' }).click();
    await expect(main.getByText('המעקב אחרי דנה דולה הופסק.')).toBeVisible();
  });
});
