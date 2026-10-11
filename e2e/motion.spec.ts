// UI wave 1 part b: criterion 11 (reduced motion, deferred from part a), the reduced-motion
// half of 21 (pending Button) and of 23 (Skeleton), and the pending visuals of 21.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MOBILE, openStory, storiesOf, storyIds } from './helpers';

interface Running {
  tag: string;
  pseudo: string;
  animation: string;
  transition: string;
}

// Elements (and their ::before / ::after) whose computed animation or transition duration is not zero.
const nonZeroDurations = (page: Page): Promise<Running[]> =>
  page.evaluate(() => {
    const nonZero = (value: string) =>
      value.split(',').some((part) => {
        const n = Number.parseFloat(part.trim());
        return Number.isFinite(n) && n !== 0;
      });
    const out: Running[] = [];
    const scope = document.querySelector('#storybook-root');
    if (!scope) return out;
    for (const el of [scope, ...Array.from(scope.querySelectorAll('*'))]) {
      for (const pseudo of ['', '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo || null);
        if (nonZero(cs.animationDuration) || nonZero(cs.transitionDuration)) {
          out.push({ tag: el.tagName, pseudo, animation: cs.animationDuration, transition: cs.transitionDuration });
        }
      }
    }
    return out;
  });

test.describe('prefers-reduced-motion: reduce', () => {
  test.use({ viewport: MOBILE, reducedMotion: 'reduce' });

  for (const id of storyIds()) {
    test(`[11] ${id}: every element has computed animation and transition duration 0s`, async ({ page }) => {
      await openStory(page, id);
      expect(await nonZeroDurations(page)).toEqual([]);
    });
  }

  test('[11] hovering and focusing do not start a transition either', async ({ page }) => {
    await openStory(page, 'ui-button--primary');
    const button = page.locator('#storybook-root button').first();
    await button.hover();
    expect(await nonZeroDurations(page)).toEqual([]);
    await button.focus();
    expect(await nonZeroDurations(page)).toEqual([]);
  });

  test('[21] pending: the loader icon does not spin', async ({ page }) => {
    await openStory(page, 'ui-button--pending');
    const svg = page.locator('#storybook-root button svg').first();
    await expect(svg).toBeVisible();
    const sample = () =>
      svg.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { transform: cs.transform, rotate: cs.rotate, duration: cs.animationDuration };
      });
    const first = await sample();
    await page.waitForTimeout(350);
    const second = await sample();
    expect(second).toEqual(first);
    expect(Number.parseFloat(first.duration)).toBe(0);
  });

  for (const id of storiesOf('ui-skeleton--')) {
    test(`[23] ${id}: no shimmer`, async ({ page }) => {
      await openStory(page, id);
      expect(await nonZeroDurations(page)).toEqual([]);
    });
  }
});

test.describe('motion allowed (controls: the reduced-motion tests above can fail)', () => {
  test.use({ viewport: MOBILE, reducedMotion: 'no-preference' });

  test('[21] pending: the loader icon spins when motion is allowed', async ({ page }) => {
    await openStory(page, 'ui-button--pending');
    expect((await nonZeroDurations(page)).length).toBeGreaterThan(0);
    const svg = page.locator('#storybook-root button svg').first();
    const t1 = await svg.evaluate((el) => getComputedStyle(el).transform);
    await page.waitForTimeout(130);
    const t2 = await svg.evaluate((el) => getComputedStyle(el).transform);
    expect(t2).not.toBe(t1);
  });

  for (const id of storiesOf('ui-skeleton--')) {
    test(`[23] ${id}: the shimmer runs when motion is allowed`, async ({ page }) => {
      await openStory(page, id);
      expect((await nonZeroDurations(page)).length).toBeGreaterThan(0);
    });

    test(`[23] ${id}: nothing of the skeleton is exposed to assistive technology`, async ({ page }) => {
      await openStory(page, id);
      const exposed = await page.evaluate(() => {
        const root = document.querySelector('#storybook-root');
        if (!root) return ['no root'];
        const leaves = Array.from(root.querySelectorAll('*')).filter((el) => el.children.length === 0);
        return leaves.filter((el) => el.closest('[aria-hidden="true"]') === null).map((el) => el.outerHTML);
      });
      expect(exposed).toEqual([]);
      expect(await page.locator('#storybook-root [aria-hidden="true"]').count()).toBeGreaterThan(0);
    });
  }

  test('[21] pending: the loader sits at the inline start (right of the label in RTL)', async ({ page }) => {
    await openStory(page, 'ui-button--pending');
    const geometry = await page.evaluate(() => {
      const button = document.querySelector('#storybook-root button');
      const svg = button?.querySelector('svg');
      if (!button || !svg) return null;
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && !(node.textContent ?? '').trim()) node = walker.nextNode();
      if (!node) return null;
      const range = document.createRange();
      range.selectNodeContents(node);
      return { svgLeft: svg.getBoundingClientRect().left, textRight: range.getBoundingClientRect().right };
    });
    expect(geometry).not.toBeNull();
    expect(geometry?.svgLeft ?? 0).toBeGreaterThanOrEqual((geometry?.textRight ?? Infinity) - 1);
  });
});
