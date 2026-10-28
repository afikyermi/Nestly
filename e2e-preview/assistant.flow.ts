// The Nestly assistant on a real Preview (Afik 28.10.2026; FR-AI-001, AC-211, AC-212, ERR-055): a fresh Regular user opens the bubble and sends one
// example question, and the real answer comes back from Google through the deployed server. This is the one real call to Google of a run (CI
// never calls it: its tests use a stand-in). The time from the press to the answer is printed, so the 10-second limit can be judged on the
// Preview. Skipped, with the reason, where the assistant is not deployed yet (the route answers 404) or the Preview has no service key.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { AFTER_ANSWERS_MS, createAccount } from './support/timed-steps.ts';
import { generateTestUser } from './support/test-user.ts';

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const passwordField = (page: Page) => page.getByLabel('סיסמה', { exact: true });
const QUESTION = 'מה כדאי לדעת לפני שמתחילים לנסות להיכנס להריון?';

test('[FR-AI-001 AC-212] a Regular user asks the assistant one example question and gets a real answer', async ({ page }) => {
  test.setTimeout(180_000);
  const u = generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');
  await page.goto('/register');
  await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
  await page.getByLabel(/^שם מלא/).fill('נועה לוי');
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
  const bell = page.waitForResponse((r) => ['/api/notifications', '/api/notifications/counts'].includes(new URL(r.url()).pathname) && r.request().method() === 'GET');
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/, { timeout: AFTER_ANSWERS_MS });

  // Is the assistant deployed here, and does it have its key? Asked with the session the bell already sent.
  const authorization = (await (await bell).request().headerValue('authorization')) ?? '';
  const status = await page.evaluate(async (auth) => {
    const r = await fetch('/api/assistant', { headers: { authorization: auth } });
    return { code: r.status, body: await r.text() };
  }, authorization);
  test.skip(status.code === 404, 'the assistant is not deployed on this Preview');
  expect(status.code, status.body).toBe(200);
  test.skip(status.body.includes('"available":false'), 'this Preview has no GEMINI_API_KEY');

  const bubble = page.getByRole('button', { name: 'פתיחת העוזר של Nestly', exact: true });
  await expect(bubble).toBeVisible({ timeout: 30_000 });
  await bubble.click();
  const dialog = page.getByRole('dialog', { name: 'העוזר של Nestly' });
  await expect(dialog.getByText('ההודעות נשלחות לשירות של Google לעיבוד. לא נשלח מידע מהחשבון שלכם.')).toBeVisible();

  const answered = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/assistant' && r.request().method() === 'POST', { timeout: 60_000 });
  const started = Date.now();
  await dialog.getByRole('button', { name: QUESTION, exact: true }).click();
  const response = await answered;
  const ms = Date.now() - started;
  const timing = response.headers()['server-timing'] ?? '';
  console.log(`assistant: POST /api/assistant answered ${response.status()} in ${ms} ms${timing === '' ? '' : ` (server-timing: ${timing})`}`);
  test.info().annotations.push({ type: 'assistant-ms', description: String(ms) });
  expect(response.status(), 'the real answer (503 = the service failed, was slow or out of quota)').toBe(200);
  const answer = dialog.getByTestId('assistant-answer');
  await expect(answer).toBeVisible();
  expect(((await answer.textContent()) ?? '').trim().length).toBeGreaterThan(20);
});
