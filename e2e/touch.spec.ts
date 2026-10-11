// UI wave 1 part b: criterion 18 (44 x 44 bounding box of each primary touch action).
import { expect, test } from '@playwright/test';
import { MOBILE, openStory, storiesOf } from './helpers';

test.use({ viewport: MOBILE });

// Every Button story and every Tooltip story (whose trigger is a Button) except the disabled one.
const ids = [...storiesOf('ui-button--'), ...storiesOf('ui-tooltip--')].filter((id) => !id.endsWith('--disabled'));

for (const id of ids) {
  test(`[18] ${id}: the touch action is at least 44 x 44 CSS px`, async ({ page }) => {
    await openStory(page, id);
    const target = page.locator('#storybook-root').locator('button, a[href]').first();
    await expect(target).toBeVisible();
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
}
