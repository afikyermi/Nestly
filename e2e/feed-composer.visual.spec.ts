import { expect, test } from '@playwright/test';
import { APP } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { pageOf, range, setupFeed } from './support/feed-stub';
import { anonToggle, bodyBox, choice, feedCards, feedStatus, openComposer, openFeedAt, publishButton } from './support/composer';

// Visual regression for the feed's composer (.work/feed-composer/spec.md c12; Afik's test rules 14.10.2026): idle, engaged, and after a success (the new card first with
// the status), at phone (375) and desktop (1024) against a committed baseline, e2e/__screenshots__/<name>-<size>.png, made on Linux Chrome only (the `update-baselines`
// workflow); a missing baseline FAILS. The engaged state with the toggle checked is e2e/anonymous-post.visual.spec.ts, retaken on /feed. The clock is fixed by the stub,
// motion is reduced.
test.use({ baseURL: APP, reducedMotion: 'reduce' });

const SIZES = [
  { label: 'phone', viewport: MOBILE },
  { label: 'desktop', viewport: DESKTOP },
] as const;
const shot = (page: Parameters<typeof openFeedAt>[0], name: string, size: string) =>
  expect(page).toHaveScreenshot(`${name}-${size}.png`, { animations: 'disabled', caret: 'hide', scale: 'css' });

for (const { label, viewport } of SIZES) {
  test.describe(`visual: feed composer @${label}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
    });

    test('idle: the text field and "פרסום" above the cards', async ({ page }) => {
      const net = await setupFeed(page, () => pageOf(range(1, 3), null));
      await openFeedAt(page, net);
      await expect(feedCards(page)).toHaveCount(3);
      await expect(bodyBox(page)).toBeVisible();
      await expect(anonToggle(page)).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await shot(page, 'feed-composer-idle', label);
    });

    test('engaged: text typed, the options shown after the field', async ({ page }) => {
      const net = await setupFeed(page, () => pageOf(range(1, 3), null));
      await openFeedAt(page, net);
      await expect(feedCards(page)).toHaveCount(3);
      await openComposer(page);
      await bodyBox(page).fill('שאלה קטנה על שינה');
      await choice(page, 'חברים בלבד').click();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await shot(page, 'feed-composer-engaged', label);
    });

    test('after a success: the new card first with the status "הפוסט פורסם"', async ({ page }) => {
      const net = await setupFeed(page, () => pageOf(range(1, 3), null));
      await openFeedAt(page, net);
      await expect(feedCards(page)).toHaveCount(3);
      await openComposer(page);
      await bodyBox(page).fill('הפוסט הראשון שלי, עם שאלה קטנה על שינה');
      await choice(page, 'חברים בלבד').click();
      await choice(page, 'בהריון').click();
      await expect(anonToggle(page)).not.toBeChecked();
      await publishButton(page).click();
      await expect(feedCards(page)).toHaveCount(4);
      await expect(feedStatus(page)).toHaveText('הפוסט פורסם');
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await shot(page, 'feed-composer-published', label);
    });
  });
}
