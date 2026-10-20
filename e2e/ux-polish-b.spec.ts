// I3 ux-polish-b (real browser, real session source, network stubbed): the feed's in-place edit, the post page's author "⋯", the in-flight
// confirmation, one-press "⋯" switching, same-screen navigation, the to-top tooltip and their accessibility. Derived from .work/ux-polish-b/spec.md
// criteria 1-3, 5, 7-9, 12 and screen.md (roles and Hebrew names) only. Superseded (re-cited, not duplicated): F3.9 c13 "עריכת הפוסט opens
// /posts/:id" (now c1 here), F3.1b c18 / F3.4 c12 visible "עריכה" and "מחיקה" buttons (now the "⋯" items: posts.spec.ts, anonymous-post.spec.ts,
// share-in-feed.spec.ts). Not repeated: F3.9 bug 1 (a time link pressed with a menu open) is hide-post.spec.ts "[c8] menu open, then a time link"; the
// sheets' Back / Esc / outside press are share-in-feed, share-link, report*.spec.ts. Confirmations on every screen, the side menu and a pending
// sheet are e2e/ux-polish-b-windows.spec.ts. The spec says `PUT /posts/:id`; the stub (as built, F3.1) is `PATCH`: "one request" is counted at the stub.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { CORS, EMAIL, json, main, scan } from './support/journeys-stub';
import { id, named, pageOf, range, setupFeed } from './support/feed-stub';
import type { FeedNet, Unit } from './support/feed-stub';
import { ANON_MINE, ANON_MINE_ID, MINE, OTHERS_ID, POST_ID, setupPosts } from './support/posts-stub';
import type { StoredPost } from './support/posts-stub';
import { comment, setupComments, top } from './support/comments-stub';
import type { StubTop } from './support/comments-stub';
import { originalOf, setupShare, shareView } from './support/share-stub';
import { feedCards, feedStatus, openFeedAt, timeLinkOf } from './support/composer';
import { DELETE_ITEM, EDIT_ITEM, POST_MORE, chooseFromPostMenu, menuItem, postMore, afterPaint } from './support/post-menu';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;

const MENU = 'פעולות נוספות';
const HIDE = 'הסתרת הפוסט';
const SAVE_FAILED = 'השמירה לא הצליחה. אפשר לנסות שוב'; // F3.1's ERR-004 save text
const DELETE_FAILED = 'המחיקה לא הצליחה. אפשר לנסות שוב';
const UPDATED = 'הפוסט עודכן';
const UNAVAILABLE = 'הפוסט אינו זמין';
const DELETED = 'הפוסט נמחק';
const PROBE = '/feed?probe=1';
const onFeed = (page: Page): boolean => page.url().includes('probe=1');

const cards = feedCards;
const more = (card: Locator) => card.getByRole('button', { name: POST_MORE, exact: true });
/** The "⋯" by CSS: while a menu is open Radix hides the page behind it from role queries. */
const moreCss = (page: Page, index: number) => page.locator('[role="feed"] [aria-posinset]').nth(index).locator('button[aria-haspopup="menu"]');
const menu = (page: Page) => page.getByRole('menu', { name: MENU, exact: true });
const item = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true });
const formOf = (card: Locator) => card.getByRole('form', { name: 'עריכת פוסט' });
const textOf = (card: Locator) => formOf(card).getByRole('textbox', { name: 'מה תרצו לשתף?' });
const saveOf = (card: Locator) => formOf(card).getByRole('button', { name: 'שמירה', exact: true });
const cancelOf = (card: Locator) => formOf(card).getByRole('button', { name: 'ביטול', exact: true });
const like = (card: Locator) => card.getByRole('button', { name: /^לייק/ });
const polite = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
const dialog = (page: Page) => page.getByRole('alertdialog', { name: 'למחוק את הפוסט?' });
const mine = (n: number, over: Unit = {}): Unit => named(n, { isMine: true, ...over });
const stored = (n: number, over: Partial<StoredPost> = {}): StoredPost => ({ id: id(n), body: `גוף הפוסט ${n}`, audience: 'everyone', stageTag: null, createdAt: '2026-06-14T09:00:00.000Z', isMine: true, ...over });

