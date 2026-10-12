// UI wave 1 part f, the "Addendum after the part-f review" (spec.md), in real Chrome and Edge on the built Storybook.
// Derived from .work/ui-wave-1/spec.md only. Test names carry the addendum line they assert:
//   [R-2.4.11] a focused control is never entirely hidden behind the TopBar or the BottomNavigation (WCAG 2.2 SC 2.4.11)
//   [R-focus]  focus returns to the Hamburger when the drawer closes even if the Hamburger was not focused at open
//   [R-esc]    Escape with the close control focused (Tooltip first, then drawer) / focus elsewhere (one Escape)
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DESKTOP, MOBILE, openStory, storiesOf } from './helpers';

const MENU = 'פתיחת התפריט';
const SHELL = storiesOf('layout-appshell--');
const WIDTHS = [
  ['375', MOBILE],
  ['1024', DESKTOP],
] as const;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Probe {
  label: string;
  rect: Rect | null;
  header: Rect | null;
  nav: Rect | null;
  inViewport: boolean;
  belongsToBar: boolean;
  onTop: boolean;
}

/** Describes the focused element, the header and the navigation, all by bounding box, in viewport coordinates. */
const probeFocus = (page: Page): Promise<Probe> =>
  page.evaluate(() => {
    const toRect = (el: Element | null): Rect | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const el = document.activeElement;
    const rect = el && el !== document.body ? toRect(el) : null;
    const inViewport = rect
      ? rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth
      : false;
    const hit = rect ? document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2) : null;
    // onTop: the element (or a part of it) is what a pointer at its centre would hit, so nothing is painted over it
    const onTop = !!(el && hit && (el === hit || el.contains(hit) || hit.contains(el)));
    return {
      belongsToBar: !!el?.closest('header, nav'),
      onTop,
      label: el ? `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"` : 'none',
      rect,
      header: toRect(document.querySelector('header')),
      nav: toRect(document.querySelector('nav')),
      inViewport,
    };
  });

const EPS = 0.5;
const inside = (inner: Rect, outer: Rect | null): boolean =>
  outer !== null &&
  inner.left >= outer.left - EPS &&
  inner.right <= outer.right + EPS &&
  inner.top >= outer.top - EPS &&
  inner.bottom <= outer.bottom + EPS;

/** Adds focusable links before and after the story's own content so that the page always scrolls. */
const addFiller = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('no main');
    const make = (tag: string, n: number) => {
      const wrap = document.createElement('div');
      for (let i = 0; i < n; i += 1) {
        const a = document.createElement('a');
        a.href = `#${tag}-${i}`;
        a.textContent = `${tag} ${i}`;
        a.style.display = 'block';
        a.style.padding = '12px 0';
        a.style.minHeight = '44px';
        wrap.append(a);
      }
      return wrap;
    };
    main.prepend(make('before', 18));
    main.append(make('after', 18));
  });

const focusableCount = (page: Page) =>
  page.evaluate(
    () =>
      document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')
        .length,
  );

for (const [label, viewport] of WIDTHS) {
  test.describe(`SC 2.4.11 at ${label}`, () => {
    test.use({ viewport });

    for (const id of SHELL) {
      for (const filler of [false, true]) {
        for (const direction of ['Tab', 'Shift+Tab'] as const) {
          test(`[R-2.4.11] ${id}${filler ? ' + filler links' : ''}: ${direction} through every control never leaves the focused one entirely behind the TopBar or the BottomNavigation`, async ({
            page,
          }) => {
            await openStory(page, id);
            if (filler) await addFiller(page);
            const total = await focusableCount(page);
            expect(total).toBeGreaterThanOrEqual(5);
            if (direction === 'Shift+Tab') {
              await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            }
            const hidden: string[] = [];
            let seen = 0;
            for (let i = 0; i < total + 2; i += 1) {
              await page.keyboard.press(direction);
              const p = await probeFocus(page);
              if (!p.rect) continue; // focus left the page (browser chrome); nothing to measure
              seen += 1;
              if (p.belongsToBar || p.onTop) continue; // the bars' own controls, or painted above the bar
              if (inside(p.rect, p.header)) hidden.push(`${p.label} entirely inside the TopBar (step ${i})`);
              if (inside(p.rect, p.nav)) hidden.push(`${p.label} entirely inside the BottomNavigation (step ${i})`);
            }
            expect(seen, 'the walk reached controls').toBeGreaterThanOrEqual(3);
            expect(hidden).toEqual([]);
          });
        }

        test(`[R-2.4.11] ${id}${filler ? ' + filler links' : ''}: focusing the first and the last control in main by Tab from the matching end shows them in the viewport and clear of the bars`, async ({
          page,
        }) => {
          await openStory(page, id);
          await addFiller(page); // the story may have no control in main; the edges need some
          const links = page.locator('main a[href], main button');
          const n = await links.count();
          expect(n).toBeGreaterThanOrEqual(1);
          for (const edge of [n - 1, 0]) {
            await links.nth(edge).focus();
            const p = await probeFocus(page);
            expect(p.rect, 'focused element has a box').not.toBeNull();
            if (!p.rect) continue;
            expect(p.inViewport, `control ${edge} is within the viewport`).toBe(true);
            expect(inside(p.rect, p.header) && !p.onTop, `control ${edge} not entirely behind the TopBar`).toBe(false);
            expect(inside(p.rect, p.nav) && !p.onTop, `control ${edge} not entirely behind the BottomNavigation`).toBe(false);
          }
        });
      }
    }
  });
}

