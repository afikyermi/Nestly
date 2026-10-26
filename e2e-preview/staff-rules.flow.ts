// I14 completion B on the real Preview (Afik 21.10.2026 (b), decisions-in-force.md §10.1, §10.4, §10.9, §11.9): the staff's rules through the
// deployment and the real database.
//
// 1. Community side (always): A signs up and publishes a post; B, in another browser context, reports it with "אחר" and a 500-character text
//    (VAL-048: 501 is refused); the new strict queries pass Vercel's `path` parameter (#147): the children's trends by calendar period answer a
//    parent 403 (not 400), and a thread read with `?group=` answers 200.
// 2. Staff side (decision §10.1; Afik 23.10.2026): the temporary Preview Moderator of this run and project (`staffUser`, written by the
//    trusted-main CI step "Prepare temporary Preview Moderators", REPORTS_VIEW + CONTENT_MODERATE, removed by the cleanup) opens B's report
//    and decides it justified; the post is then gone, for its author too (AC-159). Never a real staff account.
import type { BrowserContext, Page } from '@playwright/test';
import { createBypassRouteHandler } from './support/bypass.ts';
import { expect, test } from './support/fixtures.ts';
import { generateTestUser, type TestUser } from './support/test-user.ts';
import { AFTER_ANSWERS_MS, createAccount, SIGN_IN_MS, submitSignIn } from './support/timed-steps.ts';

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
  await createAccount(page); // both sign-up calls, up to 30 s each, as every other flow's sign-up
  await expect(page).toHaveURL(/\/recovery-questions$/);
  await page.getByLabel(/חיית המחמד/).fill(u.answers.pet);
  await page.getByLabel(/כינו אתכם/).fill(u.answers.nickname);
  // the bell's first request: the list on mount, or its light poll (/counts) when the list loaded before this wait (PR #241)
  const bell = page.waitForResponse((r) => ['/api/notifications', '/api/notifications/counts'].includes(new URL(r.url()).pathname) && r.request().method() === 'GET');
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/, { timeout: AFTER_ANSWERS_MS });
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

/** A Preview can take 10 s or more to sign in (a cold server function). */
const SLOW = 45_000;

/**
 * Signs the run's temporary Moderator in and opens `path`, waiting for `ready`. The first sign-in of the run meets the recovery-question gate
 * (completed through the app, as monetization.flow does); a later one (another flow of the same project signed it in first) goes straight on.
 */
async function openAsStaff(page: Page, staff: TestUser, path: string, ready: (page: Page) => ReturnType<Page['getByRole']>): Promise<void> {
  await page.goto('/login');
  await emailField(page).fill(staff.email);
  await passwordField(page).fill(staff.password);
  await submitSignIn(page);
  await expect(page).not.toHaveURL(/\/login$/, { timeout: SIGN_IN_MS });
  await page.goto(path);
  const gate = page.getByLabel(/חיית המחמד/);
  await expect(ready(page).or(gate)).toBeVisible({ timeout: SLOW });
  if (await gate.isVisible()) {
    await gate.fill(staff.answers.pet);
    await page.getByLabel(/כינו אתכם/).fill(staff.answers.nickname);
    await page.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(page).not.toHaveURL(/\/recovery-questions$/, { timeout: SLOW });
    await page.goto(path);
    await expect(ready(page)).toBeVisible({ timeout: SLOW });
  }
}

test('[F14.3-b AC-159 VAL-048 §11.9] a report reaches the staff on the Preview; a justified decision deletes the post for everyone', async ({ page, browser, baseURL, bypassSecret, staffUser }) => {
  test.setTimeout(240_000); // three real sign-ups/sign-ins on a cold Preview
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

    // the staff side: the temporary Moderator of this run (decision §10.1, Afik 23.10.2026)
    const pageM = await open();
    // straight to this run's item (the "next in queue" address)
    await openAsStaff(pageM, staffUser, `/admin/reports?target=post:${postId}`, (p) => p.getByRole('heading', { name: /פרטי הדיווח/ }));
    const actions = pageM.getByRole('group', { name: 'טיפול' });
    await actions.getByLabel('סיבה (נרשמת ביומן)').fill('בדיקה אוטומטית של כללי הצוות');
    await actions.getByRole('button', { name: 'דיווח מוצדק: מחיקת התוכן' }).click();
    await expect(pageM.getByText('הדיווח נסגר')).toBeVisible();

    // the result from the other side: A's post is gone, for A too
    const gone = await api(page, authorA, `/api/posts/${postId}`);
    expect(gone.status, gone.body).toBe(404);
    const goneForB = await api(pageB, authorB, `/api/posts/${postId}`);
    expect(goneForB.status, goneForB.body).toBe(404);
  } finally {
    for (const context of contexts) await context.close();
  }
});
