// F1.8 P3 on the real Preview (Gate 3, automated part, criterion 19). Expected texts and URLs come from
// .work/google-sign-in/spec.md criteria 3, 4, 5, 16, 17 and 19 only. No real Google credentials: the authorize request is
// intercepted and aborted, so no Google page loads; the return URLs are opened by hand with fake parameters.
import type { Page, Request } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';

const AUTHORIZE = 'https://xmihorrkegrdlbhpktny.supabase.co/auth/v1/authorize';
const GOOGLE = 'המשך עם Google';
const FAIL = 'לא הצלחנו להשלים את הכניסה עם Google. אפשר לנסות שוב, או להתחבר עם אימייל וסיסמה.';
const CANCEL = 'הכניסה עם Google בוטלה. אפשר לנסות שוב, או להתחבר עם אימייל וסיסמה.';
const SESSION_KEY = 'nestly-auth';

/** Aborts every request to the authorize endpoint and records it, so the Google page never loads. */
async function interceptAuthorize(page: Page): Promise<Request[]> {
  const seen: Request[] = [];
  await page.route(`${AUTHORIZE}**`, async (route) => {
    seen.push(route.request());
    await route.abort('aborted');
  });
  return seen;
}

const storageKeys = (page: Page): Promise<string[]> => page.evaluate(() => Object.keys(window.localStorage));

const SCREENS: Array<[string, (page: Page) => Promise<void>]> = [
  ['Welcome', async (page) => void (await page.goto('/'))],
  ['Login', async (page) => void (await page.goto('/login'))],
  ['Register step 1', async (page) => void (await page.goto('/register'))],
];

test.describe('F1.8 P3 on the Preview [google-sign-in c19 · c16 c17]', () => {
  for (const [name, open] of SCREENS) {
    test(`[c19 · c16 c17] ${name}: "${GOOGLE}" requests the authorize URL with provider=google and redirect_to the Preview /auth/google`, async ({ page, baseURL }) => {
      const requests = await interceptAuthorize(page);
      await open(page);
      await page.getByRole('button', { name: GOOGLE, exact: true }).click();
      await expect.poll(() => requests.length).toBeGreaterThanOrEqual(1);
      const url = new URL(requests[0]?.url() ?? '');
      expect(`${url.origin}${url.pathname}`).toBe(AUTHORIZE);
      expect(url.searchParams.get('provider')).toBe('google');
      expect(url.searchParams.get('redirect_to')).toBe(`${new URL(baseURL ?? '').origin}/auth/google`);
    });
  }

  test('[c19 · c17] a double press requests the authorize URL once', async ({ page }) => {
    const requests = await interceptAuthorize(page);
    await page.goto('/login');
    await page.getByRole('button', { name: GOOGLE, exact: true }).dblclick();
    await expect.poll(() => requests.length).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(1000);
    expect(requests).toHaveLength(1);
  });

  const returns: Array<[string, string, string]> = [
    ['[c3] a provider error with a description', '?error=server_error&error_description=%3Cimg%20src%3Dx%3E', FAIL],
    ['[c3] no code and no error', '', FAIL],
    ['[c3] a code that was never exchanged', '?code=00000000-fake-code', FAIL],
    ['[c4] cancelled consent', '?error=access_denied', CANCEL],
  ];
  for (const [label, search, text] of returns) {
    test(`[c19] ${label} shows the exact text, leaves the bare path and no session key`, async ({ page }) => {
      await page.goto(`/auth/google${search}`);
      await expect(page.getByRole('alert')).toHaveText(text);
      expect(await page.locator('body').innerText()).not.toContain('img src');
      expect(await page.locator('body').innerText()).not.toContain('SENTINEL');
      await expect.poll(() => new URL(page.url()).search).toBe('');
      expect(new URL(page.url()).pathname).toBe('/auth/google');
      expect(await storageKeys(page)).not.toContain(SESSION_KEY);
      await expect(page.locator('a[href="/login"]')).not.toHaveCount(0);
      await expect(page.locator('a[href="/register"]')).not.toHaveCount(0);
    });
  }

  test('[c19 · c5] opening the same code URL again gives the failure text and no session', async ({ page }) => {
    for (let i = 0; i < 2; i += 1) {
      await page.goto('/auth/google?code=11111111-reused-code');
      await expect(page.getByRole('alert')).toHaveText(FAIL);
      expect(await storageKeys(page)).not.toContain(SESSION_KEY);
    }
  });
});
