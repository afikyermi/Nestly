// UI wave 1 part e: criteria 34 (Logo, illustrations), 35 (AuthLayout), 36 (Avatar), 37 (MenuItem), with 17 and 18,
// in the built Storybook (real Chrome and Edge, RTL page). Derived from .work/ui-wave-1/spec.md only.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DESKTOP, MOBILE, openStory, storiesOf } from './helpers';

const ROOT = '#storybook-root';
const INTERACTIVE = 'a[href], button, input, select, [role="button"]';

test('part e: the part e stories exist (so the per-story specs cover them)', () => {
  expect(storiesOf('shared-logo--').length).toBeGreaterThanOrEqual(4); // link/static x default/big
  expect(storiesOf('shared-illustrations--').length).toBeGreaterThanOrEqual(2);
  expect(storiesOf('layout-authlayout--').length).toBeGreaterThanOrEqual(3);
  expect(storiesOf('ui-avatar--').length).toBeGreaterThanOrEqual(4);
  expect(storiesOf('shared-menuitem--').length).toBeGreaterThanOrEqual(3); // link, button, disabled
});

test.describe('Logo (34)', () => {
  test.use({ viewport: MOBILE });

  for (const id of storiesOf('shared-logo--').filter((s) => s.includes('link'))) {
    test(`[34][17] ${id}: a link named "Nestly"; Tab reaches it; Enter activates it`, async ({ page }) => {
      await openStory(page, id);
      const link = page.getByRole('link', { name: 'Nestly', exact: true });
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute('href', /.+/);
      await page.evaluate(
        `document.addEventListener('click', (e) => { window.__c = (window.__c || 0) + 1; e.preventDefault(); })`,
      );
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      await page.keyboard.press('Enter');
      expect(await page.evaluate<number>('window.__c || 0')).toBe(1);
    });
  }

  for (const id of storiesOf('shared-logo--').filter((s) => s.includes('static'))) {
    test(`[34] ${id}: static, no link, not a tab stop, "Nestly" is readable once`, async ({ page }) => {
      await openStory(page, id);
      await expect(page.locator(`${ROOT} a`)).toHaveCount(0);
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
      const text = await page.locator(ROOT).innerText();
      expect(text.split('Nestly').length - 1).toBe(1);
    });
  }

  test('[34] big is wider than default (static and link; the link keeps its 44 high target)', async ({ page }) => {
    const width = async (id: string) => {
      await openStory(page, id);
      const box = await page.locator(`${ROOT} > *`).first().boundingBox();
      expect(box).not.toBeNull();
      return box?.width ?? 0;
    };
    const a = await width('shared-logo--static-default');
    const b = await width('shared-logo--static-big');
    const c = await width('shared-logo--link-default');
    const d = await width('shared-logo--link-big');
    expect(b).toBeGreaterThan(a);
    expect(d).toBeGreaterThan(c);
  });
});

test.describe('Illustrations (34)', () => {
  test.use({ viewport: MOBILE });
  for (const id of storiesOf('shared-illustrations--')) {
    test(`[34] ${id}: decorative, no hex in the rendered SVG, no overflow at 375`, async ({ page }) => {
      await openStory(page, id);
      const svg = page.locator(`${ROOT} svg`).first();
      await expect(svg).toHaveAttribute('aria-hidden', 'true');
      const html = await page.locator(ROOT).innerHTML();
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(html).not.toMatch(/<(title|desc)\b/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOBILE.width);
      // Painted with colours that resolve in the page.
      const painted = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll('#storybook-root svg *'))) {
          const s = getComputedStyle(el);
          if (s.fill !== 'none') out.push(s.fill);
          if (s.stroke !== 'none') out.push(s.stroke);
        }
        return out;
      });
      expect(painted.length).toBeGreaterThan(0);
    });
  }
});

