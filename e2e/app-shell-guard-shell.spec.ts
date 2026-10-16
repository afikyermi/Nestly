// F1.2 app-shell-guard (I1), part 2 of 3: the AppShell (TopBar, bottom navigation), the side menu and the placeholders.
// Derived from .work/app-shell-guard/spec.md only. Runs against the e2e build of the web app (server: the webServer
// entry in playwright.config.ts), Chrome and Edge. Part 1: app-shell-guard-routes.spec.ts; part 3: app-shell-guard-a11y.spec.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DESKTOP, MOBILE } from './helpers';
import {
  APP,
  CLOSE,
  DRAWER_TITLE,
  GOOGLE_RETURN,
  GUEST_ROUTES,
  LINE,
  MENU_BUTTON,
  NAV,
  PROTECTED_ROUTES,
  WELCOME_H1,
  bodyText,
  drive,
  inDomOrder,
  markerAlive,
  open,
  recordErrors,
  recordRequests,
  resetSeen,
  seen,
  setMarker,
  setState,
  signOutCalls,
  watch,
} from './app-helpers';

test.use({ baseURL: APP, viewport: MOBILE });

const SHELL_SELECTORS = [`[aria-label="${NAV}"]`, `[aria-label="${MENU_BUTTON}"]`];
const expectUrl = (page: Page, path: string) => expect(page).toHaveURL(APP + path);
const h1Of = (page: Page) => page.getByRole('heading', { level: 1 });
const navOf = (page: Page) => page.getByRole('navigation', { name: NAV });
const drawerOf = (page: Page) => page.getByRole('dialog', { name: DRAWER_TITLE });
const hamburgerOf = (page: Page) => page.getByRole('button', { name: MENU_BUTTON, exact: true });

async function openDrawer(page: Page): Promise<void> {
  await hamburgerOf(page).click();
  await expect(drawerOf(page)).toBeVisible();
}

