// I9 part 1 on the real Preview (FR-SET-002, BR-073, PG-050, PG-060, VAL-052, AC-108): the account deletion through the deployment, the real
// Auth and the real database, checked from another user's side.
//   A signs up and publishes a post; B, in another browser context, reads it. A deletes the account from Settings (the box and the password,
//   checked with Auth as a separate sign-in): signed out, the login screen gives the date. B no longer reads the post. A signs in again: held
//   on PG-050 with the date, every other path leads back there; "ביטול המחיקה" opens the feed, and B reads the post again.
// The execution at day 30 is pgTAP's (file 110) and tests/db/account-deletion.db.test.ts. Users only through the app; the cleanup sweeps them.
import type { BrowserContext, Page } from '@playwright/test';
import { createBypassRouteHandler } from './support/bypass.ts';
import { expect, test } from './support/fixtures.ts';
import { generateTestUser, type TestUser } from './support/test-user.ts';

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const passwordField = (page: Page) => page.getByLabel('סיסמה', { exact: true });
/** A Preview can take 10 s or more to sign in (a cold server function). */
const SLOW = 45_000;

/** Signs a fresh Regular user up through /register; returns it and the Authorization header of its first request. */
async function signUp(page: Page, fullName: string): Promise<{ user: TestUser; authorization: string }> {
  const user = generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');
  await page.goto('/register');
  await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
  await page.getByLabel(/^שם מלא/).fill(fullName);
  await page.getByRole('button', { name: 'המשך', exact: true }).click();
  await emailField(page).fill(user.email);
  await passwordField(page).fill(user.password);
  const box = page.getByRole('checkbox', { name: /אישור תנאי השימוש/ });
  await box.focus();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
  await page.getByRole('button', { name: 'יצירת חשבון', exact: true }).click();
  await expect(page).toHaveURL(/\/recovery-questions$/, { timeout: SLOW });
  await page.getByLabel(/חיית המחמד/).fill(user.answers.pet);
  await page.getByLabel(/כינו אתכם/).fill(user.answers.nickname);
  const bell = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/notifications' && r.request().method() === 'GET', { timeout: SLOW });
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/, { timeout: SLOW });
  const authorization = (await (await bell).request().headerValue('authorization')) ?? '';
  expect(authorization).toMatch(/^Bearer /);
  return { user, authorization };
}

/** One API call from the page, with the user's Authorization header; the status only. */
async function status(page: Page, authorization: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<number> {
  return page.evaluate(
    async ({ auth, url, method, body }) => {
      const headers: Record<string, string> = { authorization: auth };
      if (body !== undefined) headers['content-type'] = 'application/json';
      const r = await fetch(url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return r.status;
    },
    { auth: authorization, url: path, method: init.method ?? 'GET', body: init.body },
  );
}

async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await emailField(page).fill(user.email);
  await passwordField(page).fill(user.password);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: SLOW });
}

test('[I9 FR-SET-002 PG-050 AC-108] a deletion request hides the account from another user; the cancel at PG-050 brings it back', async ({ page, browser, baseURL, bypassSecret }) => {
  test.setTimeout(300_000); // two real sign-ups, three sign-ins and a password check on a cold Preview
  if (baseURL === undefined) throw new Error('preview-e2e: no baseURL');
  const origin = new URL(baseURL).origin;
  const contexts: BrowserContext[] = [];
  try {
    // A publishes
    const a = await signUp(page, 'נועה עוזבת');
    const made = await page.evaluate(
      async ({ auth }) => {
        const r = await fetch('/api/posts', { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ body: `פוסט לבדיקת מחיקת חשבון ${Date.now()}`, audience: 'everyone' }) });
        return { status: r.status, body: await r.text() };
      },
      { auth: a.authorization },
    );
    expect(made.status, 'A publishes').toBe(201);
    const created: unknown = JSON.parse(made.body);
    const id: unknown = typeof created === 'object' && created !== null ? Reflect.get(created, 'id') : undefined;
    const postId = typeof id === 'string' ? id : '';
    expect(postId).toMatch(/^[0-9a-f-]{36}$/);

    // B reads it
    const context = await browser.newContext({ baseURL });
    await context.route(`${origin}/**`, createBypassRouteHandler(origin, bypassSecret));
    contexts.push(context);
    const pageB = await context.newPage();
    const b = await signUp(pageB, 'טל נשארת');
    expect(await status(pageB, b.authorization, `/api/posts/${postId}`), 'B reads A\'s post').toBe(200);

    // A deletes the account from Settings: the box and the password
    await page.goto('/settings#account');
    await page.getByRole('link', { name: 'מחיקת חשבון', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'מחיקת חשבון' })).toBeVisible({ timeout: SLOW });
    await page.getByRole('checkbox', { name: /החשבון וכל התוכן יימחקו לצמיתות/ }).check();
    await passwordField(page).fill(a.user.password);
    const [requested] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/account/deletion', { timeout: SLOW }),
      page.getByRole('button', { name: 'מחיקת החשבון', exact: true }).click(),
    ]);
    expect(requested.status(), 'the deletion request').toBe(200);
    await expect(page).toHaveURL(/\/login$/, { timeout: SLOW });
    await expect(page.getByRole('status').filter({ hasText: 'אפשר להתחבר ולבטל את המחיקה' })).toBeVisible();

    // AC-108: nobody else sees the account's content
    expect(await status(pageB, b.authorization, `/api/posts/${postId}`), 'B no longer reads A\'s post').not.toBe(200);

    // PG-050: A signs in and is held there with the date; nothing else opens
    await signIn(page, a.user);
    await expect(page).toHaveURL(/\/account\/scheduled-deletion$/, { timeout: SLOW });
    await expect(page.getByRole('heading', { level: 1, name: 'החשבון שלך מתוזמן למחיקה' })).toBeVisible();
    await expect(page.getByText(/החשבון שלך מתוזמן למחיקה ב-\d{1,2} ב\S+ \d{4}\./)).toBeVisible({ timeout: SLOW });
    await page.goto('/feed');
    await expect(page).toHaveURL(/\/account\/scheduled-deletion$/, { timeout: SLOW });

    // the cancel brings the account and its content back
    const [cancelled] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/account/deletion/cancel', { timeout: SLOW }),
      page.getByRole('button', { name: 'ביטול המחיקה', exact: true }).click(),
    ]);
    expect(cancelled.status(), 'the cancel').toBe(200);
    await expect(page).toHaveURL(/\/feed$/, { timeout: SLOW });
    expect(await status(pageB, b.authorization, `/api/posts/${postId}`), 'B reads A\'s post again').toBe(200);
  } finally {
    for (const context of contexts) await context.close();
  }
});