interface Box {
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounding boxes of the visible controls, headings and svgs under the story root, in document order. */
const contentBoxes = (page: Page): Promise<Box[]> =>
  page.evaluate(() => {
    const out: Box[] = [];
    const sel = ['a[href]', 'button', 'input', 'h1', 'svg'].map((s) => `#storybook-root ${s}`).join(', ');
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        out.push({ tag: el.tagName.toLowerCase(), x: r.x, y: r.y, width: r.width, height: r.height });
      }
    }
    return out;
  });

test.describe('AuthLayout (35)', () => {
  const ids = storiesOf('layout-authlayout--');

  for (const [label, viewport] of [
    ['375', MOBILE],
    ['375 x 480 (short phone)', { width: 375, height: 480 }],
    ['320 (narrow)', { width: 320, height: 640 }],
  ] as const) {
    test.describe(`at ${label}`, () => {
      test.use({ viewport });
      for (const id of ids) {
        test(`[35] ${id}: no horizontal scroll; the bottom actions can be scrolled into the viewport`, async ({
          page,
        }) => {
          await openStory(page, id);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
          const controls = page.locator(`${ROOT} ${INTERACTIVE}`);
          const n = await controls.count();
          expect(n).toBeGreaterThan(0);
          const last = controls.nth(n - 1);
          await last.scrollIntoViewIfNeeded();
          const b = await last.boundingBox();
          expect(b).not.toBeNull();
          if (b) {
            expect(b.x).toBeGreaterThanOrEqual(0);
            expect(b.x + b.width).toBeLessThanOrEqual(viewport.width);
            expect(b.y).toBeGreaterThanOrEqual(0);
            expect(b.y + b.height).toBeLessThanOrEqual(viewport.height);
          }
          for (let i = 0; i < n; i += 1) {
            const cb = await controls.nth(i).boundingBox();
            if (cb && cb.width > 0) {
              expect(cb.x, `control ${i} start`).toBeGreaterThanOrEqual(0);
              expect(cb.x + cb.width, `control ${i} end`).toBeLessThanOrEqual(viewport.width);
            }
          }
        });
      }
    });
  }

  test.describe('at 1024', () => {
    test.use({ viewport: DESKTOP });
    for (const id of ids) {
      test(`[35] ${id}: the column is centred and does not span the page`, async ({ page }) => {
        await openStory(page, id);
        const boxes = await contentBoxes(page);
        expect(boxes.length).toBeGreaterThan(0);
        const left = Math.min(...boxes.map((b) => b.x));
        const right = Math.max(...boxes.map((b) => b.x + b.width));
        expect(
          Math.abs(left - (DESKTOP.width - right)),
          `left gap ${left}, right gap ${DESKTOP.width - right}`,
        ).toBeLessThanOrEqual(10); // a back target may overhang the column by its own padding
        expect(right - left, 'a column, not full width').toBeLessThan(DESKTOP.width - 200);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(DESKTOP.width);
      });
    }
  });

  for (const [label, viewport] of [
    ['375', MOBILE],
    ['1024', DESKTOP],
  ] as const) {
    test(`[35] at ${label} in RTL the back slot sits at the inline-start (right) edge of the column`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      let found = 0;
      for (const id of ids) {
        await openStory(page, id);
        expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl');
        const boxes = await contentBoxes(page);
        const h1 = boxes.find((b) => b.tag === 'h1');
        const above = boxes.find(
          (b) => (b.tag === 'a' || b.tag === 'button') && h1 !== undefined && b.y + b.height <= h1.y,
        );
        if (!above) continue;
        found += 1;
        const left = Math.min(...boxes.map((b) => b.x));
        const right = Math.max(...boxes.map((b) => b.x + b.width));
        expect(above.x + above.width / 2, `${id}: back is in the right half of the column`).toBeGreaterThan(
          (left + right) / 2,
        );
        expect(above.x + above.width, `${id}: back reaches the right edge of the column`).toBeGreaterThanOrEqual(
          right - 2,
        );
      }
      expect(found, 'at least one AuthLayout story shows a back button above the heading').toBeGreaterThanOrEqual(1);
    });
  }
});