test.describe('AppShell: TopBar', () => {
  for (const vp of [MOBILE, DESKTOP]) {
    for (const route of PROTECTED_ROUTES) {
      test(`[F1.2 c15][FR-TOP-001][AC-033] ${route.path} @${vp.width}: TopBar has the Hamburger at the inline-start (right) edge, then the Logo, and no other control`, async ({
        page,
      }) => {
        await page.setViewportSize(vp);
        await open(page, route.path, 'signed-in');
        const header = page.getByRole('banner');
        await expect(header).toHaveCount(1);
        const hamburger = hamburgerOf(page);
        await expect(hamburger).toHaveCount(1);
        const logo = header.getByRole('img', { name: 'Nestly' }).or(header.getByRole('link', { name: 'Nestly' })).first();
        await expect(logo).toBeVisible();
        expect(await inDomOrder([hamburger, logo]), 'Hamburger precedes the Logo in DOM order').toBe(true);
        const h = await hamburger.boundingBox();
        const l = await logo.boundingBox();
        const b = await header.boundingBox();
        if (h === null || l === null || b === null) throw new Error('missing box');
        expect(h.x + h.width, 'Hamburger at the right (inline-start) edge').toBeGreaterThan(b.x + b.width - 40);
        expect(l.x, 'Logo is to the left of the Hamburger').toBeLessThan(h.x);
        const controls = await header
          .locator('button, a[href], input, select, textarea, [role="button"], [role="link"], [role="searchbox"]')
          .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? (el.textContent ?? '').trim()));
        expect(controls.filter((c) => c !== MENU_BUTTON && c !== 'Nestly')).toEqual([]);
        await expect(page.getByRole('search')).toHaveCount(0);
        await expect(page.getByRole('searchbox')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /חיפוש|צ'אט|צאט|הודעות|התראות|חפש/ })).toHaveCount(0);
        await expect(page.getByRole('link', { name: /חיפוש|צ'אט|צאט|הודעות|התראות/ })).toHaveCount(0);
      });
    }
  }
});

test.describe('AppShell: bottom navigation', () => {
  test('[F1.2 c16][AC-005] a nav "ניווט ראשי" holds exactly three links in DOM order: בית /home, פיד /feed, פרופיל /profile; no חנות or יועצים', async ({
    page,
  }) => {
    await open(page, '/feed', 'signed-in');
    await expect(navOf(page)).toHaveCount(1);
    const links = await navOf(page)
      .getByRole('link')
      .evaluateAll((els) =>
        els.map((el) => ({ name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim(), href: el.getAttribute('href') })),
      );
    expect(links).toEqual([
      { name: 'בית', href: '/home' },
      { name: 'פיד', href: '/feed' },
      { name: 'פרופיל', href: '/profile' },
    ]);
    await expect(navOf(page).locator('button, [role="button"]')).toHaveCount(0);
    const text = await bodyText(page);
    expect(text).not.toContain('חנות');
    expect(text).not.toContain('יועצים');
  });

  test('[F1.2 c16][AC-005] each nav link carries its own decorative icon (three different icons)', async ({ page }) => {
    await open(page, '/feed', 'signed-in');
    const icons = await navOf(page)
      .getByRole('link')
      .evaluateAll((els) =>
        els.map((el) => {
          const svg = el.querySelector('svg');
          return svg === null ? null : { hidden: svg.getAttribute('aria-hidden'), markup: svg.innerHTML };
        }),
      );
    expect(icons).toHaveLength(3);
    for (const icon of icons) expect(icon?.hidden).toBe('true');
    expect(new Set(icons.map((i) => i?.markup)).size, 'home, nest and person icons differ').toBe(3);
  });

  test('[F1.2 c16][AC-005] it is a bar at the bottom at 375', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await open(page, '/feed', 'signed-in');
    const b = await navOf(page).boundingBox();
    if (b === null) throw new Error('nav has no box');
    expect(b.y + b.height, 'bottom edge').toBeGreaterThan(MOBILE.height - 4);
    expect(b.width, 'spans the width').toBeGreaterThan(MOBILE.width - 8);
    expect(b.width).toBeGreaterThan(b.height);
  });

  test('[F1.2 c16][AC-005] it is a rail at the inline-start (right) edge from 1024: tall, on the right, with the content to its left', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await open(page, '/feed', 'signed-in');
    const b = await navOf(page).boundingBox();
    const m = await page.locator('main').boundingBox();
    if (b === null || m === null) throw new Error('nav or main has no box');
    expect(b.x + b.width, 'at the right (inline-start) side, within 48px of the edge').toBeGreaterThan(DESKTOP.width - 48);
    expect(b.height, 'taller than wide').toBeGreaterThan(b.width);
    expect(b.y + b.height, 'inside the viewport').toBeLessThanOrEqual(DESKTOP.height);
    expect(m.x + m.width, 'the content sits to the left of the rail').toBeLessThanOrEqual(b.x + 1);
  });

  for (const route of PROTECTED_ROUTES.slice(0, 3)) {
    test(`[F1.2 c17][AC-005] on ${route.path} exactly one nav link has aria-current="page": the matching one`, async ({
      page,
    }) => {
      await open(page, route.path, 'signed-in');
      const current = await navOf(page)
        .locator('[aria-current]')
        .evaluateAll((els) =>
          els.map((el) => ({ name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim(), value: el.getAttribute('aria-current') })),
        );
      expect(current).toEqual([{ name: route.h1, value: 'page' }]);
    });
  }

  test('[F1.2 c17][AC-005] on /settings no nav link is current', async ({ page }) => {
    await open(page, '/settings', 'signed-in');
    await expect(navOf(page).locator('[aria-current]')).toHaveCount(0);
  });

  test('[F1.2 c18][AC-005] each nav link navigates without a document reload and shows its h1', async ({ page }) => {
    await open(page, '/settings', 'signed-in');
    await setMarker(page);
    const [home, feed, profile] = PROTECTED_ROUTES;
    if (home === undefined || feed === undefined || profile === undefined) throw new Error('routes missing');
    for (const route of [home, feed, profile, home, profile, feed]) {
      await navOf(page).getByRole('link', { name: route.h1, exact: true }).click();
      await expectUrl(page, route.path);
      await expect(h1Of(page)).toHaveText(route.h1);
      expect(await markerAlive(page), `no reload going to ${route.path}`).toBe(true);
    }
  });
});

