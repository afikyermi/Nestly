import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { EMAIL } from './support/journeys-stub';
import { pageOf, range, setupFeed } from './support/feed-stub';
import { MINE, POST_ID, setupPosts } from './support/posts-stub';
import { bodyBox, feedCards, openFeedAt } from './support/composer';
import { EDIT_ITEM, chooseFromPostMenu } from './support/post-menu';

// Visual regression for a Professional's posting (.work/professional-posting/spec.md c13): the composer idle and engaged, and the own post's edit form, at phone
// (375) and desktop (1024) against committed baselines, e2e/__screenshots__/<name>-<size>.png, made on Linux Chrome only (the `update-baselines` workflow); a
// missing baseline FAILS. The clock is fixed by the stub, motion is reduced.
test.use({ baseURL: APP, reducedMotion: 'reduce' });

const SIZES = [
  { label: 'phone', viewport: MOBILE },
  { label: 'desktop', viewport: DESKTOP },
] as const;
const shot = (page: Page, name: string, size: string) => expect(page).toHaveScreenshot(`${name}-${size}.png`, { animations: 'disabled', caret: 'hide', scale: 'css' });

for (const { label, viewport } of SIZES) {
  test.describe(`visual: professional posting @${label}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
    });

    test('composer idle: the text field and "פרסום" above the cards', async ({ page }) => {
      const net = await setupFeed(page, () => pageOf(range(1, 3), null), { professional: true });
      await openFeedAt(page, net);
      await expect(feedCards(page)).toHaveCount(3);
      await expect(bodyBox(page)).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await shot(page, 'professional-composer-idle', label);
    });

    test('composer engaged: text typed, "הפוסט יוצג לכולם" after the field', async ({ page }) => {
      const net = await setupFeed(page, () => pageOf(range(1, 3), null), { professional: true });
      await openFeedAt(page, net);
      await expect(feedCards(page)).toHaveCount(3);
      await bodyBox(page).click();
      await bodyBox(page).fill('שאלה קטנה על שינה');
      await expect(page.getByText('הפוסט יוצג לכולם', { exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await shot(page, 'professional-composer-engaged', label);
    });

    test('own post, edit form: the fixed line instead of the audience and tag groups', async ({ page }) => {
      await setupPosts(page, { posts: [{ ...MINE, stageTag: null }], professional: true });
      await page.goto('/login');
      await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
      await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
      await page.getByRole('button', { name: 'התחברות', exact: true }).click();
      await expect.poll(() => pathOf(page)).not.toBe('/login');
      await page.goto(`/posts/${POST_ID}`);
      await chooseFromPostMenu(page, EDIT_ITEM);
      await expect(page.getByRole('form', { name: 'עריכת פוסט' })).toBeVisible();
      await expect(page.getByText('הפוסט יוצג לכולם', { exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await shot(page, 'professional-post-edit', label);
    });
  });
}