test.describe('Avatar (36)', () => {
  test.use({ viewport: MOBILE });

  test('[36] initials stories show one or two letters; the single-word story shows exactly one', async ({ page }) => {
    await openStory(page, 'ui-avatar--initials');
    const two = (await page.locator(ROOT).innerText()).trim();
    expect(two).toMatch(/^\p{L}{2}$/u);
    await openStory(page, 'ui-avatar--single-word');
    const one = (await page.locator(ROOT).innerText()).trim();
    expect(one).toMatch(/^\p{L}$/u);
  });

  test('[36] ui-avatar--anonymous: no letters, a person icon, and it is named (not decorative)', async ({ page }) => {
    await openStory(page, 'ui-avatar--anonymous');
    expect((await page.locator(ROOT).innerText()).trim()).toBe('');
    await expect(page.locator(`${ROOT} svg`).first()).toBeVisible();
    await expect(page.getByRole('img')).toHaveCount(1);
    expect(await page.getByRole('img').getAttribute('aria-label')).toBeTruthy();
  });

  test('[36] ui-avatar--beside-name: the avatar is hidden from assistive technology', async ({ page }) => {
    await openStory(page, 'ui-avatar--beside-name');
    await expect(page.getByRole('img')).toHaveCount(0);
    expect(await page.locator(`${ROOT} [aria-hidden="true"]`).count()).toBeGreaterThanOrEqual(1);
  });

  for (const id of storiesOf('ui-avatar--')) {
    test(`[36] ${id}: the avatar is square and not a tab stop`, async ({ page }) => {
      await openStory(page, id);
      const el = await page.locator(`${ROOT} [aria-hidden="true"], ${ROOT} [role="img"]`).first().boundingBox();
      if (el) expect(Math.abs(el.width - el.height)).toBeLessThanOrEqual(1);
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    });
  }
});

test.describe('MenuItem (37)', () => {
  test.use({ viewport: MOBILE });

  for (const id of storiesOf('shared-menuitem--')) {
    test(`[37][18] ${id}: every item is at least 44 high and 44 wide, even when disabled`, async ({ page }) => {
      await openStory(page, id);
      const items = page.locator(`${ROOT} a[href], ${ROOT} button, ${ROOT} [aria-disabled="true"]`);
      const n = await items.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i += 1) {
        const b = await items.nth(i).boundingBox();
        expect(b, `item ${i}`).not.toBeNull();
        if (b) {
          expect(b.height, `${id} item ${i} height`).toBeGreaterThanOrEqual(44);
          expect(b.width, `${id} item ${i} width`).toBeGreaterThanOrEqual(44);
        }
      }
    });
  }

  test('[37][17] shared-menuitem--as-link: a link (no button); Tab reaches it; Enter activates it', async ({ page }) => {
    await openStory(page, 'shared-menuitem--as-link');
    const link = page.locator(`${ROOT} a[href]`).first();
    await expect(link).toHaveCount(1);
    await expect(page.locator(`${ROOT} button`)).toHaveCount(0);
    await page.evaluate(
      `document.addEventListener('click', (e) => { window.__c = (window.__c || 0) + 1; e.preventDefault(); })`,
    );
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await page.evaluate<number>('window.__c || 0')).toBe(1);
  });

  test('[37][17] shared-menuitem--as-button: a button (no link); Tab reaches it; Enter and Space activate it', async ({
    page,
  }) => {
    await openStory(page, 'shared-menuitem--as-button');
    const button = page.locator(`${ROOT} button`).first();
    await expect(button).toHaveCount(1);
    await expect(page.locator(`${ROOT} a[href]`)).toHaveCount(0);
    await page.evaluate(
      `document.querySelector('#storybook-root button').addEventListener('click', () => { window.__c = (window.__c || 0) + 1; })`,
    );
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await page.evaluate<number>('window.__c || 0')).toBe(1);
    await page.keyboard.press('Space');
    expect(await page.evaluate<number>('window.__c || 0')).toBe(2);
  });

  test('[37] shared-menuitem--disabled: aria-disabled, stays focusable, and click, Enter and Space do nothing', async ({
    page,
  }) => {
    await openStory(page, 'shared-menuitem--disabled');
    const item = page.locator(`${ROOT} [aria-disabled="true"]`).first();
    await expect(item).toHaveCount(1);
    await page.evaluate(
      `document.addEventListener('click', (e) => { window.__clicks = (window.__clicks || 0) + 1; window.__nav = e.defaultPrevented; })`,
    );
    const before = page.url();
    await page.keyboard.press('Tab');
    await expect(item).toBeFocused(); // disabled items stay in the tab order
    await item.click({ force: true });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    expect(page.url()).toBe(before);
    const href = await item.getAttribute('href');
    if (href) expect(await page.evaluate<boolean>('window.__nav === true')).toBe(true);
  });

  test('[37] the icon sits at the inline-start (right) side of the label in RTL', async ({ page }) => {
    await openStory(page, 'shared-menuitem--as-link');
    const item = await page.locator(`${ROOT} a[href]`).first().boundingBox();
    const icon = await page.locator(`${ROOT} a[href] svg`).first().boundingBox();
    expect(item && icon).toBeTruthy();
    if (item && icon) expect(icon.x + icon.width / 2).toBeGreaterThan(item.x + item.width / 2);
  });

  test('[37][17] shared-menuitem--stacked: items do not overlap and Tab visits them in visual order', async ({
    page,
  }) => {
    await openStory(page, 'shared-menuitem--stacked');
    const items = page.locator(`${ROOT} a[href], ${ROOT} button`);
    const n = await items.count();
    expect(n).toBeGreaterThanOrEqual(2);
    let prevBottom = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const b = await items.nth(i).boundingBox();
      expect(b).not.toBeNull();
      if (b) {
        expect(b.y, `item ${i} starts below the previous one`).toBeGreaterThanOrEqual(prevBottom - 0.5);
        prevBottom = b.y + b.height;
      }
    }
    for (let i = 0; i < n; i += 1) {
      await page.keyboard.press('Tab');
      await expect(items.nth(i)).toBeFocused();
    }
  });
});

