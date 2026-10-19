// I3 F3.4 (real browser, real session source, network stubbed). Derived from .work/anonymous-post/spec.md criteria 11-14 and 16 and from screen.md
// (roles and Hebrew names) only. The server half is apps/server/tests/db/anonymous-post.db.test.ts; the payload/remembered-audience logic of c11 is
// apps/web/tests/posts-composer.test.tsx. c15 (a stranger sees a commenter's full name) is the F3.3 c15 rendering test of e2e/comments.spec.ts; its real-data
// half is at the DB layer: apps/server/tests/db/comments.db.test.ts "[F3.3-b1 c7]" (stranger → full name, regular_names_select_comment_reader). c11 is asserted in the feed composer (feed-composer c3, c8). Visual baselines: e2e/anonymous-post.visual.spec.ts. The stub plays the server: e2e/support/posts-stub.ts, comments-stub.ts.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { EMAIL, main, scan } from './support/journeys-stub';
import { pageOf, range, setupFeed } from './support/feed-stub';
import { FAILED, acceptLeave, feedCards, feedStatus, openComposer, openFeedAt } from './support/composer';
import { ANON_MINE, ANON_MINE_ID, ANON_OTHERS, ANON_OTHERS_ID, MINE, OTHERS, OTHERS_ID, POST_ID, setupPosts } from './support/posts-stub';
import { setupComments, top } from './support/comments-stub';
import type { CommentsNet, StubTop } from './support/comments-stub';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;
const ANON_LABEL = 'אנונימי';
const TOGGLE = 'פרסום אנונימי';
const GROUP = 'מי יראה את הפוסט';
const NAME_NOTICE_POST = 'השם שלכם יוצג לכל מי שיכול לראות את הפוסט';
// Only the first sentence of the pending notice (Gate 1 decision 2: whether it says staff can see the author awaits Afik, reserved 4).
const ANON_NOTICE = /השם שלכם לא יוצג לאף אחד בקהילה/;
const OWN_NOTE = 'פרסמתם את הפוסט הזה באופן אנונימי. רק אתם רואים את ההודעה הזו';
const FIXED_LINE = 'הפוסט אנונימי ומוצג לכולם. אי אפשר לשנות את זה';
const NAME_NOTICE_COMMENT = 'השם שלכם יוצג לכל מי שיכול לראות את התגובה';
const AUTHOR_NOTICE = 'בפוסט הזה התגובות שלכם מוצגות תחת "המחבר", בלי השם שלכם';
const SAVE_FAILED = 'השמירה לא הצליחה. אפשר לנסות שוב';

