// UI wave 1 part b: criterion 17 (Tab reaches, Enter / Space activate), 21 (disabled inert,
// pending stays focusable) and 19/22 (Tooltip with real keyboard and pointer) in the built Storybook.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MOBILE, openStory } from './helpers';

test.use({ viewport: MOBILE });

const BUTTON_STORIES = [
  'ui-button--primary',
  'ui-button--soft',
  'ui-button--text',
  'ui-button--large',
  'ui-button--block',
  'ui-button--icon-only',
];

const countClicks = (page: Page) =>
  page.evaluate(`(() => {
    window.__clicks = 0;
    document.querySelector('#storybook-root button').addEventListener('click', () => { window.__clicks += 1; });
  })()`);
const clicks = (page: Page) => page.evaluate<number>('window.__clicks');

for (const id of BUTTON_STORIES) {
  test(`[17] ${id}: Tab reaches the button, Enter and Space each activate it once`, async ({ page }) => {
    await openStory(page, id);
    await countClicks(page);
    await page.keyboard.press('Tab');
    await expect(page.locator('#storybook-root button').first()).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await clicks(page)).toBe(1);
    await page.keyboard.press('Space');
    expect(await clicks(page)).toBe(2);
  });
}

test('[17] ui-button--as-link: Tab reaches the link and Enter follows it', async ({ page }) => {
  await openStory(page, 'ui-button--as-link');
  await page.keyboard.press('Tab');
  await expect(page.locator('#storybook-root a[href]').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#welcome');
});

test('[21] ui-button--disabled: Tab skips it and keys do nothing', async ({ page }) => {
  await openStory(page, 'ui-button--disabled');
  await countClicks(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('#storybook-root button').first()).not.toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  expect(await clicks(page)).toBe(0);
});

test('[21] ui-button--pending: aria-busy, not disabled, reached by Tab', async ({ page }) => {
  await openStory(page, 'ui-button--pending');
  const button = page.locator('#storybook-root button').first();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(button).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(button).toBeFocused();
});

// Radix renders a tooltip twice: a visible bubble and a visually hidden role="tooltip" node for
// assistive technology. The role node is the open/closed signal.
const tips = (page: Page) => page.getByRole('tooltip');

test.describe('Tooltip with keyboard and pointer', () => {
  test('[22] ui-tooltip--on-focus: open on focus, Escape closes it, blur closes it, focus reopens it', async ({
    page,
  }) => {
    await openStory(page, 'ui-tooltip--on-focus');
    const trigger = page.locator('#storybook-root button').first();
    await trigger.focus(); // the story may already have focused it; focusing again is harmless
    await expect(tips(page)).toHaveCount(1);
    await expect(tips(page)).toHaveText('שמירה');
    await page.keyboard.press('Escape');
    await expect(tips(page)).toHaveCount(0);
    await trigger.blur();
    await trigger.focus();
    await expect(tips(page)).toHaveCount(1);
    await trigger.blur();
    await expect(tips(page)).toHaveCount(0);
  });

  test('[19][22] ui-button--icon-only: closed at rest, Tab opens it with the control name, Escape closes it', async ({
    page,
  }) => {
    await openStory(page, 'ui-button--icon-only');
    const trigger = page.locator('#storybook-root button').first();
    const name = await trigger.getAttribute('aria-label');
    expect(name).toBeTruthy();
    await expect(tips(page)).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    await expect(tips(page)).toHaveCount(1);
    await expect(tips(page)).toHaveText(name ?? '');
    await page.keyboard.press('Escape');
    await expect(tips(page)).toHaveCount(0);
  });

  test('[19][22] ui-button--icon-only: hover opens it, it stays while hovered and on the bubble, Escape and leaving close it', async ({
    page,
  }) => {
    await openStory(page, 'ui-button--icon-only');
    const trigger = page.locator('#storybook-root button').first();
    const name = (await trigger.getAttribute('aria-label')) ?? '';
    await trigger.hover();
    await expect(tips(page)).toHaveCount(1);
    await page.waitForTimeout(1500);
    await expect(tips(page)).toHaveCount(1);
    const bubble = page.getByText(name).filter({ visible: true });
    const box = await bubble.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
      await page.waitForTimeout(600);
      await expect(tips(page)).toHaveCount(1);
    }
    await page.mouse.move(2, 2, { steps: 5 });
    await expect(tips(page)).toHaveCount(0);
    await trigger.hover();
    await expect(tips(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(tips(page)).toHaveCount(0);
  });

  test('[22] ui-tooltip--on-hover: hover opens it with the label and leaving closes it', async ({ page }) => {
    await openStory(page, 'ui-tooltip--on-hover');
    await expect(tips(page)).toHaveCount(0);
    await page.locator('#storybook-root button').first().hover();
    await expect(tips(page).first()).toBeAttached();
    await expect(tips(page).first()).toHaveText('פתיחת התפריט');
    await page.mouse.move(2, 2, { steps: 5 });
    await expect(tips(page)).toHaveCount(0);
  });

  test('[22] ui-tooltip--on-hover: one Escape closes the tooltip (no tooltip left behind)', async ({ page }) => {
    await openStory(page, 'ui-tooltip--on-hover');
    await page.locator('#storybook-root button').first().hover();
    await expect(tips(page).first()).toBeAttached();
    await page.keyboard.press('Escape');
    await expect(tips(page)).toHaveCount(0);
  });
});
