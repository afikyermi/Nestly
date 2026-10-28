// UI wave 1 part b: criterion 15 (RTL, Hebrew, Assistant, 375 default viewport).
import { expect, test } from '@playwright/test';
import { MOBILE, openStory, storyIds } from './helpers';

test.use({ viewport: MOBILE });

for (const id of storyIds()) {
  test(`[15] ${id}: renders with dir="rtl", lang="he" and Assistant`, async ({ page }) => {
    await openStory(page, id);
    const info = await page.evaluate(async () => {
      const html = document.documentElement;
      const root = document.querySelector('#storybook-root');
      const family = (root ? getComputedStyle(root).fontFamily : '').split(',')[0]?.trim().replace(/["']/g, '') ?? '';
      await document.fonts.load(`16px "${family}"`, 'שלום');
      const fontLoaded = Array.from(document.fonts).some((f) => /Assistant/.test(f.family) && f.status === 'loaded');
      return {
        dir: html.getAttribute('dir'),
        lang: html.getAttribute('lang'),
        computedDirection: root ? getComputedStyle(root).direction : null,
        fontFamily: root ? getComputedStyle(root).fontFamily : '',
        fontLoaded,
        fontChecked: document.fonts.check(`16px "${family}"`, 'שלום'),
      };
    });
    expect(info.dir).toBe('rtl');
    expect(info.lang).toBe('he');
    expect(info.computedDirection).toBe('rtl');
    expect(info.fontFamily).toMatch(/Assistant/);
    expect(info.fontLoaded).toBe(true);
    expect(info.fontChecked).toBe(true);
  });
}

test('[15] the default Storybook viewport of a story is 375 wide', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?path=/story/ui-button--primary');
  const frame = page.locator('#storybook-preview-iframe');
  await expect(frame).toBeVisible();
  await expect.poll(async () => (await frame.boundingBox())?.width).toBe(375);
});

test('[15] a story at 1024 keeps rtl (the viewport is set by the test, not the addon)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openStory(page, 'ui-button--primary');
  expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl');
});
