// F1.2 app-shell-guard (I1): Welcome, RouteGuard, session seam, AppShell, menu, accessibility, RTL, copy.
// Derived from .work/app-shell-guard/spec.md only (DR-1: a signed-in user on an unknown path goes to /feed).
// Runs against the e2e build of the web app (see app-helpers.ts for the server), Chrome and Edge.
// Test names: [F1.2 cN] + the SRS ids the criterion cites.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DESKTOP, MOBILE, runAxe } from './helpers';
import {
  APP,
  CLOSE,
  CREATE,
  DRAWER_TITLE,
  GOOGLE,
  GUEST_ROUTES,
  HAVE_ACCOUNT,
  LEAD,
  LINE,
  LOADING,
  MENU_BUTTON,
  NAV,
  PROTECTED_ROUTES,
  WELCOME_H1,
  actionOf,
  bodyText,
  drive,
  focusedName,
  historyLength,
  inDomOrder,
  logoOf,
  markerAlive,
  open,
  pathOf,
  recordErrors,
  recordRequests,
  resetSeen,
  seen,
  setMarker,
  setState,
  signOutCalls,
  tabNames,
  waitForSeam,
  watch,
} from './app-helpers';

test.use({ baseURL: APP, viewport: MOBILE });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
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

// ---------------------------------------------------------------------------------------------
// Harness controls: the instruments used below can fail
// ---------------------------------------------------------------------------------------------

test.describe('harness controls', () => {
  test('[F1.2 c5][c7] control: the render watcher DOES see protected content when a signed-in user opens /feed', async ({
    page,
  }) => {
    await watch(page, { texts: [LINE], selectors: SHELL_SELECTORS });
    await open(page, '/feed', 'signed-in');
    await expect(h1Of(page)).toHaveText('פיד');
    const hits = await seen(page);
    expect(hits).toContain(`text:${LINE}`);
    expect(hits.some((h) => h.startsWith('selector:'))).toBe(true);
  });

  test('[F1.2 c4] control: the render watcher DOES see the Welcome h1 when a Guest opens /', async ({ page }) => {
    await watch(page, { texts: [WELCOME_H1] });
    await open(page, '/', 'signed-out');
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
    expect(await seen(page)).toContain(`text:${WELCOME_H1}`);
  });

  test('[F1.2 c23] control: axe on an app page does detect a violation (image without alt)', async ({ page }) => {
    await open(page, '/', 'signed-out');
    await page.evaluate(() => {
      const img = document.createElement('img');
      img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
      document.body.appendChild(img);
    });
    const result = await runAxe(page, { tags: AXE_TAGS });
    expect(result.violations.map((v) => v.id)).toContain('image-alt');
  });

  test('[F1.2 c12] control: the seam reports its own absence loudly (drive throws on a page that is not the e2e build)', async ({
    page,
  }) => {
    await page.goto('about:blank');
    await expect(setState(page, 'signed-in')).rejects.toThrow(/nestlyTestSession/);
  });
});

// ---------------------------------------------------------------------------------------------
// Welcome
// ---------------------------------------------------------------------------------------------

