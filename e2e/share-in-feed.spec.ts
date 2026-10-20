// I3 F3.5 share-in-feed (real browser, network stubbed): the "שיתוף בפיד" action, the share window in F3.7's primitive, the outcomes, and the share view on
// the post page. Derived from .work/share-in-feed/spec.md criteria 9-12 and screen.md (roles and Hebrew names) only; the Gate 1 / direction.md amendments
// (sheet primitive; Back, Esc, outside click close it; the new share enters the top of the feed at once). The stub plays the server: e2e/support/share-stub.ts.
// What the server decides (c3-c8) is apps/server/tests/db/shares.db.test.ts; the pure rules are packages/shared/tests/share.test.ts.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { DESKTOP_1280, scan } from './support/journeys-stub';
import { anonymous, named, pageOf, range, share } from './support/feed-stub';
import type { Unit } from './support/feed-stub';
import { id, originalOf, postView, setupShare, shareView } from './support/share-stub';
import { DELETE_ITEM, chooseFromPostMenu, afterPaint } from './support/post-menu';
import type { ShareNet } from './support/share-stub';
import { bodyBox, choice, feedCards, feedStatus, openComposer, openFeedAt, publishButton } from './support/composer';
import type { StoredPost } from './support/posts-stub';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;
const SHARE = 'שיתוף בפיד';
const POSTED = 'השיתוף פורסם';
const NOT_SHAREABLE = 'אי אפשר לשתף את הפוסט הזה';
const FAILED = 'השיתוף לא פורסם. אפשר לנסות שוב';
const TOO_LONG = 'הפוסט ארוך מדי. אפשר לקצר אותו עד 2,000 תווים';
const UNAVAILABLE = 'הפוסט המקורי כבר לא זמין';

const shareButton = (scope: Locator | Page) => scope.getByRole('button', { name: SHARE, exact: true });
const windowOf = (page: Page) => page.getByRole('dialog', { name: SHARE, exact: true });
const textBox = (box: Locator) => box.getByRole('textbox', { name: 'הטקסט שלכם (לא חובה)', exact: true });
const submit = (box: Locator) => box.getByRole('button', { name: 'שיתוף', exact: true });
const cancel = (box: Locator) => box.getByRole('button', { name: 'ביטול', exact: true });
const polite = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const storedMine = (n: number): StoredPost => ({ id: id(n), body: `גוף הפוסט ${n}`, audience: 'everyone', stageTag: null, createdAt: '2026-06-14T09:00:00.000Z', isMine: true });

