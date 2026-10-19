import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { EMAIL } from './support/journeys-stub';
import { ANON_MINE, ANON_MINE_ID, ANON_OTHERS, ANON_OTHERS_ID, MINE, OTHERS, setupPosts } from './support/posts-stub';
import { setupComments, top } from './support/comments-stub';
import { pageOf, range, setupFeed } from './support/feed-stub';
import { anonToggle, feedCards, openComposer, openFeedAt } from './support/composer';

// Visual regression for the screens F3.4 touches (.work/anonymous-post/spec.md c11-c14; Afik's test rules 14.10.2026): each state at phone (375) and desktop (1024)
// against a committed baseline, e2e/__screenshots__/<name>-<size>.png, made on Linux Chrome only (the `update-baselines` workflow); a missing baseline FAILS.
// The app runs in the e2e build with the network stubbed (e2e/support/posts-stub.ts, comments-stub.ts); the clock is fixed by the stub, motion is reduced.
test.use({ baseURL: APP, reducedMotion: 'reduce' });

const SIZES = [
  { label: 'phone', viewport: MOBILE },
  { label: 'desktop', viewport: DESKTOP },
] as const;

async function open(page: Page, path: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
const shot = (page: Page, name: string, size: string) =>
  expect(page).toHaveScreenshot(`${name}-${size}.png`, { animations: 'disabled', caret: 'hide', scale: 'css' });

for (const { label, viewport } of SIZES) {
  test.describe(`visual: anonymous post @${label}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
    });

    // The composer is the button at the top of /feed that opens in place (feed-composer c2, c12): the baselines are retaken there.
    test('composer open in the feed, toggle unchecked', async ({ page }) => {
      const net = await setupFeed(page, () => pageOf(range(1, 3), null));
      await openFeedAt(page, net);
      await expect(feedCards(page)).toHaveCount(3);
      await openComposer(page);
      await expect(anonToggle(page)).not.toBeChecked();
      await shot(page, 'anonymous-composer', label);
    });

    test('composer open in the feed, toggle checked (audience group gone, anonymous notice)', async ({ page }) => {
      const net = await setupFeed(page, () => pageOf(range(1, 3), null));
      await openFeedAt(page, net);
      await expect(feedCards(page)).toHaveCount(3);
      await openComposer(page);
      await anonToggle(page).check();
      await expect(page.getByRole('radiogroup', { name: 'מי יראה את הפוסט' })).toHaveCount(0);
      await shot(page, 'anonymous-composer-checked', label);
    });

    test('post page of an anonymous post, as its real author (header, own note, edit and delete)', async ({ page }) => {
      await setupPosts(page, { posts: [MINE, ANON_MINE] });
      await open(page, `/posts/${ANON_MINE_ID}`);
      await expect(page.getByText('פרסמתם את הפוסט הזה באופן אנונימי. רק אתם רואים את ההודעה הזו')).toBeVisible();
      await shot(page, 'anonymous-post-author', label);
    });

    test('post page of an anonymous post, as a reader (header only)', async ({ page }) => {
      await setupPosts(page, { posts: [OTHERS, ANON_OTHERS] });
      await open(page, `/posts/${ANON_OTHERS_ID}`);
      await expect(page.getByRole('main').getByText('אנונימי', { exact: true })).toBeVisible();
      await shot(page, 'anonymous-post-reader', label);
    });

    test('edit form of an anonymous post (no audience group, the fixed line)', async ({ page }) => {
      await setupPosts(page, { posts: [ANON_MINE] });
      await open(page, `/posts/${ANON_MINE_ID}`);
      await page.getByRole('button', { name: 'עריכה', exact: true }).click();
      await expect(page.getByText('הפוסט אנונימי ומוצג לכולם. אי אפשר לשנות את זה')).toBeVisible();
      await shot(page, 'anonymous-post-edit', label);
    });

    test('comment thread of an anonymous post, name notice (reader)', async ({ page }) => {
      await setupComments(page, [top(1, 'תגובה ראשונה', [], { author: { name: 'נועה' } })], { posts: [ANON_OTHERS] });
      await open(page, `/posts/${ANON_OTHERS_ID}`);
      await expect(page.getByText('השם שלכם יוצג לכל מי שיכול לראות את התגובה')).toBeVisible();
      await shot(page, 'anonymous-thread-name-notice', label);
    });

    test('comment thread of an anonymous post, "המחבר" notice (real author)', async ({ page }) => {
      await setupComments(page, [top(1, 'תגובה ראשונה', [], { author: { name: 'נועה' } })], { posts: [ANON_MINE] });
      await open(page, `/posts/${ANON_MINE_ID}`);
      await expect(page.getByText('בפוסט הזה התגובות שלכם מוצגות תחת "המחבר", בלי השם שלכם')).toBeVisible();
      await shot(page, 'anonymous-thread-author-notice', label);
    });
  });
}
