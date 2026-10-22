// I13 Monetization on the real Preview (FR-MKT-004, FR-ALG-007, NFR-SEC-007, AC-098; Afik 21.10.2026 §11.3, §11.5): a fresh Regular publishes a
// listing and promotes it from "המודעות שלי" with a simulated payment of a sample price; a second fresh Regular searches the Marketplace and finds it
// at the top, apart from the organic list, marked "מודעה מקודמת" (the action checked from another user's side). A Professional's profile promotion is
// the second test (below). The staff stop and the settings
// are covered by tests/db/promotions.db.test.ts and pgTAP 104. Users are made through the app (the cleanup covers their listings, promotions,
// payments and events). No recovery attempts are made.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { generateTestUser, type TestUser } from './support/test-user.ts';

const main = (page: Page) => page.getByRole('main');
/** A Preview can take 10 s or more to sign a user up or in (a cold server function): every sign-up step waits this long. */
const SLOW = 45_000;
const fresh = (): TestUser => generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');

async function signUp(page: Page, u: TestUser, fullName: string): Promise<void> {
  await page.goto('/register');
  await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
  await page.getByLabel(/^שם מלא/).fill(fullName);
  await page.getByRole('button', { name: 'המשך', exact: true }).click();
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(u.email);
  await page.getByLabel('סיסמה', { exact: true }).fill(u.password);
  const box = page.getByRole('checkbox', { name: /אישור תנאי השימוש/ });
  await box.focus();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
  await page.getByRole('button', { name: 'יצירת חשבון', exact: true }).click();
  await expect(page).toHaveURL(/\/recovery-questions$/, { timeout: SLOW });
  await page.getByLabel(/חיית המחמד/).fill(u.answers.pet);
  await page.getByLabel(/כינו אתכם/).fill(u.answers.nickname);
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/, { timeout: SLOW });
}

test.describe.serial('I13 Monetization on the Preview [FR-MKT-004 FR-ALG-007 NFR-SEC-007]', () => {
  test('a Regular promotes its listing with a simulated payment; another Regular finds it at the top, marked "מודעה מקודמת"', async ({ page }, info) => {
    test.setTimeout(240_000); // three sign-ups on a Preview that may be cold
    const seller = fresh();
    const title = `מנשא לקידום ${/-([0-9a-f]{16})@/.exec(seller.email)?.[1] ?? info.project.name}`;
    await signUp(page, seller, 'שירה מקדמת');

    await page.goto('/marketplace/new');
    await main(page).getByLabel('כותרת', { exact: true }).fill(title);
    await main(page).getByLabel('קטגוריה', { exact: true }).selectOption('feeding');
    await main(page).getByLabel('מצב', { exact: true }).selectOption('good');
    await main(page).getByRole('checkbox', { name: 'למסירה, בלי מחיר' }).check();
    await main(page).getByLabel('עיר או אזור', { exact: true }).selectOption('center');
    const [created] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/marketplace/listings'),
      main(page).getByRole('button', { name: 'פרסום', exact: true }).click(),
    ]);
    expect(created.status(), 'POST /api/marketplace/listings status').toBe(201);

    await page.goto('/marketplace/mine');
    const mine = main(page).getByRole('list', { name: 'המודעות שלי' });
    await mine.getByRole('button', { name: 'קידום המודעה' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'קידום המודעה' });
    await expect(dialog).toContainText('התשלום מדומה');
    const [bought] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/promotions'),
      dialog.getByRole('button', { name: 'אישור התשלום' }).click(),
    ]);
    expect(bought.status(), 'POST /api/promotions status').toBe(201);
    // AC-098: the request names the plan and the target only, never an amount or a card
    const sentBody: unknown = bought.request().postDataJSON();
    expect(typeof sentBody === 'object' && sentBody !== null ? Object.keys(sentBody).sort() : []).toEqual(['planKey', 'target']);
    await expect(mine).toContainText('המודעה מקודמת');

    // the other side: a second fresh Regular (the seller's session is dropped from this browser first)
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await signUp(page, fresh(), 'ורד מחפשת');
    await page.goto('/marketplace');
    await main(page).getByLabel('חיפוש מוצר', { exact: true }).fill(title);
    await main(page).getByRole('button', { name: 'הצגה', exact: true }).click();
    const promoted = main(page).getByRole('list', { name: 'מודעות מקודמות' });
    await expect(promoted.getByRole('link', { name: title })).toBeVisible();
    await expect(promoted).toContainText('מודעה מקודמת');
  });
});

// FR-SERV-010, FR-PRO-002, FR-ALG-007, BR-005 (§11.5): a fresh Professional buys a profile promotion; a fresh Regular finds it on the Directory,
// apart from the organic list and marked "ממומן", and opens it; the Professional then sees the impression and the click as counts only. Each
// viewport uses its own field, so the two runs of this flow never compete for the Directory's one promoted slot.
const PRO_BY_PROJECT: Readonly<Record<string, { readonly name: string; readonly field: string }>> = {
  'mobile-375': { name: 'מיכל קלינאית', field: 'speech' },
  'desktop-1280': { name: 'נועה צלמת', field: 'photography' },
};

