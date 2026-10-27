// UI wave 1 part f: criteria 38 (TopBar), 39 (BottomNavigation), 40 (SideDrawer), 41 (AppShell), with 15, 17, 18 and
// Q3 (story screenshots, attached, never compared). Built Storybook, real Chrome and Edge, RTL page.
// Derived from .work/ui-wave-1/spec.md only; story ids come from the built index.json.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { DESKTOP, MOBILE, openStory, runAxe, storiesOf } from './helpers';

const ROOT = '#storybook-root';
const MENU = 'פתיחת התפריט';
const NAV = 'ניווט ראשי';
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa'];

const TOPBAR = storiesOf('shared-topbar--');
const BOTTOMNAV = storiesOf('shared-bottomnavigation--');
const DRAWER = storiesOf('shared-sidedrawer--');
const SHELL = storiesOf('layout-appshell--');

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const box = async (locator: Locator): Promise<Box> => {
  const b = await locator.boundingBox();
  expect(b, 'element has a box').not.toBeNull();
  return b ?? { x: 0, y: 0, width: 0, height: 0 };
};
const right = (b: Box) => b.x + b.width;
const bottom = (b: Box) => b.y + b.height;
const viewportHeight = (page: Page) => page.evaluate(() => window.innerHeight);

test('part f: the part f stories exist (so the per-story specs cover them)', () => {
  expect(TOPBAR.length).toBeGreaterThanOrEqual(2); // default, with actions
  expect(BOTTOMNAV.length).toBeGreaterThanOrEqual(2); // 3 items (AC-005), 5 items
  expect(DRAWER.length).toBeGreaterThanOrEqual(2); // closed, open
  expect(SHELL.length).toBeGreaterThanOrEqual(1);
});

