// F1.2 app-shell-guard (I1), part 3 of 3: accessibility (axe, titles, focus, keyboard), RTL and copy.
// Derived from .work/app-shell-guard/spec.md only. Runs against the e2e build of the web app (server: the webServer
// entry in playwright.config.ts), Chrome and Edge. Part 1: app-shell-guard-routes.spec.ts; part 2: app-shell-guard-shell.spec.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DESKTOP, MOBILE, runAxe } from './helpers';
import {
  APP,
  CREATE,
  DRAWER_TITLE,
  GOOGLE,
  GOOGLE_RETURN,
  GUEST_ROUTES,
  HAVE_ACCOUNT,
  LEAD,
  LINE,
  MENU_BUTTON,
  NAV,
  PROTECTED_ROUTES,
  actionOf,
  bodyText,
  focusedName,
  open,
  setState,
  signOutCalls,
  tabNames,
  waitForSeam,
} from './app-helpers';

test.use({ baseURL: APP, viewport: MOBILE });

const GUEST_PAGES = [...GUEST_ROUTES, GOOGLE_RETURN];
const AXE_TAGS =['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const expectUrl = (page: Page, path: string) => expect(page).toHaveURL(APP + path);
const h1Of = (page: Page) => page.getByRole('heading', { level: 1 });
const navOf = (page: Page) => page.getByRole('navigation', { name: NAV });
const drawerOf = (page: Page) => page.getByRole('dialog', { name: DRAWER_TITLE });
const hamburgerOf = (page: Page) => page.getByRole('button', { name: MENU_BUTTON, exact: true });

async function openDrawer(page: Page): Promise<void> {
  await hamburgerOf(page).click();
  await expect(drawerOf(page)).toBeVisible();
}

interface Setup {
  name: string;
  /** With the drawer open the page behind it is aria-hidden, so the h1 is not in the accessibility tree. */
  modal?: boolean;
  run: (page: Page) => Promise<void>;
}
const axeSetups: Setup[] = [
  ...GUEST_PAGES.map((r) => ({ name: `Guest ${r.path}`, run: (p: Page) => open(p, r.path, 'signed-out') })),
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
    await expect(page).toHaveTitle('הפיד · Nestly');
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

  // F1.8: "המשך עם Google" on Welcome is no longer an in-app navigation (it starts the provider redirect, c16/c17), so it leaves this loop;
  // focus on the Google return screen (the heading, not main) is F1.8 c18, asserted in google-buttons.spec.ts.
  test('[F1.2 c24][NFR-A11Y-001] after every in-app navigation (Welcome actions, nav links) focus is on main', async ({
    page,
  }) => {
    await open(page, '/', 'signed-out');
    for (const [name, path] of [
      [CREATE, '/register'],
      [HAVE_ACCOUNT, '/login'],
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
      await navOf(page).getByRole('link', { name: route.nav ?? route.h1, exact: true }).click();
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
    const names = await tabNames(page, 9); // I11: "יועצים" joined the nav before "פרופיל"
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

  test('[F1.2 c24][NFR-A11Y-001] the drawer by keyboard: Enter opens, focus moves inside, חשבון then התנתקות, Enter on חשבון navigates and focuses the Account h2 [F2.5 c11]', async ({
    page,
  }) => {
    await open(page, '/feed', 'signed-in');
    await hamburgerOf(page).focus();
    await page.keyboard.press('Enter');
    await expect(drawerOf(page)).toBeVisible();
    const inside = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
    expect(inside, 'focus is inside the drawer').toBe(true);
    const names = await tabNames(page, 16); // F3.6 c11: "שיתוף Nestly" joined the drawer before the logout; I7 "התראות" and I8 "פנייה לתמיכה" joined too; I11 "בעלי מקצוע" and "הצעות עזרה"
    expect(names.indexOf('חשבון')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('התנתקות')).toBeGreaterThan(names.indexOf('חשבון'));
    await drawerOf(page).getByRole('link', { name: 'חשבון', exact: true }).focus();
    expect(await focusedName(page)).toBe('חשבון');
    await page.keyboard.press('Enter');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/settings');
    await expect(drawerOf(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'חשבון', exact: true })).toBeFocused();
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
  const everyRoute = [...GUEST_PAGES, ...PROTECTED_ROUTES, { path: '/xyz', h1: '', title: '' }];
  for (const route of everyRoute) {
    test(`[F1.2 c25][rtl-hebrew] ${route.path}: html lang="he" dir="rtl", at 375 no horizontal scroll (loading and resolved)`, async ({
      page,
    }) => {
      const isGuest = GUEST_PAGES.some((g) => g.path === route.path);
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

  for (const route of [...GUEST_PAGES, ...PROTECTED_ROUTES]) {
    test(`[F1.2 c26][NFR-USAB-003] ${route.path}: rendered copy has no slash gender form`, async ({ page }) => {
      await open(page, route.path, GUEST_PAGES.includes(route) ? 'signed-out' : 'signed-in');
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
