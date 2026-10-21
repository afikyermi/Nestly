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
      test(`[F1.2 c15][FR-TOP-001][AC-033] ${route.path} @${vp.width}: TopBar has the Hamburger at the inline-start (right) edge, then the Logo, the search, the Chat button and the notifications bell, and no other control`, async ({
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
        // AC-033: the search (a field from 768 px, an icon link to the results screen below it) and the bell.
        if (vp.width >= 768) await expect(header.getByRole('searchbox', { name: 'חיפוש אנשים ופוסטים' })).toBeVisible();
        else await expect(header.getByRole('link', { name: 'חיפוש', exact: true })).toBeVisible();
        await expect(header.getByRole('button', { name: /^התראות/ })).toBeVisible();
        const controls = await header
          .locator('button, a[href], input, select, textarea, [role="button"], [role="link"], [role="searchbox"]')
          .evaluateAll((els) =>
            els
              .filter((el) => el instanceof HTMLElement && el.offsetParent !== null && !el.classList.contains('sr-only'))
              .map((el) => el.getAttribute('aria-label') ?? (el.textContent ?? '').trim()),
          );
        const known = (c: string): boolean => c === MENU_BUTTON || c === 'Nestly' || c === 'חיפוש' || c === '' || c.startsWith('התראות') || c.startsWith('הודעות');
        expect(controls.filter((c) => !known(c))).toEqual([]);
        // I8 (FR-CHAT-001): the Chat Center's button, "הודעות" with the unread count when there is one.
        await expect(header.getByRole('button', { name: /^הודעות/ })).toBeVisible();
        await expect(page.getByRole('button', { name: /צ'אט|צאט/ })).toHaveCount(0);
      });
    }
  }
});

test.describe('AppShell: bottom navigation', () => {
  test('[F1.2 c16][AC-005] a nav "ניווט ראשי" holds exactly four links in DOM order: בית /home, פיד /feed, יועצים /services (I11), פרופיל /profile; no חנות', async ({
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
      { name: 'יועצים', href: '/services' }, // I11: the Professionals' directory (FR-SERV-001)
      { name: 'פרופיל', href: '/profile' },
    ]);
    await expect(navOf(page).locator('button, [role="button"]')).toHaveCount(0);
    const text = await bodyText(page);
    expect(text).not.toContain('חנות');
  });

  test('[F1.2 c16][AC-005] each nav link carries its own decorative icon (four different icons)', async ({ page }) => {
    await open(page, '/feed', 'signed-in');
    const icons = await navOf(page)
      .getByRole('link')
      .evaluateAll((els) =>
        els.map((el) => {
          const svg = el.querySelector('svg');
          return svg === null ? null : { hidden: svg.getAttribute('aria-hidden'), markup: svg.innerHTML };
        }),
      );
    expect(icons).toHaveLength(4);
    for (const icon of icons) expect(icon?.hidden).toBe('true');
    expect(new Set(icons.map((i) => i?.markup)).size, 'home, nest, spark and person icons differ').toBe(4);
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
      expect(current).toEqual([{ name: route.nav ?? route.h1, value: 'page' }]);
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
      await navOf(page).getByRole('link', { name: route.nav ?? route.h1, exact: true }).click();
      await expectUrl(page, route.path);
      await expect(h1Of(page)).toHaveText(route.h1);
      expect(await markerAlive(page), `no reload going to ${route.path}`).toBe(true);
    }
  });
});