async function startFeed(page: Page, items: Unit[], opts: { professional?: boolean } = {}): Promise<ShareNet> {
  const net = await setupShare(page, () => pageOf(items, null), opts);
  await openFeedAt(page, net);
  await expect(feedCards(page).first()).toBeVisible();
  return net;
}
async function startPost(page: Page, net: ShareNet, postId: string): Promise<void> {
  await openFeedAt(page, net, `/posts/${postId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'פוסט', exact: true })).toBeVisible();
}
async function openWindow(page: Page, card: Locator): Promise<Locator> {
  await shareButton(card).click();
  const box = windowOf(page);
  await expect(box).toBeVisible();
  return box;
}

test.describe('F3.5 c9 [FR-FEED-006, BR-064] the "שיתוף בפיד" action exists exactly when the post can be shared', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c9] ${label}: shown on another's named everyone post and on a share of an available everyone original; absent (never disabled) on anonymous, friends-only, my own, and a share whose original is unavailable, friends-only or mine`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await startFeed(page, [
        named(1),
        anonymous(2),
        named(3, { audience: 'friends' }),
        named(4, { isMine: true }),
        share(5, originalOf(9)),
        share(6, { available: false }),
        share(7, originalOf(9, { audience: 'friends' })),
        share(8, originalOf(9, { isMine: true })),
      ]);
      const expected = [1, 0, 0, 0, 1, 0, 0, 0];
      await expect(feedCards(page)).toHaveCount(8);
      for (const [n, count] of expected.entries()) {
        await expect(shareButton(feedCards(page).nth(n)), `card ${n + 1}`).toHaveCount(count);
        await expect(feedCards(page).nth(n).getByRole('button', { name: /^שיתוף בפיד/ }), `card ${n + 1}: no renamed share control`).toHaveCount(count);
      }
      await expect(page.getByRole('button', { name: /^שיתוף בפיד/, disabled: true })).toHaveCount(0);
    });
  }

  test('[c9] tab order inside a card: like, comments, then share in feed; the control is a 44x44 button', async ({ page }) => {
    await startFeed(page, [named(1)]);
    const card = feedCards(page).first();
    await card.getByRole('button', { name: /^לייק/ }).focus();
    const seen: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      await page.keyboard.press('Tab');
      seen.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? ''));
    }
    expect(seen[0]).toMatch(/^תגובות/);
    expect(seen[1]).toBe(SHARE);
    const box = await shareButton(card).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test('[c9] a Professional sees no share control on any card', async ({ page }) => {
    const net = await setupShare(page, () => pageOf([named(1), share(2, originalOf(9))], null), { professional: true });
    await openFeedAt(page, net);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: SHARE, exact: true })).toHaveCount(0);
  });

  test('[c9] a share card targets its ORIGINAL (BR-066): the request goes to the original\'s id, not the share\'s', async ({ page }) => {
    const net = await setupShare(page, () => pageOf([share(2, originalOf(9))], null));
    await openFeedAt(page, net);
    const box = await openWindow(page, feedCards(page).first());
    await submit(box).click();
    await expect.poll(() => net.shares.map((s) => s.target)).toEqual([id(9)]);
  });
});