async function startFeed(page: Page, items: Unit[], posts: StoredPost[] = [], path = '/feed'): Promise<FeedNet> {
  const net = await setupFeed(page, () => pageOf(items, null), { posts });
  await openFeedAt(page, net, path);
  await expect(cards(page)).toHaveCount(items.length);
  return net;
}
async function openEdit(page: Page, card: Locator): Promise<void> {
  await more(card).click();
  await item(page, EDIT_ITEM).click();
  await expect(formOf(card)).toBeVisible();
}
interface Gate { promise: Promise<void>; release: () => void }
const gate = (): Gate => {
  let release = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
/** Holds every PATCH /api/posts/:id until `g` is released, then lets the stub answer it. */
async function holdEdits(page: Page, g: Gate): Promise<void> {
  await page.route(/\/api\/posts\/[^/?]+(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await g.promise;
    return route.fallback();
  });
}
/** Answers every DELETE /api/posts/:id after `g` with `status`, and counts them; the stub's own delete is not reached. */
async function holdDeletes(page: Page, g: Gate, status: 204 | 500): Promise<{ calls: number }> {
  const seen = { calls: 0 };
  await page.route(/\/api\/posts\/[^/?]+(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    seen.calls += 1;
    await g.promise;
    return status === 204 ? route.fulfill({ status: 204, headers: CORS }) : json(route, 500, { error: 'server_error' });
  });
  return seen;
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

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-b c1 [FR-FEED-002] a card edits in place', () => {
  for (const { label, viewport } of SIZES) {
    test(`[ub c1] ${label}: "עריכת הפוסט" replaces the card's body and action row with the edit form; header, aria-posinset and URL stay; focus in the text box; the other cards are untouched`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await startFeed(page, [named(1), mine(2), named(3)], [stored(2)]);
      const card = cards(page).nth(1);
      const position = await card.getAttribute('aria-posinset');
      expect(position).toBe('2');
      const url = page.url();
      await openEdit(page, card);
      await expect(textOf(card)).toBeFocused();
      await expect(textOf(card)).toHaveValue('גוף הפוסט 2');
      await expect(card.getByText('כותבת מספר 2', { exact: true }), 'the header stays').toBeVisible();
      await expect(card).toHaveAttribute('aria-posinset', position ?? '');
      await expect(card.locator('p', { hasText: 'גוף הפוסט 2' }), 'the body text is replaced by the form').toHaveCount(0);
      await expect(like(card), 'the action row is replaced').toHaveCount(0);
      await expect(card.getByRole('button', { name: /^תגובות/ })).toHaveCount(0); // ux-polish-a c9: a button now
      await expect(like(cards(page).first())).toBeVisible();
      await expect(like(cards(page).nth(2))).toBeVisible();
      expect(page.url()).toBe(url); // no navigation; that no history entry is left behind is asserted by the Back test below (one Back leaves the feed)
      expect(net.edits, 'opening the form sends nothing').toEqual([]);
    });
  }

  test('[ub c1] one card edits at a time: opening another closes the first (its text back as it was), no request', async ({ page }) => {
    const net = await startFeed(page, [mine(1), mine(2)], [stored(1), stored(2)]);
    const [first, second] = [cards(page).nth(0), cards(page).nth(1)];
    await openEdit(page, first);
    await textOf(first).fill('טיוטה שלא תישמר');
    await openEdit(page, second);
    await expect(formOf(first)).toHaveCount(0);
    await expect(first).toContainText('גוף הפוסט 1');
    await expect(first).not.toContainText('טיוטה שלא תישמר');
    await expect(textOf(second)).toBeFocused();
    await expect(page.getByRole('form', { name: 'עריכת פוסט' })).toHaveCount(1);
    expect(net.edits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-b c2 [FR-FEED-002 ERR-004] saving and leaving the in-place edit', () => {
  for (const { label, viewport } of SIZES) {
    test(`[ub c2] ${label}: save sends one request even on a double press ("שומרים" while pending); body, audience and tag update in place; the form goes; status "${UPDATED}"; focus on the card's "⋯"`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await startFeed(page, [named(1), mine(2), named(3)], [stored(2)]);
      const g = gate();
      await holdEdits(page, g);
      const card = cards(page).nth(1);
      await openEdit(page, card);
      await textOf(card).fill('הנוסח החדש');
      await formOf(card).getByText('חברים בלבד', { exact: true }).click();
      await formOf(card).getByText('בהריון', { exact: true }).click();
      await saveOf(card).dblclick();
      await expect(formOf(card).getByRole('button', { name: 'שומרים', exact: true })).toBeVisible();
      g.release();
      await expect(formOf(card)).toHaveCount(0);
      expect(net.edits).toEqual([{ body: 'הנוסח החדש', audience: 'friends', stageTag: 'pregnant' }]);
      await expect(card).toContainText('הנוסח החדש');
      await expect(card).toContainText('חברים בלבד');
      await expect(card).toContainText('בהריון');
      await expect(card).toHaveAttribute('aria-posinset', '2');
      await expect(feedStatus(page)).toHaveText(UPDATED);
      await expect(more(card)).toBeFocused();
      expect(pathOf(page)).toBe('/feed');
    });
  }

  test('[ub c2] "ביטול": no request, the card unchanged, focus on the card\'s "⋯"', async ({ page }) => {
    const net = await startFeed(page, [named(1), mine(2)], [stored(2)]);
    const card = cards(page).nth(1);
    await openEdit(page, card);
    await textOf(card).fill('לא יישמר');
    await cancelOf(card).click();
    await expect(formOf(card)).toHaveCount(0);
    await expect(card).toContainText('גוף הפוסט 2');
    await expect(card).not.toContainText('לא יישמר');
    await expect(more(card)).toBeFocused();
    await expect(like(card)).toBeVisible();
    expect(net.edits).toEqual([]);
  });

  for (const [what, answer] of [['a 5xx', 500], ['a dropped connection', 'abort']] as const) {
    test(`[ub c2] ${what} on save: the form stays, the text is kept, F3.1's save-failed alert shows in the form`, async ({ page }) => {
      const net = await startFeed(page, [mine(1)], [stored(1)]);
      net.edit = answer;
      const card = cards(page).first();
      await openEdit(page, card);
      await textOf(card).fill('נשאר בטופס');
      await saveOf(card).click();
      await expect(formOf(card).getByRole('alert').filter({ hasText: SAVE_FAILED })).toBeVisible();
      await expect(textOf(card)).toHaveValue('נשאר בטופס');
      expect(await formOf(card).getByRole('alert').first().innerText()).not.toMatch(/500|server_error|fetch/i);
      await expect(cards(page)).toHaveCount(1);
      net.edit = 200; // the same control again
      await saveOf(card).click();
      await expect(formOf(card)).toHaveCount(0);
      await expect(card).toContainText('נשאר בטופס');
    });
  }

  test('[ub c2] a 404 on save: the card is removed, "הפוסט אינו זמין", focus on the next card\'s first control (the h1 when it was last)', async ({ page }) => {
    await startFeed(page, [named(1), mine(2), named(3)], [stored(2)]);
    await page.route(/\/api\/posts\/[^/?]+(\?.*)?$/, async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      return json(route, 404, { error: 'not_found' });
    });
    const card = cards(page).nth(1);
    await openEdit(page, card);
    await textOf(card).fill('מי שנמחק');
    await saveOf(card).click();
    await expect(polite(page, UNAVAILABLE)).toHaveCount(1);
    await expect(cards(page)).toHaveCount(2);
    await expect(page.getByText('גוף הפוסט 2')).toHaveCount(0);
    await expect(like(cards(page).nth(1))).toBeFocused();
    expect(pathOf(page)).toBe('/feed');
  });

  test('[ub c2] a 404 on save of the last card: focus goes to the h1', async ({ page }) => {
    await startFeed(page, [mine(1)], [stored(1)]);
    await page.route(/\/api\/posts\/[^/?]+(\?.*)?$/, async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      return json(route, 404, { error: 'not_found' });
    });
    const card = cards(page).first();
    await openEdit(page, card);
    await saveOf(card).click();
    await expect(polite(page, UNAVAILABLE)).toHaveCount(1);
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'הפיד', exact: true })).toBeFocused();
  });

  test('[ub c2] after a save, the post opened from the time link shows the saved text and no edit form; Back restores the card with the saved text', async ({ page }) => {
    await startFeed(page, [named(1), mine(2)], [stored(2), stored(1, { isMine: false })]);
    const card = cards(page).nth(1);
    await openEdit(page, card);
    await textOf(card).fill('הטקסט ששמרתי');
    await saveOf(card).click();
    await expect(formOf(card)).toHaveCount(0);
    await timeLinkOf(card).click();
    await expect.poll(() => pathOf(page)).toBe(`/posts/${id(2)}`);
    await expect(main(page).getByText('הטקסט ששמרתי')).toBeVisible();
    await expect(page.getByRole('form', { name: 'עריכת פוסט' })).toHaveCount(0);
    await page.goBack();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await expect(cards(page).nth(1)).toContainText('הטקסט ששמרתי');
    await expect(page.getByRole('form', { name: 'עריכת פוסט' })).toHaveCount(0);
  });

  test('[ub c1][c2][Q1] history unchanged by opening the edit: one Back leaves the feed, the edit is dropped, no request, no prompt', async ({ page }) => {
    const net = await startFeed(page, [named(1), mine(2)], [stored(2)], PROBE);
    const card = cards(page).nth(1);
    await openEdit(page, card);
    await textOf(card).fill('בלי שמירה');
    await page.goBack();
    await expect.poll(() => onFeed(page)).toBe(false);
    expect(net.edits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-b c3 [FR-FEED-002] the post page: the author\'s actions are in the "⋯"', () => {
  const openMenuNames = async (page: Page): Promise<string[]> => {
    await postMore(page).click();
    await expect(menu(page)).toBeVisible();
    const names = await menu(page).getByRole('menuitem').allInnerTexts();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    return names;
  };
  const noButtons = async (page: Page): Promise<void> => {
    await expect(main(page).getByRole('button', { name: 'עריכה', exact: true })).toHaveCount(0);
    await expect(main(page).getByRole('button', { name: 'מחיקה', exact: true })).toHaveCount(0);
  };
  const SHARE_ID = id(5);
  for (const { label, viewport } of SIZES) {
    test(`[ub c3] ${label}: an own post offers "${EDIT_ITEM}" and "${DELETE_ITEM}" in "${POST_MORE}"; no visible "עריכה" or "מחיקה" button`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setupPosts(page, { posts: [{ ...MINE }] });
      await openAt(page, `/posts/${POST_ID}`);
      await expect(main(page).getByText('שאלה על שינה')).toBeVisible();
      await expect(postMore(page)).toHaveAttribute('aria-haspopup', 'menu');
      await noButtons(page);
      expect(await openMenuNames(page)).toEqual([EDIT_ITEM, DELETE_ITEM]);
    });
    test(`[ub c3] ${label}: an own anonymous post offers both items`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setupPosts(page, { posts: [{ ...ANON_MINE }] });
      await openAt(page, `/posts/${ANON_MINE_ID}`);
      await expect(main(page).getByText('שאלה אנונימית שלי')).toBeVisible();
      await noButtons(page);
      expect(await openMenuNames(page)).toEqual([EDIT_ITEM, DELETE_ITEM]);
    });
    test(`[ub c3] ${label}: an own share offers "${DELETE_ITEM}" only`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupShare(page, () => pageOf([], null), { posts: [stored(5)] });
      net.views[SHARE_ID] = shareView(5, originalOf(9), { isMine: true, sharerText: 'שלי' });
      await openFeedAt(page, net, `/posts/${SHARE_ID}`);
      await expect(main(page).getByText('שלי', { exact: true })).toBeVisible();
      await noButtons(page);
      expect(await openMenuNames(page)).toEqual([DELETE_ITEM]);
    });
  }

  test('[ub c3] edit save, edit cancel and a cancelled delete (ביטול, Esc) each return focus to the post\'s "⋯"; delete outcome as built', async ({ page }) => {
    const net = await setupPosts(page, { posts: [{ ...MINE }] });
    await openAt(page, `/posts/${POST_ID}`);
    await chooseFromPostMenu(page, EDIT_ITEM);
    await expect(page.getByRole('form', { name: 'עריכת פוסט' })).toBeVisible();
    await page.getByRole('button', { name: 'ביטול', exact: true }).click();
    await expect(page.getByRole('form', { name: 'עריכת פוסט' })).toHaveCount(0);
    await expect(postMore(page)).toBeFocused();
    await chooseFromPostMenu(page, EDIT_ITEM);
    await page.getByRole('textbox', { name: 'מה תרצו לשתף?' }).fill('הנוסח מהתפריט');
    await page.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(polite(page, UPDATED)).toBeVisible();
    await expect(main(page).getByText('הנוסח מהתפריט')).toBeVisible();
    await expect(postMore(page)).toBeFocused();
    expect(net.edits).toHaveLength(1);
    await chooseFromPostMenu(page, DELETE_ITEM);
    await dialog(page).getByRole('button', { name: 'ביטול', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(postMore(page)).toBeFocused();
    await chooseFromPostMenu(page, DELETE_ITEM);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(postMore(page)).toBeFocused();
    expect(net.deletes).toEqual([]);
    await chooseFromPostMenu(page, DELETE_ITEM);
    await dialog(page).getByRole('button', { name: 'מחיקת הפוסט', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await expect(polite(page, DELETED)).toBeVisible();
    expect(net.deletes).toEqual([POST_ID]);
  });
});

async function openAt(page: Page, path: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.goto(path);
}

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-b c5 [NFR-USAB-004] a confirmation whose request is pending (F3.9 bug 4)', () => {
  const own = (): Unit[] => [named(1), mine(2), named(3)];
  const openDelete = async (page: Page): Promise<void> => {
    await more(cards(page).nth(1)).click();
    await item(page, DELETE_ITEM).click();
    await expect(dialog(page)).toBeVisible();
  };
  const confirm = (page: Page) => dialog(page).getByRole('button', { name: DELETE_ITEM, exact: true });
  /** Back, Esc and an outside press each leave the dialog open and send nothing more. */
  async function tryToClose(page: Page, seen: { calls: number }): Promise<void> {
    await page.goBack();
    await expect(dialog(page)).toBeVisible();
    expect(onFeed(page), 'Back stays on the feed').toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeVisible();
    await page.mouse.click(3, 3);
    await expect(dialog(page)).toBeVisible();
    expect(seen.calls, 'one request only').toBe(1);
  }

  test('[ub c5] a delayed 500: Back, Esc and an outside press leave the dialog open; the failure shows in the dialog; the next Back cancels it and stays; the one after leaves the feed', async ({ page }) => {
    await startFeed(page, own(), [stored(2)], PROBE);
    const g = gate();
    const seen = await holdDeletes(page, g, 500);
    await openDelete(page);
    await confirm(page).click();
    await expect.poll(() => seen.calls).toBe(1);
    await tryToClose(page, seen);
    g.release();
    await expect(page.getByRole('alert').filter({ hasText: DELETE_FAILED })).toBeVisible();
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator('[role="feed"] [aria-posinset]')).toHaveCount(3); // CSS: the page behind an open dialog is aria-hidden
    await afterPaint(page);
    await page.goBack();
    await expect(dialog(page)).toHaveCount(0);
    expect(onFeed(page), 'the Back that cancels stays on the feed').toBe(true);
    await expect(cards(page)).toHaveCount(3);
    await expect(more(cards(page).nth(1))).toBeFocused();
    expect(seen.calls).toBe(1);
    await page.goBack();
    await expect.poll(() => onFeed(page), 'the next Back leaves the feed').toBe(false);
  });

  test('[ub c5] a delayed 204: nothing closes it meanwhile; then the card is removed, "הפוסט נמחק", still on /feed, and exactly one Back leaves the feed', async ({ page }) => {
    await startFeed(page, own(), [stored(2)], PROBE);
    const g = gate();
    const seen = await holdDeletes(page, g, 204);
    await openDelete(page);
    await confirm(page).click();
    await expect.poll(() => seen.calls).toBe(1);
    await tryToClose(page, seen);
    g.release();
    await expect(dialog(page)).toHaveCount(0);
    await expect(cards(page)).toHaveCount(2);
    await expect(page.getByText('גוף הפוסט 2')).toHaveCount(0);
    await expect(polite(page, DELETED)).toHaveCount(1);
    expect(onFeed(page), 'still on the feed').toBe(true);
    expect(pathOf(page)).toBe('/feed');
    await page.goBack();
    await expect.poll(() => onFeed(page), 'one Back leaves the feed').toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-b c7 [NFR-USAB-004] "פיד" pressed on the feed with a menu open', () => {
  for (const { label, viewport } of SIZES) {
    test(`[ub c7] ${label}: the menu closes, the URL stays /feed, and one Back reaches the screen before /feed (no dead entry)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await startFeed(page, [named(1), named(2)]);
      const navTo = (path: string) => page.locator(`nav:visible a[href="${path}"]`).first();
      await navTo('/home').click();
      await expect.poll(() => pathOf(page)).toBe('/home');
      await navTo('/feed').click();
      await expect.poll(() => pathOf(page)).toBe('/feed');
      await expect(cards(page)).toHaveCount(2);
      await more(cards(page).first()).click();
      await expect(menu(page)).toBeVisible();
      await navTo('/feed').click();
      await expect(menu(page)).toHaveCount(0);
      expect(pathOf(page)).toBe('/feed');
      await page.goBack();
      await expect.poll(() => pathOf(page)).toBe('/home');
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-b c8 [NFR-USAB-004] one press moves from one "⋯" to another', () => {
  for (const { label, viewport } of SIZES) {
    test(`[ub c8] ${label}: feed, card to card: one press closes the first and opens the second with focus on its first item; Back closes it and stays; the next Back leaves the feed`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await startFeed(page, [named(1), named(2), named(3)], [], PROBE);
      await moreCss(page, 0).click();
      await expect(menu(page)).toBeVisible();
      await expect(moreCss(page, 0)).toHaveAttribute('aria-expanded', 'true');
      await moreCss(page, 1).click();
      await expect(menu(page)).toHaveCount(1);
      await expect(moreCss(page, 0)).toHaveAttribute('aria-expanded', 'false');
      await expect(moreCss(page, 1)).toHaveAttribute('aria-expanded', 'true');
      await expect(menu(page).getByRole('menuitem').first()).toBeFocused();
      await expect(item(page, HIDE)).toBeVisible();
      await afterPaint(page);
      await page.goBack();
      await expect(menu(page)).toHaveCount(0);
      expect(onFeed(page), 'the Back that closes it stays on the feed').toBe(true);
      await expect(cards(page)).toHaveCount(3);
      await page.goBack();
      await expect.poll(() => onFeed(page), 'the next Back leaves the feed: no dead entry').toBe(false);
    });
  }

  const thread = (): StubTop[] => [
    top(1, 'שלום מנועה', [comment(11, 'תגובה לנועה')], { author: { name: 'נועה' } }),
    top(3, 'הדעה שלי', [], { isMine: true, author: { name: 'דנה כהן' } }),
  ];
  const postBtn = (page: Page) => page.locator(`main button[aria-label="${POST_MORE}"]`);
  const commentBtn = (page: Page, index: number) => page.locator('button[aria-label="פעולות נוספות לתגובה"]').nth(index);
  for (const { label, viewport } of SIZES) {
    test(`[ub c8] ${label}: post page, post to comment, comment to post, comment to comment: one press each; Back closes and stays; the next Back leaves the post`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setupComments(page, thread());
      await openAt(page, `/posts/${OTHERS_ID}`);
      await expect(page.getByRole('region', { name: 'תגובות', exact: true })).toBeVisible();
      const postPath = pathOf(page);
      const only = async (button: Locator): Promise<void> => {
        await expect(menu(page)).toHaveCount(1);
        await expect(button).toHaveAttribute('aria-expanded', 'true');
        await expect(menu(page).getByRole('menuitem').first()).toBeFocused();
      };
      await postBtn(page).click();
      await only(postBtn(page));
      await commentBtn(page, 0).click(); // post → comment
      await only(commentBtn(page, 0));
      await expect(postBtn(page)).toHaveAttribute('aria-expanded', 'false');
      await postBtn(page).click(); // comment → post
      await only(postBtn(page));
      await expect(commentBtn(page, 0)).toHaveAttribute('aria-expanded', 'false');
      await commentBtn(page, 0).click(); // post → comment again, then comment → comment
      await only(commentBtn(page, 0));
      await commentBtn(page, 1).click();
      await only(commentBtn(page, 1));
      await expect(commentBtn(page, 0)).toHaveAttribute('aria-expanded', 'false');
      await afterPaint(page);
      await page.goBack();
      await expect(menu(page)).toHaveCount(0);
      expect(pathOf(page), 'the Back that closes it stays on the post').toBe(postPath);
      await page.goBack();
      await expect.poll(() => pathOf(page), 'the next Back leaves the post: no dead entry').not.toBe(postPath);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-b c9 [NFR-USAB-004] the "חזרה למעלה" tooltip', () => {
  const pages = (): FeedNet['answer'] => (cursor) => (cursor === null ? pageOf(range(1, 12), 'c1') : cursor === 'c1' ? pageOf(range(13, 24), null) : pageOf([], null));
  const goLong = async (page: Page, width: number): Promise<Locator> => {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 800 });
    const net = await setupFeed(page, pages());
    await openFeedAt(page, net);
    await expect(cards(page)).toHaveCount(12);
    await cards(page).last().scrollIntoViewIfNeeded();
    await expect(cards(page)).toHaveCount(24);
    await cards(page).last().scrollIntoViewIfNeeded();
    const button = page.getByRole('button', { name: 'חזרה למעלה', exact: true });
    await expect(button).toBeVisible();
    return button;
  };
  const tooltip = (page: Page) => page.getByRole('tooltip');

  test('[ub c9] 1024 px (icon only): hover shows the tooltip "חזרה למעלה"; the accessible name stays; axe 0 with the tooltip shown', async ({ page }) => {
    const button = await goLong(page, 1024);
    expect((await button.innerText()).trim(), 'icon-only').toBe('');
    await expect(tooltip(page)).toHaveCount(0);
    await button.hover();
    await expect(tooltip(page)).toHaveText('חזרה למעלה');
    await expect(button).toHaveAccessibleName('חזרה למעלה');
    await scan(page);
  });

  test('[ub c9] 1024 px (icon only): keyboard focus shows the tooltip "חזרה למעלה"', async ({ page }) => {
    const button = await goLong(page, 1024);
    await expect(tooltip(page)).toHaveCount(0);
    // The tooltip closes on any scroll of the page: let the late scroll (the list's second page, scroll anchoring) finish before the key press.
    let last = -1;
    await expect
      .poll(async () => {
        const now = await page.evaluate(() => Math.round(window.scrollY));
        const same = now === last;
        last = now;
        return same;
      })
      .toBe(true);
    await button.focus();
    await expect(button).toBeFocused();
    await expect(tooltip(page)).toHaveText('חזרה למעלה');
  });

  test('[ub c9] 1280 px (text shown): no tooltip on hover or focus', async ({ page }) => {
    const button = await goLong(page, 1280);
    expect(await button.innerText()).toContain('חזרה למעלה');
    await button.hover();
    await page.waitForTimeout(700); // a tooltip, if one opened, shows within Radix's default delay (700 ms)
    await expect(tooltip(page)).toHaveCount(0);
    await button.focus();
    await page.waitForTimeout(300);
    await expect(tooltip(page)).toHaveCount(0);
  });

  test('[ub c9] 375 px: unchanged, no tooltip; the accessible name stays', async ({ page }) => {
    const button = await goLong(page, 375);
    await expect(button).toHaveAccessibleName('חזרה למעלה');
    await button.hover();
    await page.waitForTimeout(700);
    await expect(tooltip(page)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-b c12 [NFR-A11Y-001] accessibility of what moved or is new', () => {
  for (const { label, viewport } of SIZES) {
    test(`[ub c12] ${label}: a card in edit passes axe; the form's buttons and the card's "⋯" are at least 44x44 with a visible focus; RTL`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await startFeed(page, [named(1), mine(2)], [stored(2)]);
      const card = cards(page).nth(1);
      await big(more(card), 'more');
      await openEdit(page, card);
      await scan(page);
      for (const control of [saveOf(card), cancelOf(card)]) {
        await big(control, 'form button');
        await control.focus();
        expect(await ring(control), 'visible focus').toBe(true);
      }
    });
    test(`[ub c12] ${label}: the post page "⋯" open (own post, own share): axe 0, items at least 44x44, focused item has a visible focus`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupShare(page, () => pageOf([], null), { posts: [stored(5), { ...MINE }] });
      net.views[id(5)] = shareView(5, originalOf(9), { isMine: true, sharerText: 'שלי' });
      await openFeedAt(page, net, `/posts/${POST_ID}`);
      await expect(main(page).getByText('שאלה על שינה')).toBeVisible();
      await big(postMore(page), 'post more');
      await postMore(page).focus();
      await page.keyboard.press('Enter');
      await expect(menuItem(page, EDIT_ITEM)).toBeFocused();
      await big(menuItem(page, EDIT_ITEM), 'edit item');
      await big(menuItem(page, DELETE_ITEM), 'delete item');
      expect(await ring(menuItem(page, EDIT_ITEM)), 'visible focus').toBe(true);
      await scan(page);
      await page.keyboard.press('Escape');
      await page.goto(`/posts/${id(5)}`);
      await expect(main(page).getByText('שלי', { exact: true })).toBeVisible();
      await postMore(page).click();
      await big(menuItem(page, DELETE_ITEM), 'delete item of the share');
      await scan(page);
    });
  }

  // 8fa0cd3: the "⋯" tooltip is drawn inside main; once Esc closes the menu nothing is left outside the landmarks (axe "region").
  for (const { label, viewport } of SIZES) {
    test(`[ub c12] ${label}: after Esc closes the post page's "⋯" menu: axe 0 and focus back on the "⋯"`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupShare(page, () => pageOf([], null), { posts: [{ ...MINE }] });
      await openFeedAt(page, net, `/posts/${POST_ID}`);
      await expect(main(page).getByText('שאלה על שינה')).toBeVisible();
      await postMore(page).click();
      await expect(menu(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu(page)).toHaveCount(0);
      await expect(postMore(page)).toBeFocused();
      await scan(page);
    });
    test(`[ub c12] ${label}: after Esc closes a feed card's "⋯" menu: axe 0 and focus back on the "⋯"`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await startFeed(page, [mine(1), named(2)], [stored(1)]);
      await more(cards(page).first()).click();
      await expect(menu(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu(page)).toHaveCount(0);
      await expect(more(cards(page).first())).toBeFocused();
      await scan(page);
    });
  }

  test('[ub c12] keyboard only: Enter on the card\'s "⋯", Enter on "עריכת הפוסט", type, Tab to "שמירה", Enter saves and leaves focus on the "⋯"', async ({ page }) => {
    const net = await startFeed(page, [mine(1)], [stored(1)]);
    const card = cards(page).first();
    await more(card).focus();
    await page.keyboard.press('Enter');
    await expect(item(page, EDIT_ITEM)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(textOf(card)).toBeFocused();
    await page.keyboard.type(' ועוד');
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      if (await saveOf(card).evaluate((el) => el === document.activeElement)) break;
    }
    await expect(saveOf(card)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(formOf(card)).toHaveCount(0);
    await expect(more(card)).toBeFocused();
    expect(net.edits).toHaveLength(1);
  });
});