async function signUpProfessional(page: Page, u: TestUser, fullName: string, field: string): Promise<void> {
  await page.goto('/register');
  await page.getByRole('button', { name: 'נרשמים כבעלי מקצוע? להרשמה לחשבון מקצועי', exact: true }).click();
  await page.getByLabel(/^שם מלא/).fill(fullName);
  await page.getByLabel(/^תחום/).selectOption(field);
  await page.getByLabel(/^שנות ניסיון/).fill('6');
  await page.getByRole('checkbox', { name: 'הצהרה: יש לי ההכשרה והרישיון הנדרשים בתחום שבחרתי' }).check();
  await page.getByRole('button', { name: 'המשך', exact: true }).click();
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(u.email);
  await page.getByLabel('סיסמה', { exact: true }).fill(u.password);
  const box = page.getByRole('checkbox', { name: /אישור תנאי השימוש/ });
  await box.focus();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
  await page.getByRole('button', { name: 'יצירת חשבון', exact: true }).click();
  await expect(page).toHaveURL(/\/recovery-questions$/, { timeout: SLOW });
  await page.getByLabel(/חיית המחמד/).fill(u.answers.pet);
  await page.getByLabel(/כינו אתכם/).fill(u.answers.nickname);
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/, { timeout: SLOW });
}

async function signOut(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

test.describe.serial('I13 Professional promotion on the Preview [FR-SERV-010 FR-PRO-002 FR-ALG-007 BR-005]', () => {
  test('a Professional promotes its profile; a Regular sees it marked "ממומן" and opens it; the Professional sees the counts', async ({ page }, info) => {
    test.setTimeout(240_000); // three sign-ups on a Preview that may be cold
    const pro = PRO_BY_PROJECT[info.project.name] ?? { name: 'נועה צלמת', field: 'photography' };
    const proUser = fresh();
    await signUpProfessional(page, proUser, pro.name, pro.field);

    await page.goto('/pro/promotion');
    await expect(main(page).getByText('התשלום מדומה: לא נגבה כסף ולא נדרשים פרטי כרטיס.').first()).toBeVisible();
    await expect(main(page).getByLabel('משך הקידום', { exact: true })).toContainText('מחיר לדוגמה');
    await main(page).getByRole('button', { name: 'לתשלום ולהפעלת הקידום' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'אישור תשלום מדומה' });
    const [bought] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/promotions'),
      dialog.getByRole('button', { name: 'אישור התשלום' }).click(),
    ]);
    expect(bought.status(), 'POST /api/promotions status').toBe(201);
    await expect(main(page).getByRole('list', { name: 'הקידומים שלי' })).toContainText('פעיל');

    // the other side: a fresh Regular on the Directory, filtered to the Professional's field
    await signOut(page);
    await signUp(page, fresh(), 'יעל מחפשת');
    await page.goto('/services');
    await main(page).getByLabel('תחום', { exact: true }).selectOption(pro.field);
    await main(page).getByRole('button', { name: 'הצגת תוצאות', exact: true }).click();
    const promoted = main(page).getByRole('list', { name: 'בעלי מקצוע ממומנים' });
    await expect(promoted.getByRole('link', { name: pro.name })).toBeVisible();
    await expect(promoted).toContainText('ממומן');
    await expect(main(page).getByRole('list', { name: 'תוצאות' })).not.toContainText(pro.name); // BR-004: never also in the organic list
    const [clicked] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && /^\/api\/promotions\/[0-9a-f-]{36}\/click$/.test(new URL(r.url()).pathname)),
      promoted.getByRole('link', { name: pro.name }).click(),
    ]);
    expect(clicked.status(), 'POST /api/promotions/:id/click status').toBeLessThan(300);

    // the result: the Professional sees the impression and the click, counts only (FR-PRO-002, AC-072)
    await signOut(page);
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(proUser.email);
    await page.getByLabel('סיסמה', { exact: true }).fill(proUser.password);
    await page.getByRole('button', { name: 'התחברות', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login$/, { timeout: SLOW });
    await page.goto('/pro/promotion');
    await expect(main(page).getByRole('list', { name: 'הקידומים שלי' })).toContainText(/[1-9]\d* חשיפות · [1-9]\d* לחיצות/);
    await expect(main(page).getByRole('heading', { name: 'מקידום בתשלום' })).toBeVisible();

    // TODO(I13 §11.1, WORKPLAN "ממתין לך" 1): the staff step — an Admin or a Moderator with CONTENT_MODERATE stops this promotion with a reason,
    // then the Professional sees "הקידום הופסק" (no refund). It needs a staff test user on the Preview, created by the CI job with the cleanup
    // credential (e2e-preview/README.md); that is waiting on Afik. Until then the stop is covered by tests/db/promotions.db.test.ts, pgTAP 104
    // and e2e/promotions.spec.ts. Never fake it here with a real staff account or one made through the app.
  });
});