test.describe('Welcome', () => {
  test('[F1.2 c1][FR-AUTH-001][AC-001][AC-087] a Guest at / sees Logo, decorative illustration, h1, lead, three actions in DOM order', async ({
    page,
  }) => {
    await open(page, '/', 'signed-out');
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
    await expect(h1Of(page)).toHaveCount(1);
    const lead = page.getByText(LEAD, { exact: true });
    await expect(lead).toBeVisible();
    const create = actionOf(page, CREATE);
    const google = actionOf(page, GOOGLE);
    const login = actionOf(page, HAVE_ACCOUNT);
    for (const a of [create, google, login]) await expect(a).toHaveCount(1);
    expect(await inDomOrder([logoOf(page), h1Of(page), lead, create, google, login])).toBe(true);

    // Exactly three actions on the page besides the Logo, in this order.
    const actions = await page.locator('main a[href], main button').evaluateAll((els) =>
      els
        .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter((n) => n !== 'Nestly'),
    );
    expect(actions).toEqual([CREATE, GOOGLE, HAVE_ACCOUNT]);

    // The illustration: a large, decorative (aria-hidden) element before the h1, with no running animation.
    const illustration = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      if (h1 === null) return 'no h1';
      const candidates = Array.from(document.querySelectorAll('[aria-hidden="true"], img[alt=""], [role="presentation"]'));
      const hit = candidates.find((el) => {
        const r = el.getBoundingClientRect();
        const before = (h1.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
        return before && r.width >= 100 && r.height >= 60;
      });
      if (hit === undefined) return 'no decorative illustration before the h1';
      return hit.getAnimations({ subtree: true }).length === 0 ? 'ok' : 'illustration is animated';
    });
    expect(illustration).toBe('ok');
  });

  test('[F1.2 c1][FR-AUTH-001] exactly one action has the primary style: "יצירת חשבון חדש"', async ({ page }) => {
    await open(page, '/', 'signed-out');
    const bg = (name: string) => actionOf(page, name).evaluate((el) => getComputedStyle(el).backgroundColor);
    const create = await bg(CREATE);
    const google = await bg(GOOGLE);
    const login = await bg(HAVE_ACCOUNT);
    expect(create, 'the primary action has a filled background').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(google).not.toBe(create);
    expect(login).not.toBe(create);
  });

  test('[F1.2 c1][FR-AUTH-001][Q5] the Welcome screen has no shop, advisor or professional wording', async ({ page }) => {
    await open(page, '/', 'signed-out');
    const text = await bodyText(page);
    for (const banned of ['חנות', 'יועצים', 'בעלי מקצוע']) expect(text).not.toContain(banned);
  });

  test('[F1.2 c2][FR-AUTH-001][AC-001] "יצירת חשבון חדש" goes to /register (not account type), with an h1 and a back control to /', async ({
    page,
  }) => {
    await open(page, '/', 'signed-out');
    await actionOf(page, CREATE).click();
    await expectUrl(page, '/register');
    expect(pathOf(page)).not.toMatch(/account|type/i);
    await expect(h1Of(page)).toHaveText('הרשמה');
    await actionOf(page, 'חזרה').click();
    await expectUrl(page, '/');
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
  });

  test('[F1.2 c2][FR-AUTH-001][AC-001] "כבר יש לי חשבון" goes to /login, with an h1 and a back control to /', async ({
    page,
  }) => {
    await open(page, '/', 'signed-out');
    await actionOf(page, HAVE_ACCOUNT).click();
    await expectUrl(page, '/login');
    await expect(h1Of(page)).toHaveText('התחברות');
    await actionOf(page, 'חזרה').click();
    await expectUrl(page, '/');
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
  });

  test('[F1.2 c3][FR-AUTH-005][AC-087] "המשך עם Google" goes to /auth/google placeholder with h1 and back control', async ({
    page,
  }) => {
    await open(page, '/', 'signed-out');
    await actionOf(page, GOOGLE).click();
    await expectUrl(page, '/auth/google');
    await expect(h1Of(page)).toHaveText(GOOGLE);
    await actionOf(page, 'חזרה').click();
    await expectUrl(page, '/');
  });

  test('[F1.2 c3][FR-AUTH-005][AC-087] no Welcome action and no Guest placeholder sends a request to Google, Supabase or /api/*', async ({
    page,
  }) => {
    const urls = recordRequests(page);
    await open(page, '/', 'signed-out');
    for (const name of [CREATE, GOOGLE, HAVE_ACCOUNT]) {
      await actionOf(page, name).click();
      await expect(h1Of(page)).not.toHaveText(WELCOME_H1);
      await actionOf(page, 'חזרה').click();
      await expect(h1Of(page)).toHaveText(WELCOME_H1);
    }
    for (const route of GUEST_ROUTES.slice(1)) {
      await open(page, route.path, 'signed-out');
      await expect(h1Of(page)).toHaveText(route.h1);
    }
    // Same-origin page loads of the app's own routes (e.g. /auth/google) are fine; nothing else leaves the app.
    const bad = urls.filter((u) => {
      const url = new URL(u);
      return url.origin !== APP || url.pathname.startsWith('/api/') || /\/auth\/v1|\/rest\/v1|supabase/i.test(url.href);
    });
    expect(bad).toEqual([]);
    expect(urls.some((u) => u.startsWith(APP)), 'the recorder saw requests at all').toBe(true);
  });

  for (const route of GUEST_ROUTES) {
    test(`[F1.2 c4][FR-AUTH-001][FR-AUTH-002] a signed-in session at ${route.path} is replaced by /feed; the Welcome h1 is never in the DOM`, async ({
      page,
    }) => {
      await watch(page, { texts: [WELCOME_H1] });
      await page.goto(APP + route.path);
      await waitForSeam(page);
      await resetSeen(page); // a Guest may legitimately see Welcome before sign-in; the promise starts at the transition
      const len = await historyLength(page);
      await setState(page, 'signed-in');
      await expectUrl(page, '/feed');
      await expect(h1Of(page)).toHaveText('פיד');
      expect(await seen(page)).toEqual([]);
      expect(await historyLength(page), 'replaced, not pushed').toBe(len);
    });
  }

  test('[F1.2 c4][FR-AUTH-001] Welcome is not in the DOM while loading, nor after the session resolves to signed-in', async ({
    page,
  }) => {
    await watch(page, { texts: [WELCOME_H1] });
    await page.goto(APP + '/');
    await waitForSeam(page);
    expect(await seen(page), 'loading shows no Welcome').toEqual([]);
    await setState(page, 'signed-in');
    await expectUrl(page, '/feed');
    expect(await seen(page)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// RouteGuard
// ---------------------------------------------------------------------------------------------

const GUEST_BLOCKED = ['/home', '/feed', '/profile', '/settings', '/marketplace', '/profile/123'];

test.describe('RouteGuard: Guest', () => {
  for (const path of GUEST_BLOCKED) {
    test(`[F1.2 c5][FR-AUTH-004][AC-016][ERR-012] a Guest requesting ${path} ends at / with Welcome, no message, no protected content ever in the DOM, history entry replaced`, async ({
      page,
    }) => {
      await watch(page, { texts: [LINE], selectors: SHELL_SELECTORS });
      await page.goto(APP + path);
      await waitForSeam(page);
      const len = await historyLength(page);
      await setState(page, 'signed-out');
      await expectUrl(page, '/');
      await expect(h1Of(page)).toHaveText(WELCOME_H1);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByRole('status')).toHaveCount(0);
      expect(await seen(page), 'protected content or shell was rendered, even for one render').toEqual([]);
      expect(await historyLength(page), 'the redirect replaced the history entry').toBe(len);
    });
  }

  test('[F1.2 c5][FR-AUTH-004][ERR-012] hostile and odd URLs for a Guest: query, hash, double slash, dot segments, encoded', async ({
    page,
  }) => {
    const odd = [
      '/feed?next=/login',
      '/feed#section',
      '//home',
      '/profile/%2e%2e/%2e%2e/settings',
      '/settings/..%2f..%2fhome',
      '/%66eed',
      '/feed/',
    ];
    await watch(page, { texts: [LINE], selectors: SHELL_SELECTORS });
    for (const path of odd) {
      await page.goto(APP + path);
      await waitForSeam(page);
      await setState(page, 'signed-out');
      await expect(h1Of(page), path).toHaveText(WELCOME_H1);
      const url = new URL(page.url());
      expect(url.origin, path).toBe(APP);
      expect(url.pathname, path).toBe('/');
      expect(url.href, `${path}: the requested destination is not kept`).not.toMatch(/feed|home|settings|login/);
      expect(await seen(page), path).toEqual([]);
    }
  });

  test('[F1.2 c6][FR-AUTH-004] deny by default: every path that is not one of the four Guest routes sends a Guest to /', async ({
    page,
  }) => {
    const notAllowed = [
      '/home',
      '/feed',
      '/profile',
      '/settings',
      '/marketplace',
      '/auth',
      '/auth/google/extra',
      '/register/extra',
      '/login/extra',
      '/login2',
      '/admin',
      '/new-route-nobody-listed',
      '/groups',
      '/shop',
    ];
    for (const path of notAllowed) {
      await open(page, path, 'signed-out');
      await expectUrl(page, '/');
      await expect(h1Of(page), path).toHaveText(WELCOME_H1);
    }
  });

  test('[F1.2 c6][FR-AUTH-004] the Guest allow-list is exactly the four Guest routes: each one renders its own placeholder to a Guest', async ({
    page,
  }) => {
    for (const route of GUEST_ROUTES) {
      await open(page, route.path, 'signed-out');
      await expectUrl(page, route.path);
      await expect(h1Of(page)).toHaveText(route.h1);
      await expect(navOf(page)).toHaveCount(0);
    }
  });
});

test.describe('RouteGuard: loading, session end, fail closed, DR-1', () => {
  test('[F1.2 c7][FR-AUTH-004] while loading: no Welcome, no shell, no protected content; a status reads "בטעינה"', async ({
    page,
  }) => {
    for (const path of ['/feed', '/', '/login', '/settings', '/nope']) {
      await page.goto(APP + path);
      await waitForSeam(page);
      await expect(page.getByRole('status'), path).toHaveText(LOADING);
      await expect(h1Of(page), path).toHaveCount(0);
      await expect(page.getByRole('banner'), path).toHaveCount(0);
      await expect(navOf(page), path).toHaveCount(0);
      await expect(page.getByText(LINE), path).toHaveCount(0);
      await expect(page.getByText(LEAD), path).toHaveCount(0);
      expect(pathOf(page), 'the URL is untouched while loading').toBe(path);
    }
  });

  test('[F1.2 c7][FR-AUTH-004] loading then signed-in: the requested protected screen renders', async ({ page }) => {
    await open(page, '/settings', null);
    await expect(page.getByRole('status')).toHaveText(LOADING);
    await setState(page, 'signed-in');
    await expectUrl(page, '/settings');
    await expect(h1Of(page)).toHaveText('הגדרות');
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('[F1.2 c7][FR-AUTH-004] loading then signed-out: the user lands on /', async ({ page }) => {
    await open(page, '/profile', null);
    await expect(page.getByRole('status')).toHaveText(LOADING);
    await setState(page, 'signed-out');
    await expectUrl(page, '/');
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('[F1.2 c7][FR-AUTH-004] a session that goes back to loading hides the shell and protected content again', async ({
    page,
  }) => {
    await open(page, '/feed', 'signed-in');
    await expect(h1Of(page)).toHaveText('פיד');
    await setState(page, 'loading');
    await expect(page.getByRole('status')).toHaveText(LOADING);
    await expect(navOf(page)).toHaveCount(0);
    await expect(page.getByText(LINE)).toHaveCount(0);
    await setState(page, 'signed-in');
    await expect(h1Of(page)).toHaveText('פיד');
  });

  test('[F1.2 c8][FR-AUTH-004] signed-in to signed-out in place: content leaves the DOM, URL becomes /, no document reload', async ({
    page,
  }) => {
    await open(page, '/profile', 'signed-in');
    await expect(h1Of(page)).toHaveText('פרופיל');
    await setMarker(page);
    await setState(page, 'signed-out');
    await expectUrl(page, '/');
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
    await expect(page.getByText(LINE)).toHaveCount(0);
    await expect(navOf(page)).toHaveCount(0);
    await expect(hamburgerOf(page)).toHaveCount(0);
    expect(await markerAlive(page), 'no document reload').toBe(true);
  });

  test('[F1.2 c8][FR-AUTH-004] with the drawer open, ending the session removes shell, drawer and content', async ({
    page,
  }) => {
    await open(page, '/feed', 'signed-in');
    await openDrawer(page);
    await setState(page, 'signed-out');
    await expectUrl(page, '/');
    await expect(drawerOf(page)).toHaveCount(0);
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
  });

  test('[F1.2 c8][c4][FR-AUTH-004] out, in, out again: signed-in lands on /feed, signed-out on /', async ({ page }) => {
    await open(page, '/settings', 'signed-in');
    await expectUrl(page, '/settings');
    await setState(page, 'signed-out');
    await expectUrl(page, '/');
    await setState(page, 'signed-in');
    await expectUrl(page, '/feed');
    await setState(page, 'signed-out');
    await expectUrl(page, '/');
  });

  test('[F1.2 c8][FR-AUTH-004] three state changes in the same task (out, in, out): the end state wins, no protected content stays', async ({
    page,
  }) => {
    await open(page, '/feed', 'signed-in');
    await page.evaluate(() => {
      const t: unknown = Reflect.get(window, 'nestlyTestSession');
      if (typeof t !== 'object' || t === null) throw new Error('no seam');
      const set: unknown = Reflect.get(t, 'set');
      if (typeof set !== 'function') throw new Error('no set');
      Reflect.apply(set, t, ['signed-out']);
      Reflect.apply(set, t, ['signed-in']);
      Reflect.apply(set, t, ['signed-out']);
    });
    await expectUrl(page, '/');
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
  });

  for (const path of ['/feed', '/home', '/profile', '/settings', '/']) {
    test(`[F1.2 c9][FR-AUTH-004] a session source that errors is treated as signed-out (loading at ${path})`, async ({
      page,
    }) => {
      await watch(page, { texts: [LINE], selectors: SHELL_SELECTORS });
      await page.goto(APP + path);
      await waitForSeam(page);
      await drive(page, 'fail');
      await expectUrl(page, '/');
      await expect(h1Of(page)).toHaveText(WELCOME_H1);
      await expect(page.getByRole('status')).toHaveCount(0);
      expect(await seen(page)).toEqual([]);
    });
  }

  test('[F1.2 c9][FR-AUTH-004] a source that errors while the user is signed-in fails closed: protected content leaves, user lands on /', async ({
    page,
  }) => {
    const errors = recordErrors(page);
    await open(page, '/feed', 'signed-in');
    await expect(h1Of(page)).toHaveText('פיד');
    await drive(page, 'fail');
    await expectUrl(page, '/');
    await expect(h1Of(page)).toHaveText(WELCOME_H1);
    await expect(page.getByText(LINE)).toHaveCount(0);
    expect(errors, 'the failing source must not crash the app with an uncaught error').toEqual([]);
  });

  for (const path of ['/xyz', '/marketplace', '/profile/123', '/feed/extra', '/auth/google/extra']) {
    test(`[F1.2 c10][FR-AUTH-004][DR-1] a signed-in user on the unknown path ${path} is replaced by /feed`, async ({
      page,
    }) => {
      await watch(page, { texts: [WELCOME_H1] });
      await page.goto(APP + path);
      await waitForSeam(page);
      await resetSeen(page);
      const len = await historyLength(page);
      await setState(page, 'signed-in');
      await expectUrl(page, '/feed');
      await expect(h1Of(page)).toHaveText('פיד');
      expect(await seen(page)).toEqual([]);
      expect(await historyLength(page), 'replace, not push').toBe(len);
      await expect(page.getByText(/404|לא נמצא/)).toHaveCount(0);
    });
  }

  test('[F1.2 c10][FR-AUTH-004][DR-1] //evil.example as a signed-in user stays on the app origin and lands on /feed', async ({
    page,
  }) => {
    await page.goto(APP + '//evil.example');
    await waitForSeam(page);
    await setState(page, 'signed-in');
    await expectUrl(page, '/feed');
  });

  test('[F1.2 c10][FR-AUTH-004][DR-1] a signed-in user moved in-app to an unknown path (history API) is sent to /feed', async ({
    page,
  }) => {
    await open(page, '/feed', 'signed-in');
    await page.evaluate(() => {
      window.history.pushState(null, '', '/xyz');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expectUrl(page, '/feed');
  });
});

// ---------------------------------------------------------------------------------------------
// Session seam. The pure decision function and the contract suite cannot be asserted from the spec: see the report.
// ---------------------------------------------------------------------------------------------

test.describe('Session seam', () => {
  test('[F1.2 c12][FR-AUTH-004] every state and transition is drivable with no network and no login screen: loading→in, loading→out, in→out, error', async ({
    page,
  }) => {
    const urls = recordRequests(page);
    await open(page, '/feed', null);
    await setState(page, 'signed-in');
    await expectUrl(page, '/feed');
    await setState(page, 'signed-out');
    await expectUrl(page, '/');
    await open(page, '/feed', null);
    await setState(page, 'signed-out');
    await expectUrl(page, '/');
    await open(page, '/feed', null);
    await drive(page, 'fail');
    await expectUrl(page, '/');
    expect(urls.filter((u) => new URL(u).origin !== APP)).toEqual([]);
  });

  test('[F1.2 c11][c21][FR-MENU-001] the seam counts sign-out calls and starts at zero', async ({ page }) => {
    await open(page, '/feed', 'signed-in');
    expect(await signOutCalls(page)).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------------------------

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
    expect(b.y + b.height, 'not a bottom bar: it does not hug the bottom edge as a wide strip').toBeLessThanOrEqual(DESKTOP.height);
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
  test('[F1.2 c19][FR-MENU-001] the drawer titled "תפריט" holds exactly two items in order: הגדרות (link to /settings), התנתקות (button)', async ({
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

  for (const route of GUEST_ROUTES.slice(1)) {
    test(`[F1.2 c22][FR-AUTH-004] the Guest placeholder ${route.path} sends no request to /api/*`, async ({ page }) => {
      const urls = recordRequests(page);
      await open(page, route.path, 'signed-out');
      await expect(h1Of(page)).toHaveText(route.h1);
      await page.waitForTimeout(300);
      expect(urls.filter((u) => new URL(u).pathname.startsWith('/api/'))).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Accessibility, RTL, copy
// ---------------------------------------------------------------------------------------------

interface Setup {
  name: string;
  /** With the drawer open the page behind it is aria-hidden, so the h1 is not in the accessibility tree. */
  modal?: boolean;
  run: (page: Page) => Promise<void>;
}
const axeSetups: Setup[] = [
  ...GUEST_ROUTES.map((r) => ({ name: `Guest ${r.path}`, run: (p: Page) => open(p, r.path, 'signed-out') })),
  ...PROTECTED_ROUTES.map((r) => ({ name: `protected ${r.path}`, run: (p: Page) => open(p, r.path, 'signed-in') })),
  {
    name: 'the open drawer',
    modal: true,
    run: async (p: Page) => {
      await open(p, '/feed', 'signed-in');
      await openDrawer(p);
    },
  },
];

test.describe('axe-core', () => {
  for (const vp of [MOBILE, DESKTOP]) {
    for (const setup of axeSetups) {
      test(`[F1.2 c23][NFR-A11Y-001] axe finds zero violations on ${setup.name} @${vp.width}`, async ({ page }) => {
        await page.setViewportSize(vp);
        await setup.run(page);
        if (setup.modal === true) await expect(drawerOf(page)).toBeVisible();
        else await expect(h1Of(page)).toBeVisible();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const result = await runAxe(page, { tags: AXE_TAGS });
        expect(result.passes, 'axe actually evaluated rules').toBeGreaterThan(0);
        expect(result.violations).toEqual([]);
      });
    }
  }
});

test.describe('titles and focus', () => {
  for (const route of [...GUEST_ROUTES, ...PROTECTED_ROUTES]) {
    test(`[F1.2 c24][NFR-A11Y-001] ${route.path} sets document.title "${route.title}"`, async ({ page }) => {
      await open(page, route.path, GUEST_ROUTES.includes(route) ? 'signed-out' : 'signed-in');
      await expect(page).toHaveTitle(route.title);
    });
  }

  test('[F1.2 c24][NFR-A11Y-001] the title follows in-app navigation', async ({ page }) => {
    await open(page, '/home', 'signed-in');
    await navOf(page).getByRole('link', { name: 'פרופיל', exact: true }).click();
    await expect(page).toHaveTitle('פרופיל · Nestly');
    await navOf(page).getByRole('link', { name: 'פיד', exact: true }).click();
    await expect(page).toHaveTitle('פיד · Nestly');
  });

  test('[F1.2 c24][NFR-A11Y-001] after a redirect (Guest at /feed) focus is on the new screen main', async ({ page }) => {
    await open(page, '/feed', 'signed-out');
    await expectUrl(page, '/');
    await expect(page.locator('main')).toBeFocused();
  });

  test('[F1.2 c24][NFR-A11Y-001][DR-1] after the signed-in redirect to /feed focus is on main', async ({ page }) => {
    await open(page, '/xyz', 'signed-in');
    await expectUrl(page, '/feed');
    await expect(page.locator('main')).toBeFocused();
  });

  test('[F1.2 c24][NFR-A11Y-001] after every in-app navigation (Welcome actions, nav links) focus is on main', async ({
    page,
  }) => {
    await open(page, '/', 'signed-out');
    for (const [name, path] of [
      [CREATE, '/register'],
      [HAVE_ACCOUNT, '/login'],
      [GOOGLE, '/auth/google'],
    ] as const) {
      await actionOf(page, name).click();
      await expectUrl(page, path);
      await expect(page.locator('main'), path).toBeFocused();
      await actionOf(page, 'חזרה').click();
      await expectUrl(page, '/');
      await expect(page.locator('main')).toBeFocused();
    }
    await open(page, '/settings', 'signed-in');
    for (const route of PROTECTED_ROUTES.slice(0, 3)) {
      await navOf(page).getByRole('link', { name: route.h1, exact: true }).click();
      await expectUrl(page, route.path);
      await expect(page.locator('main'), route.path).toBeFocused();
    }
  });

  test('[F1.2 c24][NFR-A11Y-001] Welcome is operable by keyboard alone, in visual order', async ({ page }) => {
    await open(page, '/', 'signed-out');
    const names = await tabNames(page, 6);
    const idx = [CREATE, GOOGLE, HAVE_ACCOUNT].map((n) => names.indexOf(n));
    expect(
      idx.every((i) => i >= 0),
      `all three actions are reached by Tab: ${names.join(' | ')}`,
    ).toBe(true);
    expect(idx[0]).toBeLessThan(idx[1] ?? -1);
    expect(idx[1]).toBeLessThan(idx[2] ?? -1);
    const ys: number[] = [];
    for (const n of [CREATE, GOOGLE, HAVE_ACCOUNT]) ys.push((await actionOf(page, n).boundingBox())?.y ?? -1);
    expect(ys[0]).toBeLessThan(ys[1] ?? -1);
    expect(ys[1]).toBeLessThan(ys[2] ?? -1);
    await actionOf(page, CREATE).focus();
    await page.keyboard.press('Enter');
    await expectUrl(page, '/register');
    await expect(page.locator('main')).toBeFocused();
  });

  test('[F1.2 c24][NFR-A11Y-001] the shell is operable by keyboard alone: Hamburger first, then the nav links in order (RTL: right to left)', async ({
    page,
  }) => {
    await open(page, '/feed', 'signed-in');
    const names = await tabNames(page, 8);
    const i = [MENU_BUTTON, 'בית', 'פיד', 'פרופיל'].map((n) => names.indexOf(n));
    expect(
      i.every((x) => x >= 0),
      `reached: ${names.join(' | ')}`,
    ).toBe(true);
    expect([...i].sort((a, b) => a - b)).toEqual(i);
    const xs: number[] = [];
    for (const n of ['בית', 'פיד', 'פרופיל']) {
      xs.push((await navOf(page).getByRole('link', { name: n, exact: true }).boundingBox())?.x ?? -1);
    }
    expect(xs[0]).toBeGreaterThan(xs[1] ?? Infinity);
    expect(xs[1]).toBeGreaterThan(xs[2] ?? Infinity);
  });

  test('[F1.2 c24][NFR-A11Y-001] the drawer by keyboard: Enter opens, focus moves inside, הגדרות then התנתקות, Enter on הגדרות navigates and focuses main', async ({
    page,
  }) => {
    await open(page, '/feed', 'signed-in');
    await hamburgerOf(page).focus();
    await page.keyboard.press('Enter');
    await expect(drawerOf(page)).toBeVisible();
    const inside = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
    expect(inside, 'focus is inside the drawer').toBe(true);
    const names = await tabNames(page, 4);
    expect(names.indexOf('הגדרות')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('התנתקות')).toBeGreaterThan(names.indexOf('הגדרות'));
    await drawerOf(page).getByRole('link', { name: 'הגדרות' }).focus();
    expect(await focusedName(page)).toBe('הגדרות');
    await page.keyboard.press('Enter');
    await expectUrl(page, '/settings');
    await expect(drawerOf(page)).toHaveCount(0);
    await expect(page.locator('main')).toBeFocused();
  });

  test('[F1.2 c24][c21][NFR-A11Y-001][FR-MENU-001] Logout by keyboard (Space) signs out once', async ({ page }) => {
    await open(page, '/feed', 'signed-in');
    await hamburgerOf(page).focus();
    await page.keyboard.press('Enter');
    await drawerOf(page).getByRole('button', { name: 'התנתקות' }).focus();
    await page.keyboard.press('Space');
    expect(await signOutCalls(page)).toBe(1);
    await expect(drawerOf(page)).toHaveCount(0);
  });

  test('[F1.2 c24][NFR-A11Y-001] Escape closes the drawer and returns focus to the Hamburger', async ({ page }) => {
    await open(page, '/feed', 'signed-in');
    await openDrawer(page);
    await page.keyboard.press('Escape');
    await expect(drawerOf(page)).toHaveCount(0);
    await expect(hamburgerOf(page)).toBeFocused();
  });
});

test.describe('RTL and copy', () => {
  const everyRoute = [...GUEST_ROUTES, ...PROTECTED_ROUTES, { path: '/xyz', h1: '', title: '' }];
  for (const route of everyRoute) {
    test(`[F1.2 c25][rtl-hebrew] ${route.path}: html lang="he" dir="rtl", at 375 no horizontal scroll (loading and resolved)`, async ({
      page,
    }) => {
      const isGuest = GUEST_ROUTES.some((g) => g.path === route.path);
      await page.goto(APP + route.path);
      await waitForSeam(page);
      const check = async (label: string) => {
        const info = await page.evaluate(() => ({
          lang: document.documentElement.getAttribute('lang'),
          dir: document.documentElement.getAttribute('dir'),
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }));
        expect(info.lang, `${label} lang`).toBe('he');
        expect(info.dir, `${label} dir`).toBe('rtl');
        expect(info.sw, `${label} no horizontal scroll`).toBeLessThanOrEqual(info.cw);
      };
      await check('loading');
      await setState(page, isGuest ? 'signed-out' : 'signed-in');
      await expect(h1Of(page)).toBeVisible();
      await check('resolved');
    });
  }

  test('[F1.2 c25][rtl-hebrew] no horizontal scroll with the drawer open at 375', async ({ page }) => {
    await open(page, '/feed', 'signed-in');
    await openDrawer(page);
    const widths = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(widths.sw).toBeLessThanOrEqual(widths.cw);
  });

  for (const route of [...GUEST_ROUTES, ...PROTECTED_ROUTES]) {
    test(`[F1.2 c26][NFR-USAB-003] ${route.path}: rendered copy has no slash gender form`, async ({ page }) => {
      await open(page, route.path, GUEST_ROUTES.includes(route) ? 'signed-out' : 'signed-in');
      await expect(h1Of(page)).toBeVisible();
      const text = await bodyText(page);
      expect(text).not.toMatch(/[א-ת]\/[א-ת]/);
      expect(text).not.toMatch(/\/(?:ה|י|ית|ת)(?![א-ת])/);
    });
  }

  test('[F1.2 c26][NFR-USAB-003] the drawer copy has no slash gender form', async ({ page }) => {
    await open(page, '/feed', 'signed-in');
    await openDrawer(page);
    expect(await drawerOf(page).innerText()).not.toMatch(/[א-ת]\/[א-ת]/);
  });

  test('[F1.2 c1][c22][Q5][Q6] the lead text and the placeholder line are exactly the specified strings', async ({ page }) => {
    await open(page, '/', 'signed-out');
    await expect(page.getByText(LEAD, { exact: true })).toHaveCount(1);
    await open(page, '/home', 'signed-in');
    await expect(page.getByText(LINE, { exact: true })).toHaveCount(1);
  });
});