test.describe('AppShell: side menu', () => {
  test('[F1.2 c19][F2.5 c1][FR-MENU-001] the drawer titled "תפריט" holds exactly ten items in order: חברים, כללי הקהילה (F3.7 c14, PG-049), חשבון, פרטיות ואבטחה, תנאים ופרטיות (links to /settings sections; terms: DR-2 A), פנייה למוקד רפואי (F3.8), שאלות לשחזור סיסמה, החלפת סיסמה (links), שיתוף Nestly (button, F3.6 c11), התנתקות (button)', async ({
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
    const shown = items.filter((i) => i.name !== CLOSE);
    // The three section items open /settings; the address differs per section (F2.5 c2, Q2), so only the path is fixed here.
    const sections = shown.filter((i) => ['חשבון', 'פרטיות ואבטחה', 'התראות', 'תנאים ופרטיות'].includes(i.name));
    for (const s of sections) expect(s.href ?? '', s.name).toMatch(/^\/settings(?:[#/?]|$)/);
    expect(new Set(sections.map((s) => s.href)).size, 'a distinct address per section').toBe(4);
    expect(shown.map((i) => ({ ...i, href: i.href?.startsWith('/settings') === true ? '/settings*' : i.href }))).toEqual([
      { tag: 'a', name: 'חברים', href: '/friends' }, // F2.4b c13, before Settings (FR-MENU-001)
      { tag: 'a', name: 'בעלי מקצוע', href: '/services' }, // I11: the directory (FR-SERV-001)
      { tag: 'a', name: 'הצעות עזרה', href: '/offers' }, // I11: Offer Help (FR-SERV-006)
      { tag: 'a', name: 'כללי הקהילה', href: '/community-rules' }, // F3.7 c14, right after Friends
      { tag: 'a', name: 'חשבון', href: '/settings*' },
      { tag: 'a', name: 'פרטיות ואבטחה', href: '/settings*' },
      { tag: 'a', name: 'התראות', href: '/settings*' }, // FR-NOTIF-002: the notifications section of Settings
      { tag: 'a', name: 'תנאים ופרטיות', href: '/settings*' },
      { tag: 'a', name: 'פנייה למוקד רפואי', href: '/medical-hotlines' }, // F3.8
      { tag: 'a', name: 'שאלות לשחזור סיסמה', href: '/recovery-questions' }, // F1.6 c18
      { tag: 'a', name: 'החלפת סיסמה', href: '/change-password' }, // F2.0 c15
      { tag: 'a', name: 'פנייה לתמיכה', href: '/support' }, // I8: Help/Support Request (FR-ADMIN-001)
      { tag: 'button', name: 'שיתוף Nestly', href: null }, // F3.6 c11, just before the logout
      { tag: 'button', name: 'התנתקות', href: null },
    ]);
    for (const dest of ['/home', '/feed', '/profile']) {
      await expect(drawer.locator(`a[href="${dest}"]`)).toHaveCount(0);
    }
    const text = await drawer.innerText();
    // "התראות" is now the Settings section (FR-NOTIF-002), so it is no longer banned here.
    // I11: "הצעות עזרה" (Offer Help, FR-SERV-006) joined the drawer, so "עזרה" alone is no longer banned here.
    for (const banned of ['חנות', 'יועצים', 'קבוצות', 'עוקבים', 'מקצועיים במעקב', 'מחיקת חשבון', 'מחיקה', 'בית', 'פיד', 'פרופיל']) {
      expect(text, `the drawer must not hold "${banned}"`).not.toContain(banned);
    }
  });

  test('[F1.2 c20][F2.5 c2][FR-MENU-001] activating "חשבון" closes the drawer, shows Settings (h1 הגדרות, the Account h2 focused) with no reload', async ({
    page,
  }) => {
    await open(page, '/feed', 'signed-in');
    await setMarker(page);
    await openDrawer(page);
    await drawerOf(page).getByRole('link', { name: 'חשבון', exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/settings');
    await expect(drawerOf(page)).toHaveCount(0);
    await expect(h1Of(page)).toHaveText('הגדרות');
    await expect(page.getByRole('heading', { level: 2, name: 'חשבון', exact: true })).toBeFocused();
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
  test('[F1.2 c22][F2.1] /profile is no longer a placeholder: it shows the h1 "פרופיל" and not the placeholder line', async ({ page }) => {
    await open(page, '/profile', 'signed-in');
    await expect(h1Of(page)).toHaveText('פרופיל');
    await expect(page).toHaveTitle('פרופיל · Nestly');
    await expect(page.locator('main')).not.toContainText(LINE);
  });

  // F2.1: /profile is the own-profile screen now (its states: e2e/profile.spec.ts). F2.3a (Gate 1 DR-2 A): /settings holds the privacy
  // section now; what this test guarded there (its h1, no data without a real session) is in e2e/privacy.spec.ts, "F2.3a c5 c22".
  // The other two stay placeholders.
  for (const route of PROTECTED_ROUTES.filter((r) => r.path !== '/profile' && r.path !== '/settings' && r.path !== '/feed' && r.path !== '/home')) {
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

  // F3.2b: /feed is the community feed now (its states: e2e/feed.spec.ts). The guard intent stays: with state forced to signed-in and no
  // session behind it, the page asks the server for nothing at all and shows no card.
  test('[F1.2 c22][F3.2b c13][FR-AUTH-004] /feed with state forced to signed-in and no session: h1 "הפיד", no /api/* request, no article', async ({ page }) => {
    const urls = recordRequests(page);
    await open(page, '/feed', 'signed-in');
    await expect(h1Of(page)).toHaveText('הפיד');
    await page.waitForTimeout(500);
    expect(urls.filter((u) => new URL(u).pathname.startsWith('/api/'))).toEqual([]);
    await expect(page.getByRole('article')).toHaveCount(0);
  });

  // I6: /home is the home screen now (its states: e2e/home-trackers.spec.ts). The guard intent stays: with state forced to signed-in and no
  // session behind it, the page asks the server for nothing at all and shows no route card, no tracker and no guide.
  test('[F1.2 c22][I6][FR-AUTH-004] /home with state forced to signed-in and no session: h1 "בית", its line, no /api/* request, no card', async ({ page }) => {
    const urls = recordRequests(page);
    await open(page, '/home', 'signed-in');
    await expect(h1Of(page)).toHaveText('בית');
    await expect(page.locator('main').getByText(LINE, { exact: true })).toHaveCount(1);
    await page.waitForTimeout(500);
    expect(urls.filter((u) => new URL(u).pathname.startsWith('/api/'))).toEqual([]);
    await expect(page.locator('main').getByRole('heading', { name: 'המסלולים שלי' })).toHaveCount(0);
    await expect(page.locator('main').getByRole('heading', { name: 'יומן פעולות' })).toHaveCount(0);
    await expect(page.locator('main').getByRole('listitem')).toHaveCount(0);
  });

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
