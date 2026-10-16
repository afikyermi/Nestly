// F1.2 app-shell-guard (I1), part 1 of 3: Welcome, RouteGuard, session seam.
// Derived from .work/app-shell-guard/spec.md only (DR-1: a signed-in user on an unknown path goes to /feed).
// Runs against the e2e build of the web app (server: the webServer entry in playwright.config.ts), Chrome and Edge.
// Test names: [F1.2 cN] + the SRS ids the criterion cites. Parts 2 and 3: app-shell-guard-shell.spec.ts, app-shell-guard-a11y.spec.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MOBILE } from './helpers';
import {
  APP,
  CREATE,
  GOOGLE,
  GOOGLE_RETURN,
  GUEST_ROUTES,
  HAVE_ACCOUNT,
  LEAD,
  LINE,
  LOADING,
  MENU_BUTTON,
  NAV,
  WELCOME_H1,
  actionOf,
  bodyText,
  drive,
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
  waitForSeam,
  watch,
} from './app-helpers';

test.use({ baseURL: APP, viewport: MOBILE });

const SHELL_SELECTORS = [`[aria-label="${NAV}"]`, `[aria-label="${MENU_BUTTON}"]`];
const expectUrl = (page: Page, path: string) => expect(page).toHaveURL(APP + path);
const h1Of = (page: Page) => page.getByRole('heading', { level: 1 });
// F1.8 c16/c17: Guest pages carry the Google button's always-present, empty live region (role=status). "No message" means no status
// region has any text, not that no region exists.
const expectNoStatusMessage = (page: Page) => expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveCount(0);
const navOf = (page: Page) => page.getByRole('navigation', { name: NAV });
const drawerOf = (page: Page) => page.getByRole('dialog', { name: 'תפריט' });
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
    await expect(h1Of(page)).toHaveText('פרטים אישיים');
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

  // F1.8: "המשך עם Google" on Welcome is a button that starts the provider redirect (c16/c17, google-buttons.spec.ts); /auth/google is the
  // return handler. Opened bare it is a Guest page with a heading, the c3 failure text in an alert, and links to /login and /register (c5).
  test('[F1.8 c3][c5][FR-AUTH-005][AC-087] a Guest at /auth/google with no code sees a heading, the failure text and links to /login and /register', async ({
    page,
  }) => {
    await open(page, '/auth/google', 'signed-out');
    await expect(h1Of(page)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText(
      'לא הצלחנו להשלים את הכניסה עם Google. אפשר לנסות שוב, או להתחבר עם אימייל וסיסמה.',
    );
    await expect(page.locator('main a[href="/login"]')).toHaveCount(1);
    await expect(page.locator('main a[href="/register"]')).toHaveCount(1);
  });

  test('[F1.2 c3][FR-AUTH-005][AC-087] no Welcome navigation action and no Guest page opened bare sends a request to Google, Supabase or /api/*', async ({
    page,
  }) => {
    const urls = recordRequests(page);
    await open(page, '/', 'signed-out');
    for (const name of [CREATE, HAVE_ACCOUNT]) {
      await actionOf(page, name).click();
      await expect(h1Of(page)).not.toHaveText(WELCOME_H1);
      await actionOf(page, 'חזרה').click();
      await expect(h1Of(page)).toHaveText(WELCOME_H1);
    }
    for (const route of GUEST_ROUTES.slice(1)) {
      await open(page, route.path, 'signed-out');
      await expect(h1Of(page)).toHaveText(route.h1);
    }
    await open(page, GOOGLE_RETURN.path, 'signed-out');
    await expect(h1Of(page)).toBeVisible();
    // Same-origin page loads of the app's own routes (e.g. /auth/google) are fine; nothing else leaves the app.
    const bad = urls.filter((u) => {
      const url = new URL(u);
      return url.origin !== APP || url.pathname.startsWith('/api/') || /\/auth\/v1|\/rest\/v1|supabase/i.test(url.href);
    });
    expect(bad).toEqual([]);
    expect(urls.some((u) => u.startsWith(APP)), 'the recorder saw requests at all').toBe(true);
  });

  for (const route of [...GUEST_ROUTES, GOOGLE_RETURN]) {
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
      await expectNoStatusMessage(page);
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
    for (const route of [...GUEST_ROUTES, GOOGLE_RETURN]) {
      await open(page, route.path, 'signed-out');
      await expectUrl(page, route.path);
      if (route.h1 === '') await expect(h1Of(page)).toBeVisible();
      else await expect(h1Of(page)).toHaveText(route.h1);
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
    await expectNoStatusMessage(page);
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
      await expectNoStatusMessage(page);
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
// Session seam. The pure decision function is tested in apps/web/tests/app/access-decision.test.ts.
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
