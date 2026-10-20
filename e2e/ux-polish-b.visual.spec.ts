// Visual regression for the states ux-polish-b adds (.work/ux-polish-b/spec.md c1, c3, c9; Afik's test rules 14.10.2026): phone (375) and desktop (1024)
// against committed baselines, e2e/__screenshots__/<name>-<size>.png, made on Linux Chrome only (the `update-baselines` workflow); a missing baseline FAILS.
// Also changed by c3 and to be retaken there: anonymous-post-author-{phone,desktop} (the own post page now shows the "⋯", not "עריכה" / "מחיקה").
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { id, named, pageOf, range, setupFeed } from './support/feed-stub';
import { MINE, POST_ID, setupPosts } from './support/posts-stub';
import { feedCards, openFeedAt } from './support/composer';
import { EDIT_ITEM, postMore } from './support/post-menu';
import { EMAIL } from './support/journeys-stub';

test.use({ baseURL: APP, reducedMotion: 'reduce' });

const SIZES = [
  { label: 'phone', viewport: MOBILE },
  { label: 'desktop', viewport: DESKTOP },
] as const;
const shot = (page: Page, name: string, size: string) =>
  expect(page).toHaveScreenshot(`${name}-${size}.png`, { animations: 'disabled', caret: 'hide', scale: 'css' });

for (const { label, viewport } of SIZES) {
  test.describe(`visual: ux-polish-b @${label}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
    });

    test('feed: an own card in edit, in place (header stays, form replaces body and actions)', async ({ page }) => {
      const net = await setupFeed(page, () => pageOf([named(1), named(2, { isMine: true }), named(3)], null), {
        posts: [{ id: id(2), body: 'גוף הפוסט 2', audience: 'everyone', stageTag: null, createdAt: '2026-06-14T09:00:00.000Z', isMine: true }],
      });
      await openFeedAt(page, net);
      await expect(feedCards(page)).toHaveCount(3);
      const card = feedCards(page).nth(1);
      await card.getByRole('button', { name: 'פעולות נוספות לפוסט', exact: true }).click();
      await page.getByRole('menuitem', { name: EDIT_ITEM, exact: true }).click();
      await expect(card.getByRole('form', { name: 'עריכת פוסט' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await shot(page, 'ux-polish-feed-card-edit', label);
    });

    test('post page of an own post: the "⋯" open with edit and delete', async ({ page }) => {
      await setupPosts(page, { posts: [{ ...MINE }] });
      await page.goto('/login');
      await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
      await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
      await page.getByRole('button', { name: 'התחברות', exact: true }).click();
      await expect.poll(() => new URL(page.url()).pathname).not.toBe('/login');
      await page.goto(`/posts/${POST_ID}`);
      await postMore(page).click();
      await expect(page.getByRole('menuitem', { name: EDIT_ITEM, exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await shot(page, 'ux-polish-post-own-menu', label);
    });
  });
}

test.describe('visual: ux-polish-b @desktop tooltip', () => {
  test('feed: the "חזרה למעלה" tooltip at 1024 px (icon only, hovered)', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const net = await setupFeed(page, (cursor) => (cursor === null ? pageOf(range(1, 12), 'c1') : cursor === 'c1' ? pageOf(range(13, 24), null) : pageOf([], null)));
    await openFeedAt(page, net);
    await expect(feedCards(page)).toHaveCount(12);
    await feedCards(page).last().scrollIntoViewIfNeeded();
    await expect(feedCards(page)).toHaveCount(24);
    await feedCards(page).last().scrollIntoViewIfNeeded();
    const top = page.getByRole('button', { name: 'חזרה למעלה', exact: true });
    await expect(top).toBeVisible();
    await top.hover();
    await expect(page.getByRole('tooltip')).toHaveText('חזרה למעלה');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await shot(page, 'ux-polish-to-top-tooltip', 'desktop');
  });
});
