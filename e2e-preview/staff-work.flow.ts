// I14 completion on the real Preview (Afik 21.10.2026, decisions-in-force.md §9): what a community account sees of the staff's work, through the
// deployment and the real database. A fresh Regular user signs up: /home stays the parent's home (not the admin area); the staff's endpoints —
// "my work", the Admin's home, escalation and the children's trends (CHILD_DATA_VIEW, audited) — answer 403 to it, and the Audit Log's
// sensitive view too. The staff side of the flow (an Admin's or a Moderator's home, the review feed) needs a TEST staff account on the Preview,
// which only Afik can create there (see the PR body): until then this flow covers the community side only.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { createAccount } from './support/timed-steps.ts';
import { generateTestUser } from './support/test-user.ts';

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const passwordField = (page: Page) => page.getByLabel('סיסמה', { exact: true });

test('[I14 completion] a community account keeps its home and is refused every staff endpoint on the Preview', async ({ page }) => {
  const u = generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');
  await page.goto('/register');
  await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
  await page.getByLabel(/^שם מלא/).fill('נעמה בודקת');
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
  await expect(page).toHaveURL(/\/feed$/);
  const authorization = (await (await bell).request().headerValue('authorization')) ?? '';
  expect(authorization).toMatch(/^Bearer /);

  // §9.6: /home by role: a parent keeps the parent's home
  await page.goto('/home');
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).not.toHaveText('ניהול');

  const calls = await page.evaluate(async (auth) => {
    const call = async (path: string, init: RequestInit = {}) => {
      const r = await fetch(path, { ...init, headers: { authorization: auth, ...(init.headers ?? {}) } });
      return { path, status: r.status, body: await r.text() };
    };
    return [
      await call('/api/admin/my-work'),
      await call('/api/admin/overview'),
      await call('/api/admin/child-trends?metric=bottle&field=amount_ml&dimension=child_sex&period=this_month'),
      await call('/api/admin/reports/escalate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetKind: 'user', targetId: '00000000-0000-4000-8000-000000000000', note: 'בדיקה' }),
      }),
      await call('/api/admin/audit?sensitive=true'),
    ];
  }, authorization);
  for (const result of calls) {
    expect(result.status, `${result.path}: ${result.body}`).toBe(403);
    expect(result.body).toContain('forbidden');
  }
});
