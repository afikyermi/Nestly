// I3 F3.3 w2 (real browser, network stubbed): the action row on the feed card. Derived from .work/comments-likes/spec.md criteria 13, 14 and the w2 half
// of 20, and from screen.md (feed card part, ORCHESTRATOR lines): roles and Hebrew names only. The stub plays the server: e2e/support/feed-stub.ts
// (like routes, an empty thread for the post page). The post page itself is w1's (e2e/comments.spec.ts); F3.2b's feed tests are e2e/feed.spec.ts.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { EMAIL, main, scan } from './support/journeys-stub';
import { anonymous, id, named, originalOf, pageOf, range, setupFeed, share } from './support/feed-stub';
import type { FeedNet, Unit } from './support/feed-stub';
import type { StoredPost } from './support/posts-stub';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;
const LIKE_FAILED = 'הלייק לא נשמר. אפשר לנסות שוב';

async function open(page: Page, net: FeedNet): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.waitForLoadState('networkidle');
  net.armed = true;
  await page.goto('/feed');
}
const cards = (page: Page) => page.getByRole('feed', { name: 'פוסטים בפיד' }).getByRole('article');
const like = (card: Locator) => card.getByRole('button', { name: /^לייק/ });
const comments = (card: Locator) => card.getByRole('link', { name: /^תגובות/ });
const stored = (n: number): StoredPost => ({ id: id(n), body: `גוף הפוסט ${n}`, audience: 'everyone', stageTag: null, createdAt: '2026-06-14T09:00:00.000Z', isMine: false });
const hold = (net: FeedNet): (() => void) => {
  let release = (): void => undefined;
  net.holdLike = new Promise<void>((resolve) => {
    release = () => {
      net.holdLike = null;
      resolve();
    };
  });
  return release;
};
const failed = (page: Page) => page.getByRole('status').filter({ hasText: LIKE_FAILED });
/** Named (4 likes, 5 comments, liked), anonymous (0, 0), a share (its own 2 likes, 1 comment) whose original carries other counts. */
const mixed = (): Unit[] => [
  named(1, { likeCount: 4, commentCount: 5, likedByMe: true }),
  anonymous(2),
  share(3, originalOf(9, { likeCount: 99 }), { likeCount: 2, commentCount: 1 }),
];