test.describe('focus return and Escape in the AppShell composition', () => {
  for (const [label, viewport] of WIDTHS) {
    test.describe(`at ${label}`, () => {
      test.use({ viewport });

      for (const id of SHELL) {
        for (const how of ['escape', 'close', 'backdrop'] as const) {
          test(`[R-focus] ${id}: opened without the Hamburger focused (programmatic click, focus on body), closed by ${how}: the Hamburger is focused`, async ({
            page,
          }) => {
            await openStory(page, id);
            const hamburger = page.getByRole('button', { name: MENU });
            const dialog = page.getByRole('dialog');
            await page.evaluate(() => {
              if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            });
            await hamburger.evaluate((el) => { if (el instanceof HTMLElement) el.click(); }); // el.click() does not focus a button
            await expect(dialog).toBeVisible();
            await page.waitForTimeout(400);
            if (how === 'escape') {
              await page.keyboard.press('Escape');
              if ((await dialog.count()) > 0) {
                await page.keyboard.press('Escape'); // a first Escape may close only a Tooltip
              }
            } else if (how === 'close') {
              await dialog.getByRole('button').first().click();
            } else {
              const b = await dialog.boundingBox();
              await page.mouse.click(Math.max(2, (b?.x ?? 40) / 2), 300);
            }
            await expect(dialog).toHaveCount(0);
            await expect(hamburger).toBeFocused();
          });
        }

        test(`[R-focus] ${id}: opened while another control had focus (a link in main), closed: the Hamburger is focused`, async ({
          page,
        }) => {
          await openStory(page, id);
          const hamburger = page.getByRole('button', { name: MENU });
          const dialog = page.getByRole('dialog');
          await addFiller(page); // guarantees a control in main
          const link = page.locator('main a[href], main button').first();
          await link.focus();
          await expect(link).toBeFocused();
          await hamburger.evaluate((el) => { if (el instanceof HTMLElement) el.click(); });
          await expect(dialog).toBeVisible();
          await page.waitForTimeout(400);
          await dialog.getByRole('button').first().click();
          await expect(dialog).toHaveCount(0);
          await expect(hamburger).toBeFocused();
        });

        test(`[R-esc] ${id}: close control focused: Tooltip first (drawer may stay open), then the drawer; at most two Escapes; focus on the Hamburger`, async ({
          page,
        }) => {
          await openStory(page, id);
          const hamburger = page.getByRole('button', { name: MENU });
          const dialog = page.getByRole('dialog');
          await hamburger.click();
          await expect(dialog).toBeVisible();
          await page.waitForTimeout(400);
          const close = dialog.getByRole('button').first();
          const closeName = (await close.getAttribute('aria-label')) ?? '';
          expect(closeName.length).toBeGreaterThan(0);
          await page.mouse.move(2, 2); // the pointer is not what shows the Tooltip
          await close.focus();
          await page.keyboard.press('Shift+Tab');
          await page.keyboard.press('Tab');
          await expect(close).toBeFocused();
          await expect(page.getByRole('tooltip')).toHaveCount(1);
          await page.keyboard.press('Escape');
          if ((await dialog.count()) > 0) {
            await expect(page.getByRole('tooltip'), 'the first Escape closed the Tooltip').toHaveCount(0);
            await page.keyboard.press('Escape');
          }
          await expect(dialog).toHaveCount(0);
          // the Hamburger has its own Tooltip once it has focus; only the close control's must be gone
          await expect(page.getByRole('tooltip').filter({ hasText: closeName })).toHaveCount(0);
          await expect(hamburger).toBeFocused();
        });

        test(`[R-esc] ${id}: focus elsewhere in the drawer (the last control): one Escape closes it`, async ({ page }) => {
          await openStory(page, id);
          const hamburger = page.getByRole('button', { name: MENU });
          const dialog = page.getByRole('dialog');
          await hamburger.click();
          await expect(dialog).toBeVisible();
          await page.waitForTimeout(400);
          const count = await dialog.locator('a[href], button').count();
          expect(count, 'the drawer has a close control and at least one more control').toBeGreaterThanOrEqual(2);
          await dialog.locator('a[href], button').nth(count - 1).focus();
          await expect(page.getByRole('tooltip')).toHaveCount(0);
          await page.keyboard.press('Escape');
          await expect(dialog).toHaveCount(0);
          await expect(hamburger).toBeFocused();
        });
      }
    });
  }
});
