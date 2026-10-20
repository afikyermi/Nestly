// I2 F2.5 Settings and side-menu destinations (real browser, real session source, network stubbed).
// Derived from .work/settings-menu/spec.md only (12 criteria, Gate 1 and "Gate 1 clarifications"). The address of a section is Q2's
// open choice (default `/settings#account|privacy|terms`): the tests read the address from the app and assert only that it is on
// /settings, differs per section, survives a reload and has a section token to corrupt. c1's order and c2's first-section focus are
// also asserted in app-shell-guard-shell.spec.ts (the amended F1.2 c19/c20); c6's path table is apps/web/tests/app/access-decision.test.ts.
// The privacy form itself is F2.3's (e2e/privacy.spec.ts). Visual baselines are the entries in e2e/visual-screens.ts.
import { expect, test } from '@playwright/test';
import type { Locator, Page, Route } from '@playwright/test';
import { APP, MENU_BUTTON, WELCOME_H1, open, pathOf } from './app-helpers';
import { CORS, DESKTOP_1280, EMAIL, NOW, json, main, scan, session } from './support/journeys-stub';

test.use({ baseURL: APP, viewport: { width: 360, height: 800 } });

const PHONE = { width: 360, height: 800 };
const SIZES = [
  { label: 'phone', viewport: PHONE },
  { label: 'desktop', viewport: DESKTOP_1280 },
] as const;
const SECTIONS = ['חשבון', 'פרטיות ואבטחה', 'תנאים ופרטיות'] as const;
const DRAWER = 'תפריט';
const PRIVACY_LOAD_FAILED = 'לא הצלחנו לטעון את הגדרות הפרטיות. אפשר לנסות שוב';
const PASSWORD = 'Zq-7-unique-pw-marker-91';

interface Net {
  /** Every fetch/xhr the page made since the last `calls.length = 0`, as "METHOD /path". */
  calls: string[];
  get: number | 'hold';
  me: 'active' | 'unavailable';
  releaseGet: () => void;
}

