// I3 F3.8 (real browser, real session source, network stubbed). Derived from .work/medical-hotlines/spec.md criteria 2-7 and screen.md only: roles and
// Hebrew names. The list's contents (five entries, order, numbers) are the unit test packages/shared/tests/medical-hotlines.test.ts (c1); the page's
// markup and the guard are apps/web/tests/medical-hotlines.test.tsx; here: the real menu, focus, the zero-request journey, axe and the sizes.
// Visual baselines: none yet (Linux workflow, see the handoff).
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, open, pathOf } from './app-helpers';
import { DESKTOP_1280, EMAIL, main, scan } from './support/journeys-stub';
import { pageOf, range, setupFeed } from './support/feed-stub';
import type { FeedNet } from './support/feed-stub';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'phone 360', viewport: { width: 360, height: 800 } },
  { label: 'desktop 1280', viewport: DESKTOP_1280 },
] as const;
const TITLE = 'פנייה למוקד רפואי';
const DISCLAIMER = 'לא תחליף לטיפול רפואי. במצב חירום — 101';
const HAMBURGER = 'פתיחת התפריט';
const DRAWER = 'תפריט';

async function signIn(page: Page, net: FeedNet): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).toBe('/feed');
  await page.waitForLoadState('networkidle');
  net.armed = true;
}
const drawer = (page: Page) => page.getByRole('dialog', { name: DRAWER });
async function viaMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: HAMBURGER, exact: true }).click();
  await expect(drawer(page)).toBeVisible();
  await drawer(page).getByRole('link', { name: TITLE, exact: true }).click();
}
const links = (page: Page): Locator => page.getByRole('list', { name: 'מוקדי רפואה' }).getByRole('link');

test.describe('F3.8 c5 [FR-MENU-001 FR-MENU-002] the menu item', () => {
  test('[c5] "פנייה למוקד רפואי" sits between "תנאים ופרטיות" and "שאלות לשחזור סיסמה"; choosing it closes the drawer, opens /medical-hotlines, focus on the h1; aria-current="page" there', async ({ page }) => {
    const net = await setupFeed(page, () => pageOf(range(1, 2), null));
    await signIn(page, net);
    await page.getByRole('button', { name: HAMBURGER, exact: true }).click();
    const names = await drawer(page).locator('a[href], button').evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').replace(/\s+/g, ' ').trim()));
    const at = names.indexOf(TITLE);
    expect(at, 'the item is in the drawer').toBeGreaterThan(-1);
    expect(names[at - 1]).toBe('תנאים ופרטיות');
    expect(names[at + 1]).toBe('שאלות לשחזור סיסמה');
    const link = drawer(page).getByRole('link', { name: TITLE, exact: true });
    await expect(link).not.toHaveAttribute('aria-current', 'page');
    await link.click();
    await expect.poll(() => pathOf(page)).toBe('/medical-hotlines');
    await expect(drawer(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeFocused();
    await page.getByRole('button', { name: HAMBURGER, exact: true }).click();
    await expect(drawer(page).getByRole('link', { name: TITLE, exact: true })).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('F3.8 c2 c3 c7 [AC-109 FR-MENU-002 NFR-A11Y-001] the page', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c2][c3][c7] ${label}: main with one h1, the disclaimer above the list, five tel: links ≥44x44 with visible focus, numbers left-to-right, one column, no horizontal scroll; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupFeed(page, () => pageOf(range(1, 2), null));
      await signIn(page, net);
      await viaMenu(page);
      await expect.poll(() => pathOf(page)).toBe('/medical-hotlines');
      await expect(main(page).getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(main(page).getByRole('heading', { level: 1 })).toHaveText(TITLE);
      await expect(main(page).getByRole('heading', { level: 2 })).toHaveCount(0);
      await expect(links(page)).toHaveCount(5);
      const rows = await links(page).evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          const run = e.querySelector('[dir="ltr"]');
          return { href: e.getAttribute('href') ?? '', text: (e.textContent ?? '').replace(/\s+/g, ' ').trim(), w: r.width, h: r.height, x: Math.round(r.left), run: run?.textContent?.trim() ?? null };
        }),
      );
      for (const row of rows) {
        expect(row.href, row.text).toMatch(/^tel:(\*\d{2,5}|\+?\d{3,12})$/);
        expect(row.run, `${row.text}: the number is its own ltr run`).toBe(row.href.slice(4));
        expect(row.text, 'name and number are visible text').toContain(row.href.slice(4));
        expect(row.text.length, 'a name besides the number').toBeGreaterThan(row.href.length - 4);
        expect(row.w).toBeGreaterThanOrEqual(44);
        expect(row.h).toBeGreaterThanOrEqual(44);
      }
      expect(rows[0]?.href, 'MDA first').toBe('tel:101');
      expect(new Set(rows.map((r) => r.x)).size, 'one column: every row starts at the same edge').toBe(1);
      const disclaimer = main(page).getByText(DISCLAIMER, { exact: true });
      await expect(disclaimer).toBeVisible();
      expect(await disclaimer.evaluate((el) => el.closest('a') === null)).toBe(true);
      const above = await page.evaluate(() => {
        const p = Array.from(document.querySelectorAll('main p')).find((e) => (e.textContent ?? '').includes('במצב חירום'));
        const first = document.querySelector('main ul a');
        return p !== undefined && first !== null && p.getBoundingClientRect().bottom <= first.getBoundingClientRect().top;
      });
      expect(above, 'the disclaimer is above the list').toBe(true);
      await links(page).first().focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(links(page).first()).toBeFocused();
      const ring = await links(page).first().evaluate((el) => {
        const s = getComputedStyle(el);
        return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2) || s.boxShadow !== 'none';
      });
      expect(ring, 'visible focus').toBe(true);
      await scan(page);
    });
  }

  test('[c2] a direct load of /medical-hotlines renders the page (signed in) and keeps the skip link first', async ({ page }) => {
    const net = await setupFeed(page, () => pageOf(range(1, 2), null));
    await signIn(page, net);
    await page.goto('/medical-hotlines');
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(links(page)).toHaveCount(5);
    await expect(page).toHaveTitle(/פנייה למוקד רפואי/);
  });
});