test.describe('F3.3 c13 [FR-FEED-001] the action row', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c13][c20] ${label}: named, anonymous and share cards each carry "לייק" and "תגובות" with their own counts; touch size; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupFeed(page, () => pageOf(mixed(), null));
      await open(page, net);
      await expect(cards(page)).toHaveCount(3);
      const [a, b, s] = [cards(page).nth(0), cards(page).nth(1), cards(page).nth(2)];
      await expect(a.getByRole('button', { name: 'לייק, 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(a.getByRole('link', { name: 'תגובות, 5', exact: true })).toHaveAttribute('href', `/posts/${id(1)}#comments`);
      await expect(b.getByRole('button', { name: 'לייק', exact: true })).toHaveAttribute('aria-pressed', 'false');
      await expect(b.getByRole('link', { name: 'תגובות', exact: true })).toHaveAttribute('href', `/posts/${id(2)}#comments`);
      await expect(s.getByRole('button', { name: 'לייק, 2', exact: true })).toHaveAttribute('aria-pressed', 'false');
      await expect(s.getByRole('link', { name: 'תגובות, 1', exact: true })).toHaveAttribute('href', `/posts/${id(3)}#comments`);
      await expect(b.getByRole('article')).toHaveCount(0);
      await expect(page.getByText('99')).toHaveCount(0); // the original's counts are not the share's
      await expect(b).not.toContainText('כותבת מספר 2'); // nothing author-related joined the anonymous card
      for (const control of [like(a), comments(a), like(s), comments(b)]) {
        const box = await control.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await scan(page);
    });
  }

  test('[c13] ARIA feed intact: articles focusable with posinset/setsize; the row sits after the body, inside the article', async ({ page }) => {
    const net = await setupFeed(page, () => pageOf(range(1, 3), null));
    await open(page, net);
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByRole('feed', { name: 'פוסטים בפיד' })).toHaveAttribute('role', 'feed');
    for (let i = 0; i < 3; i += 1) {
      const c = cards(page).nth(i);
      await expect(c).toHaveAttribute('aria-posinset', String(i + 1));
      await expect(c).toHaveAttribute('aria-setsize', '-1');
      expect(await c.evaluate((e) => (e instanceof HTMLElement ? e.tabIndex : -1))).toBeGreaterThanOrEqual(0);
      const bodyBox = await c.getByText(`גוף הפוסט ${i + 1}`, { exact: true }).boundingBox();
      for (const control of [like(c), comments(c)]) expect((await control.boundingBox())?.y ?? 0).toBeGreaterThanOrEqual((bodyBox?.y ?? 1e9) + (bodyBox?.height ?? 0) - 1);
    }
  });

  test('[c13] click: the count and the pressed state change at once (before the answer), then PUT; click again: DELETE; focus stays on the button', async ({ page }) => {
    const net = await setupFeed(page, () => pageOf([named(1), share(2, originalOf(9))], null));
    await open(page, net);
    const release = hold(net);
    const c = cards(page).nth(0);
    await like(c).click();
    await expect(c.getByRole('button', { name: 'לייק, 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(like(c)).toBeFocused();
    release();
    await expect.poll(() => net.likeCalls).toEqual([`PUT /api/posts/${id(1)}/like`]);
    await like(c).click();
    await expect(c.getByRole('button', { name: 'לייק', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => net.likeCalls).toEqual([`PUT /api/posts/${id(1)}/like`, `DELETE /api/posts/${id(1)}/like`]);
    await like(cards(page).nth(1)).click(); // a share is liked on its own row
    await expect.poll(() => net.likeCalls.at(-1)).toBe(`PUT /api/posts/${id(2)}/like`);
    expect(net.cursors, 'a like does not reload the feed').toEqual([null]);
    await expect(failed(page)).toHaveCount(0);
  });

  test('[c13] unlike a liked card: count -1 at once, DELETE', async ({ page }) => {
    const net = await setupFeed(page, () => pageOf([named(1, { likeCount: 4, likedByMe: true })], null));
    await open(page, net);
    const release = hold(net);
    await like(cards(page).first()).click();
    await expect(cards(page).first().getByRole('button', { name: 'לייק, 3', exact: true })).toHaveAttribute('aria-pressed', 'false');
    release();
    await expect.poll(() => net.likeCalls).toEqual([`DELETE /api/posts/${id(1)}/like`]);
  });

  test('[c13] a quick double click sends one request and ends liked once', async ({ page }) => {
    const net = await setupFeed(page, () => pageOf([named(1)], null));
    await open(page, net);
    const release = hold(net);
    await like(cards(page).first()).dblclick();
    await page.waitForTimeout(300); // a second request, if the page makes one, is sent within this bound
    release();
    await expect(cards(page).first().getByRole('button', { name: 'לייק, 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(300);
    expect(net.likeCalls).toEqual([`PUT /api/posts/${id(1)}/like`]);
  });

  test('[c13] keyboard: Space and Enter on the like toggle it', async ({ page }) => {
    const net = await setupFeed(page, () => pageOf([named(1)], null));
    await open(page, net);
    await like(cards(page).first()).focus();
    await page.keyboard.press('Space');
    await expect(cards(page).first().getByRole('button', { name: 'לייק, 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => net.likeCalls.length).toBe(1);
    await page.keyboard.press('Enter');
    await expect(cards(page).first().getByRole('button', { name: 'לייק', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => net.likeCalls.length).toBe(2);
  });

  for (const { label, viewport } of SIZES) {
    for (const answer of [500, 'abort'] as const) {
      test(`[c13] ${label}: a like that fails (${answer}) reverts the count and state and says "${LIKE_FAILED}" politely; axe`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const net = await setupFeed(page, () => pageOf([named(1)], null));
        await open(page, net);
        net.likeAnswer = answer;
        await like(cards(page).first()).click();
        await expect(failed(page)).toHaveCount(1);
        await expect(cards(page).first().getByRole('button', { name: 'לייק', exact: true })).toHaveAttribute('aria-pressed', 'false');
        await expect(main(page).getByRole('alert')).toHaveCount(0);
        expect(await failed(page).innerText()).not.toMatch(/500|internal|error|undefined|fetch/i);
        await scan(page);
      });
    }
  }

  test('[c13] an unlike that fails keeps the like and its count', async ({ page }) => {
    const net = await setupFeed(page, () => pageOf([named(1, { likeCount: 4, likedByMe: true })], null));
    await open(page, net);
    net.likeAnswer = 500;
    await like(cards(page).first()).click();
    await expect(failed(page)).toHaveCount(1);
    await expect(cards(page).first().getByRole('button', { name: 'לייק, 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('[c13] a Professional gets no feed, so no like button and no comments link', async ({ page }) => {
    const net = await setupFeed(page, () => 403, { professional: true });
    await open(page, net);
    await expect(page.getByRole('heading', { level: 1, name: 'הפיד', exact: true })).toBeVisible();
    await page.waitForTimeout(500); // the profile check answers after the heading
    await expect(main(page).getByRole('button', { name: /^לייק/ })).toHaveCount(0);
    await expect(main(page).getByRole('link', { name: /^תגובות/ })).toHaveCount(0);
    expect(net.likeCalls).toEqual([]);
  });
});

test.describe('F3.3 c14 [FR-FEED-001] the comments link and Back', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c14] ${label}: "תגובות" opens the post and lands on the focused heading "תגובות"`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupFeed(page, () => pageOf([named(1), named(2)], null), { posts: [stored(1), stored(2)] });
      await open(page, net);
      await comments(cards(page).nth(1)).click();
      await expect.poll(() => pathOf(page)).toBe(`/posts/${id(2)}`);
      expect(new URL(page.url()).hash).toBe('#comments');
      await expect(page.getByRole('heading', { level: 2, name: 'תגובות', exact: true })).toBeFocused();
    });
  }

  test('[c14] keyboard: Enter on "תגובות" lands on the focused heading', async ({ page }) => {
    const net = await setupFeed(page, () => pageOf([named(1)], null), { posts: [stored(1)] });
    await open(page, net);
    await comments(cards(page).first()).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: 'תגובות', exact: true })).toBeFocused();
  });

  test('[c14] like, open the post, go back: the restored card shows the new state and the feed is not fetched again', async ({ page }) => {
    const net = await setupFeed(page, () => pageOf([named(1, { likeCount: 2 }), named(2)], null), { posts: [stored(1), stored(2)] });
    await open(page, net);
    await like(cards(page).first()).click();
    await expect(cards(page).first().getByRole('button', { name: 'לייק, 3', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => net.likeCalls.length).toBe(1);
    await comments(cards(page).first()).click();
    await expect.poll(() => pathOf(page)).toBe(`/posts/${id(1)}`);
    await page.goBack();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).first().getByRole('button', { name: 'לייק, 3', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page).nth(1).getByRole('button', { name: 'לייק', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect(net.cursors).toEqual([null]);
  });
});