test.describe('F3.5 c10 [direction "דפוסי אינטראקציה"] the share window', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c10] ${label}: a modal dialog "${SHARE}" — a bottom sheet below 1024 px, a small centred window from 1024 px — with the quote, the text box in focus, the audience and the buttons`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await startFeed(page, [share(2, originalOf(9, { body: 'גוף המקור לשיתוף' }))]);
      const box = await openWindow(page, feedCards(page).first());
      await expect(box).toHaveAttribute('aria-modal', 'true');
      const quote = box.getByRole('blockquote');
      await expect(quote).toContainText('גוף המקור לשיתוף');
      await expect(quote).toContainText('מחברת המקור 9');
      await expect(box.getByRole('link'), 'no link inside the window').toHaveCount(0);
      await expect(textBox(box)).toBeFocused();
      await expect(textBox(box)).toHaveAttribute('dir', 'rtl');
      const group = box.getByRole('radiogroup', { name: 'מי יראה את השיתוף', exact: true });
      await expect(group.getByRole('radio', { name: 'כולם', exact: true })).toBeChecked();
      await expect(group.getByRole('radio', { name: 'חברים בלבד', exact: true })).not.toBeChecked();
      await expect(submit(box)).toBeEnabled();
      await expect(cancel(box)).toBeVisible();
      const rect = (await box.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
      if (viewport.width < 1024) {
        expect(Math.round(rect.y + rect.height), 'bottom edge is the screen bottom').toBe(viewport.height);
        expect(Math.round(rect.width), 'full width').toBe(viewport.width);
      } else {
        expect(rect.width, 'a small window').toBeLessThan(viewport.width / 2 + 1);
        expect(Math.abs(rect.x + rect.width / 2 - viewport.width / 2), 'centred across').toBeLessThanOrEqual(2);
      }
      for (const control of [submit(box), cancel(box), textBox(box)]) {
        const size = await control.boundingBox();
        expect(size?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await scan(page);
    });

    test(`[c10] ${label}: Esc, an outside click, "ביטול" and Back each close it with no request; the feed neither scrolls nor navigates; focus returns to the opener`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await startFeed(page, range(1, 12));
      const opener = shareButton(feedCards(page).nth(1));
      await opener.scrollIntoViewIfNeeded();
      for (const close of ['Escape', 'outside', 'cancel', 'Back'] as const) {
        const at = await scrollY(page);
        const box = await openWindow(page, feedCards(page).nth(1));
        await page.mouse.move(viewport.width / 2, 20);
        await page.mouse.wheel(0, 600);
        await page.keyboard.press('PageDown');
        expect(await scrollY(page), `${close}: no scroll behind`).toBe(at);
        await afterPaint(page);
        if (close === 'Escape') await page.keyboard.press('Escape');
        else if (close === 'outside') await page.mouse.click(3, 3);
        else if (close === 'cancel') await cancel(box).click();
        else await page.goBack();
        await expect(box, close).toHaveCount(0);
        expect(pathOf(page), `${close}: still the feed`).toBe('/feed');
        expect(await scrollY(page), `${close}: same place`).toBe(at);
        await expect(opener, `${close}: focus returns`).toBeFocused();
      }
      expect(net.shares, 'closing sends nothing').toEqual([]);
      expect(net.cursors, 'closing does not reload the feed').toEqual([null]);
    });
  }

  test('[c10] the audience is preselected as the composer does (1א): "כולם" by default; "חברים בלבד" after a post was published with it', async ({ page }) => {
    const net = await startFeed(page, [named(1)]);
    let box = await openWindow(page, feedCards(page).first());
    await expect(box.getByRole('radio', { name: 'כולם', exact: true })).toBeChecked();
    await cancel(box).click();
    await openComposer(page);
    await bodyBox(page).fill('פוסט לחברים');
    await choice(page, 'חברים בלבד').click();
    await publishButton(page).click();
    await expect(feedStatus(page)).toHaveText('הפוסט פורסם');
    box = await openWindow(page, feedCards(page).nth(1));
    await expect(box.getByRole('radio', { name: 'חברים בלבד', exact: true })).toBeChecked();
    expect(net.shares).toEqual([]);
  });

  test('[c10] the counter speaks only at 100 characters left or fewer; 2,001 is refused with the too-long message, aria-invalid, and no request', async ({ page }) => {
    const net = await startFeed(page, [named(1)]);
    const box = await openWindow(page, feedCards(page).first());
    await textBox(box).fill('א'.repeat(1899));
    await expect(box.getByRole('status')).toHaveText('');
    await textBox(box).fill('א'.repeat(1900));
    await expect(box.getByRole('status')).toHaveText('נותרו 100 תווים');
    await textBox(box).fill('😀'.repeat(2000));
    await expect(box.getByRole('status')).toHaveText('לא נותרו תווים');
    await textBox(box).fill('א'.repeat(2001));
    await submit(box).click();
    await expect(box.getByText(TOO_LONG, { exact: true })).toBeVisible();
    await expect(textBox(box)).toHaveAttribute('aria-invalid', 'true');
    await expect(textBox(box)).toHaveAccessibleDescription(new RegExp(TOO_LONG));
    expect(net.shares).toEqual([]);
  });

  test('[c10] "שיתוף" sends one request even on a double click; while pending it reads "משתפים" and is disabled', async ({ page }) => {
    const net = await startFeed(page, [named(1)]);
    let release = (): void => undefined;
    net.holdShare = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    const box = await openWindow(page, feedCards(page).first());
    await submit(box).dblclick();
    const pending = box.getByRole('button', { name: 'משתפים', exact: true });
    await expect(pending).toBeDisabled();
    release();
    await expect(box).toHaveCount(0);
    expect(net.shares).toHaveLength(1);
  });
});

test.describe('F3.5 c11 [AC-079] the outcomes', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c11] ${label}: success closes the window, says "${POSTED}" politely, returns focus to the opener, and the server's share is at the top of the loaded feed at once — with no new GET /api/feed`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupShare(page, () => pageOf([named(1), named(2), share(3, originalOf(9, { body: 'גוף המקור' }))], null));
      net.originals[id(1)] = originalOf(1, { id: id(1), body: 'גוף הפוסט 1', author: { name: 'כותבת מספר 1' } });
      await openFeedAt(page, net);
      await expect(feedCards(page)).toHaveCount(3);
      const box = await openWindow(page, feedCards(page).first());
      await textBox(box).fill('  כדאי לקרוא  ');
      await box.getByText('חברים בלבד', { exact: true }).click();
      await submit(box).click();
      await expect(box).toHaveCount(0);
      await expect(polite(page, POSTED)).toBeVisible();
      await expect(feedCards(page)).toHaveCount(4);
      const top = feedCards(page).first();
      await expect(top).toContainText('דנה כהן');
      await expect(top).toContainText('כדאי לקרוא');
      await expect(top).toContainText('גוף הפוסט 1');
      await expect(top).toContainText('כותבת מספר 1');
      // the new share took the top place, so the card that held the opener is now the second
      await expect(shareButton(feedCards(page).nth(1)), 'focus returns to the button that opened the window').toBeFocused();
      expect(net.shares).toEqual([{ target: id(1), body: { text: 'כדאי לקרוא', audience: 'friends' } }]);
      expect(net.cursors, 'no new GET /api/feed').toEqual([null]);
      await scan(page);
    });
  }

  test('[c11] an empty text sends no text (or null) and the new card shows no sharer text', async ({ page }) => {
    const net = await startFeed(page, [named(1)]);
    const box = await openWindow(page, feedCards(page).first());
    await submit(box).click();
    await expect(feedCards(page)).toHaveCount(2);
    const sent = net.shares[0]?.body ?? {};
    expect(Object.keys(sent).filter((k) => k !== 'text' && k !== 'audience')).toEqual([]);
    expect(sent.text === undefined || sent.text === null || sent.text === '').toBe(true);
    expect(sent.audience).toBe('everyone');
  });

  test('[c11] ids are deduplicated: if the feed already holds the share the server returns, the list does not grow', async ({ page }) => {
    const net = await setupShare(page, () => pageOf([named(1), share(901, originalOf(1), { id: id(901) })], null));
    await openFeedAt(page, net);
    await expect(feedCards(page)).toHaveCount(2);
    const box = await openWindow(page, feedCards(page).first());
    await submit(box).click();
    await expect(box).toHaveCount(0);
    await expect(feedCards(page)).toHaveCount(2);
  });

  test('[c11] on reload the share is in the feed (AC-079)', async ({ page }) => {
    let shared = false;
    const net = await setupShare(page, () => pageOf(shared ? [share(901, originalOf(1), { sharerText: 'נשאר אחרי רענון', isMine: true }), named(1)] : [named(1)], null));
    await openFeedAt(page, net);
    const box = await openWindow(page, feedCards(page).first());
    await submit(box).click();
    await expect(box).toHaveCount(0);
    shared = true;
    await page.reload();
    await expect(feedCards(page).first()).toContainText('נשאר אחרי רענון');
  });

  test('[c11] not_shareable → an alert inside the window "אי אפשר לשתף את הפוסט הזה", no reason, no retry, the text kept, the window open, nothing added', async ({ page }) => {
    const net = await startFeed(page, [named(1)]);
    net.shareAnswer = 403;
    net.shareError = 'not_shareable';
    const box = await openWindow(page, feedCards(page).first());
    await textBox(box).fill('הטקסט שלי');
    await submit(box).click();
    await expect(box.getByRole('alert')).toHaveText(NOT_SHAREABLE);
    await expect(box.getByRole('button', { name: 'נסו שוב', exact: true })).toHaveCount(0);
    await expect(textBox(box)).toHaveValue('הטקסט שלי');
    expect(net.shares).toHaveLength(1);
    await cancel(box).click(); // the feed is inert behind the window: count the cards once it is closed
    await expect(feedCards(page)).toHaveCount(1);
  });

  for (const [what, answer] of [['a 5xx', 500], ['a dropped connection', 'abort']] as const) {
    test(`[c11] ${what} → the alert "${FAILED}" with "נסו שוב" inside the window, the text kept; the retry sends again and succeeds`, async ({ page }) => {
      const net = await startFeed(page, [named(1)]);
      net.shareAnswer = answer;
      const box = await openWindow(page, feedCards(page).first());
      await textBox(box).fill('מנסים שוב');
      await submit(box).click();
      await expect(box.getByRole('alert')).toContainText(FAILED);
      await expect(textBox(box)).toHaveValue('מנסים שוב');
      net.shareAnswer = 201;
      await box.getByRole('button', { name: 'נסו שוב', exact: true }).click();
      await expect(box).toHaveCount(0);
      await expect(feedCards(page)).toHaveCount(2);
      expect(net.shares).toHaveLength(2);
    });
  }

  test('[c11] 403 not_allowed → the window closes and a page-level alert says it was not posted; nothing is added', async ({ page }) => {
    const net = await startFeed(page, [named(1)]);
    net.shareAnswer = 403;
    net.shareError = 'not_allowed';
    const box = await openWindow(page, feedCards(page).first());
    await submit(box).click();
    await expect(box).toHaveCount(0);
    await expect(page.getByRole('alert').filter({ hasText: /השיתוף לא פורסם/ })).toBeVisible();
    await expect(feedCards(page)).toHaveCount(1);
  });

  test('[c10] the quote: from a feed card it shows the author name; from the page of a plain post (author unknown there) it shows no name line and never "מהקהילה"', async ({ page }) => {
    const net = await setupShare(page, () => pageOf([named(1)], null), { posts: [{ ...storedMine(2), isMine: false }] });
    net.views[id(2)] = postView(2, { body: 'גוף הפוסט בעמוד' });
    await openFeedAt(page, net);
    let box = await openWindow(page, feedCards(page).first());
    await expect(box.getByRole('blockquote')).toContainText('כותבת מספר 1');
    await cancel(box).click();
    await page.goto(`/posts/${id(2)}`);
    await expect(page.getByRole('heading', { level: 1, name: 'פוסט', exact: true })).toBeVisible();
    box = await openWindow(page, page.getByRole('main'));
    const quote = box.getByRole('blockquote');
    await expect(quote).toContainText('גוף הפוסט בעמוד');
    await expect(quote).not.toContainText('מהקהילה');
    await expect(quote).not.toContainText('כותבת מספר');
  });

  test('[c11] from the post page: success closes the window, says "השיתוף פורסם" and returns focus to the opener; the page stays', async ({ page }) => {
    const net = await setupShare(page, () => pageOf([], null), { posts: [{ ...storedMine(1), isMine: false }] });
    net.views[id(1)] = postView(1);
    await startPost(page, net, id(1));
    const opener = shareButton(page.getByRole('main'));
    const box = await openWindow(page, page.getByRole('main'));
    await submit(box).click();
    await expect(box).toHaveCount(0);
    await expect(polite(page, POSTED)).toBeVisible();
    await expect(opener).toBeFocused();
    expect(pathOf(page)).toBe(`/posts/${id(1)}`);
    expect(net.shares.map((s) => s.target)).toEqual([id(1)]);
  });
});

