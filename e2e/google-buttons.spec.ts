// F1.8 P3 (real browser, REAL session source, Auth stubbed at https://e2e-stub.invalid): criteria 16, 17, 18.
// Derived from .work/google-sign-in/spec.md only. The authorize request is intercepted and aborted; no Google page loads.
// The final action is named "יצירת חשבון" (same as F1.5; ORCHESTRATOR decision over the spec's "יצירת החשבון").
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { runAxe } from './helpers';
import { APP } from './app-helpers';

test.use({ baseURL: APP });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const GOOGLE = 'המשך עם Google';
const FAIL = 'לא הצלחנו להשלים את הכניסה עם Google. אפשר לנסות שוב, או להתחבר עם אימייל וסיסמה.';
const AUTHORIZE = 'https://e2e-stub.invalid/auth/v1/authorize';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const VIEWPORTS = [
  { name: '375', size: { width: 375, height: 812 } },
  { name: '1280', size: { width: 1280, height: 800 } },
];

async function realSession(page: Page): Promise<string[]> {
  const authorize: string[] = [];
  await page.addInitScript(() => Reflect.set(window, 'nestlyRealSession', true));
  await page.route(`${AUTHORIZE}**`, async (route) => {
    authorize.push(route.request().url());
    await route.abort('aborted');
  });
  return authorize;
}

/** A stored session of a Google user whose account does not exist yet (completion mode), with Auth and /api/me stubbed. */
async function googleUserWithoutAccount(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Reflect.set(window, 'nestlyRealSession', true);
    const user = {
      id: 'f0000000-0000-4000-8000-0000000000f1',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'google.person@example.com',
      identities: [],
      app_metadata: { provider: 'google' },
      user_metadata: {},
      created_at: '2026-10-16T10:00:00Z',
    };
    window.localStorage.setItem(
      'nestly-auth',
      JSON.stringify({ access_token: 'a.b.c', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user }),
    );
  });
  const json = (body: unknown) => ({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await page.route('https://e2e-stub.invalid/auth/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill(
      json({
        id: 'f0000000-0000-4000-8000-0000000000f1',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'google.person@example.com',
        identities: [],
        app_metadata: { provider: 'google' },
        user_metadata: {},
        created_at: '2026-10-16T10:00:00Z',
      }),
    );
  });
  await page.route('**/api/me', async (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : route.fulfill(json({ state: 'unregistered' })),
  );
}

const googleButton = (page: Page) => page.getByRole('button', { name: GOOGLE, exact: true });
const scan = async (page: Page): Promise<void> => {
  const result = await runAxe(page, { tags: AXE_TAGS });
  expect(result.checked).toBeGreaterThan(0);
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
};
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const vp of VIEWPORTS) {
  test.describe(`F1.8 P3 at ${vp.name}`, () => {
    test.use({ viewport: vp.size });

    for (const [name, path] of [['Welcome', '/'], ['Login', '/login'], ['Register step 1', '/register']] as const) {
      test(`[c16] ${name}: the button exists by name, RTL, axe clean${vp.name === '375' ? ', 44px target, no horizontal scroll' : ''}`, async ({ page }) => {
        await realSession(page);
        await page.goto(path);
        await expect(googleButton(page)).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl');
        if (vp.name === '375') {
          const box = await googleButton(page).boundingBox();
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
          expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
          expect(await noHorizontalScroll(page)).toBe(true);
        }
        await scan(page);
      });

      test(`[c16] ${name}: Enter and Space each start one authorize navigation`, async ({ page }) => {
        const authorize = await realSession(page);
        for (const key of ['Enter', 'Space']) {
          authorize.length = 0;
          await page.goto(path);
          await googleButton(page).focus();
          await page.keyboard.press(key);
          await expect.poll(() => authorize.length).toBe(1);
        }
      });

      test(`[c17] ${name}: pressed, the button is disabled and aria-busy; a double press starts one navigation`, async ({ page }) => {
        const authorize = await realSession(page);
        await page.goto(path);
        await googleButton(page).dblclick();
        await expect(googleButton(page)).toBeDisabled();
        await expect(googleButton(page)).toHaveAttribute('aria-busy', 'true');
        await page.waitForTimeout(800);
        expect(authorize).toHaveLength(1);
        const url = new URL(authorize[0] ?? '');
        expect(url.searchParams.get('provider')).toBe('google');
        expect(url.searchParams.get('redirect_to')).toBe(`${APP}/auth/google`);
      });
    }

    test('[c16] the button is not on step 2 (consent) of registration', async ({ page }) => {
      await realSession(page);
      await page.goto('/register');
      await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
      await page.getByLabel(/^שם מלא/).fill('דנה כהן');
      await page.getByRole('button', { name: 'המשך', exact: true }).click();
      await expect(page.getByRole('checkbox', { name: /אישור תנאי השימוש/ })).toBeVisible();
      await expect(googleButton(page)).toHaveCount(0);
    });

    test('[c18] the return screen: heading, alert, focus on the heading, no placeholder title, axe clean', async ({ page }) => {
      await realSession(page);
      await page.goto('/auth/google?error=server_error&error_description=%3Cimg%20src%3Dx%3E');
      await expect(page.getByRole('alert')).toHaveText(FAIL);
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toBeVisible();
      await expect(heading).toBeFocused();
      expect(await page.title()).not.toBe('המשך עם Google · Nestly');
      expect(await noHorizontalScroll(page)).toBe(true);
      await scan(page);
    });

    test('[c18] completion step 2 for a Google user: password labelled, error linked by aria-describedby, axe clean', async ({ page }) => {
      await googleUserWithoutAccount(page);
      await page.goto('/register');
      await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
      await page.getByLabel(/^שם מלא/).fill('דנה כהן');
      await page.getByRole('button', { name: 'המשך', exact: true }).click();
      const password = page.getByLabel('סיסמה', { exact: true });
      await expect(password).toBeVisible();
      await scan(page);
      await password.fill('a');
      await password.blur();
      const describedBy = await password.getAttribute('aria-describedby');
      expect(describedBy).not.toBeNull();
      const target = page.locator(`[id="${(describedBy ?? '').split(' ')[0] ?? ''}"]`);
      expect((await target.innerText()).trim().length).toBeGreaterThan(0);
      await expect(page.getByRole('button', { name: 'יצירת חשבון', exact: true })).toBeDisabled();
      await scan(page);
    });
  });
}