test.describe('AppShell: side menu', () => {
  test('[F1.2 c19][FR-MENU-001] the drawer titled "תפריט" holds exactly three items in order: הגדרות (link to /settings), שאלות לשחזור סיסמה (link, F1.6 c18), התנתקות (button)', async ({
    page,
  }) => {
    await open(page, '/feed', 'signed-in');
    await openDrawer(page);
    const drawer = drawerOf(page);
    const items = await drawer
      .locator('a[href], button, [role="button"], [role="link"], [role="menuitem"]')
      .evaluateAll((els) =>
        els.map((el) => ({
          tag: el.tagName.toLowerCase(),
          name: (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim(),
          href: el.getAttribute('href'),
        })),
      );
    expect(items.filter((i) => i.name !== CLOSE)).toEqual([
      { tag: 'a', name: 'הגדרות', href: '/settings' },
      { tag: 'a', name: 'שאלות לשחזור סיסמה', href: '/recovery-questions' }, // F1.6 c18
      { tag: 'button', name: 'התנתקות', href: null },
    ]);
    for (const dest of ['/home', '/feed', '/profile']) {
      await expect(drawer.locator(`a[href="${dest}"]`)).toHaveCount(0);
    }
    const text = await drawer.innerText();
    for (const banned of ['חנות', 'יועצים', 'קבוצות', 'חברים', 'עזרה']) expect(text).not.toContain(banned);
  });

  test('[F1.2 c20][FR-MENU-001] activating "הגדרות" closes the drawer, shows Settings (h1 הגדרות) and moves focus to main', async ({
    page,
  }) => {
    await open(page, '/feed', 'signed-in');
    await setMarker(page);
    await openDrawer(page);
    await drawerOf(page).getByRole('link', { name: 'הגדרות' }).click();
    await expectUrl(page, '/settings');
    await expect(drawerOf(page)).toHaveCount(0);
    await expect(h1Of(page)).toHaveText('הגדרות');
    await expect(page.locator('main')).toBeFocused();
    expect(await markerAlive(page)).toBe(true);
  });

  test('[F1.2 c21][FR-MENU-001] activating "התנתקות" calls sign-out exactly once, closes the drawer, and once signed-out shows Welcome at /', async ({
    page,
  }) => {
    await open(page, '/feed', 'signed-in');
    await openDrawer(page);
    await drawerOf(page).getByRole('button', { name: 'התנתקות' }).click();
    await expect(drawerOf(page)).toHaveCount(0);
    expect(await signOutCalls(page)).toBe(1);
    await setState(page, 'signed-out'); // the seam reports signed-out
    await expectUrl(page, '/');
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
    expect(await signOutCalls(page), 'still exactly one call').toBe(1);
  });

  test('[F1.2 c21][FR-MENU-001] after Logout, Back shows no protected content: the guard redirects to / again', async ({
    page,
  }) => {
    await watch(page, { texts: [LINE], selectors: SHELL_SELECTORS });
    await open(page, '/home', 'signed-in');
    await navOf(page).getByRole('link', { name: 'פיד', exact: true }).click();
    await expectUrl(page, '/feed');
    await openDrawer(page);
    await drawerOf(page).getByRole('button', { name: 'התנתקות' }).click();
    await setState(page, 'signed-out');
    await expectUrl(page, '/');
    await resetSeen(page);
    for (let i = 0; i < 3; i += 1) {
      await page.goBack();
      if (!page.url().startsWith(APP)) break;
      await expectUrl(page, '/');
      await expect(h1Of(page)).toHaveText(WELCOME_H1);
      await expect(page.getByText(LINE)).toHaveCount(0);
      await expect(navOf(page)).toHaveCount(0);
      expect(await seen(page), 'protected content or shell appeared after Back').toEqual([]);
    }
  });

  test('[F1.2 c21][FR-MENU-001] a double activation of "התנתקות" signs out exactly once', async ({ page }) => {
    await open(page, '/feed', 'signed-in');
    await openDrawer(page);
    await drawerOf(page).getByRole('button', { name: 'התנתקות' }).dblclick();
    expect(await signOutCalls(page)).toBe(1);
  });

  test('[F1.2 c21][FR-MENU-001] a sign-out that rejects does not crash the app: no uncaught error, the drawer is closed, a main landmark remains', async ({
    page,
  }) => {
    const errors = recordErrors(page);
    await open(page, '/feed', 'signed-in');
    await drive(page, 'rejectSignOut', true);
    await openDrawer(page);
    await drawerOf(page).getByRole('button', { name: 'התנתקות' }).click();
    await expect(drawerOf(page)).toHaveCount(0);
    expect(await signOutCalls(page)).toBe(1);
    await page.waitForTimeout(300);
    expect(errors, 'unhandled rejection from sign-out').toEqual([]);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(h1Of(page)).toHaveCount(1);
  });
});

test.describe('Placeholders', () => {
  for (const route of PROTECTED_ROUTES) {
    test(`[F1.2 c22][FR-AUTH-004][NFR-SEC-002] ${route.path} shows its h1 and the line, and nothing else; no request to /api/* with state forced to signed-in`, async ({
      page,
    }) => {
      const urls = recordRequests(page);
      await open(page, route.path, 'signed-in');
      await expect(h1Of(page)).toHaveText(route.h1);
      const main = page.locator('main');
      const text = (await main.innerText()).replace(/\s+/g, ' ').trim();
      expect(text).toBe(`${route.h1} ${LINE}`);
      expect(await main.locator('a[href], button, input, img, form').count(), 'no controls or media in main').toBe(0);
      await page.waitForTimeout(500);
      expect(urls.filter((u) => new URL(u).pathname.startsWith('/api/'))).toEqual([]);
    });
  }

  // F1.8: /auth/google is the return handler; opened with no code it makes no /api call either (c13: nothing but the token reaches the server).
  for (const route of [...GUEST_ROUTES.slice(1), GOOGLE_RETURN]) {
    test(`[F1.2 c22][FR-AUTH-004] the Guest page ${route.path} sends no request to /api/*`, async ({ page }) => {
      const urls = recordRequests(page);
      await open(page, route.path, 'signed-out');
      if (route.h1 === '') await expect(h1Of(page)).toBeVisible();
      else await expect(h1Of(page)).toHaveText(route.h1);
      await page.waitForTimeout(300);
      expect(urls.filter((u) => new URL(u).pathname.startsWith('/api/'))).toEqual([]);
    });
  }
});