test.describe('TopBar (38)', () => {
  test.use({ viewport: MOBILE });

  for (const id of TOPBAR) {
    test(`[38] ${id}: one header landmark, a Hamburger named "${MENU}", the Logo at the right edge and the Hamburger at the left edge (RTL; §7.3, redesign 27.10.2026)`, async ({
      page,
    }) => {
      await openStory(page, id);
      await expect(page.locator(`${ROOT} header`)).toHaveCount(1);
      const hamburger = page.getByRole('button', { name: MENU });
      await expect(hamburger).toHaveCount(1);
      await expect(page.getByRole('img', { name: 'Nestly' }).or(page.getByRole('link', { name: 'Nestly' }))).toHaveCount(1);
      const h = await box(hamburger);
      const header = await box(page.locator(`${ROOT} header`));
      expect(h.x, 'Hamburger sits at the inline-end (left) edge of the bar').toBeLessThan(header.x + 24);
      const logo = await box(page.getByRole('img', { name: 'Nestly' }).or(page.getByRole('link', { name: 'Nestly' })));
      expect(right(logo), 'the Logo sits at the inline-start (right) edge').toBeGreaterThan(right(header) - 24);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOBILE.width);
    });

    test(`[38][18] ${id}: every control in the bar is at least 44x44`, async ({ page }) => {
      await openStory(page, id);
      const controls = page.locator(`${ROOT} header a[href], ${ROOT} header button`);
      const n = await controls.count();
      expect(n).toBeGreaterThanOrEqual(1);
      for (let i = 0; i < n; i += 1) {
        const b = await box(controls.nth(i));
        expect(b.width, `control ${i} width`).toBeGreaterThanOrEqual(44);
        expect(b.height, `control ${i} height`).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test('[38] the default story has no search, chat or bell: the Hamburger is the only control', async ({ page }) => {
    const id = TOPBAR.find((s) => s.endsWith('--default')) ?? TOPBAR[0] ?? '';
    await openStory(page, id);
    await expect(page.locator(`${ROOT} header button, ${ROOT} header a[href], ${ROOT} header input`)).toHaveCount(1);
    await expect(page.getByRole('search')).toHaveCount(0);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
  });

  test('[38] the with-actions story shows caller nodes in the header, between the Logo and the Hamburger, in the same bar (§7.3, redesign 27.10.2026)', async ({
    page,
  }) => {
    const id = TOPBAR.find((s) => s.includes('actions')) ?? '';
    expect(id).not.toBe('');
    await openStory(page, id);
    const extra = page.locator(`${ROOT} header a[href], ${ROOT} header button`);
    expect(await extra.count()).toBeGreaterThanOrEqual(2);
    const hamburger = await box(page.getByRole('button', { name: MENU }));
    const header = await box(page.locator(`${ROOT} header`));
    // the Hamburger is the last control, at the inline-end (left) edge; the caller's actions come just before it
    const last = await box(extra.nth((await extra.count()) - 2));
    expect(last.x, 'actions sit just to the right of the Hamburger').toBeGreaterThan(hamburger.x);
    expect(last.y).toBeGreaterThanOrEqual(header.y - 1);
    expect(bottom(last)).toBeLessThanOrEqual(bottom(header) + 1);
  });

  test('[38][17] Tab reaches the Hamburger first; Enter and Space activate it', async ({ page }) => {
    await openStory(page, TOPBAR[0] ?? '');
    const hamburger = page.getByRole('button', { name: MENU });
    await page.evaluate(
      `document.addEventListener('click', () => { window.__c = (window.__c || 0) + 1; });`,
    );
    await page.keyboard.press('Tab');
    await expect(hamburger).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    expect(await page.evaluate<number>('window.__c || 0')).toBe(2);
  });

  test('[38][19] hover and keyboard focus each show a Tooltip with the Hamburger name', async ({ page }) => {
    await openStory(page, TOPBAR[0] ?? '');
    const hamburger = page.getByRole('button', { name: MENU });
    await hamburger.hover();
    await expect(page.getByRole('tooltip')).toHaveText(MENU);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.mouse.move(300, 400, { steps: 12 });
    await page.keyboard.press('Tab');
    await expect(hamburger).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveText(MENU);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });
});

const NAV_LINKS = `${ROOT} nav a[href]`;

test.describe('BottomNavigation (39) at 375', () => {
  test.use({ viewport: MOBILE });

  for (const id of BOTTOMNAV) {
    test(`[39] ${id}: nav named "${NAV}"; bar spans the width and its bottom edge meets the viewport bottom`, async ({
      page,
    }) => {
      await openStory(page, id);
      const nav = page.getByRole('navigation', { name: NAV });
      await expect(nav).toHaveCount(1);
      const b = await box(nav);
      expect(Math.abs(bottom(b) - (await viewportHeight(page))), 'bottom edge meets the viewport bottom').toBeLessThanOrEqual(1);
      expect(b.x).toBeLessThanOrEqual(1);
      expect(right(b)).toBeGreaterThanOrEqual(MOBILE.width - 1);
      expect(b.height, 'a bar, not a column').toBeLessThan(140);
    });

    test(`[39] ${id}: items form one row, in props order starting at the right (RTL), each at least 44x44, filling the bar`, async ({
      page,
    }) => {
      await openStory(page, id);
      const links = page.locator(NAV_LINKS);
      const n = await links.count();
      expect(n).toBeGreaterThanOrEqual(3);
      const boxes: Box[] = [];
      for (let i = 0; i < n; i += 1) boxes.push(await box(links.nth(i)));
      for (const [i, b] of boxes.entries()) {
        expect(b.width, `item ${i} width`).toBeGreaterThanOrEqual(44);
        expect(b.height, `item ${i} height`).toBeGreaterThanOrEqual(44);
        expect(Math.abs(b.y - (boxes[0]?.y ?? 0)), `item ${i} on the same row`).toBeLessThanOrEqual(2);
        if (i > 0) {
          const prev = boxes[i - 1] ?? b;
          expect(right(b), `item ${i} is left of item ${i - 1}`).toBeLessThanOrEqual(prev.x + 1);
        }
      }
      const spanLeft = Math.min(...boxes.map((b) => b.x));
      const spanRight = Math.max(...boxes.map(right));
      expect(spanRight - spanLeft, 'items spread across the bar').toBeGreaterThan(MOBILE.width * 0.6);
      expect(spanLeft).toBeGreaterThanOrEqual(0);
      expect(spanRight).toBeLessThanOrEqual(MOBILE.width);
    });

    test(`[39] ${id}: exactly one item is aria-current="page", and it is heavier than the rest (not colour alone)`, async ({
      page,
    }) => {
      await openStory(page, id);
      await expect(page.locator(`${ROOT} nav [aria-current]`)).toHaveCount(1);
      await expect(page.locator(`${ROOT} nav [aria-current="page"]`)).toHaveCount(1);
      const weights = await page.evaluate(() => {
        const out: { current: boolean; weight: number }[] = [];
        for (const a of Array.from(document.querySelectorAll('#storybook-root nav a[href]'))) {
          // the weight of the text that the user reads: the link itself or its text-bearing descendant
          const holder = Array.from(a.querySelectorAll('*')).find(
            (el) => el.children.length === 0 && (el.textContent ?? '').trim().length > 0 && !el.closest('[aria-hidden="true"]'),
          );
          const target = holder ?? a;
          out.push({ current: a.getAttribute('aria-current') === 'page', weight: Number(getComputedStyle(target).fontWeight) });
        }
        return out;
      });
      const current = weights.find((w) => w.current);
      const others = weights.filter((w) => !w.current);
      expect(current).toBeDefined();
      expect(others.length).toBeGreaterThanOrEqual(2);
      for (const o of others) expect(current?.weight ?? 0, 'current is heavier').toBeGreaterThan(o.weight);
    });

    test(`[39][17] ${id}: Tab visits every item in visual order (right to left); focus is visible`, async ({ page }) => {
      await openStory(page, id);
      const links = page.locator(NAV_LINKS);
      const n = await links.count();
      for (let i = 0; i < n; i += 1) {
        await page.keyboard.press('Tab');
        await expect(links.nth(i)).toBeFocused();
        const outline = await links.nth(i).evaluate((el) => {
          const s = getComputedStyle(el);
          return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow };
        });
        expect(
          (outline.style !== 'none' && outline.width >= 2) || outline.shadow !== 'none',
          `item ${i} shows a focus indicator on keyboard focus`,
        ).toBe(true);
      }
    });
  }

  test('[39] the 3-item and 5-item stories show 3 and 5 items', async ({ page }) => {
    const three = BOTTOMNAV.find((s) => s.includes('three')) ?? '';
    const five = BOTTOMNAV.find((s) => s.includes('five')) ?? '';
    expect(three && five).toBeTruthy();
    await openStory(page, three);
    await expect(page.locator(NAV_LINKS)).toHaveCount(3);
    await openStory(page, five);
    await expect(page.locator(NAV_LINKS)).toHaveCount(5);
  });

  test('[39] five items still fit a 320 wide phone without a horizontal scroll, each at least 44 wide', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openStory(page, BOTTOMNAV.find((s) => s.includes('five')) ?? '');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const links = page.locator(NAV_LINKS);
    for (let i = 0; i < 5; i += 1) {
      const b = await box(links.nth(i));
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(right(b)).toBeLessThanOrEqual(320);
      expect(b.x).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('BottomNavigation (39) at 1024 (NFR-USE-001)', () => {
  test.use({ viewport: DESKTOP });

  for (const id of BOTTOMNAV) {
    test(`[39] ${id}: from 1024 a row of icons at the top, centred (redesign 27.10.2026, §7.1); the bottom bar is gone`, async ({
      page,
    }) => {
      await openStory(page, id);
      const nav = page.getByRole('navigation', { name: NAV });
      await expect(nav).toBeVisible();
      const n = await box(nav);
      expect(n.y, 'at the top edge').toBeLessThanOrEqual(1);
      expect(n.height, 'a top-bar row, not a bottom bar').toBeLessThanOrEqual(64);
      expect(Math.abs(n.x + n.width / 2 - DESKTOP.width / 2), 'centred').toBeLessThanOrEqual(24);
      const links = page.locator(NAV_LINKS);
      const count = await links.count();
      expect(count).toBeGreaterThanOrEqual(3);
      const boxes: Box[] = [];
      for (let i = 0; i < count; i += 1) boxes.push(await box(links.nth(i)));
      for (const [i, b] of boxes.entries()) {
        expect(b.width, `item ${i} width`).toBeGreaterThanOrEqual(44);
        expect(b.height, `item ${i} height`).toBeGreaterThanOrEqual(44);
        expect(b.x, `item ${i} inside the row`).toBeGreaterThanOrEqual(n.x - 1);
        expect(right(b), `item ${i} inside the row`).toBeLessThanOrEqual(right(n) + 1);
        if (i > 0) {
          const prev = boxes[i - 1] ?? b;
          // right to left: each item starts where the one before it ends
          expect(right(b), `item ${i} follows item ${i - 1}`).toBeLessThanOrEqual(prev.x + 1);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(DESKTOP.width);
    });

    test(`[39] ${id}: aria-current stays on exactly one item at 1024, still heavier than the rest`, async ({ page }) => {
      await openStory(page, id);
      await expect(page.locator(`${ROOT} nav [aria-current="page"]`)).toHaveCount(1);
      const weights = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#storybook-root nav a[href]')).map((a) => {
          const holder = Array.from(a.querySelectorAll('*')).find(
            (el) => el.children.length === 0 && (el.textContent ?? '').trim().length > 0 && !el.closest('[aria-hidden="true"]'),
          );
          return { current: a.getAttribute('aria-current') === 'page', weight: Number(getComputedStyle(holder ?? a).fontWeight) };
        }),
      );
      const current = weights.find((w) => w.current)?.weight ?? 0;
      for (const o of weights.filter((w) => !w.current)) expect(current).toBeGreaterThan(o.weight);
    });
  }

  test('[39] resizing from 375 to 1024 on the same page switches the bottom bar to the top row', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await openStory(page, BOTTOMNAV[0] ?? '');
    const bar = await box(page.getByRole('navigation', { name: NAV }));
    expect(bar.width).toBeGreaterThanOrEqual(MOBILE.width - 1);
    await page.setViewportSize(DESKTOP);
    const rail = await box(page.getByRole('navigation', { name: NAV }));
    expect(rail.width).toBeLessThan(DESKTOP.width / 3);
    await page.setViewportSize({ width: 1023, height: 768 });
    const below = await box(page.getByRole('navigation', { name: NAV }));
    expect(below.width, 'one pixel under 1024 is still the bar').toBeGreaterThanOrEqual(1022);
  });
});

const openDrawerStory = async (page: Page) => {
  const id = DRAWER.find((s) => s.endsWith('--closed')) ?? '';
  expect(id).not.toBe('');
  await openStory(page, id);
};

test.describe('SideDrawer (40)', () => {
  test.use({ viewport: MOBILE });

  test('[40] the closed story shows no dialog; the open story shows one with a name', async ({ page }) => {
    await openDrawerStory(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await openStory(page, DRAWER.find((s) => s.endsWith('--open')) ?? '');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveCount(1);
    expect(((await dialog.getAttribute('aria-labelledby')) ?? (await dialog.getAttribute('aria-label')) ?? '').length).toBeGreaterThan(0);
    await expect(page.getByRole('dialog', { name: /\S/ })).toHaveCount(1);
  });

  for (const width of [375, 1024]) {
    test(`[40] at ${width} it opens from the inline-start (right) edge, leaves the backdrop visible, and stays inside the viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 768 });
      await openDrawerStory(page);
      await page.getByRole('button', { name: MENU }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await page.waitForTimeout(500); // let the slide settle
      const b = await box(dialog);
      expect(Math.abs(right(b) - width), 'attached to the right edge').toBeLessThanOrEqual(1);
      expect(b.width, 'not full width: the backdrop remains').toBeLessThan(width - 40);
      expect(b.x).toBeGreaterThan(0);
      expect(b.y).toBeLessThanOrEqual(1);
      expect(bottom(b)).toBeGreaterThanOrEqual(768 - 1);
    });
  }

  test('[40] focus moves in on open and is trapped: 12 Tabs and 12 Shift+Tabs never leave the dialog', async ({ page }) => {
    await openDrawerStory(page);
    const trigger = page.getByRole('button', { name: MENU });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const inside = () => dialog.evaluate((d) => d.contains(document.activeElement));
    await expect.poll(inside).toBe(true);
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      expect(await inside(), `Tab ${i}`).toBe(true);
    }
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await inside(), `Shift+Tab ${i}`).toBe(true);
    }
  });

  test('[40] Escape closes it and focus returns to the trigger', async ({ page }) => {
    await openDrawerStory(page);
    const trigger = page.getByRole('button', { name: MENU });
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('[40] the close control closes it (by mouse, and by keyboard Enter and Space) and focus returns to the trigger', async ({
    page,
  }) => {
    await openDrawerStory(page);
    const trigger = page.getByRole('button', { name: MENU });
    const dialog = page.getByRole('dialog');
    await trigger.click();
    await dialog.getByRole('button').first().click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    for (const key of ['Enter', 'Space']) {
      await page.keyboard.press('Enter'); // the trigger is focused: opens
      await expect(dialog).toBeVisible();
      const close = dialog.getByRole('button').first();
      await close.focus();
      await page.keyboard.press(key);
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  });

  test('[40] a click on the backdrop (the page outside the drawer) closes it and focus returns to the trigger', async ({
    page,
  }) => {
    await openDrawerStory(page);
    const trigger = page.getByRole('button', { name: MENU });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(400);
    const b = await box(dialog);
    await page.mouse.click(Math.max(2, b.x / 2), 400); // the visible strip left of the drawer
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('[40] a click inside the drawer does not close it', async ({ page }) => {
    await openDrawerStory(page);
    await page.getByRole('button', { name: MENU }).click();
    const dialog = page.getByRole('dialog');
    const b = await box(dialog);
    await page.mouse.click(b.x + b.width / 2, bottom(b) - 20);
    await expect(dialog).toBeVisible();
  });

  test('[40] page scroll is locked while open and released after close', async ({ page }) => {
    await openDrawerStory(page);
    await page.evaluate(() => {
      const filler = document.createElement('div');
      filler.style.height = '3000px';
      document.body.appendChild(filler);
    });
    await page.getByRole('button', { name: MENU }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.mouse.move(20, 400);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY), 'wheel over the backdrop does not scroll the page').toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test('[40] closed by default after a reload, and opening twice in a row works (already-done state)', async ({ page }) => {
    await openDrawerStory(page);
    const trigger = page.getByRole('button', { name: MENU });
    for (let i = 0; i < 3; i += 1) {
      await trigger.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
    await page.reload();
    await page.waitForSelector('body.sb-show-main');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('[40][18] the controls inside the open drawer are at least 44x44', async ({ page }) => {
    await openStory(page, DRAWER.find((s) => s.endsWith('--open')) ?? '');
    const controls = page.getByRole('dialog').locator('a[href], button');
    const n = await controls.count();
    expect(n).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < n; i += 1) {
      const b = await box(controls.nth(i));
      expect(b.width, `control ${i} width`).toBeGreaterThanOrEqual(44);
      expect(b.height, `control ${i} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test('[40][19] the close control shows a Tooltip with its name on focus', async ({ page }) => {
    await openStory(page, DRAWER.find((s) => s.endsWith('--open')) ?? '');
    const dialog = page.getByRole('dialog');
    const close = dialog.getByRole('button').first();
    const name = (await close.getAttribute('aria-label')) ?? '';
    expect(name.length).toBeGreaterThan(0);
    await close.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveText(name);
  });

  test('[40] reduced motion: the drawer opens without a running transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDrawerStory(page);
    await page.getByRole('button', { name: MENU }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const durations = await dialog.evaluate((d) => {
      const s = getComputedStyle(d);
      return [s.transitionDuration, s.animationDuration];
    });
    for (const list of durations) for (const d of list.split(',')) expect(parseFloat(d)).toBe(0);
  });
});

const SHELL_WIDTHS = [
  ['375', MOBILE],
  ['1024', DESKTOP],
] as const;

test.describe('AppShell (41)', () => {
  for (const [label, viewport] of SHELL_WIDTHS) {
    test.describe(`at ${label}`, () => {
      test.use({ viewport });

      for (const id of SHELL) {
        test(`[41] ${id}: exactly one main, one header, one nav; drawer closed on load; children in main`, async ({ page }) => {
          await openStory(page, id);
          await expect(page.locator('main')).toHaveCount(1);
          await expect(page.locator('header')).toHaveCount(1);
          await expect(page.locator('nav')).toHaveCount(1);
          await expect(page.getByRole('dialog')).toHaveCount(0);
          expect(await page.locator('main').innerText()).toMatch(/\S/);
          expect(await page.locator('main').locator('header, nav').count()).toBe(0);
        });

        test(`[41][17] ${id}: the first Tab stop is a skip link, visible on focus; Enter moves focus to main; the next Tab does not return to the header`, async ({
          page,
        }) => {
          await openStory(page, id);
          await page.keyboard.press('Tab');
          const skip = page.locator(':focus');
          expect(await skip.evaluate((el) => el.tagName)).toBe('A');
          expect(((await skip.getAttribute('href')) ?? '').startsWith('#')).toBe(true);
          expect((await skip.innerText()).trim().length).toBeGreaterThan(0);
          const b = await box(skip);
          expect(b.width).toBeGreaterThan(0);
          expect(b.height).toBeGreaterThan(0);
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.y).toBeGreaterThanOrEqual(0);
          expect(right(b)).toBeLessThanOrEqual(viewport.width);
          expect(await page.evaluate(() => !!document.activeElement?.closest('header')), 'the skip link is before the header').toBe(false);
          await page.keyboard.press('Enter');
          expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('MAIN');
          const mainHasFocusable = await page
            .locator('main')
            .evaluate((m) => m.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])').length);
          if (mainHasFocusable > 0) {
            await page.keyboard.press('Tab');
            expect(await page.evaluate(() => !!document.activeElement?.closest('main')), 'next Tab lands in the content').toBe(true);
          }
        });

        test(`[41] ${id}: the Hamburger is the second Tab stop and is at the left (inline-end) edge of the header (§7.3, redesign 27.10.2026)`, async ({ page }) => {
          await openStory(page, id);
          await page.keyboard.press('Tab');
          await page.keyboard.press('Tab');
          const hamburger = page.getByRole('button', { name: MENU });
          await expect(hamburger).toBeFocused();
          const h = await box(hamburger);
          const header = await box(page.locator('header'));
          expect(h.x).toBeLessThan(header.x + 24);
        });

        test(`[41][40] ${id}: Hamburger opens the drawer; Escape, close control and backdrop each close it and return focus to the Hamburger`, async ({
          page,
        }) => {
          await openStory(page, id);
          const hamburger = page.getByRole('button', { name: MENU });
          const dialog = page.getByRole('dialog');
          for (const how of ['escape', 'close', 'backdrop']) {
            await hamburger.click();
            await expect(dialog).toBeVisible();
            await page.waitForTimeout(400);
            const d = await box(dialog);
            expect(Math.abs(right(d) - viewport.width), `${how}: from the right edge`).toBeLessThanOrEqual(1);
            if (how === 'escape') await page.keyboard.press('Escape');
            else if (how === 'close') await dialog.getByRole('button').first().click();
            else await page.mouse.click(Math.max(2, d.x / 2), 300);
            await expect(dialog, how).toHaveCount(0);
            await expect(hamburger, how).toBeFocused();
          }
        });

        test(`[41] ${id}: no horizontal scroll`, async ({ page }) => {
          await openStory(page, id);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        });

        test(`[41][18] ${id}: every control in the shell is at least 44x44`, async ({ page }) => {
          await openStory(page, id);
          const controls = page.locator('header a[href], header button, nav a[href], main a[href], main button');
          const n = await controls.count();
          expect(n).toBeGreaterThanOrEqual(3);
          for (let i = 0; i < n; i += 1) {
            const b = await controls.nth(i).boundingBox();
            if (!b) continue;
            expect(b.width, `control ${i} width`).toBeGreaterThanOrEqual(44);
            expect(b.height, `control ${i} height`).toBeGreaterThanOrEqual(44);
          }
        });

        test(`[41][14][15] ${id}: axe reports zero violations (closed, then with the drawer open)`, async ({ page }) => {
          await openStory(page, id);
          const closed = await runAxe(page, { tags: AXE_TAGS });
          expect(closed.passes).toBeGreaterThan(0);
          expect(closed.violations).toEqual([]);
          await page.getByRole('button', { name: MENU }).click();
          await expect(page.getByRole('dialog')).toBeVisible();
          await page.waitForTimeout(500);
          const open = await runAxe(page, { tags: AXE_TAGS });
          expect(open.violations).toEqual([]);
          const sizes = await runAxe(page, { rules: ['target-size'] });
          expect(sizes.violations).toEqual([]);
        });
      }
    });
  }

  test.describe('layout at 375', () => {
    test.use({ viewport: MOBILE });
    for (const id of SHELL) {
      test(`[41][39] ${id}: header at the top, the bar at the bottom edge, and scrolled to the end the content is not hidden behind the bar`, async ({
        page,
      }) => {
        await openStory(page, id);
        const header = await box(page.locator('header'));
        expect(header.y).toBeLessThanOrEqual(1);
        const nav = await box(page.getByRole('navigation', { name: NAV }));
        expect(Math.abs(bottom(nav) - (await viewportHeight(page)))).toBeLessThanOrEqual(1);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const last = await page.locator('main').evaluate((m) => {
          const kids = Array.from(m.querySelectorAll('*')).filter((el) => el.getBoundingClientRect().height > 0);
          return Math.max(...kids.map((el) => el.getBoundingClientRect().bottom));
        });
        expect(last, 'the last content edge is above the bar').toBeLessThanOrEqual(nav.y + 1);
        const firstTop = await page.evaluate(() => window.scrollTo(0, 0));
        void firstTop;
        const top = await page.locator('main').evaluate((m) => {
          const kids = Array.from(m.querySelectorAll('*')).filter((el) => el.getBoundingClientRect().height > 0);
          return Math.min(...kids.map((el) => el.getBoundingClientRect().top));
        });
        expect(top, 'the first content edge is below the header').toBeGreaterThanOrEqual(bottom(header) - 1);
      });
    }
  });

  test.describe('layout at 1024', () => {
    test.use({ viewport: DESKTOP });
    for (const id of SHELL) {
      test(`[41][39] ${id}: the destinations sit in the middle of the top bar, the bottom bar is gone, and the content column is centred and does not span the page`, async ({
        page,
      }) => {
        await openStory(page, id);
        const nav = await box(page.getByRole('navigation', { name: NAV }));
        // redesign 27.10.2026 (§7.1): a row of icons in the middle of the plum top bar
        expect(nav.y, 'in the top bar').toBeLessThanOrEqual(1);
        expect(Math.abs(nav.x + nav.width / 2 - DESKTOP.width / 2), 'centred').toBeLessThanOrEqual(24);
        expect(nav.width).toBeLessThan(DESKTOP.width / 2);
        const col = await page.locator('main').evaluate((m) => {
          const kids = Array.from(m.querySelectorAll('*')).filter((el) => el.getBoundingClientRect().width > 0);
          const rects = kids.map((el) => el.getBoundingClientRect());
          return { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)), top: Math.min(...rects.map((r) => r.top)) };
        });
        const width = col.right - col.left;
        expect(width, 'a column, not the whole page').toBeLessThan(DESKTOP.width - 250);
        expect(width).toBeGreaterThan(200);
        // centred in the viewport, or beside the shortcuts column at the inline-start (right) side when the shell has one
        const shortcuts = page.getByRole('navigation', { name: 'קיצורי דרך' });
        const start = (await shortcuts.count()) > 0 ? (await box(shortcuts)).x : DESKTOP.width;
        const gapsIn = (lo: number, hi: number) => Math.abs(col.left - lo - (hi - col.right));
        expect(Math.min(gapsIn(0, start), gapsIn(0, DESKTOP.width)), `left ${col.left}, right ${col.right}`).toBeLessThanOrEqual(12);
        expect(col.right, 'clear of the shortcuts').toBeLessThanOrEqual(start + 1);
        // the content starts below the bar the destinations sit in
        expect(col.top).toBeGreaterThanOrEqual(bottom(nav) - 1);
      });

      test(`[41] ${id}: the Hamburger is not covered by the destinations`, async ({ page }) => {
        await openStory(page, id);
        const nav = await box(page.getByRole('navigation', { name: NAV }));
        const hamburger = await box(page.getByRole('button', { name: MENU }));
        const overlap = !(right(hamburger) <= nav.x || hamburger.x >= right(nav) || bottom(hamburger) <= nav.y || hamburger.y >= bottom(nav));
        expect(overlap, 'Hamburger and the destinations do not overlap').toBe(false);
      });
    }
  });
});

// Q3 (spec): story screenshots are non-blocking. They are attached to the test report, never compared, so a
// pixel difference can never fail a run; ORCHESTRATOR / the reviewer opens them in the HTML report.
test.describe('story screenshots (Q3, non-blocking)', () => {
  for (const [label, viewport] of SHELL_WIDTHS) {
    test.describe(`at ${label}`, () => {
      test.use({ viewport });
      for (const id of [...TOPBAR, ...BOTTOMNAV, ...DRAWER, ...SHELL]) {
        test(`[Q3] ${id} @${label}: screenshot attached`, async ({ page }, testInfo) => {
          await openStory(page, id);
          await page.waitForTimeout(400);
          const shot = await page.screenshot({ fullPage: false });
          await testInfo.attach(`${id}@${label}`, { body: shot, contentType: 'image/png' });
          expect(shot.byteLength).toBeGreaterThan(0);
        });
      }
    });
  }
});
