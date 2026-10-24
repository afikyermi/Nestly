// I3 F3.1b (real browser, real session source, network stubbed), amended by feed-composer (.work/feed-composer/spec.md): the composer is the
// button at the top of /feed that opens in place, so criteria 14 and 17 are asserted there (c1, c7, c10 of feed-composer). Derived from
// .work/post-create/spec.md criteria 14, 17, 18, .work/feed-composer/spec.md and screen.md (roles and Hebrew names); the unit half (15, 16) is
// apps/web/tests/posts-composer.test.tsx. The server half is F3.1a's. The stub plays the server: e2e/support/feed-stub.ts, posts-stub.ts.
// The rest of the in-feed composer (open, collapse and keep, redirect, leave prompt, order after paging) is e2e/feed-composer.spec.ts.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { CORS, EMAIL, json, main, scan } from './support/journeys-stub';
import { pageOf, range, setupFeed } from './support/feed-stub';
import { MINE, OTHERS, POST_ID, setupPosts } from './support/posts-stub';
import { DELETE_ITEM, EDIT_ITEM, chooseFromPostMenu, menuItem, postMore } from './support/post-menu';
import { FAILED, PUBLISHED, acceptLeave, anonToggle, bodyBox, choice, composer, feedCards, feedStatus, openComposer, openFeedAt, publishButton, timeLinkOf } from './support/composer';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;

async function open(page: Page, path: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.goto(path);
}
const body = bodyBox;
const publish = publishButton;
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const dialog = (page: Page) => page.getByRole('alertdialog', { name: 'למחוק את הפוסט?' });
/** The radio input is visually hidden; its card (the label text) is what a person presses. */
const card = choice;
const choose = (page: Page, name: string) => choice(page, name).click();
const heightOf = async (el: Locator) => (await el.boundingBox())?.height ?? 0;
/** Three server cards, then the feed is armed and opened at /feed. */
const FEED = () => pageOf(range(1, 3), null);
const feedAt = async (page: Page) => {
  const net = await setupFeed(page, FEED);
  await openFeedAt(page, net);
  await expect(feedCards(page)).toHaveCount(3);
  return net;
};

test.describe('F3.1b c14 [FR-FEED-002] the entry point (feed-composer c1)', () => {
  test('[c14] a Regular sees the form "כתיבת פוסט" on the feed (no button or link); idle it has no anonymous control, once the field has focus it has exactly one (F3.4 c11)', async ({ page }) => {
    await feedAt(page);
    await expect(composer(page)).toBeVisible();
    await expect(bodyBox(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'כתיבת פוסט' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'כתיבת פוסט' })).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await openComposer(page);
    expect(pathOf(page)).toBe('/feed');
    await expect(page.getByRole('heading', { level: 1, name: 'כתיבת פוסט' })).toHaveCount(0); // no page, no h1 of that name (feed-composer c11)
    await expect(page.getByRole('checkbox')).toHaveCount(1); // F3.4 amends F3.1b c14: "פרסום אנונימי"; I11-C (§13.1): no help-request box
    await expect(page.getByText('הפוסט מבקש עזרה מבעלי מקצוע')).toHaveCount(0);
    await expect(anonToggle(page)).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(0);
  });
  // F3.1b c14's "a Professional has no composer form" is superseded by professional-posting c8: see e2e/professional-posting.spec.ts.
});

