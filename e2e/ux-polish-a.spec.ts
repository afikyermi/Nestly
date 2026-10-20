// I3 ux-polish-a (real browser, network stubbed): the comments inside the feed card. Derived from .work/ux-polish-a/spec.md criteria 1-7, 9-12 and screen.md
// (roles and Hebrew names) only. c8 (comment likes in the card) is a unit test: apps/web/tests/ux-polish-a-likes.test.tsx. Superseded and re-cited, not duplicated:
// F3.3 c13/c14 "תגובות" link -> in-card button (e2e/feed-actions.spec.ts), F3.2b/F3.9 tab order and link counts (feed.spec.ts), F3.4 link count (anonymous-post.spec.ts).
// The post page's own thread, F3.3 c15-c19 texts and F3.7's sheet are comments.spec.ts / report*.spec.ts; here only what the card changes.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { main, scan } from './support/journeys-stub';
import { anonymous, named } from './support/feed-stub';
import type { Unit } from './support/feed-stub';
import type { StoredPost } from './support/posts-stub';
import { comment, gate, id, setupCardComments, top } from './support/card-comments-stub';
import type { CardNet, StubTop } from './support/card-comments-stub';
import { feedCards, openFeedAt } from './support/composer';
import { T, choose, sendButton, sheet } from './support/report-ui';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;
const LOAD_FAILED = 'לא הצלחנו לטעון את התגובות. אפשר לנסות שוב';
const MORE_FAILED = 'לא הצלחנו לטעון עוד תגובות. אפשר לנסות שוב';
const SEND_FAILED = 'התגובה לא נשלחה. אפשר לנסות שוב';
const NAME_NOTICE = 'השם שלכם יוצג לכל מי שיכול לראות את התגובה';
const AUTHOR_NOTICE = 'בפוסט הזה התגובות שלכם מוצגות תחת "המחבר", בלי השם שלכם';
const SCRIPT = 'window.__ua=1';

const cards = feedCards;
const card = (page: Page, i: number) => cards(page).nth(i);
const list = (c: Locator) => c.getByRole('list', { name: 'רשימת התגובות', exact: true });
const field = (c: Locator) => c.getByRole('textbox', { name: 'כתיבת תגובה', exact: true });
// screen.md (60ecc9f): the in-card comment and reply forms are unnamed, so they are found by the textbox they hold.
const form = (c: Locator) => c.locator('form').filter({ has: c.page().getByRole('textbox', { name: 'כתיבת תגובה', exact: true }) });
const replyForm = (c: Locator) => c.locator('form').filter({ has: c.page().getByRole('textbox', { name: 'כתיבת השבה', exact: true }) });
const btn = (scope: Page | Locator, name: string | RegExp) => scope.getByRole('button', { name, ...(typeof name === 'string' ? { exact: true } : {}) });
const commentsBtn = (c: Locator) => c.getByRole('button', { name: /^תגובות/ });
const moreOfComment = (scope: Locator) => scope.getByRole('button', { name: 'פעולות נוספות לתגובה', exact: true }).first();
const shown = (c: Locator) => list(c).locator(':scope > li');
/** A top-level comment by text only it holds (a reply's text also sits inside its parent, hence first()). */
const item = (c: Locator, text: string) => list(c).getByRole('listitem').filter({ hasText: text }).first();
const status = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
const alertIn = (scope: Locator, text: string) => scope.getByRole('alert').filter({ hasText: text });
const focusedText = (page: Page) => page.evaluate(() => document.activeElement?.textContent ?? '');
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const stored = (n: number, over: Partial<StoredPost> = {}): StoredPost => ({ id: id(n), body: `גוף הפוסט ${n}`, audience: 'everyone', stageTag: null, createdAt: '2026-06-14T09:00:00.000Z', isMine: false, ...over });
const many = (n: number, prefix = 'קומה'): StubTop[] => Array.from({ length: n }, (_v, i) => top(200 + i, `${prefix} ${String(i + 1).padStart(2, '0')}`));
const commentCalls = (net: CardNet, n: number) => net.calls.filter((c) => c.includes(`/api/posts/${id(n)}/comments`));
/** The thread of the first card: three top-level comments; the first has two replies, the second is the anonymous post author's. */
const basic = (): StubTop[] => [
  top(101, 'ראשונה', [comment(111, 'השבה א'), comment(112, 'השבה ב')], { author: { name: 'נועה' }, likeCount: 2 }),
  top(102, 'שניה מהמחברת', [], { byAuthor: true, author: undefined }),
  top(103, 'שלישית', [], { isMine: true, author: { name: 'דנה כהן' } }),
];

async function start(page: Page, items: Unit[], threads: Record<string, StubTop[]>, opts: { posts?: StoredPost[]; tweak?: (net: CardNet) => void; path?: string } = {}): Promise<CardNet> {
  const net = await setupCardComments(page, items, threads, opts.posts === undefined ? {} : { posts: opts.posts });
  opts.tweak?.(net);
  await openFeedAt(page, net.feed, opts.path ?? '/feed');
  await expect(cards(page).first()).toBeVisible();
  return net;
}
const big = async (target: Locator, what: string): Promise<void> => {
  const box = await target.boundingBox();
  expect(box?.width ?? 0, `${what} width`).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0, `${what} height`).toBeGreaterThanOrEqual(44);
};
const ring = (target: Locator) =>
  target.evaluate((el) => {
    const s = getComputedStyle(el);
    return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2) || s.boxShadow !== 'none';
  });
