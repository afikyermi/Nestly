// I11 completion C on the real Preview (decisions-in-force §13.1-13.4, §11.10, §11.20-11.22): a Regular parent posts with no "asks for help" box
// (a named post and an anonymous one); a Professional sees "הצעת עזרה" on both, comments and likes the anonymous one, and offers once on each
// (the second time the post says "נשלחה הצעה"); the parent sees the offers, accepts one into a conversation; the Professional replies; the parent
// reviews, then edits the review ("נערכה"); another Regular user then reads the edited review and the rating with one decimal on the
// Professional's page; the Professional reports the review with its own four reasons. Fresh users (the cleanup sweep's email pattern), no
// recovery attempts.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { createBypassRouteHandler } from './support/bypass.ts';
import { createAccount } from './support/timed-steps.ts';
import { generateTestUser, type TestUser } from './support/test-user.ts';

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const passwordField = (page: Page) => page.getByLabel('סיסמה', { exact: true });
const main = (page: Page) => page.getByRole('main');

const runId = () => process.env['GITHUB_RUN_ID'] ?? '';
const runAttempt = () => process.env['GITHUB_RUN_ATTEMPT'] ?? '';

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
  await expect(page).toHaveURL(/\/feed$/);
}

async function signUpRegular(page: Page, name: string): Promise<void> {
  await page.goto('/register');
  await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
  await page.getByLabel(/^שם מלא/).fill(name);
  await page.getByRole('button', { name: 'המשך', exact: true }).click();
  await credentialsAndAnswers(page, generateTestUser(runId(), runAttempt()));
}

/** Publishes from the feed's composer and returns the new post's id (the 201's own answer). */
async function publish(page: Page, text: string, anonymous: boolean): Promise<string> {
  await page.goto('/feed');
  await main(page).getByLabel('מה תרצו לשתף?', { exact: true }).fill(text);
  if (anonymous) await main(page).getByRole('checkbox', { name: 'פרסום אנונימי' }).check();
  const created = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/posts' && r.request().method() === 'POST');
  await main(page).getByRole('button', { name: 'פרסום', exact: true }).click();
  const answer = await created;
  expect(answer.status(), 'POST /api/posts').toBe(201);
  const body: unknown = await answer.json();
  const id: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'id') : undefined;
  if (typeof id !== 'string') throw new Error('the new post has no id');
  return id;
}