test.describe('F3.1b c17 [FR-FEED-002 ERR-004] publishing (feed-composer c7, c10)', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c17][fc c7] ${label}: a post with "חברים בלבד" and a tag becomes the first card at once: no new feed request, status, text, audience, tag, time link, focus; the composer resets; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupFeed(page, FEED);
      await openFeedAt(page, net);
      await expect(feedCards(page)).toHaveCount(3);
      await openComposer(page);
      await expect(page.getByText('השם שלכם יוצג לכל מי שיכול לראות את הפוסט')).toBeVisible();
      await expect(page.getByRole('radio', { name: 'כולם' })).toBeChecked();
      await expect(page.getByRole('radio', { name: 'בלי תגית' })).toBeChecked();
      await scan(page);
      await body(page).fill('שלום לכולם\nשאלה קטנה');
      await choose(page, 'חברים בלבד');
      await choose(page, 'בהריון');
      await publish(page).click();
      await expect(feedCards(page)).toHaveCount(4);
      expect(net.creates).toEqual([{ body: 'שלום לכולם\nשאלה קטנה', audience: 'friends', stageTag: 'pregnant' }]);
      expect(pathOf(page)).toBe('/feed');
      expect(net.cursors, 'no GET /feed after the post').toEqual([null]);
      await expect(composer(page)).toBeVisible(); // the form resets and goes idle
      await expect(bodyBox(page)).toHaveValue('');
      await expect(anonToggle(page)).toHaveCount(0);
      const newId = net.posts[net.posts.length - 1]?.id ?? '';
      const first = feedCards(page).first();
      for (let i = 0; i < 4; i += 1) await expect(feedCards(page).nth(i)).toHaveAttribute('aria-posinset', String(i + 1));
      await expect(page.getByRole('article', { name: 'דנה כהן', exact: true })).toHaveCount(1);
      await expect(first).toContainText('שלום לכולם');
      await expect(first).toContainText('שאלה קטנה');
      await expect(first).toContainText('חברים בלבד');
      await expect(first).toContainText('בהריון');
      await expect(timeLinkOf(first)).toHaveAttribute('href', `/posts/${newId}`);
      await expect(first.getByRole('button', { name: /לייק/ })).toHaveCount(1);
      await expect(first.getByRole('button', { name: /^תגובות/ })).toHaveCount(1);
      await expect(first.getByText(/^\d+$/)).toHaveCount(0); // no counts yet
      await expect(first).toBeFocused();
      await expect(feedStatus(page)).toHaveText(PUBLISHED);
      await expect(feedStatus(page)).toBeVisible();
      await scan(page);
      // The composer starts anew: empty, unchecked, the remembered "חברים בלבד", "בלי תגית".
      await openComposer(page);
      await expect(body(page)).toHaveValue('');
      await expect(anonToggle(page)).not.toBeChecked();
      await expect(page.getByRole('radio', { name: 'חברים בלבד' })).toBeChecked();
      await expect(page.getByRole('radio', { name: 'בלי תגית' })).toBeChecked();
    });
  }
  test('[c17][fc c7] a profile answer without a full name shows the new card as "מהקהילה"', async ({ page }) => {
    const net = await setupFeed(page, FEED);
    await page.route('**/api/profile', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      return json(route, 200, { fullName: '', parentGender: 'woman' });
    });
    await openFeedAt(page, net);
    await openComposer(page);
    await body(page).fill('בלי שם');
    await publish(page).click();
    await expect(feedCards(page)).toHaveCount(4);
    await expect(page.getByRole('article', { name: 'מהקהילה', exact: true })).toHaveCount(1);
    await expect(feedCards(page).first()).toContainText('בלי שם');
    await expect(feedCards(page).first()).not.toContainText('דנה כהן');
  });
  test('[c17] no tag chosen: no tag text on the card, and stageTag is null or absent in the request', async ({ page }) => {
    const net = await feedAt(page);
    await openComposer(page);
    await body(page).fill('הודעה פשוטה');
    await publish(page).click();
    await expect(feedCards(page).first()).toContainText('הודעה פשוטה');
    for (const tag of ['מתכננים', 'בהריון', 'יש לנו ילד או ילדה']) await expect(feedCards(page).first()).not.toContainText(tag);
    expect(net.creates[0]?.stageTag ?? null).toBeNull();
  });
  for (const [name, status] of [['403', 403], ['5xx', 500], ['network', 'abort'], ['422 audience_not_allowed', 422]] as const) {
    test(`[c17][fc c10] ${name}: the composer stays open, text and choices kept, a Hebrew alert in it with focus and no technical detail; no card added`, async ({ page }) => {
      const net = await feedAt(page);
      net.create = status;
      await openComposer(page);
      await body(page).fill('הטקסט שלי');
      await choose(page, 'חברים בלבד');
      await publish(page).click();
      const alert = composer(page).getByRole('alert').filter({ hasText: FAILED });
      await expect(alert).toBeVisible();
      await expect(page.locator('[role="alert"]:focus-within, *:focus:has([role="alert"])')).toHaveCount(1); // focus on the alert, or on the message that holds it (F3.1b)
      expect(pathOf(page)).toBe('/feed');
      await expect(body(page)).toHaveValue('הטקסט שלי');
      await expect(page.getByRole('radio', { name: 'חברים בלבד' })).toBeChecked();
      expect(await alert.innerText()).not.toMatch(/403|422|500|not_allowed|audience_not_allowed|server_error|fetch/i);
      await expect(feedCards(page)).toHaveCount(3);
      await expect(feedStatus(page)).not.toHaveText(PUBLISHED);
      // Nothing was remembered by the failed post: after a reload the composer opens on "כולם".
      acceptLeave(page); // unsent text asks before leaving (c6)
      await page.reload();
      await openComposer(page);
      await expect(page.getByRole('radio', { name: 'כולם' })).toBeChecked();
    });
  }
  test('[c17 c16] a double click on "פרסום" sends one request; the pending button is "מפרסמים" and disabled', async ({ page }) => {
    const net = await feedAt(page);
    let release: () => void = () => undefined;
    net.holdCreate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await openComposer(page);
    await body(page).fill('פעם אחת');
    await publish(page).dblclick();
    await expect(button(page, 'מפרסמים')).toBeDisabled();
    release();
    await expect(feedCards(page)).toHaveCount(4);
    expect(net.creates).toHaveLength(1);
  });
  test('[c17 c16] keyboard only: Tab from the heading reaches the text field and reveals the options, Tab reaches the anonymous checkbox (F3.4), the audience group, the tag group, the help marking (I11) and "פרסום"; Enter on it publishes', async ({ page }) => {
    const net = await feedAt(page);
    await page.getByRole('heading', { level: 1, name: 'הפיד' }).focus();
    await page.keyboard.press('Tab');
    await expect(body(page)).toBeFocused();
    await expect(anonToggle(page)).toBeVisible();
    await page.keyboard.type('בלי עכבר');
    await page.keyboard.press('Tab');
    await expect(anonToggle(page)).toBeFocused(); // F3.4 c11: after the textbox, before the audience
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio', { name: 'כולם' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio', { name: 'בלי תגית' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'הוספת תמונה', exact: true })).toBeFocused(); // I5: the pictures, just before "פרסום"
    await page.keyboard.press('Tab');
    await expect(publish(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(feedCards(page)).toHaveCount(4);
    expect(net.creates).toHaveLength(1);
  });
  test('[c16] phone: the submit button and every radio option are at least 44 px tall', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await feedAt(page);
    await openComposer(page);
    expect(await heightOf(publish(page))).toBeGreaterThanOrEqual(44);
    for (const name of ['כולם', 'חברים בלבד', 'בלי תגית', 'מתכננים', 'בהריון', 'יש לנו ילד או ילדה']) {
      expect(await heightOf(card(page, name).locator('xpath=ancestor-or-self::label[1]')), name).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('F3.1b c18 [FR-FEED-002] the own-post page (author actions in the "⋯": ux-polish-b c3)', () => {
  test('[c18] the author sees "עריכה" and "מחיקה"; another person\'s post shows neither; a missing one shows the 404 text and link', async ({ page }) => {
    await setupPosts(page);
    await open(page, `/posts/${POST_ID}`);
    await expect(main(page).getByText('שאלה על שינה')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'הפוסט פורסם' })).toHaveCount(0); // a status text only right after publishing
    // ux-polish-b c3 supersedes the visible buttons: the author's edit and delete are items of the post's "⋯"; no "עריכה" / "מחיקה" button remains.
    await expect(button(page, 'עריכה')).toHaveCount(0);
    await expect(button(page, 'מחיקה')).toHaveCount(0);
    await postMore(page).click();
    await expect(menuItem(page, EDIT_ITEM)).toBeVisible();
    await expect(menuItem(page, DELETE_ITEM)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goto(`/posts/${OTHERS.id}`);
    await expect(main(page).getByText('פוסט של מישהי אחרת')).toBeVisible();
    await expect(button(page, 'עריכה')).toHaveCount(0);
    await expect(button(page, 'מחיקה')).toHaveCount(0);
    await postMore(page).click();
    await expect(menuItem(page, EDIT_ITEM)).toHaveCount(0);
    await expect(menuItem(page, DELETE_ITEM)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto('/posts/d0000000-0000-4000-8000-0000000000ff');
    await expect(main(page).getByText('הפוסט אינו זמין')).toBeVisible();
    await expect(page.getByRole('link', { name: 'חזרה לפיד' })).toHaveAttribute('href', '/feed');
    await expect(main(page).getByText('שאלה על שינה')).toHaveCount(0);
  });
  test('[c18] a 5xx load shows the retry text and "נסו שוב", which loads the post', async ({ page }) => {
    const net = await setupPosts(page);
    net.read = 500;
    await open(page, `/posts/${POST_ID}`);
    await expect(main(page).getByText('לא הצלחנו לטעון את הפוסט. אפשר לנסות שוב')).toBeVisible();
    net.read = 200;
    await button(page, 'נסו שוב').click();
    await expect(main(page).getByText('שאלה על שינה')).toBeVisible();
  });
  test('[c18] edit opens the form prefilled without the name notice; cancel saves nothing; saving shows the update', async ({ page }) => {
    const net = await setupPosts(page);
    await open(page, `/posts/${POST_ID}`);
    await chooseFromPostMenu(page, EDIT_ITEM);
    const form = page.getByRole('form', { name: 'עריכת פוסט' });
    await expect(body(page)).toHaveValue('שאלה על שינה\nבשעות הלילה');
    await expect(page.getByRole('radio', { name: 'כולם' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'בהריון' })).toBeChecked();
    await expect(form.getByText('השם שלכם יוצג לכל מי שיכול לראות את הפוסט')).toHaveCount(0);
    await body(page).fill('טקסט שלא יישמר');
    await button(page, 'ביטול').click();
    await expect(form).toHaveCount(0);
    expect(net.edits).toHaveLength(0);
    await expect(main(page).getByText('שאלה על שינה')).toBeVisible();
    await chooseFromPostMenu(page, EDIT_ITEM);
    await body(page).fill('הטקסט החדש');
    await choose(page, 'חברים בלבד');
    await choose(page, 'בלי תגית');
    await button(page, 'שמירה').click();
    await expect(page.getByRole('status').filter({ hasText: 'הפוסט עודכן' })).toBeVisible();
    await expect(main(page).getByText('הטקסט החדש')).toBeVisible();
    await expect(main(page).getByText('מי יראה את הפוסט: חברים בלבד')).toBeVisible();
    await expect(main(page).getByText(/^תגית:/)).toHaveCount(0);
    expect(net.edits).toEqual([{ body: 'הטקסט החדש', audience: 'friends', stageTag: null }]);
  });
  test('[c18] a failed save keeps the form and the text with the save-failed alert', async ({ page }) => {
    const net = await setupPosts(page);
    net.edit = 500;
    await open(page, `/posts/${POST_ID}`);
    await chooseFromPostMenu(page, EDIT_ITEM);
    await body(page).fill('נשאר');
    await button(page, 'שמירה').click();
    await expect(page.getByRole('alert').filter({ hasText: 'השמירה לא הצליחה. אפשר לנסות שוב' })).toBeVisible();
    await expect(body(page)).toHaveValue('נשאר');
  });
  for (const { label, viewport } of SIZES) {
    test(`[c18] ${label}: the delete dialog has its description, focus on cancel, passes axe; Esc and cancel change nothing`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupPosts(page);
      await open(page, `/posts/${POST_ID}`);
      await scan(page);
      await chooseFromPostMenu(page, DELETE_ITEM);
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page)).toContainText('המחיקה מיידית ולצמיתות');
      await expect(dialog(page).getByRole('button', { name: 'ביטול', exact: true })).toBeFocused();
      await scan(page);
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toHaveCount(0);
      await chooseFromPostMenu(page, DELETE_ITEM);
      await dialog(page).getByRole('button', { name: 'ביטול', exact: true }).click();
      await expect(dialog(page)).toHaveCount(0);
      expect(net.deletes).toHaveLength(0);
      expect(pathOf(page)).toBe(`/posts/${POST_ID}`);
    });
  }
  test('[c18] a failed delete keeps the dialog open with the alert; confirming again goes to the feed with "הפוסט נמחק"', async ({ page }) => {
    const net = await setupPosts(page);
    net.remove = 500;
    await open(page, `/posts/${POST_ID}`);
    await chooseFromPostMenu(page, DELETE_ITEM);
    await dialog(page).getByRole('button', { name: 'מחיקת הפוסט', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'המחיקה לא הצליחה. אפשר לנסות שוב' })).toBeVisible();
    await expect(dialog(page)).toBeVisible();
    net.remove = 204;
    await dialog(page).getByRole('button', { name: 'מחיקת הפוסט', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await expect(page.getByRole('status').filter({ hasText: 'הפוסט נמחק' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'הפיד' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'הפוסט נמחק' })).toHaveCount(0);
    expect(net.deletes).toEqual([POST_ID, POST_ID]);
    expect(net.posts.some((p) => p.id === MINE.id)).toBe(false);
  });
});