async function setup(page: Page): Promise<Net> {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const net: Net = { calls: [], get: 200, me: 'active', releaseGet: release };
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => {
    Reflect.set(window, 'nestlyRealSession', true);
  });
  page.on('request', (req) => {
    if (['fetch', 'xhr'].includes(req.resourceType()) && req.method() !== 'OPTIONS') net.calls.push(`${req.method()} ${new URL(req.url()).pathname}`);
  });
  const far = Math.floor(new Date(2100, 0, 1).getTime() / 1000);
  await page.route('https://e2e-stub.invalid/auth/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.url().includes('/token')) return json(route, 200, session(far));
    if (req.url().includes('/logout')) return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET' && req.url().includes('/auth/v1/user')) return json(route, 200, { id: 'u-1', email: EMAIL, app_metadata: { provider: 'email' } });
    return json(route, 404, { error: 'unstubbed' });
  });
  const answer = (path: string, body: (route: Route) => Promise<unknown>) =>
    page.route(`**/api/${path}`, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      return body(route);
    });
  await answer('me', async (route) => json(route, 200, net.me === 'active' ? { state: 'active', recoveryQuestions: 'set', mustSetPassword: false } : { state: 'unavailable' }));
  await answer('profile', async (route) => json(route, 200, { fullName: 'דנה כהן', parentGender: 'woman' }));
  await answer('blocks', async (route) => json(route, 200, { blocked: [] })); // the blocked list in Settings (FR-REL-002), empty
  await answer('journeys', async (route) => json(route, 200, { journeys: [{ id: 'j-1', stage: 'planning', dueDate: null }], children: [] }));
  await answer('privacy', async (route) => {
    if (net.get === 'hold') await held;
    if (net.get !== 200 && net.get !== 'hold') return json(route, net.get, { error: 'internal' });
    return json(route, 200, { profileVisibility: 'open', isEmptyJourneySentenceShown: true, isChildBirthdayShared: true });
  });
  return net;
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}
const drawer = (page: Page) => page.getByRole('dialog', { name: DRAWER });
const hamburger = (page: Page) => page.getByRole('button', { name: MENU_BUTTON, exact: true });
const h2 = (page: Page, name: string) => page.getByRole('heading', { level: 2, name, exact: true });
async function openMenu(page: Page): Promise<void> {
  await hamburger(page).click();
  await expect(drawer(page)).toBeVisible();
}
/** From any screen of the signed-in app: open the drawer and choose an item (a client-side navigation). */
async function choose(page: Page, name: string): Promise<void> {
  await openMenu(page);
  await drawer(page).getByRole('link', { name, exact: true }).click();
}
async function signedInAtFeed(page: Page): Promise<Net> {
  const net = await setup(page);
  await signIn(page);
  await expect(page).toHaveURL(/\/feed$/);
  return net;
}
/** The focusable controls between this section's h2 and the next h2 (or the end of main): structure-independent. */
function controlsOf(page: Page, name: string): Promise<Array<{ tag: string; name: string; href: string | null; type: string | null }>> {
  return h2(page, name).evaluate((start) => {
    const out: Array<{ tag: string; name: string; href: string | null; type: string | null }> = [];
    const all = Array.from(document.querySelectorAll('main h2, main a[href], main button, main input, main select, main textarea'));
    for (const el of all.slice(all.indexOf(start) + 1)) {
      if (el.tagName === 'H2') break;
      out.push({
        tag: el.tagName.toLowerCase(),
        name: (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim(),
        href: el.getAttribute('href'),
        type: el.getAttribute('type'),
      });
    }
    return out;
  });
}
const inViewport = (el: Locator) =>
  el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  });

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.5 c2 [FR-SET-001 FR-MENU-001] each menu section opens Settings at that section', () => {
  test('[F2.5 c2] each of the three items closes the drawer, shows /settings with the h2 visible and focused, at its own address', async ({ page }) => {
    await signedInAtFeed(page);
    const addresses: string[] = [];
    for (const name of SECTIONS) {
      await choose(page, name);
      await expect.poll(() => pathOf(page)).toBe('/settings');
      await expect(drawer(page)).toHaveCount(0);
      await expect(h2(page, name)).toBeVisible();
      await expect(h2(page, name)).toBeFocused();
      addresses.push(page.url());
    }
    expect(new Set(addresses).size, `three different addresses: ${addresses.join(' ')}`).toBe(3);
  });

  test('[F2.5 c2] reloading a section address shows the same section; back returns to the previous screen', async ({ page }) => {
    await signedInAtFeed(page);
    await choose(page, 'פרטיות ואבטחה');
    await expect(h2(page, 'פרטיות ואבטחה')).toBeFocused();
    const address = page.url();
    await page.reload();
    expect(page.url()).toBe(address);
    await expect(h2(page, 'פרטיות ואבטחה')).toBeVisible();
    expect(await inViewport(h2(page, 'פרטיות ואבטחה')), 'the section is in view after a reload').toBe(true);
    await page.goBack();
    await expect.poll(() => pathOf(page)).not.toBe('/settings');
  });

  test('[F2.5 c2] an unknown section in the address shows the top of Settings, no error', async ({ page }) => {
    await signedInAtFeed(page);
    await choose(page, 'חשבון');
    const odd = page.url().replace('account', 'no-such-section');
    expect(odd, 'the account address carries a section token (Q2 default #account)').not.toBe(page.url());
    await page.goto(odd);
    await expect(page.getByRole('heading', { level: 1, name: 'הגדרות', exact: true })).toBeVisible();
    expect(pathOf(page)).toBe('/settings');
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3);
    expect(await inViewport(page.getByRole('heading', { level: 1 })), 'the top of the page').toBe(true);
    expect(await main(page).innerText()).not.toMatch(/שגיאה|לא נמצא|404/);
  });
});