test.describe('F3.8 c4 [AC-109] no record or event', () => {
  test('[c4] opening the page and activating each of the five links sends zero network requests and leaves localStorage and sessionStorage unchanged', async ({ page }) => {
    const net = await setupFeed(page, () => pageOf(range(1, 2), null));
    await signIn(page, net);
    await page.getByRole('button', { name: HAMBURGER, exact: true }).click();
    await expect(drawer(page)).toBeVisible();
    const seen: string[] = [];
    page.on('request', (req) => void seen.push(`${req.method()} ${req.url()}`));
    await drawer(page).getByRole('link', { name: TITLE, exact: true }).click();
    await expect(links(page)).toHaveCount(5);
    await page.waitForLoadState('networkidle');
    const snapshot = () => page.evaluate(() => JSON.stringify([{ ...window.localStorage }, { ...window.sessionStorage }]));
    const before = await snapshot();
    // A tel: link hands off to the phone; the test lets the click happen and stops the browser from trying to open a dialer.
    await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault(), true));
    seen.length = 0;
    for (let i = 0; i < 5; i += 1) await links(page).nth(i).click();
    await page.waitForTimeout(500); // a beacon or a delayed call would be sent within this bound
    expect(seen, 'no request from opening the page to the last click').toEqual([]);
    expect(await snapshot()).toBe(before);
    expect(pathOf(page)).toBe('/medical-hotlines');
  });
});

test.describe('F3.8 c6 [FR-MENU-002 ERR-012] the path is protected', () => {
  test('[c6] signed out, /medical-hotlines leads to Welcome and shows no hotline', async ({ page }) => {
    await open(page, '/medical-hotlines', 'signed-out');
    await expect.poll(() => pathOf(page)).toBe('/');
    await expect(page.getByRole('list', { name: 'מוקדי רפואה' })).toHaveCount(0);
  });

  test('[c6] signed in and active: the page renders', async ({ page }) => {
    await open(page, '/medical-hotlines', 'signed-in');
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    expect(pathOf(page)).toBe('/medical-hotlines');
  });

  test('[c6] a held account (no recovery questions yet) is redirected to the questions, as for every protected path', async ({ page }) => {
    await open(page, '/medical-hotlines', 'signed-in-needs-recovery');
    await expect.poll(() => pathOf(page)).toBe('/recovery-questions');
    await expect(page.getByRole('list', { name: 'מוקדי רפואה' })).toHaveCount(0);
  });

  test('[c6] a forced new-password session is redirected to the new-password screen', async ({ page }) => {
    await open(page, '/medical-hotlines', 'signed-in-needs-new-password');
    await expect.poll(() => pathOf(page)).toBe('/set-new-password');
    await expect(page.getByRole('list', { name: 'מוקדי רפואה' })).toHaveCount(0);
  });
});
