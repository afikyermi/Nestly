// Production bug 21.10.2026: Vercel's rewrite "/api/:path*" → "/api/index" adds a `path` query parameter, and every route that checks
// its query strictly answered 400 (trackers, notifications, the image upload). The local server and its stubs never pass through the
// rewrite, so only a real deployment shows it. A fresh user signs up, the feed's own bell request (no query of its own: Vercel adds one) must answer 200, and with that
// request's Authorization header the page calls the other strict-query routes through the deployment: none may answer 400.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { AFTER_ANSWERS_MS, createAccount } from './support/timed-steps.ts';
import { generateTestUser } from './support/test-user.ts';

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const passwordField = (page: Page) => page.getByLabel('סיסמה', { exact: true });

/** Today and a week before, as Israeli days (the server judges the period in Asia/Jerusalem). */
function week(): { from: string; to: string } {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
  const now = new Date();
  return { from: day(new Date(now.getTime() - 6 * 86_400_000)), to: day(now) };
}

test('[strict query] through the Vercel rewrite: notifications, tracker events, Support and the image upload accept their own query', async ({ page }) => {
  const u = generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');
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
  const bell = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/notifications' && r.request().method() === 'GET');
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/, { timeout: AFTER_ANSWERS_MS });

  const notifications = await bell;
  expect(notifications.status(), 'GET /api/notifications from the bell').toBe(200);
  const authorization = await notifications.request().headerValue('authorization');
  expect(authorization, 'the bell sends the session').toMatch(/^Bearer /);

  const { from, to } = week();
  const calls = await page.evaluate(
    async ({ auth, from: f, to: t }) => {
      const headers = { authorization: auth };
      const call = async (path: string, init: RequestInit = {}) => {
        const r = await fetch(path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
        return { path, status: r.status, body: await r.text() };
      };
      return [
        await call(`/api/trackers/events?kind=sleep&from=${f}&to=${t}`),
        await call('/api/support'),
        // Four bytes that are no image: past the query check the server answers 415 unsupported_image, never 400.
        await call('/api/media?kind=post', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: 'abcd' }),
      ];
    },
    { auth: authorization ?? '', from, to },
  );
  const [events, support, upload] = calls;
  expect(events?.status, events?.body).toBe(200);
  expect(support?.status, support?.body).toBe(200);
  expect(upload?.status, upload?.body).toBe(415);
  expect(upload?.body).toContain('unsupported_image');
});