async function open(page: Page, path: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.goto(path);
}
const body = (page: Page) => page.getByRole('textbox', { name: 'מה תרצו לשתף?' });
const toggle = (page: Page) => page.getByRole('checkbox', { name: TOGGLE, exact: true });
const group = (page: Page) => page.getByRole('radiogroup', { name: GROUP, exact: true });
const publish = (page: Page) => page.getByRole('button', { name: 'פרסום', exact: true });
const button = (scope: Page | Locator, name: string) => scope.getByRole('button', { name, exact: true });
const card = (page: Page, name: string) => page.getByRole('radiogroup').getByText(name, { exact: true });
/** The ids a form or field lists in aria-describedby, as the texts of the elements they name. */
async function describedBy(el: Locator): Promise<string[]> {
  return el.evaluate((node) => (node.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent?.trim() ?? ''));
}
const list = (page: Page) => page.getByRole('list', { name: 'רשימת התגובות', exact: true });
const rootBox = (page: Page) => page.getByRole('textbox', { name: 'כתיבת תגובה', exact: true });
const replyBox = (page: Page) => page.getByRole('textbox', { name: 'כתיבת השבה', exact: true });
/** Three server cards, then the feed is armed and opened at /feed (the composer is the button at its top). */
const feedAt = async (page: Page) => {
  const net = await setupFeed(page, () => pageOf(range(1, 3), null));
  await openFeedAt(page, net);
  await expect(feedCards(page)).toHaveCount(3);
  return net;
};
const sizeOf = async (el: Locator) => (await el.boundingBox()) ?? { width: 0, height: 0 };

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F3.4 c11 [FR-FEED-005 r.1] the composer toggle (in the feed: feed-composer c3, c8)', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c11 c16] ${label}: unchecked on open; checking removes the audience group and swaps the name notice for the anonymous one; unchecking restores the earlier choice; axe in both states`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await feedAt(page);
      await openComposer(page);
      await expect(toggle(page)).not.toBeChecked();
      await expect(group(page)).toBeVisible();
      await expect(page.getByText(NAME_NOTICE_POST)).toBeVisible();
      await expect(page.getByText(ANON_NOTICE)).toHaveCount(0);
      expect(await describedBy(page.getByRole('form', { name: 'כתיבת פוסט' }))).toContain(NAME_NOTICE_POST);
      await scan(page);

      await card(page, 'חברים בלבד').click();
      await toggle(page).check();
      await expect(group(page)).toHaveCount(0);
      await expect(page.getByRole('radio', { name: 'חברים בלבד' })).toHaveCount(0);
      await expect(page.getByText(ANON_NOTICE)).toBeVisible();
      await expect(page.getByText(NAME_NOTICE_POST)).toHaveCount(0);
      const described = await describedBy(page.getByRole('form', { name: 'כתיבת פוסט' }));
      expect(described.some((t) => ANON_NOTICE.test(t))).toBe(true);
      expect(described).not.toContain(NAME_NOTICE_POST);
      await scan(page);

      await toggle(page).uncheck();
      await expect(group(page)).toBeVisible();
      await expect(page.getByRole('radio', { name: 'חברים בלבד' })).toBeChecked();
      await expect(page.getByText(NAME_NOTICE_POST)).toBeVisible();
      await expect(page.getByText(ANON_NOTICE)).toHaveCount(0);
    });
  }

  test('[c11] the checkbox sits after the textbox and before the audience in the page order', async ({ page }) => {
    await feedAt(page);
    await openComposer(page);
    const y = async (el: Locator) => (await el.boundingBox())?.y ?? -1;
    expect(await y(toggle(page))).toBeGreaterThan(await y(body(page)));
    expect(await y(toggle(page))).toBeLessThan(await y(group(page)));
  });

  for (const { label, viewport } of SIZES) {
    test(`[c11 fc c8] ${label}: submit while checked sends isAnonymous:true and audience "everyone" (even after "חברים בלבד" was picked); the new first card is "אנונימי" for "כולם" with no name or author data; the remembered audience is unchanged; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await feedAt(page);
      // A named "חברים בלבד" post first, so there is a remembered audience for the anonymous one to leave alone (F3.4 c11).
      await openComposer(page);
      await body(page).fill('פוסט רגיל לחברים');
      await card(page, 'חברים בלבד').click();
      await publish(page).click();
      await expect(feedCards(page)).toHaveCount(4);

      await openComposer(page);
      await body(page).fill('שאלה רגישה');
      await card(page, 'חברים בלבד').click();
      await toggle(page).check();
      await publish(page).click();
      await expect(feedCards(page)).toHaveCount(5);
      expect(net.creates).toHaveLength(2);
      expect(net.creates[1]).toMatchObject({ body: 'שאלה רגישה', audience: 'everyone', isAnonymous: true });
      expect(Object.keys(net.creates[1] ?? {}).filter((k) => /author|user|email|name/i.test(k))).toEqual([]);
      expect(pathOf(page)).toBe('/feed');
      expect(net.cursors, 'no GET /feed after either post').toEqual([null]);

      const first = feedCards(page).first();
      await expect(first).toHaveAttribute('aria-posinset', '1');
      await expect(first).toContainText('שאלה רגישה');
      await expect(page.getByRole('article', { name: ANON_LABEL, exact: true })).toHaveCount(1);
      await expect(first).toContainText('כולם');
      await expect(first).not.toContainText('חברים בלבד');
      await expect(first).not.toContainText('דנה כהן');
      await expect(first).not.toContainText('מהקהילה');
      await expect(first.getByRole('link')).toHaveCount(2); // the time link and "תגובות": no author link
      const ids = await first.evaluate((el) => [el, ...el.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid') ?? ''));
      expect(ids.filter((t) => /author|name|avatar|user/i.test(t))).toEqual([]);
      expect(await first.evaluate((el) => el.outerHTML)).not.toContain('דנה כהן');
      await expect(first).toBeFocused();
      await expect(feedStatus(page)).toHaveText('הפוסט פורסם');
      await scan(page);

      // The remembered audience is the earlier "חברים בלבד"; the toggle starts unchecked.
      await openComposer(page);
      await expect(toggle(page)).not.toBeChecked();
      await expect(page.getByRole('radio', { name: 'חברים בלבד' })).toBeChecked();
    });
  }

  test('[c11] the toggle is never stored: after an anonymous post a new composer is unchecked; storage holds neither the flag nor the text; a reload opens unchecked', async ({ page }) => {
    const net = await feedAt(page);
    await openComposer(page);
    await body(page).fill('טקסט סודי שלא נשמר');
    await toggle(page).check();
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/anonym|טקסט סודי/i);
    await publish(page).click();
    await expect(feedCards(page)).toHaveCount(4);
    await openComposer(page);
    await expect(toggle(page)).not.toBeChecked();
    await expect(group(page)).toBeVisible();
    await expect(body(page)).toHaveValue('');
    await toggle(page).check();
    await body(page).fill('עוד טקסט');
    acceptLeave(page); // the browser asks before leaving with unsent text (c6); the test leaves
    await page.reload();
    await openComposer(page);
    await expect(toggle(page)).not.toBeChecked();
    await expect(body(page)).toHaveValue('');
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/anonym|טקסט|עוד/i);
    expect(net.creates).toHaveLength(1);
  });

  test('[c11 fc c10] a failed anonymous post (403, 5xx, network, 422 audience_not_allowed): the composer stays, text and a checked toggle kept, the F3.1b alert and nothing technical; no card added', async ({ page }) => {
    const net = await feedAt(page);
    await openComposer(page);
    await body(page).fill('הטקסט שלי');
    await toggle(page).check();
    for (const status of [403, 500, 422, 'abort'] as const) {
      net.create = status;
      await publish(page).click();
      await expect(page.getByRole('alert').filter({ hasText: FAILED })).toBeVisible();
      expect(pathOf(page)).toBe('/feed');
      await expect(body(page)).toHaveValue('הטקסט שלי');
      await expect(toggle(page)).toBeChecked();
      await expect(group(page)).toHaveCount(0);
      await expect(feedCards(page)).toHaveCount(3);
      expect(await page.getByRole('alert').first().innerText()).not.toMatch(/403|422|500|not_allowed|audience_not_allowed|server_error|fetch/i);
    }
  });

  test('[c11 c16] keyboard only: Space toggles, focus stays on the checkbox, the audience group leaves the tab order, Enter on "פרסום" sends it anonymously', async ({ page }) => {
    const net = await feedAt(page);
    await openComposer(page);
    await body(page).focus();
    await page.keyboard.type('בלי עכבר');
    await page.keyboard.press('Tab');
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(toggle(page)).toBeChecked();
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(toggle(page)).not.toBeChecked();
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio', { name: 'בלי תגית' })).toBeFocused(); // the first control after the toggle is the tag group
    await page.keyboard.press('Tab');
    await expect(publish(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(feedCards(page)).toHaveCount(4);
    expect(net.creates).toHaveLength(1);
    expect(net.creates[0]).toMatchObject({ audience: 'everyone', isAnonymous: true });
  });

  test('[c16] phone: the checkbox (or the label that is its target) is at least 44x44 px and shows a visible focus', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await feedAt(page);
    await openComposer(page);
    const label = page.locator('label').filter({ has: toggle(page) });
    const own = await sizeOf(toggle(page));
    const target = await sizeOf(label.first());
    const ok = (s: { width: number; height: number }) => s.width >= 44 && s.height >= 44;
    expect(ok(own) || ok(target), `checkbox ${JSON.stringify(own)}, label ${JSON.stringify(target)}`).toBe(true);
    await body(page).focus();
    await page.keyboard.press('Tab');
    await expect(toggle(page)).toBeFocused();
    const outline = await toggle(page).evaluate((el) => {
      const own = getComputedStyle(el);
      const wrapper = el.closest('label');
      const outer = wrapper === null ? own : getComputedStyle(wrapper);
      return [own.outlineStyle, own.outlineWidth, own.boxShadow, outer.outlineStyle, outer.outlineWidth, outer.boxShadow].join('|');
    });
    expect(outline).not.toMatch(/^none\|0px\|none\|none\|0px\|none$/);
  });

  test('[c11] a Professional has no composer and so no new control', async ({ page }) => {
    const net = await setupFeed(page, () => 403, { professional: true });
    await openFeedAt(page, net);
    await expect(page.getByRole('heading', { level: 1, name: 'הפיד' })).toBeVisible();
    await page.waitForTimeout(500); // the posting-right check answers after the heading; a control must not appear later
    await expect(body(page)).toHaveCount(0);
    await expect(toggle(page)).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F3.4 c12 [FR-FEED-005 r.1 AC-075] the post page of an anonymous post', () => {
  test('[c12] every reader sees the header "אנונימי" before the text; the real author also sees the own note, "עריכה" and "מחיקה", others see neither', async ({ page }) => {
    await setupPosts(page, { posts: [MINE, ANON_MINE, ANON_OTHERS] });
    await open(page, `/posts/${ANON_MINE_ID}`);
    const header = main(page).getByText(ANON_LABEL, { exact: true });
    await expect(header).toBeVisible();
    await expect(main(page).getByText('שאלה אנונימית שלי')).toBeVisible();
    const y = async (el: Locator) => (await el.boundingBox())?.y ?? -1;
    expect(await y(header)).toBeLessThan(await y(main(page).getByText('שאלה אנונימית שלי')));
    await expect(main(page).getByText(OWN_NOTE)).toBeVisible();
    await expect(main(page).getByText('מי יראה את הפוסט: כולם')).toBeVisible();
    await expect(button(page, 'עריכה')).toBeVisible();
    await expect(button(page, 'מחיקה')).toBeVisible();

    await page.goto(`/posts/${ANON_OTHERS_ID}`);
    await expect(main(page).getByText('שאלה אנונימית של מישהי')).toBeVisible();
    await expect(main(page).getByText(ANON_LABEL, { exact: true })).toBeVisible();
    await expect(main(page).getByText(OWN_NOTE)).toHaveCount(0);
    await expect(button(page, 'עריכה')).toHaveCount(0);
    await expect(button(page, 'מחיקה')).toHaveCount(0);
  });

  test('[c12] a named post (own or not) shows no "אנונימי" header and no own note', async ({ page }) => {
    await setupPosts(page, { posts: [MINE, OTHERS] });
    await open(page, `/posts/${POST_ID}`);
    for (const id of [POST_ID, OTHERS_ID]) {
      await page.goto(`/posts/${id}`);
      await expect(main(page).getByText('מי יראה את הפוסט: כולם')).toBeVisible();
      await expect(main(page).getByText(ANON_LABEL, { exact: true })).toHaveCount(0);
      await expect(main(page).getByText(OWN_NOTE)).toHaveCount(0);
    }
  });

  for (const [who, id] of [['the author', ANON_MINE_ID], ['a reader', ANON_OTHERS_ID]] as const) {
    test(`[c12 c16] ${who}: no author data in the DOM — no name, avatar, link, test id or id of a person — and axe passes at 375`, async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await setupPosts(page, { posts: [ANON_MINE, ANON_OTHERS] });
      await open(page, `/posts/${id}`);
      await expect(main(page).getByText(ANON_LABEL, { exact: true })).toBeVisible();
      const html = await page.evaluate(() => document.documentElement.outerHTML);
      expect(html).not.toMatch(/דנה כהן|dana\.cohen|u-1\b/);
      const article = main(page);
      await expect(article.getByRole('img')).toHaveCount(0);
      await expect(article.locator('img, svg[role="img"], [data-avatar]')).toHaveCount(0);
      const header = article.getByText(ANON_LABEL, { exact: true });
      expect(await header.evaluate((el) => !el.closest('a') && el.querySelectorAll('a, img').length === 0)).toBe(true);
      const testIds = await page.evaluate(() => [...document.querySelectorAll('[data-testid]')].map((el) => el.getAttribute('data-testid') ?? ''));
      for (const t of testIds) expect(t).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}|@|דנה|dana|u-1/i); // a slot name such as post-author is fine; data is not
      await scan(page);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F3.4 c13 [FR-FEED-005] editing an anonymous post', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c13 c16] ${label}: the form has no audience group and no checkbox, shows the fixed line; saving shows the update; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupPosts(page, { posts: [{ ...ANON_MINE }] });
      await open(page, `/posts/${ANON_MINE_ID}`);
      await button(page, 'עריכה').click();
      const form = page.getByRole('form', { name: 'עריכת פוסט' });
      await expect(form).toBeVisible();
      await expect(group(page)).toHaveCount(0);
      await expect(page.getByRole('radio', { name: 'כולם' })).toHaveCount(0);
      await expect(page.getByRole('radio', { name: 'חברים בלבד' })).toHaveCount(0);
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await expect(form.getByText(FIXED_LINE)).toBeVisible();
      await expect(body(page)).toHaveValue('שאלה אנונימית שלי');
      await scan(page);
      await body(page).fill('הנוסח החדש');
      await button(page, 'שמירה').click();
      await expect(page.getByRole('status').filter({ hasText: 'הפוסט עודכן' })).toBeVisible();
      await expect(main(page).getByText('הנוסח החדש')).toBeVisible();
      await expect(main(page).getByText(ANON_LABEL, { exact: true })).toBeVisible();
      expect(net.edits).toHaveLength(1);
      expect(net.edits[0]).toMatchObject({ body: 'הנוסח החדש' });
      expect(net.edits[0]?.audience ?? 'everyone').toBe('everyone');
      expect('isAnonymous' in (net.edits[0] ?? {})).toBe(false);
    });
  }

  test('[c13] a named post\'s edit form is unchanged: the audience group, no fixed line, no checkbox', async ({ page }) => {
    await setupPosts(page, { posts: [{ ...MINE }] });
    await open(page, `/posts/${POST_ID}`);
    await button(page, 'עריכה').click();
    await expect(group(page)).toBeVisible();
    await expect(page.getByText(FIXED_LINE)).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
  });

  test('[c13] a failed save (5xx, and 422 audience_not_allowed) keeps the form and the text with the save-failed alert, nothing technical', async ({ page }) => {
    const net = await setupPosts(page, { posts: [{ ...ANON_MINE }] });
    await open(page, `/posts/${ANON_MINE_ID}`);
    await button(page, 'עריכה').click();
    await body(page).fill('נשאר');
    for (const status of [500, 422] as const) {
      net.edit = status;
      await button(page, 'שמירה').click();
      await expect(page.getByRole('alert').filter({ hasText: SAVE_FAILED })).toBeVisible();
      await expect(body(page)).toHaveValue('נשאר');
      expect(await page.getByRole('alert').first().innerText()).not.toMatch(/422|500|audience_not_allowed|server_error/i);
    }
  });

  test('[c13] keyboard only: the form is reachable and saves with Enter on "שמירה"', async ({ page }) => {
    const net = await setupPosts(page, { posts: [{ ...ANON_MINE }] });
    await open(page, `/posts/${ANON_MINE_ID}`);
    await button(page, 'עריכה').focus();
    await page.keyboard.press('Enter');
    await expect(body(page)).toBeVisible();
    await body(page).focus();
    await page.keyboard.type(' ועוד');
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      if (await button(page, 'שמירה').evaluate((el) => el === document.activeElement)) break;
    }
    await expect(button(page, 'שמירה')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'הפוסט עודכן' })).toBeVisible();
    expect(net.edits).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F3.4 c14 [Q7 FR-FEED-005 r.1] the comment and reply composer notices', () => {
  const some = (): StubTop[] => [top(1, 'תגובה ראשונה', [], { author: { name: 'נועה' } })];

  async function start(page: Page, id: string, tops: StubTop[] = some(), anonymousAuthor = false): Promise<CommentsNet> {
    const net = await setupComments(page, tops, { posts: [MINE, OTHERS, ANON_MINE, ANON_OTHERS], ...(anonymousAuthor ? { anonymousAuthor } : {}) });
    await open(page, `/posts/${id}`);
    await expect(rootBox(page)).toBeVisible();
    return net;
  }

  for (const { label, viewport } of SIZES) {
    test(`[c14 c16] ${label}: on a named post and on an anonymous post of someone else the box has the name notice, linked by aria-describedby; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page, ANON_OTHERS_ID);
      await expect(page.getByText(NAME_NOTICE_COMMENT)).toBeVisible();
      await expect(page.getByText(AUTHOR_NOTICE)).toHaveCount(0);
      expect(await describedBy(rootBox(page))).toContain(NAME_NOTICE_COMMENT);
      await scan(page);
      await page.goto(`/posts/${OTHERS_ID}`);
      await expect(list(page)).toBeVisible();
      await expect(page.getByText(NAME_NOTICE_COMMENT)).toBeVisible();
      await expect(page.getByText(AUTHOR_NOTICE)).toHaveCount(0);
      expect(await describedBy(rootBox(page))).toContain(NAME_NOTICE_COMMENT);
    });

    test(`[c14 c16] ${label}: the real author of an anonymous post sees the "המחבר" notice instead of the name notice, in the box and in the reply box; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page, ANON_MINE_ID);
      await expect(page.getByText(AUTHOR_NOTICE)).toBeVisible();
      await expect(page.getByText(NAME_NOTICE_COMMENT)).toHaveCount(0);
      expect(await describedBy(rootBox(page))).toContain(AUTHOR_NOTICE);
      expect(await describedBy(rootBox(page))).not.toContain(NAME_NOTICE_COMMENT);
      await button(page, 'השבה').first().click();
      await expect(replyBox(page)).toBeVisible();
      expect(await describedBy(replyBox(page))).toContain(AUTHOR_NOTICE);
      expect(await describedBy(replyBox(page))).not.toContain(NAME_NOTICE_COMMENT);
      await scan(page);
    });
  }

  test('[c14] the reply box of a reader carries the name notice', async ({ page }) => {
    await start(page, ANON_OTHERS_ID);
    await button(page, 'השבה').first().click();
    await expect(replyBox(page)).toBeVisible();
    expect(await describedBy(replyBox(page))).toContain(NAME_NOTICE_COMMENT);
    await expect(page.getByText(AUTHOR_NOTICE)).toHaveCount(0);
  });

  test('[c14] the author\'s sent comment shows "המחבר" to her, never her name, and the notice does not change', async ({ page }) => {
    const net = await start(page, ANON_MINE_ID, [], true);
    await rootBox(page).fill('אני כתבתי את הפוסט');
    await button(page.getByRole('form', { name: 'כתיבת תגובה', exact: true }), 'שליחה').click();
    const item = list(page).getByRole('listitem', { name: 'המחבר', exact: true });
    await expect(item).toContainText('אני כתבתי את הפוסט');
    await expect(page.getByText('דנה כהן')).toHaveCount(0);
    await expect(item.getByRole('img')).toHaveCount(0);
    expect(net.sends).toHaveLength(1);
    expect(Object.keys(net.sends[0] ?? {}).filter((k) => /author|name|user/i.test(k))).toEqual([]);
    await expect(page.getByText(AUTHOR_NOTICE)).toBeVisible();
  });

  test('[c14] a stranger sees the author\'s comment as "המחבר", no name and no delete', async ({ page }) => {
    await start(page, ANON_OTHERS_ID, [top(2, 'תשובת כותבת הפוסט', [], { byAuthor: true, author: undefined }), ...some()]);
    const item = list(page).getByRole('listitem', { name: 'המחבר', exact: true });
    await expect(item).toContainText('תשובת כותבת הפוסט');
    await expect(button(item, 'מחיקה')).toHaveCount(0);
    expect(await item.evaluate((el) => el.outerHTML)).not.toMatch(/דנה|נועה|data-testid|href=|src=/);
  });

  test('[c14] the writer of a comment who is not the author still sees the name notice on an anonymous post she did not write', async ({ page }) => {
    const net = await start(page, ANON_OTHERS_ID, []);
    await rootBox(page).fill('מגיבה רגילה');
    await button(page.getByRole('form', { name: 'כתיבת תגובה', exact: true }), 'שליחה').click();
    await expect(list(page).getByRole('listitem', { name: 'דנה כהן', exact: true })).toContainText('מגיבה רגילה');
    expect(net.sends).toHaveLength(1);
    await expect(page.getByText(NAME_NOTICE_COMMENT)).toBeVisible();
  });

  test('[c14] the notice is plain text under the textbox: it is not a link or a button, and the box still sends with the keyboard', async ({ page }) => {
    const net = await start(page, ANON_MINE_ID, [top(1, 'x')]);
    const notice = page.getByText(AUTHOR_NOTICE);
    expect(await notice.evaluate((el) => el.closest('a, button') === null)).toBe(true);
    await rootBox(page).focus();
    await page.keyboard.type('בלי עכבר');
    await page.keyboard.press('Tab');
    await expect(button(page, 'שליחה')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => net.sends.length).toBe(1);
  });
});