test.describe('F3.5 c12 [AC-081] the share view on the post page', () => {
  const original = originalOf(9, { body: 'גוף המקור בעמוד', author: { name: 'מחברת המקור' } });

  for (const { label, viewport } of [{ label: 'phone 375', viewport: MOBILE }, { label: 'desktop 1280', viewport: DESKTOP_1280 }] as const) {
    test(`[c12] ${label}: the sharer's header and text, the original in a quote with "לפוסט המקורי" to its page, "שיתוף בפיד" for the original; another viewer sees neither delete nor edit; the thread region is there; axe 0`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupShare(page, () => pageOf([], null), { posts: [] });
      net.views[id(5)] = shareView(5, original, { sharerText: 'המלצה חמה', author: { name: 'המשתפת' } });
      await startPost(page, net, id(5));
      const main = page.getByRole('main');
      await expect(main).toContainText('המשתפת');
      await expect(main.getByText('המלצה חמה', { exact: true })).toBeVisible();
      const quote = main.getByRole('blockquote');
      await expect(quote).toContainText('גוף המקור בעמוד');
      await expect(quote).toContainText('מחברת המקור');
      await expect(main.getByRole('link', { name: 'לפוסט המקורי', exact: true })).toHaveAttribute('href', `/posts/${id(9)}`);
      await expect(main.getByText(UNAVAILABLE)).toHaveCount(0);
      await expect(shareButton(main)).toHaveCount(1);
      await expect(main.getByRole('button', { name: 'מחיקה', exact: true })).toHaveCount(0);
      await expect(main.getByRole('button', { name: 'עריכה', exact: true })).toHaveCount(0);
      await expect(main.getByRole('link', { name: 'עריכה', exact: true })).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'תגובות', exact: true })).toBeVisible();
      for (const control of [shareButton(main), main.getByRole('link', { name: 'לפוסט המקורי', exact: true })]) {
        const box = await control.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await scan(page);
    });
  }

  test('[c12] "שיתוף בפיד" on a share page shares the ORIGINAL', async ({ page }) => {
    const net = await setupShare(page, () => pageOf([], null), { posts: [] });
    net.views[id(5)] = shareView(5, original);
    await startPost(page, net, id(5));
    const box = await openWindow(page, page.getByRole('main'));
    await submit(box).click();
    await expect.poll(() => net.shares.map((s) => s.target)).toEqual([id(9)]);
  });

  test(`[c12][AC-081] an unavailable original → "${UNAVAILABLE}" replaces the quote and the link; none of the original's content; no share control`, async ({ page }) => {
    const net = await setupShare(page, () => pageOf([], null), { posts: [] });
    net.views[id(5)] = shareView(5, { available: false }, { sharerText: 'נשאר שלי' });
    await startPost(page, net, id(5));
    const main = page.getByRole('main');
    await expect(main.getByText(UNAVAILABLE, { exact: true })).toBeVisible();
    await expect(main.getByText('נשאר שלי', { exact: true })).toBeVisible();
    await expect(main.getByRole('blockquote')).toHaveCount(0);
    await expect(main.getByRole('link', { name: 'לפוסט המקורי', exact: true })).toHaveCount(0);
    await expect(shareButton(main)).toHaveCount(0);
    await scan(page);
  });

  test('[c12][c8] the sharer sees "מחיקת הפוסט" in the "⋯" and no "עריכה" (ux-polish-b c3); deleting keeps the F3.1b dialog and the status "הפוסט נמחק"', async ({ page }) => {
    const net = await setupShare(page, () => pageOf([], null), { posts: [storedMine(5)] });
    net.views[id(5)] = shareView(5, original, { isMine: true, sharerText: 'שלי' });
    await startPost(page, net, id(5));
    const main = page.getByRole('main');
    await expect(main.getByRole('button', { name: 'עריכה', exact: true })).toHaveCount(0);
    await expect(main.getByRole('link', { name: 'עריכה', exact: true })).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'מחיקה', exact: true })).toHaveCount(0); // ux-polish-b c3: no visible "מחיקה" button
    await chooseFromPostMenu(page, DELETE_ITEM);
    const dialog = page.getByRole('alertdialog', { name: 'למחוק את הפוסט?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'מחיקת הפוסט', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await expect(polite(page, 'הפוסט נמחק')).toBeVisible();
    expect(net.deletes).toEqual([id(5)]);
  });
});
