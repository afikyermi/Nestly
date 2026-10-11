// UI wave 1 part b: criteria 14 (axe on every story) and the axe half of 18 (target-size).
import { expect, test } from '@playwright/test';
import { MOBILE, openStory, runAxe, storyIds } from './helpers';

test.use({ viewport: MOBILE });

const ids = storyIds();

test('[14] the story list is not empty (Storybook built with the part b components)', () => {
  expect(ids.length).toBeGreaterThanOrEqual(15);
});

test('[14] harness control: axe in this setup does detect a violation (image without alt)', async ({ page }) => {
  await openStory(page, ids[0] ?? 'ui-button--primary');
  await page.evaluate(() => {
    const img = document.createElement('img');
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    document.body.appendChild(img);
  });
  const result = await runAxe(page, { tags: ['wcag2a', 'wcag2aa', 'wcag22aa'] });
  expect(result.violations.map((v) => v.id)).toContain('image-alt');
  expect(result.passes).toBeGreaterThan(0);
});

for (const id of ids) {
  test(`[14] ${id}: axe (wcag2a, wcag2aa, wcag22aa) reports zero violations`, async ({ page }) => {
    await openStory(page, id);
    const result = await runAxe(page, { tags: ['wcag2a', 'wcag2aa', 'wcag22aa'] });
    expect(result.passes, 'axe actually evaluated rules').toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
  });

  test(`[18] ${id}: axe target-size passes`, async ({ page }) => {
    await openStory(page, id);
    const result = await runAxe(page, { rules: ['target-size'] });
    expect(result.violations).toEqual([]);
  });
}