async function offerOn(page: Page, postId: string, text: string): Promise<void> {
  await page.goto(`/posts/${postId}`);
  await main(page).getByRole('button', { name: 'הצעת עזרה', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'הצעת עזרה' });
  await sheet.getByLabel('ההודעה הראשונה', { exact: true }).fill(text);
  await sheet.getByRole('button', { name: 'שליחת ההצעה' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(main(page).getByText('נשלחה הצעה')).toBeVisible();
}

test('[I11-C FR-SERV-005/006/011 AC-169 AC-172 AC-173 AC-174] offer → accept → reply → review → edit, read by another user; the Professional reports it', async ({ browser, baseURL, bypassSecret }, info) => {
  test.setTimeout(6 * 60_000);
  if (baseURL === undefined) throw new Error('no baseURL');
  const origin = new URL(baseURL).origin;
  // three people at once, each in a context of its own with the deployment's bypass (as the fixture's own context has)
  const open = async () => {
    const context = await browser.newContext({ baseURL, viewport: info.project.use.viewport ?? null });
    await context.route(`${origin}/**`, createBypassRouteHandler(origin, bypassSecret));
    return context;
  };
  const parentContext = await open();
  const proContext = await open();
  const readerContext = await open();
  const parent = await parentContext.newPage();
  const pro = await proContext.newPage();
  const reader = await readerContext.newPage();
  try {
    await signUpRegular(parent, 'רינה מבקשת');
    await expect(main(parent).getByText('הפוסט מבקש עזרה מבעלי מקצוע')).toHaveCount(0);
    const named = await publish(parent, 'מחפשת ליווי לקראת הלידה, יש המלצות?', false);
    const anonymous = await publish(parent, 'שאלה אנונימית על הצירים הראשונים', true);

    await pro.goto('/register');
    await pro.getByRole('button', { name: 'נרשמים כבעלי מקצוע? להרשמה לחשבון מקצועי', exact: true }).click();
    await pro.getByLabel(/^שם מלא/).fill('דפנה דולה');
    await pro.getByLabel(/^תחום/).selectOption('doula');
    await pro.getByLabel(/^שנות ניסיון/).fill('6');
    await pro.getByRole('checkbox', { name: 'הצהרה: יש לי ההכשרה והרישיון הנדרשים בתחום שבחרתי' }).check();
    await pro.getByRole('button', { name: 'המשך', exact: true }).click();
    await credentialsAndAnswers(pro, generateTestUser(runId(), runAttempt()));
    // §11.20: the four tabs; "בקשות עזרה" from the home
    const nav = pro.getByRole('navigation', { name: 'ניווט ראשי' });
    expect((await nav.getByRole('link').allTextContents()).map((text) => text.split(/[\d,]/)[0])).toEqual(['בית', 'פיד', 'שיחות', 'פרופיל']);
    await pro.goto('/home');
    await expect(main(pro).getByText('הצעות עזרה היום: 0 מתוך 100')).toBeVisible();
    const own = await main(pro).getByRole('link', { name: 'צפייה בעמוד שלי' }).getAttribute('href');
    expect(own).toMatch(/^\/pros\/[0-9a-f-]{36}$/);
    const proPage = own ?? '';

    // §13.2: the Professional comments and likes the anonymous post, and offers on both; one per post
    await pro.goto(`/posts/${anonymous}`);
    await main(pro).getByRole('textbox', { name: 'כתיבת תגובה', exact: true }).fill('אפשר לנשום עמוק, אשמח לעזור');
    await main(pro).getByRole('button', { name: 'שליחה', exact: true }).click();
    await expect(main(pro).getByText('אפשר לנשום עמוק, אשמח לעזור')).toBeVisible();
    await main(pro).getByRole('button', { name: /^לייק/ }).first().click();
    await expect(main(pro).getByRole('button', { name: /^לייק, 1/ }).first()).toBeVisible();
    await offerOn(pro, anonymous, 'אני דולה, אשמח לענות על השאלות');
    await offerOn(pro, named, 'אני דולה עם 6 שנות ניסיון, אשמח ללוות');
    await pro.reload();
    await expect(main(pro).getByText('נשלחה הצעה')).toBeVisible();
    await expect(main(pro).getByRole('button', { name: 'הצעת עזרה', exact: true })).toHaveCount(0);

    // the parent sees both offers (the anonymous post's too) and accepts the one on the named post
    await parent.goto('/offers');
    const received = main(parent).getByRole('list', { name: 'הצעות שקיבלת' });
    await expect(received).toContainText('אני דולה, אשמח לענות על השאלות');
    const item = received.getByRole('listitem').filter({ hasText: 'אני דולה עם 6 שנות ניסיון, אשמח ללוות' });
    await item.getByRole('button', { name: 'אישור ופתיחת שיחה' }).click();
    await expect(parent).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
    const conversation = new URL(parent.url()).pathname;

    // the Professional replies in that conversation
    await pro.goto(conversation);
    await main(pro).getByLabel('הודעה', { exact: true }).fill('בשמחה, מתי נוח לדבר?');
    await main(pro).getByRole('button', { name: 'שליחה', exact: true }).click();
    await expect(main(pro).getByText('בשמחה, מתי נוח לדבר?')).toBeVisible();

    // §11.21: the parent reviews, then edits; the review shows "נערכה"
    await parent.goto(proPage);
    const form = main(parent).getByRole('form', { name: 'כתיבת ביקורת' });
    await form.getByLabel('דירוג', { exact: true }).selectOption('3');
    await form.getByLabel('הביקורת', { exact: true }).fill('נעימה ומקצועית');
    await form.getByRole('button', { name: 'פרסום הביקורת' }).click();
    const mine = main(parent).getByTestId('my-review');
    await expect(mine).toContainText('נעימה ומקצועית');
    await mine.getByRole('button', { name: 'עריכת הביקורת' }).click();
    const edit = main(parent).getByRole('form', { name: 'עריכת הביקורת' });
    await expect(edit.getByLabel('הביקורת', { exact: true })).toHaveValue('נעימה ומקצועית');
    await edit.getByLabel('דירוג', { exact: true }).selectOption('5');
    await edit.getByLabel('הביקורת', { exact: true }).fill('נעימה, מקצועית וזמינה');
    await edit.getByRole('button', { name: 'שמירת השינויים' }).click();
    await expect(main(parent).getByText('הביקורת עודכנה.')).toBeVisible();
    await expect(mine).toContainText('נערכה');

    // another Regular user reads the edited review and the rating with one decimal (§11.22); never who wrote it
    await signUpRegular(reader, 'נועה קוראת');
    await reader.goto(proPage);
    const reviews = main(reader).getByRole('list', { name: 'ביקורות' });
    await expect(reviews).toContainText('נעימה, מקצועית וזמינה');
    await expect(reviews).toContainText('נערכה');
    await expect(reviews).not.toContainText('רינה');
    await expect(main(reader).getByTestId('profile-rating')).toContainText('5.0');
    await expect(main(reader).getByRole('img', { name: 'דירוג 5.0 מתוך 5 · ביקורת אחת' })).toBeVisible();

    // §11.10: the Professional reports the review with its own four reasons
    await pro.goto(proPage);
    await main(pro).getByRole('button', { name: /^דיווח על הביקורת: נעימה, מקצועית/ }).click();
    await pro.getByRole('menuitem', { name: 'דיווח על הביקורת' }).click();
    const box = pro.getByRole('dialog', { name: 'דיווח על ביקורת' });
    await expect(box.getByRole('radio')).toHaveCount(4);
    for (const name of ['פוגענית', 'שקרית / בלי אינטראקציה', 'מידע אישי', 'אחר']) await expect(box.getByRole('radio', { name, exact: true })).toHaveCount(1);
    await box.getByText('שקרית / בלי אינטראקציה', { exact: true }).click();
    const filed = pro.waitForResponse((r) => new URL(r.url()).pathname === '/api/reports' && r.request().method() === 'POST');
    await box.getByRole('button', { name: 'שליחת הדיווח', exact: true }).click();
    expect((await filed).status(), 'POST /api/reports with a review reason').toBe(201);
    await expect(main(pro).getByText('הדיווח נשלח. הצוות יבדוק אותו')).toBeVisible();
  } finally {
    await parentContext.close();
    await proContext.close();
    await readerContext.close();
  }
});
