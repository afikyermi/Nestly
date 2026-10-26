// I12 Marketplace on the real Preview (FR-MKT-001/002/005; decisions §3 item 11; I12 part B, Afik §10.5–§10.6): a fresh Regular publishes a
// listing in "מכשירי חשמל" with a description and a price of 0 ("למסירה"; no image: the background check is not part of this flow); a fresh
// Professional opens "חנות" from its menu (view and contact only: no "פרסום מודעה"), finds the listing by its title and category, reads the
// description and "למסירה", and writes to the seller; the seller marks it sold/given — it leaves the Marketplace for the Professional and stays
// in the seller's "המודעות שלי" — then back, and deletes it. The users are made through the app (the fixture's email pattern, so the cleanup
// sweep covers them, listings included). No recovery attempts are made. The expiry purge runs as the job role: pgTAP file 120.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { createBypassRouteHandler } from './support/bypass.ts';
import { AFTER_ANSWERS_MS, createAccount } from './support/timed-steps.ts';
import { generateTestUser, type TestUser } from './support/test-user.ts';

const main = (page: Page) => page.getByRole('main');
const runId = () => process.env['GITHUB_RUN_ID'] ?? '';
const runAttempt = () => process.env['GITHUB_RUN_ATTEMPT'] ?? '';
/** Every server answer this flow waits for gets 45 s (conventions: CI, Preview and orchestration (2)). */
const ANSWER_MS = 45_000;

async function credentialsAndAnswers(page: Page, u: TestUser): Promise<void> {
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(u.email);
  await page.getByLabel('סיסמה', { exact: true }).fill(u.password);
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

async function signUpRegular(page: Page, u: TestUser): Promise<void> {
  await page.goto('/register');
  await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
  await page.getByLabel(/^שם מלא/).fill('מאיה מוכרת');
  await page.getByRole('button', { name: 'המשך', exact: true }).click();
  await credentialsAndAnswers(page, u);
}

async function signUpProfessional(page: Page, u: TestUser): Promise<void> {
  await page.goto('/register');
  await page.getByRole('button', { name: 'נרשמים כבעלי מקצוע? להרשמה לחשבון מקצועי', exact: true }).click();
  await page.getByLabel(/^שם מלא/).fill('דפנה דולה');
  await page.getByLabel(/^תחום/).selectOption('doula');
  await page.getByLabel(/^שנות ניסיון/).fill('6');
  await page.getByRole('checkbox', { name: 'הצהרה: יש לי ההכשרה והרישיון הנדרשים בתחום שבחרתי' }).check();
  await page.getByRole('button', { name: 'המשך', exact: true }).click();
  await credentialsAndAnswers(page, u);
}

/** The Professional's Marketplace search for the title in "מכשירי חשמל"; waits for the server's answer. */
async function searchAsReader(page: Page, title: string): Promise<void> {
  await main(page).getByLabel('חיפוש מוצר', { exact: true }).fill(title);
  await main(page).getByLabel('קטגוריה', { exact: true }).selectOption({ label: 'מכשירי חשמל' });
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/marketplace', { timeout: ANSWER_MS }),
    main(page).getByRole('button', { name: 'הצגה', exact: true }).click(),
  ]);
}

