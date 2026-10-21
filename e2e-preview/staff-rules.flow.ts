// I14 completion B on the real Preview (Afik 21.10.2026 (b), decisions-in-force.md §10.1, §10.4, §10.9, §11.9): the staff's rules through the
// deployment and the real database.
//
// 1. Community side (always): A signs up and publishes a post; B, in another browser context, reports it with "אחר" and a 500-character text
//    (VAL-048: 501 is refused); the new strict queries pass Vercel's `path` parameter (#147): the children's trends by calendar period answer a
//    parent 403 (not 400), and a thread read with `?group=` answers 200.
// 2. Staff side (decision §10.1, a Moderator on the Preview only, created by the CI job and removed with the run): the Moderator opens the queue,
//    finds B's report and decides it justified; the post is then gone for B too (AC-159). Its sign-in comes from the file the CI job writes
//    (PREVIEW_E2E_STAFF_FILE: {"email","password"}); without it this part is skipped and says why. Never a real staff account.
import { readFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { createBypassRouteHandler } from './support/bypass.ts';
import { expect, test } from './support/fixtures.ts';
import { generateTestUser } from './support/test-user.ts';

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const passwordField = (page: Page) => page.getByLabel('סיסמה', { exact: true });

/** Signs a fresh Regular user up through /register and returns the Authorization header of its first request. */
async function signUp(page: Page, fullName: string): Promise<string> {
  const u = generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');
  await page.goto('/register');
  await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
  await page.getByLabel(/^שם מלא/).fill(fullName);
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
  const bell = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/notifications' && r.request().method() === 'GET');
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/);
  const authorization = (await (await bell).request().headerValue('authorization')) ?? '';
  expect(authorization).toMatch(/^Bearer /);
  return authorization;
}

interface Answer {
  status: number;
  body: string;
}
/** One API call from the page, with the user's Authorization header. */
async function api(page: Page, authorization: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<Answer> {
  return page.evaluate(
    async ({ auth, url, method, body }) => {
      const headers: Record<string, string> = { authorization: auth };
      if (body !== undefined) headers['content-type'] = 'application/json';
      const r = await fetch(url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: r.status, body: await r.text() };
    },
    { auth: authorization, url: path, method: init.method ?? 'GET', body: init.body },
  );
}

/** The staff sign-in the CI job wrote for this run, or null (then the staff part is skipped). */
function staffSignIn(): { email: string; password: string } | null {
  const file = process.env['PREVIEW_E2E_STAFF_FILE'];
  if (file === undefined || file === '') return null;
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof value !== 'object' || value === null) return null;
  const email: unknown = Reflect.get(value, 'email');
  const password: unknown = Reflect.get(value, 'password');
  return typeof email === 'string' && typeof password === 'string' ? { email, password } : null;
}

test('[F14.3-b AC-159 VAL-048 §11.9] a report reaches the staff on the Preview; a justified decision deletes the post for everyone', async ({ page, browser, baseURL, bypassSecret }) => {
  if (baseURL === undefined) throw new Error('preview-e2e: no baseURL');
  const origin = new URL(baseURL).origin;
  const contexts: BrowserContext[] = [];
  const open = async (): Promise<Page> => {
    const context = await browser.newContext({ baseURL });
    await context.route(`${origin}/**`, createBypassRouteHandler(origin, bypassSecret));
    contexts.push(context);
    return context.newPage();
  };
  try {
    // A publishes
    const authorA = await signUp(page, 'אורית כותבת');
    const made = await api(page, authorA, '/api/posts', { method: 'POST', body: { body: `פוסט לבדיקת כללי הצוות ${Date.now()}`, audience: 'everyone' } });
    expect(made.status, made.body).toBe(201);
    const created: unknown = JSON.parse(made.body);
    const postId = typeof created === 'object' && created !== null ? String(Reflect.get(created, 'id')) : '';
    expect(postId).toMatch(/^[0-9a-f-]{36}$/);

    // B reports it: "אחר" with 500 characters (§11.9); 501 is refused
    const pageB = await open();
    const authorB = await signUp(pageB, 'בתיה מדווחת');
    const tooLong = await api(pageB, authorB, '/api/reports', { method: 'POST', body: { targetKind: 'post', targetId: postId, reason: 'other', details: 'א'.repeat(501) } });
    expect(tooLong.status, tooLong.body).toBe(400);
    const reported = await api(pageB, authorB, '/api/reports', { method: 'POST', body: { targetKind: 'post', targetId: postId, reason: 'other', details: 'א'.repeat(500) } });
    expect(reported.status, reported.body).toBe(201);

    // the new strict queries through Vercel's rewrite (#147)
    const trends = await api(pageB, authorB, '/api/admin/child-trends?metric=bottle&field=amount_ml&dimension=child_sex&period=this_month');
    expect(trends.status, trends.body).toBe(403);
    const thread = await api(page, authorA, `/api/posts/${postId}/comments?group=00000000-0000-4000-8000-000000000000`);
    expect(thread.status, thread.body).toBe(200);

    // the staff side: a Moderator of this run (decision §10.1)
    const staff = staffSignIn();
    if (staff === null) {
      // the community part above passed; the staff part waits for the CI step (WORKPLAN "ממתין לך")
      test.info().annotations.push({ type: 'staff part not run', description: 'no test Moderator on this Preview run (PREVIEW_E2E_STAFF_FILE)' });
      return;
    }
    const pageM = await open();
    await pageM.goto('/login');
    await emailField(pageM).fill(staff.email);
    await passwordField(pageM).fill(staff.password);
    await pageM.getByRole('button', { name: 'התחברות', exact: true }).click();
    await expect(pageM).toHaveURL(/\/admin/);
    // straight to this run's item (the "next in queue" address)
    await pageM.goto(`/admin/reports?target=post:${postId}`);
    await expect(pageM.getByRole('heading', { name: /פרטי הדיווח/ })).toBeVisible();
    const actions = pageM.getByRole('group', { name: 'טיפול' });
    await actions.getByLabel('סיבה (נרשמת ביומן)').fill('בדיקה אוטומטית של כללי הצוות');
    await actions.getByRole('button', { name: 'דיווח מוצדק: מחיקת התוכן' }).click();
    await expect(pageM.getByText('הדיווח נסגר')).toBeVisible();

    // the result from the other side: A's post is gone, for A too
    const gone = await api(page, authorA, `/api/posts/${postId}`);
    expect(gone.status, gone.body).toBe(404);
  } finally {
    for (const context of contexts) await context.close();
  }
});