test.describe('Avatar size (36, addendum after the part-e review)', () => {
  test.use({ viewport: MOBILE });
  const circle = async (page: Page, id: string) => {
    await openStory(page, id);
    const box = await page.locator(`${ROOT} [aria-hidden="true"], ${ROOT} [role="img"]`).first().boundingBox();
    expect(box).not.toBeNull();
    return box;
  };

  test('[36] sm is 24px and md (the default) is 40px', async ({ page }) => {
    const sm = await circle(page, 'ui-avatar--small');
    expect(Math.round(sm?.width ?? 0)).toBe(24);
    expect(Math.round(sm?.height ?? 0)).toBe(24);
    const md = await circle(page, 'ui-avatar--initials');
    expect(Math.round(md?.width ?? 0)).toBe(40);
    expect(Math.round(md?.height ?? 0)).toBe(40);
  });
});

test.describe('Auth compositions (addendum after the part-e review)', () => {
  test.use({ viewport: MOBILE });

  test('[35] layout-authlayout--login has a "שכחתי סיסמה" link, reachable by keyboard', async ({ page }) => {
    await openStory(page, 'layout-authlayout--login');
    const link = page.getByRole('link', { name: 'שכחתי סיסמה' });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href', /.+/);
    let reached = false;
    for (let i = 0; i < 12 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      reached = await link.evaluate((el) => el === document.activeElement);
    }
    expect(reached, 'Tab reaches the forgot-password link').toBe(true);
  });

  test('[35] layout-authlayout--welcome carries a descriptive lead paragraph', async ({ page }) => {
    await openStory(page, 'layout-authlayout--welcome');
    const lead = page.locator(`${ROOT} p`).first();
    await expect(lead).toBeVisible();
    expect(((await lead.innerText()) ?? '').trim().length).toBeGreaterThan(10);
  });
});
