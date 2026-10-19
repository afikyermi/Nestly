import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { named, pageOf, share } from './support/feed-stub';
import { id, originalOf, setupShare, shareView } from './support/share-stub';
import { feedCards, openFeedAt } from './support/composer';

// Visual regression for F3.5 and F3.6 (.work/share-in-feed/spec.md c10-c12, .work/share-link/spec.md c4, c5, c11, c12; Afik's test rules 14.10.2026): the share
// window (idle, "not shareable"), the post page's share view (available, unavailable), the ShareSheet (post, copy failed, site), at phone (375) and desktop (1024)
// against a committed baseline, e2e/__screenshots__/<name>-<size>.png, made on Linux Chrome only (the `update-baselines` workflow); a missing baseline FAILS.
// The clock is fixed by the stub, motion is reduced. This file has its own baselines and is not listed in e2e/visual-screens.ts (as the composer's).
test.use({ baseURL: APP, reducedMotion: 'reduce' });

const SIZES = [
  { label: 'phone', viewport: MOBILE },
  { label: 'desktop', viewport: DESKTOP },
] as const;
const shot = (page: Page, name: string, size: string) => expect(page).toHaveScreenshot(`${name}-${size}.png`, { animations: 'disabled', caret: 'hide', scale: 'css' });
const settle = (page: Page) => page.evaluate(() => document.fonts.ready.then(() => undefined));

async function noClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
}

for (const { label, viewport } of SIZES) {
  test.describe(`visual: sharing @${label}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
    });

    test('share window: the quote, the text, the audience, the buttons', async ({ page }) => {
      const net = await setupShare(page, () => pageOf([named(1, { body: 'שאלה על שינה של תינוקות בני חצי שנה' })], null));
      await openFeedAt(page, net);
      await feedCards(page).first().getByRole('button', { name: 'שיתוף בפיד', exact: true }).click();
      const box = page.getByRole('dialog', { name: 'שיתוף בפיד', exact: true });
      await box.getByRole('textbox', { name: 'הטקסט שלכם (לא חובה)', exact: true }).fill('מצאתי את זה מועיל');
      await settle(page);
      await shot(page, 'share-window', label);
    });

    test('share window: "אי אפשר לשתף את הפוסט הזה" after a refusal, the text kept', async ({ page }) => {
      const net = await setupShare(page, () => pageOf([named(1)], null));
      net.shareAnswer = 403;
      await openFeedAt(page, net);
      await feedCards(page).first().getByRole('button', { name: 'שיתוף בפיד', exact: true }).click();
      const box = page.getByRole('dialog', { name: 'שיתוף בפיד', exact: true });
      await box.getByRole('textbox', { name: 'הטקסט שלכם (לא חובה)', exact: true }).fill('מצאתי את זה מועיל');
      await box.getByRole('button', { name: 'שיתוף', exact: true }).click();
      await expect(box.getByRole('alert')).toHaveText('אי אפשר לשתף את הפוסט הזה');
      await settle(page);
      await shot(page, 'share-window-not-shareable', label);
    });

    test('post page: a share with its original quoted and "לפוסט המקורי"', async ({ page }) => {
      const net = await setupShare(page, () => pageOf([], null), { posts: [] });
      net.views[id(5)] = shareView(5, originalOf(9, { body: 'גוף הפוסט המקורי, כפי שנכתב', author: { name: 'מחברת המקור' } }), { sharerText: 'המלצה חמה', author: { name: 'המשתפת' } });
      await openFeedAt(page, net, `/posts/${id(5)}`);
      await expect(page.getByRole('link', { name: 'לפוסט המקורי', exact: true })).toBeVisible();
      await settle(page);
      await shot(page, 'post-share-view', label);
    });

    test('post page: a share whose original is no longer available', async ({ page }) => {
      const net = await setupShare(page, () => pageOf([], null), { posts: [] });
      net.views[id(5)] = shareView(5, { available: false }, { sharerText: 'המלצה חמה', author: { name: 'המשתפת' } });
      await openFeedAt(page, net, `/posts/${id(5)}`);
      await expect(page.getByText('הפוסט המקורי כבר לא זמין', { exact: true })).toBeVisible();
      await settle(page);
      await shot(page, 'post-share-unavailable', label);
    });

    test('ShareSheet: WhatsApp, email, copy, close', async ({ page }) => {
      const net = await setupShare(page, () => pageOf([named(1), share(2, originalOf(9))], null));
      await openFeedAt(page, net);
      await feedCards(page).first().getByRole('button', { name: 'שיתוף קישור', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'שיתוף קישור', exact: true })).toBeVisible();
      await settle(page);
      await shot(page, 'share-sheet-post', label);
    });

    test('ShareSheet: copy failed — the alert and the link field', async ({ page }) => {
      await noClipboard(page);
      const net = await setupShare(page, () => pageOf([named(1)], null));
      await openFeedAt(page, net);
      await feedCards(page).first().getByRole('button', { name: 'שיתוף קישור', exact: true }).click();
      const box = page.getByRole('dialog', { name: 'שיתוף קישור', exact: true });
      await box.getByRole('button', { name: 'העתקת קישור', exact: true }).click();
      await expect(box.getByRole('textbox', { name: 'הקישור', exact: true })).toBeVisible();
      await settle(page);
      await shot(page, 'share-sheet-copy-failed', label);
    });

    test('ShareSheet: the site link from the side menu', async ({ page }) => {
      const net = await setupShare(page, () => pageOf([named(1)], null));
      await openFeedAt(page, net);
      await page.getByRole('button', { name: 'פתיחת התפריט', exact: true }).click();
      await page.getByRole('dialog', { name: 'תפריט' }).getByRole('button', { name: 'שיתוף Nestly', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'שיתוף Nestly', exact: true })).toBeVisible();
      await settle(page);
      await shot(page, 'share-sheet-site', label);
    });
  });
}