async function describedBy(el: Locator): Promise<string[]> {
  return el.evaluate((node) => (node.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean).map((i) => document.getElementById(i)?.textContent?.trim() ?? ''));
}

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-a c1 [FR-FEED-001, FR-FEED-003] the preview', () => {
  for (const { label, viewport } of SIZES) {
    test(`[ua c1] ${label}: commentCount 0 sends no comments request and shows only the field; commentCount > 0 sends exactly one GET without a cursor and shows the first two top-level comments, replies hidden`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await start(page, [named(1, { commentCount: 3 }), named(2)], { [id(1)]: basic() });
      const full = card(page, 0);
      await expect(shown(full)).toHaveCount(2);
      await expect(item(full, 'ראשונה')).toBeVisible();
      await expect(full.getByText('שלישית')).toHaveCount(0);
      await expect(full.getByText('השבה א')).toHaveCount(0); // replies are not in the preview
      await expect.poll(() => commentCalls(net, 1)).toEqual([`GET /api/posts/${id(1)}/comments`]);
      const first = item(full, 'ראשונה');
      await expect(list(full).getByRole('listitem', { name: 'נועה', exact: true })).toHaveCount(1);
      await expect(first.locator('time[datetime]')).toHaveCount(1);
      await expect(first.locator('p[dir="auto"]')).toContainText('ראשונה');
      await expect(btn(first, 'לייק, 2')).toBeVisible();
      await expect(btn(first, 'השבה')).toBeVisible();
      await expect(moreOfComment(first)).toBeVisible();
      await expect(field(full)).toBeVisible();
      await expect(btn(full, 'שליחה')).toBeVisible();
      const empty = card(page, 1);
      await expect(field(empty)).toBeVisible();
      await expect(shown(empty)).toHaveCount(0);
      await expect(btn(empty, 'הצגת עוד תגובות')).toHaveCount(0);
      await page.waitForTimeout(400); // a request for the empty card, if the page makes one, is sent within this bound
      expect(commentCalls(net, 2)).toEqual([]);
    });
  }

  test('[ua c1] a card never near the viewport sends nothing; it asks once when it comes near; GET /feed is unchanged (no preview inside it)', async ({ page }) => {
    const items = Array.from({ length: 30 }, (_v, i) => named(i + 1, { commentCount: 2 }));
    const threads = Object.fromEntries(items.map((_u, i) => [id(i + 1), [top(300 + i, `תגובה לפוסט ${i + 1}`)]]));
    const net = await start(page, items, threads);
    await expect(item(card(page, 0), 'תגובה לפוסט 1')).toBeVisible();
    await page.waitForTimeout(400);
    expect(commentCalls(net, 30)).toEqual([]);
    await card(page, 29).scrollIntoViewIfNeeded();
    await expect(item(card(page, 29), 'תגובה לפוסט 30')).toBeVisible();
    expect(commentCalls(net, 30)).toEqual([`GET /api/posts/${id(30)}/comments`]);
    // GET /feed itself: one request, no extra parameter, and no comments inside what it answers (the stub answers the same page as before).
    expect(net.feed.cursors).toEqual([null]);
    expect(net.feed.methods).toEqual(['GET']);
  });

  test('[ua c1] the card asks once: leaving and re-entering the viewport does not repeat the request', async ({ page }) => {
    const items = Array.from({ length: 12 }, (_v, i) => named(i + 1, { commentCount: 1 }));
    const net = await start(page, items, { [id(1)]: [top(401, 'רק אחת')] });
    await expect(item(card(page, 0), 'רק אחת')).toBeVisible();
    await card(page, 11).scrollIntoViewIfNeeded();
    await card(page, 0).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    expect(commentCalls(net, 1)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-a c2 [FR-FEED-001] show more comments and replies', () => {
  for (const { label, viewport } of SIZES) {
    test(`[ua c2] ${label}: "הצגת עוד תגובות" reveals the loaded page with no request, then fetches the next page with the cursor, focus on the first new comment, and leaves at the end`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await start(page, [named(1, { commentCount: 5 })], { [id(1)]: many(5) }, { tweak: (n) => { n.pageSize = 3; } });
      const c = card(page, 0);
      await expect(shown(c)).toHaveCount(2);
      expect(commentCalls(net, 1)).toHaveLength(1);
      await btn(c, 'הצגת עוד תגובות').click();
      await expect(shown(c)).toHaveCount(3);
      expect(commentCalls(net, 1), 'the first press is a reveal, not a request').toHaveLength(1);
      await btn(c, 'הצגת עוד תגובות').click();
      await expect(shown(c)).toHaveCount(5);
      expect(commentCalls(net, 1).filter((x) => x.includes('cursor='))).toHaveLength(1);
      expect(await focusedText(page)).toContain('קומה 04');
      await expect(btn(c, 'הצגת עוד תגובות')).toHaveCount(0);
      const text = (await list(c).innerText()).replace(/\s+/g, ' ');
      const at = [1, 3, 4, 5].map((n) => text.indexOf(`קומה 0${n}`));
      expect([...at].sort((a, b) => a - b)).toEqual(at);
      expect(at[0]).toBeGreaterThanOrEqual(0);
    });
  }

  test('[ua c2] with exactly two comments and no further page there is no "הצגת עוד תגובות"', async ({ page }) => {
    await start(page, [named(1, { commentCount: 2 })], { [id(1)]: many(2) });
    await expect(shown(card(page, 0))).toHaveCount(2);
    await expect(btn(card(page, 0), 'הצגת עוד תגובות')).toHaveCount(0);
  });

  test('[ua c2] "הצגת עוד השבות": the first press shows the inline replies with no request; a comment with more replies than inline pages as F3.3 c19', async ({ page }) => {
    const replies = Array.from({ length: 5 }, (_v, i) => comment(600 + i, `מענה ${i + 1}`));
    const net = await start(page, [named(1, { commentCount: 2 })], { [id(1)]: [top(501, 'עם השבות', replies), top(502, 'בלי השבות')] });
    const own = item(card(page, 0), 'עם השבות');
    await expect(own.getByText('מענה 1')).toHaveCount(0);
    await expect(btn(item(card(page, 0), 'בלי השבות'), 'הצגת עוד השבות')).toHaveCount(0);
    const before = net.calls.length;
    await btn(own, 'הצגת עוד השבות').click();
    await expect(own.getByRole('listitem')).toHaveCount(3);
    expect(net.calls.length, 'the first press shows the inline replies without a request').toBe(before);
    await btn(own, 'הצגת עוד השבות').click();
    await expect(own.getByRole('listitem')).toHaveCount(5);
    expect(net.calls.slice(before)).toHaveLength(1);
    expect(net.calls.at(-1)).toContain(`/api/comments/${id(501)}/replies`);
    await expect(btn(own, 'הצגת עוד השבות')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-a c3 [FR-FEED-001] states inside the card', () => {
  for (const { label, viewport } of SIZES) {
    test(`[ua c3] ${label}: loading shows skeleton lines with "טוענים את התגובות" and the field stays; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const g = gate();
      await start(page, [named(1, { commentCount: 2 })], { [id(1)]: many(2) }, { tweak: (n) => { n.holdThread = g.promise; } });
      const c = card(page, 0);
      await expect(c.getByText('טוענים את התגובות')).toBeAttached();
      await expect(field(c)).toBeVisible();
      await scan(page);
      g.release();
      await expect(shown(c)).toHaveCount(2);
      await expect(c.getByText('טוענים את התגובות')).toHaveCount(0);
    });
    test(`[ua c3] ${label}: a load failure shows the inline alert and "נסו שוב" (one new request), the field stays, no navigation, the scroll does not move; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const items = [named(1), named(2), named(3, { commentCount: 2 }), named(4)];
      const net = await start(page, items, { [id(3)]: many(2) }, { tweak: (n) => { n.fail.thread = 500; } });
      const c = card(page, 2);
      await c.scrollIntoViewIfNeeded();
      await expect(alertIn(c, LOAD_FAILED)).toBeVisible();
      await expect(field(c)).toBeVisible();
      await scan(page);
      const url = page.url();
      const y = await scrollY(page);
      net.fail.thread = null;
      const before = commentCalls(net, 3).length;
      await btn(c, 'נסו שוב').click();
      await expect(shown(c)).toHaveCount(2);
      expect(commentCalls(net, 3).length - before).toBe(1);
      await expect(alertIn(c, LOAD_FAILED)).toHaveCount(0);
      expect(page.url()).toBe(url);
      expect(Math.abs((await scrollY(page)) - y)).toBeLessThanOrEqual(2);
    });
  }

  test('[ua c3] a next-page failure keeps the list, shows the alert and "נסו שוב" with the cursor; the retry appends', async ({ page }) => {
    const net = await start(page, [named(1, { commentCount: 5 })], { [id(1)]: many(5) }, { tweak: (n) => { n.pageSize = 3; n.fail.more = 500; } });
    const c = card(page, 0);
    await btn(c, 'הצגת עוד תגובות').click();
    await btn(c, 'הצגת עוד תגובות').click();
    await expect(alertIn(c, MORE_FAILED)).toBeVisible();
    await expect(shown(c)).toHaveCount(3);
    net.fail.more = null;
    await btn(c, 'נסו שוב').click();
    await expect(shown(c)).toHaveCount(5);
    const cursors = commentCalls(net, 1).filter((x) => x.includes('cursor='));
    expect(cursors).toHaveLength(2);
    expect(cursors[1]).toBe(cursors[0]);
  });

  test('[ua c3] a 404 says "הפוסט אינו זמין" in the comment area and shows no field; the card stays', async ({ page }) => {
    await start(page, [named(1, { commentCount: 2 }), named(2)], { [id(1)]: many(2) }, { tweak: (n) => { n.gone.add(id(1)); } });
    const c = card(page, 0);
    await expect(c.getByText('הפוסט אינו זמין')).toBeVisible();
    await expect(field(c)).toHaveCount(0);
    await expect(btn(c, 'שליחה')).toHaveCount(0);
    expect(pathOf(page)).toBe('/feed');
    await expect(field(card(page, 1))).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-a c4 [FR-FEED-001] the field', () => {
  for (const { label, viewport } of SIZES) {
    test(`[ua c4] ${label}: every card with the like control has the field, shares and anonymous cards too, each in its own card`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page, [named(1), anonymous(2), named(3)], {}, { posts: [stored(2, { isAnonymous: true })] });
      await expect(main(page).getByRole('textbox', { name: 'כתיבת תגובה', exact: true })).toHaveCount(3);
      await expect(field(card(page, 0))).toBeVisible();
      await expect(field(card(page, 2))).toBeVisible();
    });
  }

  test('[ua c4] blank shows the message, 1,001 characters shows too-long and sends nothing, the counter speaks, 1,000 is sent', async ({ page }) => {
    const net = await start(page, [named(1)], {});
    const c = card(page, 0);
    await field(c).fill('   ');
    await btn(form(c), 'שליחה').click();
    await expect(form(c).getByText('יש לכתוב משהו לפני השליחה')).toBeVisible();
    await expect(field(c)).toBeFocused();
    await field(c).fill('א'.repeat(1001));
    await expect(form(c).getByText('התגובה ארוכה בתו אחד מהמותר')).toBeVisible();
    await btn(form(c), 'שליחה').click();
    await expect(form(c).getByText('התגובה ארוכה מדי. אפשר לקצר אותה עד 1,000 תווים')).toBeVisible();
    expect(net.sends).toEqual([]);
    await field(c).fill('א'.repeat(900));
    await expect(form(c).getByText('נותרו 100 תווים')).toBeVisible();
    await field(c).fill('א'.repeat(1000));
    await btn(form(c), 'שליחה').click();
    await expect.poll(() => net.sends.length).toBe(1);
  });

  test('[ua c4] success appends the server comment last (shown also when collapsed), clears the field, "תגובות, N" +1, status "התגובה נוספה", focus stays in the field', async ({ page }) => {
    const net = await start(page, [named(1, { commentCount: 3 })], { [id(1)]: many(3) });
    const c = card(page, 0);
    await expect(shown(c)).toHaveCount(2);
    await expect(commentsBtn(c)).toHaveAccessibleName('תגובות, 3');
    await field(c).fill('  תודה רבה  ');
    await btn(form(c), 'שליחה').click();
    await expect(status(page, 'התגובה נוספה')).toBeVisible();
    expect(net.sends.map((x) => String(x.body).trim())).toEqual(['תודה רבה']);
    await expect(shown(c).last()).toContainText('תודה רבה');
    await expect(field(c)).toHaveValue('');
    await expect(field(c)).toBeFocused();
    await expect(commentsBtn(c)).toHaveAccessibleName('תגובות, 4');
  });

  test('[ua c4] a double press sends one request; a failed send keeps the text and alerts; the next try works', async ({ page }) => {
    const g = gate();
    const net = await start(page, [named(1)], {}, { tweak: (n) => { n.holdSend = g.promise; } });
    const c = card(page, 0);
    await field(c).fill('פעם אחת');
    await btn(form(c), 'שליחה').dblclick();
    await expect(btn(form(c), 'שולחים')).toBeDisabled();
    await page.waitForTimeout(300);
    g.release();
    await expect(status(page, 'התגובה נוספה')).toBeVisible();
    expect(net.sends).toHaveLength(1);
    net.holdSend = null;
    net.fail.send = 500;
    await field(c).fill('טקסט שחשוב לשמור');
    await btn(form(c), 'שליחה').click();
    await expect(alertIn(c, SEND_FAILED)).toBeVisible();
    await expect(field(c)).toHaveValue('טקסט שחשוב לשמור');
    net.fail.send = null;
    await btn(form(c), 'שליחה').click();
    await expect(status(page, 'התגובה נוספה')).toBeVisible();
  });

  test('[ua c4] a comment sent in one card does not appear in another', async ({ page }) => {
    await start(page, [named(1), named(2)], {});
    await field(card(page, 0)).fill('רק בכרטיס הראשון');
    await btn(form(card(page, 0)), 'שליחה').click();
    await expect(status(page, 'התגובה נוספה')).toBeVisible();
    await expect(card(page, 1).getByText('רק בכרטיס הראשון')).toHaveCount(0);
    await expect(commentsBtn(card(page, 1))).toHaveAccessibleName('תגובות');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-a c5 [FR-FEED-001] reply in place', () => {
  for (const { label, viewport } of SIZES) {
    test(`[ua c5] ${label}: "השבה" opens the box under its comment with focus; send appends the reply (shown), "תגובות, N" +1; "ביטול" closes with focus back on "השבה"; one box per card; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await start(page, [named(1, { commentCount: 3 })], { [id(1)]: basic() });
      const c = card(page, 0);
      const second = item(c, 'שניה מהמחברת');
      await btn(second, 'השבה').click();
      const box = c.getByRole('textbox', { name: 'כתיבת השבה', exact: true });
      await expect(box).toBeFocused();
      await scan(page);
      await btn(replyForm(c), 'ביטול').click();
      await expect(box).toHaveCount(0);
      await expect(btn(second, 'השבה')).toBeFocused();
      await btn(second, 'השבה').click();
      await btn(item(c, 'ראשונה'), 'השבה').click();
      await expect(replyForm(c)).toHaveCount(1); // at most one reply box per card
      await box.fill('הנה תשובה');
      await btn(replyForm(c), 'שליחה').click();
      await expect(status(page, 'התגובה נוספה')).toBeVisible();
      expect(net.sends).toEqual([{ body: 'הנה תשובה', parentId: id(101) }]);
      await expect(item(c, 'ראשונה')).toContainText('הנה תשובה');
      await expect(commentsBtn(c)).toHaveAccessibleName('תגובות, 4');
    });
  }

  test('[ua c5] a blank reply shows the field message with focus in the reply box and sends nothing', async ({ page }) => {
    const net = await start(page, [named(1, { commentCount: 1 })], { [id(1)]: [top(101, 'אחת')] });
    const c = card(page, 0);
    await btn(item(c, 'אחת'), 'השבה').click();
    await btn(replyForm(c), 'שליחה').click();
    await expect(replyForm(c).getByText('יש לכתוב משהו לפני השליחה')).toBeVisible();
    await expect(c.getByRole('textbox', { name: 'כתיבת השבה', exact: true })).toBeFocused();
    expect(net.sends).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-a c6 [AC-075, AC-076, FR-FEED-005 r.1] anonymity 🔴', () => {
  const ANON = 7;
  const posts = (mineAnonymous: boolean): StoredPost[] => [stored(ANON, { isAnonymous: true, isMine: mineAnonymous })];
  const items = (): Unit[] => [anonymous(ANON, { commentCount: 1 }), named(8)];

  test('[ua c6] a byAuthor comment shows "המחבר": no name, avatar or link; its DOM holds no author data, test ids or ids of the post', async ({ page }) => {
    await start(page, [named(1, { commentCount: 3 })], { [id(1)]: basic() });
    const c = card(page, 0);
    const b = list(c).getByRole('listitem', { name: 'המחבר', exact: true });
    await expect(b).toHaveCount(1);
    await expect(b).toContainText('שניה מהמחברת');
    await expect(b.getByRole('img')).toHaveCount(0);
    await expect(b.getByRole('link')).toHaveCount(0);
    const html = await b.evaluate((el) => el.outerHTML);
    expect(html).not.toMatch(/נועה|דנה|מהקהילה|data-testid|href=|src=/);
    expect(html).not.toContain(id(1));
  });

  test('[ua c6] no "report user" path: the "⋯" of a "המחבר" comment offers only the comment report; the author never gets delete on someone else\'s', async ({ page }) => {
    await start(page, [named(1, { commentCount: 3 })], { [id(1)]: basic() });
    const c = card(page, 0);
    await moreOfComment(list(c).getByRole('listitem', { name: 'המחבר', exact: true })).click();
    const items$ = page.getByRole('menuitem');
    await expect(page.getByRole('menuitem', { name: 'דיווח על התגובה', exact: true })).toHaveCount(1);
    await expect(items$).toHaveCount(1);
    await expect(page.getByRole('menuitem', { name: 'מחיקה', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  for (const { label, viewport } of SIZES) {
    test(`[ua c6] ${label}: on an anonymous card the real author sees the "המחבר" notice under the field and the reply box, never the name notice; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page, items(), { [id(ANON)]: [top(701, 'אחרת')] }, { posts: posts(true) });
      const c = card(page, 0);
      await expect(field(c)).toBeVisible();
      await expect(c.getByText(AUTHOR_NOTICE)).toBeVisible();
      await expect(c.getByText(NAME_NOTICE)).toHaveCount(0);
      expect(await describedBy(field(c))).toContain(AUTHOR_NOTICE);
      expect(await describedBy(field(c))).not.toContain(NAME_NOTICE);
      await btn(item(c, 'אחרת'), 'השבה').click();
      const box = c.getByRole('textbox', { name: 'כתיבת השבה', exact: true });
      expect(await describedBy(box)).toContain(AUTHOR_NOTICE);
      expect(await describedBy(box)).not.toContain(NAME_NOTICE);
      await scan(page);
    });
    test(`[ua c6] ${label}: everyone else on that anonymous card gets the name notice, in the field and the reply box; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page, items(), { [id(ANON)]: [top(701, 'אחרת')] }, { posts: posts(false) });
      const c = card(page, 0);
      await expect(field(c)).toBeVisible();
      await expect(c.getByText(NAME_NOTICE).first()).toBeVisible();
      await expect(c.getByText(AUTHOR_NOTICE)).toHaveCount(0);
      expect(await describedBy(field(c))).toContain(NAME_NOTICE);
      await btn(item(c, 'אחרת'), 'השבה').click();
      expect(await describedBy(c.getByRole('textbox', { name: 'כתיבת השבה', exact: true }))).toContain(NAME_NOTICE);
      await scan(page);
    });
  }

  test('[ua c6] until GET /posts/:id answers an anonymous card shows no field; then the author notice appears with it, never a flash of the name notice', async ({ page }) => {
    const g = gate();
    const net = await start(page, items(), { [id(ANON)]: [top(701, 'אחרת')] }, { posts: posts(true), tweak: (n) => { n.holdRead = g.promise; } });
    const c = card(page, 0);
    await expect.poll(() => net.reads).toContain(id(ANON));
    await page.waitForTimeout(400);
    await expect(field(c)).toHaveCount(0);
    await expect(c.getByText(NAME_NOTICE)).toHaveCount(0);
    await expect(field(card(page, 1))).toBeVisible(); // a named card does not wait
    g.release();
    await expect(field(c)).toBeVisible();
    await expect(c.getByText(AUTHOR_NOTICE)).toBeVisible();
    await expect(c.getByText(NAME_NOTICE)).toHaveCount(0);
  });

  test('[ua c6] the author\'s sent comment on her anonymous card shows "המחבר", never her name; the card holds no author data; the requests carry no author lookup; GET /feed has no extra parameter', async ({ page }) => {
    const net = await start(page, items(), { [id(ANON)]: [] }, { posts: posts(true), tweak: (n) => { n.anonymousAuthorOf.add(id(ANON)); } });
    const c = card(page, 0);
    await field(c).fill('אני כתבתי את הפוסט');
    await btn(form(c), 'שליחה').click();
    const mine = list(c).getByRole('listitem', { name: 'המחבר', exact: true });
    await expect(mine).toContainText('אני כתבתי את הפוסט');
    await expect(c.getByText('דנה כהן')).toHaveCount(0);
    await expect(c.getByText(AUTHOR_NOTICE)).toBeVisible();
    const html = await c.evaluate((el) => el.outerHTML);
    expect(html).not.toMatch(/כותבת מספר|דנה כהן|data-testid="[^"]*author/i);
    expect(net.feed.apiPaths.filter((p) => /users|authors?/.test(p)), 'no author lookup from the feed').toEqual([]);
    expect(new Set(net.reads), "the only post read is the anonymous card's own isMine read").toEqual(new Set([id(ANON)]));
    expect(net.feed.cursors).toEqual([null]);
  });

  test('[ua c6] a failed isMine read of an anonymous card shows no field, the load-failure text and "נסו שוב", which asks again', async ({ page }) => {
    const net = await start(page, items(), { [id(ANON)]: [top(701, 'אחרת')] }, { posts: posts(true), tweak: (n) => { n.failRead = 500; } });
    const c = card(page, 0);
    await expect(alertIn(c, LOAD_FAILED)).toBeVisible();
    await expect(field(c)).toHaveCount(0);
    await expect(c.getByText(NAME_NOTICE)).toHaveCount(0);
    net.failRead = null;
    await btn(c, 'נסו שוב').click();
    await expect(field(c)).toBeVisible();
    await expect(c.getByText(AUTHOR_NOTICE)).toBeVisible();
  });

  test('[ua c6] hostile input: a <script> in a comment body shows as text and does not run; line breaks are kept', async ({ page }) => {
    await start(page, [named(1, { commentCount: 1 })], { [id(1)]: [top(101, `שורה\nשניה <script>${SCRIPT}</script>`)] });
    const para = card(page, 0).locator('p[dir="auto"]').filter({ hasText: 'שניה' });
    await expect(para).toHaveCount(1);
    expect(await para.innerText()).toBe(`שורה\nשניה <script>${SCRIPT}</script>`);
    expect(await page.evaluate((): unknown => Reflect.get(window, '__ua'))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-a c7 [FR-FEED-001, FR-MOD-001] the comment "⋯"', () => {
  const REPORT = 'דיווח על התגובה';
  const confirmDialog = (page: Page) => page.getByRole('alertdialog', { name: 'למחוק את התגובה?', exact: true });
  const threadOf = (): StubTop[] => [
    top(101, 'של מישהי', [], { author: { name: 'נועה' } }),
    top(102, 'שלי עם השבות', [comment(112, 'השבה אליי', { author: { name: 'יעל' } }), comment(113, 'עוד השבה')], { isMine: true, author: { name: 'דנה כהן' } }),
  ];
  for (const { label, viewport } of SIZES) {
    test(`[ua c7] ${label}: own comment: "מחיקה" opens F3.3's confirmation (cancel focused); confirm removes it and its replies, "תגובות, N" drops by 3, status "התגובה נמחקה", focus on the card's "תגובות"; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await start(page, [named(1, { commentCount: 4 })], { [id(1)]: threadOf() });
      const c = card(page, 0);
      await expect(shown(c)).toHaveCount(2);
      await moreOfComment(item(c, 'שלי עם השבות')).click();
      await page.getByRole('menuitem', { name: 'מחיקה', exact: true }).click();
      await expect(confirmDialog(page)).toBeVisible();
      await expect(confirmDialog(page)).toContainText('המחיקה מיידית ולצמיתות');
      await expect(btn(confirmDialog(page), 'ביטול')).toBeFocused();
      await scan(page);
      await btn(confirmDialog(page), 'מחיקת התגובה').click();
      await expect(confirmDialog(page)).toHaveCount(0);
      await expect(c.getByText('שלי עם השבות')).toHaveCount(0);
      await expect(c.getByText('השבה אליי')).toHaveCount(0);
      await expect(status(page, 'התגובה נמחקה')).toBeVisible();
      await expect(commentsBtn(c)).toBeFocused();
      await expect(commentsBtn(c)).toHaveAccessibleName('תגובות, 1');
      expect(net.calls.filter((x) => x.startsWith('DELETE'))).toHaveLength(1);
      expect(pathOf(page)).toBe('/feed');
    });
  }

  test('[ua c7] own comment: a failed delete keeps the dialog with F3.3\'s text and the comment; cancel leaves focus on the comment\'s "⋯"; others\' comments offer no "מחיקה"', async ({ page }) => {
    const net = await start(page, [named(1, { commentCount: 2 })], { [id(1)]: threadOf() }, { tweak: (n) => { n.fail.remove = 500; } });
    const c = card(page, 0);
    await moreOfComment(item(c, 'של מישהי')).click();
    await expect(page.getByRole('menuitem', { name: 'מחיקה', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await moreOfComment(item(c, 'שלי עם השבות')).click();
    await page.getByRole('menuitem', { name: 'מחיקה', exact: true }).click();
    await btn(confirmDialog(page), 'מחיקת התגובה').click();
    await expect(alertIn(confirmDialog(page), 'המחיקה לא הצליחה. אפשר לנסות שוב')).toBeVisible();
    await expect(confirmDialog(page)).toBeVisible();
    // a modal dialog hides the feed from role queries (aria-hidden), so the card is found by its position
    await expect(page.locator('[aria-posinset="1"]').getByText('שלי עם השבות')).toBeVisible();
    net.fail.remove = null;
    await btn(confirmDialog(page), 'ביטול').click();
    await expect(confirmDialog(page)).toHaveCount(0);
    await expect(moreOfComment(item(c, 'שלי עם השבות'))).toBeFocused();
    expect(net.calls.filter((x) => x.startsWith('DELETE'))).toHaveLength(1);
  });

  for (const { label, viewport } of SIZES) {
    test(`[ua c7] ${label}: others' comment: "דיווח על התגובה" opens F3.7's sheet over the feed; 201 closes it with the received status, the comment stays, focus on its "⋯"; Esc closes with focus back too`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await start(page, [named(1, { commentCount: 2 })], { [id(1)]: threadOf() });
      const c = card(page, 0);
      await moreOfComment(item(c, 'של מישהי')).click();
      await page.getByRole('menuitem', { name: REPORT, exact: true }).click();
      await expect(sheet(page, 'comment')).toBeVisible();
      expect(pathOf(page)).toBe('/feed');
      await page.keyboard.press('Escape');
      await expect(sheet(page, 'comment')).toHaveCount(0);
      await expect(moreOfComment(item(c, 'של מישהי'))).toBeFocused();
      await moreOfComment(item(c, 'של מישהי')).click();
      await page.getByRole('menuitem', { name: REPORT, exact: true }).click();
      await choose(sheet(page, 'comment'), 6);
      await sendButton(sheet(page, 'comment')).click();
      await expect(sheet(page, 'comment')).toHaveCount(0);
      await expect(status(page, T.received)).toBeVisible();
      await expect(c.getByText('של מישהי')).toBeVisible();
      await expect(moreOfComment(item(c, 'של מישהי'))).toBeFocused();
      expect(net.reports.sent.map((b) => [b.targetKind, b.reason])).toEqual([['comment', 'spam']]);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-a c9 [FR-FEED-001] the "תגובות" button', () => {
  for (const { label, viewport } of SIZES) {
    test(`[ua c9] ${label}: "תגובות" is a button (not a link) named with the count; it moves focus to that card's field, the URL unchanged; touch size and focus ring`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page, [named(1, { commentCount: 5 }), named(2)], { [id(1)]: many(5), });
      const url = page.url();
      const c = card(page, 1);
      await expect(c.getByRole('link', { name: /^תגובות/ })).toHaveCount(0);
      await expect(commentsBtn(card(page, 0))).toHaveAccessibleName('תגובות, 5');
      await expect(commentsBtn(c)).toHaveAccessibleName('תגובות');
      await big(commentsBtn(c), 'comments button');
      await commentsBtn(c).focus();
      expect(await ring(commentsBtn(c))).toBe(true);
      await commentsBtn(c).click();
      await expect(field(c)).toBeFocused();
      expect(page.url()).toBe(url);
      await commentsBtn(card(page, 0)).focus();
      await page.keyboard.press('Enter');
      await expect(field(card(page, 0))).toBeFocused();
      expect(page.url()).toBe(url);
    });
  }

  test('[ua c9] Tab order inside a card: like, comments, share in feed, share link, time link, card "⋯", each shown comment ("⋯", like, "השבה": screen.md 60ecc9f), "הצגת עוד תגובות", the field, "שליחה"', async ({ page }) => {
    await start(page, [named(1, { commentCount: 5 })], { [id(1)]: many(5) });
    const c = card(page, 0);
    await expect(shown(c)).toHaveCount(2);
    await c.getByRole('button', { name: /^לייק/ }).first().focus();
    const names: string[] = [];
    for (let i = 0; i < 16; i += 1) {
      names.push(await page.evaluate(() => {
        const el = document.activeElement;
        return `${el?.tagName}:${el?.getAttribute('aria-label') ?? el?.textContent?.trim() ?? ''}`;
      }));
      await page.keyboard.press('Tab');
    }
    const lead = names.slice(0, 6).map((n) => n.split(':')[0]);
    expect(lead).toEqual(['BUTTON', 'BUTTON', 'BUTTON', 'BUTTON', 'A', 'BUTTON']);
    const rest = names.slice(6);
    const at = (needle: RegExp) => rest.findIndex((n) => needle.test(n));
    const order = [at(/פעולות נוספות לתגובה/), at(/לייק/), at(/השבה/), at(/הצגת עוד תגובות/), at(/^TEXTAREA|^INPUT/), at(/שליחה/)];
    expect(order.every((n) => n >= 0), JSON.stringify(rest)).toBe(true);
    expect([...order].sort((a, b) => a - b), JSON.stringify(rest)).toEqual(order);
  });

  test('[ua c9] a card without the like control has no comment area: a hidden card\'s placeholder shows no field', async ({ page }) => {
    await start(page, [named(1), named(2)], {});
    await expect(main(page).getByRole('textbox', { name: 'כתיבת תגובה', exact: true })).toHaveCount(2);
    await card(page, 0).locator('button[aria-haspopup="menu"]').first().click();
    await page.getByRole('menuitem', { name: 'הסתרת הפוסט', exact: true }).click();
    await expect(main(page).getByRole('textbox', { name: 'כתיבת תגובה', exact: true })).toHaveCount(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-a c10 [FR-FEED-001] one overlay on /feed', () => {
  const PROBE = '/feed?probe=1';
  const onFeed = (page: Page): boolean => page.url().includes('probe=1');
  const moreCss = (c: Locator) => c.locator('button[aria-haspopup="menu"]');
  for (const { label, viewport } of SIZES) {
    test(`[ua c10] ${label}: one press switches between the card "⋯" and a comment "⋯", same or another card; Back closes the open one at the same scroll, the next Back leaves the feed`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page, [named(1, { commentCount: 2 }), named(2, { commentCount: 2 })], { [id(1)]: many(2), [id(2)]: many(2, 'ב') }, { path: PROBE });
      const a = card(page, 0);
      const b = card(page, 1);
      await moreCss(a).first().click(); // the card's own "⋯" is first in the card
      await expect(page.getByRole('menu')).toHaveCount(1);
      await moreCss(a).nth(1).click(); // one press: now a comment's "⋯" of the same card
      await expect(page.getByRole('menu')).toHaveCount(1);
      await expect(page.getByRole('menuitem', { name: 'דיווח על התגובה', exact: true })).toBeVisible();
      await moreCss(b).nth(1).click(); // another card's comment
      await expect(page.getByRole('menu')).toHaveCount(1);
      await moreCss(b).first().click(); // another card's own "⋯"
      await expect(page.getByRole('menu')).toHaveCount(1);
      await expect(page.getByRole('menuitem', { name: 'דיווח על התגובה', exact: true })).toHaveCount(0);
      const y = await scrollY(page);
      await page.goBack();
      await expect(page.getByRole('menu')).toHaveCount(0);
      expect(onFeed(page)).toBe(true);
      expect(Math.abs((await scrollY(page)) - y)).toBeLessThanOrEqual(2);
      await page.goBack();
      await expect.poll(() => onFeed(page)).toBe(false);
    });
    test(`[ua c10] ${label}: Back closes the report sheet and the delete confirmation and stays on /feed; the next Back leaves`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page, [named(1, { commentCount: 2 })], { [id(1)]: [top(101, 'של מישהי'), top(102, 'שלי', [], { isMine: true, author: { name: 'דנה כהן' } })] }, { path: PROBE });
      const c = card(page, 0);
      await moreOfComment(item(c, 'של מישהי')).click();
      await page.getByRole('menuitem', { name: 'דיווח על התגובה', exact: true }).click();
      await expect(sheet(page, 'comment')).toBeVisible();
      await page.goBack();
      await expect(sheet(page, 'comment')).toHaveCount(0);
      expect(onFeed(page)).toBe(true);
      await moreOfComment(item(c, 'שלי')).click();
      await page.getByRole('menuitem', { name: 'מחיקה', exact: true }).click();
      await expect(page.getByRole('alertdialog', { name: 'למחוק את התגובה?', exact: true })).toBeVisible();
      await page.goBack();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      expect(onFeed(page)).toBe(true);
      await page.goBack();
      await expect.poll(() => onFeed(page)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-a c11 [FR-FEED-001] Back to the feed', () => {
  const overlayState = (page: Page) => page.evaluate(() => JSON.stringify(history.state));
  test('[ua c11] add and delete comments in a card, hide one card and report another, open a post, Back: the card shows the updated "תגובות, N" and its preview loads again, collapsed; the hidden and reported cards stay absent (F3.9 c10, F3.7 c13)', async ({ page }) => {
    const net = await start(page, [named(1, { commentCount: 2 }), named(2), named(3), named(4)], { [id(1)]: [top(101, 'ראשונה'), top(102, 'שלי למחיקה', [], { isMine: true, author: { name: 'דנה כהן' } })] }, { posts: [stored(1), stored(2), stored(3), stored(4)] });
    const base = await overlayState(page);
    const c = card(page, 0);
    await field(c).fill('תוספת');
    await btn(form(c), 'שליחה').click();
    await expect(status(page, 'התגובה נוספה')).toBeVisible();
    await moreOfComment(item(c, 'שלי למחיקה')).click();
    await page.getByRole('menuitem', { name: 'מחיקה', exact: true }).click();
    const confirmDialog = page.getByRole('alertdialog', { name: 'למחוק את התגובה?', exact: true });
    await btn(confirmDialog, 'מחיקת התגובה').click();
    await expect(status(page, 'התגובה נמחקה')).toBeVisible();
    await expect(confirmDialog).toHaveCount(0);
    await expect.poll(() => overlayState(page), "the confirmation's history entry is popped").toBe(base);
    await expect(commentsBtn(c)).toHaveAccessibleName('תגובות, 2');
    // hide card 2, report card 3
    await card(page, 1).getByRole('button', { name: 'פעולות נוספות לפוסט', exact: true }).click();
    await page.getByRole('menuitem', { name: 'הסתרת הפוסט', exact: true }).click();
    await expect.poll(() => overlayState(page)).toBe(base);
    await card(page, 2).getByRole('button', { name: 'פעולות נוספות לפוסט', exact: true }).click();
    await page.getByRole('menuitem', { name: 'דיווח על הפוסט', exact: true }).click();
    await choose(sheet(page, 'post'), 1);
    await sendButton(sheet(page, 'post')).click();
    await expect(sheet(page, 'post')).toHaveCount(0);
    await expect.poll(() => overlayState(page)).toBe(base);
    await expect(page.getByText('גוף הפוסט 3', { exact: true })).toHaveCount(0);
    await cards(page).filter({ hasText: 'גוף הפוסט 4' }).locator('a:has(time)').click();
    await expect.poll(() => pathOf(page)).toBe(`/posts/${id(4)}`);
    await expect(page.getByRole('heading', { level: 1, name: 'פוסט', exact: true })).toBeVisible(); // the post page is rendered (the URL changes before the feed unmounts)
    const before = commentCalls(net, 1).filter((x) => x.startsWith('GET')).length;
    await page.goBack();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await expect(commentsBtn(card(page, 0))).toHaveAccessibleName('תגובות, 2');
    await expect.poll(() => commentCalls(net, 1).filter((x) => x.startsWith('GET')).length).toBe(before + 1);
    await expect(item(card(page, 0), 'ראשונה')).toBeVisible();
    await expect(shown(card(page, 0))).toHaveCount(2);
    await expect(cards(page).filter({ hasText: 'גוף הפוסט 2' })).toHaveCount(0);
    await expect(cards(page).filter({ hasText: 'גוף הפוסט 3' })).toHaveCount(0);
    await expect(cards(page)).toHaveCount(2);
  });

  test('[ua c11] 1024 px: feed, post, Back, post again, a link elsewhere, Back: the post page is at the window scroll it was left at', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await start(page, [named(1, { commentCount: 40 })], { [id(1)]: many(40) }, { posts: [stored(1)] });
    const open = () => card(page, 0).locator('a:has(time)').click();
    await open();
    await expect.poll(() => pathOf(page)).toBe(`/posts/${id(1)}`);
    await expect(page.getByRole('heading', { level: 1, name: 'פוסט', exact: true })).toBeVisible(); // the post page is rendered (the URL changes before the feed unmounts)
    await page.goBack();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await open();
    await expect.poll(() => pathOf(page)).toBe(`/posts/${id(1)}`);
    await expect(page.getByRole('region', { name: 'תגובות', exact: true })).toBeVisible();
    // The page grows as the 40 comments render: scroll again until it is long enough to hold the offset.
    await expect
      .poll(async () => {
        await page.evaluate(() => window.scrollTo(0, 400));
        return scrollY(page);
      })
      .toBeGreaterThan(300);
    const left = await scrollY(page);
    const link = page.getByRole('navigation').getByRole('link').first();
    await link.click();
    await expect.poll(() => pathOf(page)).not.toBe(`/posts/${id(1)}`);
    await page.goBack();
    await expect.poll(() => pathOf(page)).toBe(`/posts/${id(1)}`);
    await expect.poll(async () => Math.abs((await scrollY(page)) - left)).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-a c12 [NFR accessibility] axe, touch size, focus, RTL', () => {
  for (const { label, viewport } of SIZES) {
    test(`[ua c12] ${label}: preview, expanded with replies, and the comment menu open pass axe; new controls are at least 44x44 with a visible focus; RTL`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page, [named(1, { commentCount: 5 })], { [id(1)]: [...basic(), ...many(2)] });
      const c = card(page, 0);
      await expect(shown(c)).toHaveCount(2);
      expect(await c.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
      await scan(page);
      for (const control of [btn(c, 'הצגת עוד תגובות'), btn(item(c, 'ראשונה'), 'השבה'), moreOfComment(item(c, 'ראשונה')), btn(form(c), 'שליחה'), btn(item(c, 'ראשונה'), 'לייק, 2')]) {
        await big(control, 'new control');
        await control.focus();
        expect(await ring(control)).toBe(true);
      }
      await btn(c, 'הצגת עוד תגובות').click();
      await btn(item(c, 'ראשונה'), 'הצגת עוד השבות').click();
      await expect(item(c, 'ראשונה').getByRole('listitem')).toHaveCount(2);
      await scan(page);
      await moreOfComment(item(c, 'ראשונה')).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await scan(page);
    });
    test(`[ua c12] ${label}: the field with each notice, and the load error, pass axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page, [named(1, { commentCount: 2 })], { [id(1)]: many(2) }, { tweak: (n) => { n.fail.thread = 500; } });
      await expect(alertIn(card(page, 0), LOAD_FAILED)).toBeVisible();
      await expect(card(page, 0).getByText(NAME_NOTICE)).toBeVisible();
      await scan(page);
    });
  }
});
