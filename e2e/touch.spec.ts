// UI wave 1 criterion 18: every visible, enabled interactive control of every story is at least 44 x 44 CSS px.
// Generic on purpose: stories added by later parts (d-f) are covered automatically.
import { expect, test } from '@playwright/test';
import { MOBILE, openStory, storyIds } from './helpers';

test.use({ viewport: MOBILE });

const INTERACTIVE = [
  'button',
  'a[href]',
  'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])',
  'select',
  '[role="button"]',
].join(', ');

test('[18] the story list is not empty (the generic check has something to iterate)', () => {
  expect(storyIds().length).toBeGreaterThan(0);
});

for (const id of storyIds()) {
  test(`[18] ${id}: every visible, enabled control is at least 44 x 44 CSS px`, async ({ page }) => {
    await openStory(page, id);
    const found = await page.evaluate((selector) => {
      const out: { tag: string; text: string; width: number; height: number }[] = [];
      for (const el of Array.from(document.querySelectorAll(`#storybook-root ${selector.split(', ').join(', #storybook-root ')}`))) {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const visible =
          style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        const disabled = el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
        if (!visible || disabled) continue;
        out.push({
          tag: el.tagName.toLowerCase(),
          text: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30),
          width: rect.width,
          height: rect.height,
        });
      }
      return out;
    }, INTERACTIVE);
    const small = found.filter((f) => f.width < 44 || f.height < 44);
    expect(small, 'controls under 44 x 44').toEqual([]);
  });
}