test.describe('F2.5 c3 [FR-MENU-001 FR-AUTH-003] the other menu items keep their destinations', () => {
  test('[F2.5 c3] recovery questions and change password open their routes', async ({ page }) => {
    await signedInAtFeed(page);
    await choose(page, 'שאלות לשחזור סיסמה');
    await expect.poll(() => pathOf(page)).toBe('/recovery-questions');
    await choose(page, 'החלפת סיסמה');
    await expect.poll(() => pathOf(page)).toBe('/change-password');
  });

  test('[F2.5 c3] "התנתקות" ends the session on this device and lands on Welcome', async ({ page }) => {
    await signedInAtFeed(page);
    await openMenu(page);
    await drawer(page).getByRole('button', { name: 'התנתקות', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/');
    await expect(page.getByRole('heading', { level: 1, name: WELCOME_H1 })).toBeVisible();
  });

  test('[F2.5 c3] choosing the item of the screen already open replaces the history entry (no new entry)', async ({ page }) => {
    await signedInAtFeed(page);
    await choose(page, 'החלפת סיסמה');
    await expect.poll(() => pathOf(page)).toBe('/change-password');
    // ux-polish-b c6: an open menu holds its own overlay entry; measured with it open, the choice itself adds none.
    await openMenu(page);
    const before = await page.evaluate(() => window.history.length);
    await drawer(page).getByRole('link', { name: 'החלפת סיסמה', exact: true }).click();
    await expect(drawer(page)).toHaveCount(0);
    expect(pathOf(page)).toBe('/change-password');
    expect(await page.evaluate(() => window.history.length)).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.5 c4 c7 [FR-SET-001 PG-038] the Settings page', () => {
  test('[F2.5 c4] one h1 "הגדרות" and one h2 per section, in DOM order', async ({ page }) => {
    await signedInAtFeed(page);
    await choose(page, 'חשבון');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('הגדרות');
    expect(await page.getByRole('heading', { level: 2 }).allInnerTexts()).toEqual([...SECTIONS]);
  });

  test('[F2.5 c4 DR-3] Account holds one link "עריכת פרופיל" to the profile and nothing else', async ({ page }) => {
    await signedInAtFeed(page);
    await choose(page, 'חשבון');
    expect(await controlsOf(page, 'חשבון')).toEqual([{ tag: 'a', name: 'עריכת פרופיל', href: '/profile', type: null }]);
    await main(page).getByRole('link', { name: 'עריכת פרופיל', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/profile');
  });

  test('[F2.5 c4 DR-3] Privacy & Security holds the privacy form plus links to recovery questions and change password', async ({ page }) => {
    await signedInAtFeed(page);
    await choose(page, 'פרטיות ואבטחה');
    await expect(main(page).getByRole('radio', { name: /^פרופיל פתוח/ })).toBeVisible();
    const controls = await controlsOf(page, 'פרטיות ואבטחה');
    const links = controls.filter((c) => c.tag === 'a').map((c) => c.href);
    expect(links).toContain('/recovery-questions');
    expect(links).toContain('/change-password');
    expect(links.length, 'only those two links').toBe(2);
    await main(page).locator('a[href="/change-password"]').click();
    await expect.poll(() => pathOf(page)).toBe('/change-password');
  });

  test('[F2.5 c7 DR-2 A] Terms & Privacy: two links in the same tab, each page has a way back to Settings', async ({ page }) => {
    await signedInAtFeed(page);
    await choose(page, 'תנאים ופרטיות');
    const controls = await controlsOf(page, 'תנאים ופרטיות');
    expect(controls).toEqual([
      { tag: 'a', name: 'תנאי השימוש', href: '/terms', type: null },
      { tag: 'a', name: 'מדיניות הפרטיות', href: '/privacy', type: null },
    ]);
    for (const [name, path, h1] of [['תנאי השימוש', '/terms', 'תנאי השימוש'], ['מדיניות הפרטיות', '/privacy', 'מדיניות הפרטיות']] as const) {
      await expect(main(page).getByRole('link', { name, exact: true })).not.toHaveAttribute('target', /./);
      const pages = page.context().pages().length;
      await main(page).getByRole('link', { name, exact: true }).click();
      await expect.poll(() => pathOf(page)).toBe(path);
      expect(page.context().pages().length, 'same tab').toBe(pages);
      await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
      const back = page.getByRole('link', { name: /הגדרות/ }).or(page.getByRole('button', { name: /הגדרות/ }));
      await expect(back.first(), 'a way back to Settings').toBeVisible();
      await back.first().click();
      await expect.poll(() => pathOf(page)).toBe('/settings');
      await expect(h2(page, 'תנאים ופרטיות')).toBeVisible();
    }
  });
});

test.describe('F2.5 c5 [A9 DR-1 U1] no account deletion, no Notification Settings', () => {
  test('[F2.5 c5] nothing in Settings (every section), the menu or the page source offers deletion; no notification section; no DELETE request', async ({ page }) => {
    const net = await signedInAtFeed(page);
    net.calls.length = 0;
    await openMenu(page);
    expect(await drawer(page).innerText()).not.toMatch(/מחיקת חשבון|מחיקה/);
    await page.keyboard.press('Escape');
    for (const name of SECTIONS) {
      await choose(page, name);
      await expect(h2(page, name)).toBeFocused();
    }
    await expect(page.getByRole('heading', { level: 1, name: 'הגדרות', exact: true })).toBeVisible();
    expect(await main(page).innerText()).not.toMatch(/מחיקת חשבון|מחיקה/);
    expect(await page.content()).not.toMatch(/מחיקת חשבון|מחיקה/);
    expect(await page.getByRole('heading').allInnerTexts()).not.toContain('הגדרות התראות');
    for (const t of await page.getByRole('heading').allInnerTexts()) expect(t, 'no notifications heading').not.toMatch(/התראות/);
    for (const control of await main(page).getByRole('button').all()) expect(await control.innerText()).not.toMatch(/מחיקה|מחק/);
    expect(net.calls.filter((c) => c.startsWith('DELETE'))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.5 c6 [FR-AUTH-004 ERR-012] the route guard, in the browser', () => {
  test('[F2.5 c6] an active signed-in user opens /terms and /privacy (no redirect to the feed)', async ({ page }) => {
    await signedInAtFeed(page);
    for (const [path, h1] of [['/terms', 'תנאי השימוש'], ['/privacy', 'מדיניות הפרטיות']] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
      expect(pathOf(page)).toBe(path);
    }
  });

  test('[F2.5 c6] the other Guest paths still send an active signed-in user to /feed', async ({ page }) => {
    await signedInAtFeed(page);
    for (const path of ['/', '/login', '/register', '/recovery', '/auth/google']) {
      await page.goto(path);
      await expect.poll(() => pathOf(page), path).toBe('/feed');
    }
  });

  test('[F2.5 c6] a held account (recovery questions missing) may read /terms and /privacy, and is sent back from /settings', async ({ page }) => {
    await open(page, '/terms', 'signed-in-needs-recovery');
    expect(pathOf(page)).toBe('/terms');
    await open(page, '/privacy', 'signed-in-needs-recovery');
    expect(pathOf(page)).toBe('/privacy');
    await open(page, '/settings', 'signed-in-needs-recovery');
    await expect.poll(() => pathOf(page)).toBe('/recovery-questions');
  });

  test('[F2.5 c6] signed out: /settings, /settings/x and /settings/ all go to Welcome', async ({ page }) => {
    for (const path of ['/settings', '/settings/x', '/settings/']) {
      await open(page, path, 'signed-out');
      await expect.poll(() => pathOf(page), path).toBe('/');
      await expect(page.getByRole('heading', { level: 1, name: WELCOME_H1 })).toBeVisible();
    }
  });

  test('[F2.5 c6] signed out: /terms and /privacy still render for a Guest', async ({ page }) => {
    for (const path of ['/terms', '/privacy']) {
      await open(page, path, 'signed-out');
      expect(pathOf(page)).toBe(path);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.5 c8 [A9 FR-AUTH-004] Settings makes no request of its own', () => {
  test('[F2.5 c8] opening Settings and visiting every section sends only the privacy GET', async ({ page }) => {
    const net = await signedInAtFeed(page);
    await page.waitForTimeout(300);
    net.calls.length = 0;
    for (const name of SECTIONS) {
      await choose(page, name);
      await expect(h2(page, name)).toBeFocused();
    }
    await page.waitForTimeout(500);
    expect([...new Set(net.calls)]).toEqual(['GET /api/privacy']);
  });

  test('[F2.5 c8 ERR-037] a suspended or banned account never renders Settings: the same screen as /profile, no privacy GET', async ({ page }) => {
    const net = await setup(page);
    await signIn(page);
    net.me = 'unavailable'; // the account is suspended or banned after sign-in; the next load rechecks it
    net.calls.length = 0;
    await page.goto('/settings');
    await page.waitForTimeout(500);
    // the ERR-037 path: the account is not available, so the session ends and the user is sent to login with that notice
    await expect.poll(() => pathOf(page)).toBe('/login');
    await expect(page.getByText('הכניסה לחשבון הזה אינה זמינה כרגע')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'הגדרות', exact: true })).toHaveCount(0);
    for (const name of SECTIONS) await expect(h2(page, name)).toHaveCount(0);
    expect(net.calls.filter((c) => c.includes('/api/privacy'))).toEqual([]);
  });
});

test.describe('F2.5 c9 [ERR-004] the privacy GET failing or pending affects only the Privacy section', () => {
  for (const mode of [500, 'hold'] as const) {
    test(`[F2.5 c9] privacy GET ${String(mode)}: Account and Terms & Privacy stay visible and usable, and the menu works`, async ({ page }) => {
      const net = await setup(page);
      net.get = mode;
      await signIn(page);
      await expect(page).toHaveURL(/\/feed$/);
      await choose(page, 'חשבון');
      for (const name of SECTIONS) await expect(h2(page, name)).toBeVisible();
      if (mode === 500) await expect(main(page).getByText(PRIVACY_LOAD_FAILED)).toBeVisible();
      else await expect(main(page).getByRole('radio')).toHaveCount(0);
      await choose(page, 'תנאים ופרטיות');
      await expect(h2(page, 'תנאים ופרטיות')).toBeFocused();
      await main(page).getByRole('link', { name: 'תנאי השימוש', exact: true }).click();
      await expect.poll(() => pathOf(page)).toBe('/terms');
      await page.goBack();
      await expect.poll(() => pathOf(page)).toBe('/settings');
      await choose(page, 'חשבון');
      await main(page).getByRole('link', { name: 'עריכת פרופיל', exact: true }).click();
      await expect.poll(() => pathOf(page)).toBe('/profile');
      net.releaseGet();
    });
  }
});

test.describe('F2.5 c10 the temporary privacy link is gone from the profile page', () => {
  test('[F2.5 c10] the profile page has no "הגדרות פרטיות" link and no link to /settings in its content', async ({ page }) => {
    await setup(page);
    await signIn(page);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'פרופיל', exact: true })).toBeVisible();
    await expect(main(page).getByRole('link', { name: 'הגדרות פרטיות' })).toHaveCount(0);
    await expect(main(page).locator('a[href^="/settings"]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.5 c11 [NFR-A11Y-001 S3] keyboard only', () => {
  test('[F2.5 c11] Enter on the Hamburger opens the drawer and focus is inside; Tab and Shift+Tab stay inside; Esc closes and returns focus', async ({ page }) => {
    await signedInAtFeed(page);
    await hamburger(page).focus();
    await page.keyboard.press('Enter');
    await expect(drawer(page)).toBeVisible();
    const inside = () => page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
    expect(await inside(), 'focus lands in the drawer').toBe(true);
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      expect(await inside(), `Tab ${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await inside(), `Shift+Tab ${i + 1}`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(drawer(page)).toHaveCount(0);
    await expect(hamburger(page)).toBeFocused();
  });

  test('[F2.5 c11 c2] Enter on each section item navigates and focus is on the destination heading, never body or the Hamburger', async ({ page }) => {
    await signedInAtFeed(page);
    for (const name of SECTIONS) {
      await hamburger(page).focus();
      await page.keyboard.press('Enter');
      await expect(drawer(page)).toBeVisible();
      await drawer(page).getByRole('link', { name, exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(drawer(page)).toHaveCount(0);
      await expect(h2(page, name)).toBeFocused();
    }
  });

  test('[F2.5 c11] the current section\'s item has aria-current="page", no other item has it', async ({ page }) => {
    await signedInAtFeed(page);
    for (const current of SECTIONS) {
      await choose(page, current);
      await expect(h2(page, current)).toBeFocused();
      await openMenu(page);
      for (const name of SECTIONS) {
        const item = drawer(page).getByRole('link', { name, exact: true });
        if (name === current) await expect(item).toHaveAttribute('aria-current', 'page');
        else await expect(item).not.toHaveAttribute('aria-current', /./);
      }
      await page.keyboard.press('Escape');
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
for (const size of SIZES) {
  test.describe(`F2.5 c12 [S3 NFR-A11Y-001] axe, RTL and layout at ${size.label} (${size.viewport.width}px)`, () => {
    test.use({ viewport: size.viewport });

    test(`[F2.5 c12] side-menu-open (${size.label}): zero axe violations, RTL, opens from the right edge`, async ({ page }) => {
      await signedInAtFeed(page);
      await openMenu(page);
      await scan(page);
      const box = await drawer(page).boundingBox();
      if (box === null) throw new Error('the drawer has no box');
      expect(box.x + box.width, 'the drawer touches the right edge').toBeGreaterThanOrEqual(size.viewport.width - 1);
      expect(box.x, 'the drawer is not off-screen').toBeGreaterThanOrEqual(0);
    });

    for (const name of SECTIONS) {
      test(`[F2.5 c12] settings, ${name} in view (${size.label}): zero axe violations, RTL, one column, no horizontal scroll`, async ({ page }) => {
        await signedInAtFeed(page);
        await choose(page, name);
        await expect(h2(page, name)).toBeFocused();
        await expect(main(page).getByRole('radio', { name: /^פרופיל פתוח/ })).toBeVisible();
        await scan(page);
        const boxes = await page.getByRole('heading', { level: 2 }).evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top + window.scrollY };
          }),
        );
        for (let i = 1; i < boxes.length; i += 1) {
          const a = boxes[i - 1];
          const b = boxes[i];
          if (a === undefined || b === undefined) throw new Error('missing box');
          expect(b.top, `section ${i} sits below section ${i - 1}`).toBeGreaterThan(a.top);
          expect(Math.min(a.right, b.right) - Math.max(a.left, b.left), `sections ${i - 1} and ${i} share a column`).toBeGreaterThan(0);
        }
      });
    }
  });
}