test('[I12 FR-MKT-001 FR-MKT-002 FR-MKT-005 · I12-B AC-200 AC-201 AC-202 AC-204 AC-205] a Regular publishes, a Professional finds and contacts, the sale takes it out', async ({
  browser,
  baseURL,
  bypassSecret,
}, info) => {
  test.setTimeout(5 * 60_000);
  if (baseURL === undefined) throw new Error('no baseURL');
  const origin = new URL(baseURL).origin;
  // two people at once, each in a context of its own with the deployment's bypass (as the fixture's own context has)
  const open = async () => {
    const context = await browser.newContext({ baseURL, viewport: info.project.use.viewport ?? null });
    await context.route(`${origin}/**`, createBypassRouteHandler(origin, bypassSecret));
    return context;
  };
  const sellerContext = await open();
  const proContext = await open();
  const seller = await sellerContext.newPage();
  const pro = await proContext.newPage();
  try {
    const sellerUser = generateTestUser(runId(), runAttempt());
    // unique per run and project: the user's own random part (the email's prefix is the run's, shared by both projects)
    const title = `מחמם בקבוקים ${/-([0-9a-f]{16})@/.exec(sellerUser.email)?.[1] ?? info.project.name}`;
    await signUpRegular(seller, sellerUser);

    // the seller: "מכשירי חשמל", a description, price 0 shown as "למסירה" before and after publishing
    await seller.goto('/marketplace/new');
    await main(seller).getByLabel('כותרת', { exact: true }).fill(title);
    await main(seller).getByLabel('קטגוריה', { exact: true }).selectOption({ label: 'מכשירי חשמל' });
    await main(seller).getByLabel('מצב', { exact: true }).selectOption('good');
    await main(seller).getByLabel(/^מחיר/).fill('0');
    await expect(main(seller).getByText('המודעה תוצג "למסירה"')).toBeVisible();
    await main(seller).getByLabel('עיר או אזור', { exact: true }).selectOption('center');
    await main(seller).getByLabel(/^תיאור/).fill('עובד מצוין, עם הקופסה המקורית.');
    const [created] = await Promise.all([
      seller.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/marketplace/listings', { timeout: ANSWER_MS }),
      main(seller).getByRole('button', { name: 'פרסום', exact: true }).click(),
    ]);
    expect(created.status(), 'POST /api/marketplace/listings status').toBe(201);
    await expect(seller).toHaveURL(/\/marketplace\/[0-9a-f-]{36}$/, { timeout: ANSWER_MS });
    const listingUrl = new URL(seller.url()).pathname;
    await expect(main(seller).getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(main(seller).getByText('למסירה').first()).toBeVisible();

    // the Professional: "חנות" from its menu, view and contact only (§10.5)
    await signUpProfessional(pro, generateTestUser(runId(), runAttempt()));
    await pro.getByRole('button', { name: 'פתיחת התפריט' }).click();
    await pro.getByRole('dialog', { name: 'תפריט' }).getByRole('link', { name: 'חנות', exact: true }).click();
    await expect(pro).toHaveURL(/\/marketplace$/);
    await expect(main(pro).getByText('פרסום מודעות פתוח לחשבונות הורים בלבד')).toBeVisible({ timeout: ANSWER_MS });
    await expect(main(pro).getByRole('link', { name: 'פרסום מודעה' })).toHaveCount(0);
    await searchAsReader(pro, title);
    const results = main(pro).getByRole('list', { name: 'מודעות' });
    await expect(results.getByRole('link', { name: title })).toBeVisible();
    await expect(results).toContainText('למסירה');
    await results.getByRole('link', { name: title }).click();
    await expect(main(pro).getByRole('region', { name: 'תיאור' })).toContainText('עובד מצוין, עם הקופסה המקורית.', { timeout: ANSWER_MS });
    const [contacted] = await Promise.all([
      pro.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/marketplace\/listings\/[0-9a-f-]{36}\/contact$/.test(new URL(r.url()).pathname), { timeout: ANSWER_MS }),
      main(pro).getByRole('button', { name: 'שליחת הודעה' }).click(),
    ]);
    expect(contacted.status(), 'a Professional contacts a seller (AC-059)').toBe(200);
    await expect(pro).toHaveURL(/\/chat\/[0-9a-f-]{36}$/, { timeout: ANSWER_MS });

    // the seller marks it sold: it leaves the Marketplace and stays in "המודעות שלי"
    await seller.goto(listingUrl);
    await main(seller).getByRole('button', { name: 'סימון "נמכר/נמסר"' }).click();
    await expect(main(seller).getByRole('button', { name: 'החזרה למכירה' })).toBeVisible({ timeout: ANSWER_MS });
    await seller.goto('/marketplace/mine');
    await expect(main(seller).getByRole('list', { name: 'המודעות שלי' })).toContainText('נמכר/נמסר', { timeout: ANSWER_MS });
    await pro.goto('/marketplace');
    await searchAsReader(pro, title);
    await expect(main(pro).getByRole('link', { name: title })).toHaveCount(0);

    // and back, then deleted at once
    await seller.goto(listingUrl);
    await main(seller).getByRole('button', { name: 'החזרה למכירה' }).click();
    await expect(main(seller).getByRole('button', { name: 'סימון "נמכר/נמסר"' })).toBeVisible({ timeout: ANSWER_MS });
    await main(seller).getByRole('button', { name: 'מחיקת המודעה' }).click();
    // the confirmation is the shared ConfirmDialog: role alertdialog (as admin-guides.spec.ts and chat.spec.ts read it)
    await seller.getByRole('alertdialog', { name: 'למחוק את המודעה?' }).getByRole('button', { name: 'מחיקת המודעה' }).click();
    await expect(seller).toHaveURL(/\/marketplace\/mine$/, { timeout: ANSWER_MS });
    await expect(main(seller).getByText(title)).toHaveCount(0);
  } finally {
    await sellerContext.close();
    await proContext.close();
  }
});
