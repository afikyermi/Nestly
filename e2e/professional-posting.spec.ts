// I3 professional-posting (real browser, real session source, network stubbed). Derived from .work/professional-posting/spec.md criteria 8-11 and 13
// and screen.md (roles and Hebrew names) only. The feed list, "לייק"/"תגובות" and the comment composer of a Professional (c12) are asserted where those
// screens are tested: e2e/feed.spec.ts, e2e/feed-actions.spec.ts, e2e/comments.spec.ts. The superseded "a Professional has no composer" tests of
// posts.spec.ts and anonymous-post.spec.ts end in this file. Baselines: e2e/professional-posting.visual.spec.ts. The stub plays the server
// (e2e/support/feed-stub.ts, posts-stub.ts): a Professional is a caller whose GET /api/profile answers 404 no_profile (spec D1).
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { EMAIL, main, scan } from './support/journeys-stub';
import { pageOf, range, setupFeed } from './support/feed-stub';
import { DELETE_ITEM, EDIT_ITEM, POST_MORE, chooseFromPostMenu, postMore } from './support/post-menu';
import { MINE, POST_ID, setupPosts } from './support/posts-stub';
import type { StoredPost } from './support/posts-stub';
import { FAILED, PUBLISHED, anonToggle, audienceGroup, bodyBox, composer, feedCards, feedStatus, openFeedAt, publishButton, timeLinkOf } from './support/composer';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;
const FIXED_LINE = 'הפוסט יוצג לכולם';
const NAME_NOTICE = 'השם שלכם יוצג לכל מי שיכול לראות את הפוסט';
const FEED = () => pageOf(range(1, 3), null);
/** A Professional's own post: named, everyone, never tagged (spec D2). */
const proPost = (over: Partial<StoredPost> = {}): StoredPost => ({ ...MINE, stageTag: null, ...over }); // fresh per test: the stub edits it in place

const proFeed = async (page: Page, answer = FEED, path = '/feed') => {
  const net = await setupFeed(page, answer, { professional: true });
  await openFeedAt(page, net, path);
  return net;
};
const fixedLine = (page: Page) => page.getByText(FIXED_LINE, { exact: true });
/** Nothing a Professional must never be offered, anywhere in the page (c8). */
async function expectNoForbiddenControls(page: Page): Promise<void> {
  await expect(anonToggle(page)).toHaveCount(0);
  await expect(page.getByText('פרסום אנונימי')).toHaveCount(0);
  await expect(audienceGroup(page)).toHaveCount(0);
  await expect(page.getByRole('radiogroup')).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByText(NAME_NOTICE)).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain('בעל מקצוע');
  expect(await page.content()).not.toContain('בעל מקצוע');
}
async function openPost(page: Page, path: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.goto(path);
}
/** True when `a` comes before `b` in the document. */
async function before(a: Locator, b: Locator): Promise<boolean> {
  const handle = await b.elementHandle();
  if (handle === null) throw new Error('no element to compare with');
  return a.evaluate((x, y) => Boolean(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING), handle);
}
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test.describe('professional-posting c8 [FR-FEED-002 FR-FEED-005 DR-2 D2 DR-3] the always-open composer', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c8] ${label}: the form "כתיבת פוסט" with "מה תרצו לשתף?" and "פרסום" (44x44); engaged it shows "${FIXED_LINE}"; never an anonymous control, audience or tag group, name notice; axe in both states`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await proFeed(page);
      await expect(feedCards(page)).toHaveCount(3);
      await expect(composer(page)).toBeVisible();
      await expect(bodyBox(page)).toBeVisible();
      await expect(publishButton(page)).toBeVisible();
      await expect(fixedLine(page)).toBeHidden(); // shown when the options are revealed (screen.md)
      await expectNoForbiddenControls(page);
      const box = await publishButton(page).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      await scan(page);

      await bodyBox(page).click();
      await expect(bodyBox(page)).toBeFocused();
      await expect(fixedLine(page)).toBeVisible();
      const describedBy = await composer(page).getAttribute('aria-describedby');
      expect(describedBy, 'the form is described by the fixed line').not.toBeNull();
      await expect(page.locator(`[id="${describedBy ?? ''}"]`)).toHaveText(FIXED_LINE);
      await expectNoForbiddenControls(page);
      await bodyBox(page).fill('שאלה קטנה');
      await expectNoForbiddenControls(page);
      await scan(page);
    });
  }
  test('[c8] the fixed line sits after the text field and before "פרסום"', async ({ page }) => {
    await proFeed(page);
    await bodyBox(page).click();
    await expect(fixedLine(page)).toBeVisible();
    expect(await before(bodyBox(page), fixedLine(page))).toBe(true);
    expect(await before(fixedLine(page), publishButton(page))).toBe(true);
  });
  test('[c8] the composer is there from the first paint of the list: no placeholder, no button or link "כתיבת פוסט"', async ({ page }) => {
    await proFeed(page);
    await expect(main(page).getByText('המסך הזה ייפתח בקרוב.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'כתיבת פוסט' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'כתיבת פוסט' })).toHaveCount(0);
  });
});

test.describe('professional-posting c9 [FR-FEED-002 ERR-004] publishing', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c9] ${label}: the payload is exactly {body, audience:"everyone", stageTag:null}; the new card is first, named "מהקהילה", "כולם", the status "הפוסט פורסם", focus on it; the form goes idle; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await proFeed(page);
      await expect(feedCards(page)).toHaveCount(3);
      await bodyBox(page).click();
      await bodyBox(page).fill('  שאלה לכולם\nעל שינה  ');
      await publishButton(page).click();
      await expect(feedCards(page)).toHaveCount(4);
      expect(net.creates).toEqual([{ body: '  שאלה לכולם\nעל שינה  '.trim(), audience: 'everyone', stageTag: null }]);
      expect(Object.keys(net.creates[0] ?? {}).sort()).toEqual(['audience', 'body', 'stageTag']); // no isAnonymous, whatever its value
      const first = feedCards(page).first();
      await expect(page.getByRole('article', { name: 'מהקהילה', exact: true })).toHaveCount(1);
      await expect(first).toHaveAccessibleName('מהקהילה');
      await expect(first).toContainText('שאלה לכולם');
      await expect(first).toContainText('כולם');
      await expect(first).not.toContainText('חברים בלבד');
      await expect(first).not.toContainText('אנונימי');
      const newId = net.posts[net.posts.length - 1]?.id ?? '';
      await expect(timeLinkOf(first)).toHaveAttribute('href', `/posts/${newId}`);
      await expect(first).toBeFocused();
      await expect(feedStatus(page)).toHaveText(PUBLISHED);
      expect(net.cursors, 'no GET /feed after the post').toEqual([null]);
      await expect(bodyBox(page)).toHaveValue('');
      await expect(fixedLine(page)).toBeHidden();
      await expectNoForbiddenControls(page);
      await scan(page);
    });
  }
  test('[c9] a failed publish (as feed-composer c10): the form stays open with the text kept, the Hebrew alert, no card added, still no forbidden control', async ({ page }) => {
    const net = await proFeed(page);
    net.create = 500;
    await bodyBox(page).click();
    await bodyBox(page).fill('נשאר כאן');
    await publishButton(page).click();
    await expect(composer(page).getByRole('alert').filter({ hasText: FAILED })).toBeVisible();
    await expect(bodyBox(page)).toHaveValue('נשאר כאן');
    await expect(feedCards(page)).toHaveCount(3);
    await expect(fixedLine(page)).toBeVisible();
    await expectNoForbiddenControls(page);
    net.create = 201;
    await publishButton(page).click();
    await expect(feedCards(page)).toHaveCount(4);
    expect(net.creates).toHaveLength(2);
  });
});

test.describe('professional-posting c11 [FR-FEED-002 3א] the own post page', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c11] ${label}: "${EDIT_ITEM}" and "${DELETE_ITEM}" in "${POST_MORE}" for the author (ux-polish-b c3), no visible "עריכה" or "מחיקה" button; the audience label is "מי יראה את הפוסט: כולם", no tag line; the edit form shows "${FIXED_LINE}" and no audience or tag group; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setupPosts(page, { posts: [proPost()], professional: true });
      await openPost(page, `/posts/${POST_ID}`);
      await expect(main(page).getByText('שאלה על שינה')).toBeVisible({ timeout: 20_000 }); // the first visit in a worker compiles the post screen on the dev server (CI cold start)
      await expect(button(page, 'עריכה')).toHaveCount(0);
      await expect(button(page, 'מחיקה')).toHaveCount(0);
      await expect(main(page).getByText('מי יראה את הפוסט: כולם')).toBeVisible();
      await expect(main(page).getByText(/^תגית:/)).toHaveCount(0);
      await scan(page);
      await postMore(page).click();
      await expect(page.getByRole('menu', { name: 'פעולות נוספות', exact: true }).getByRole('menuitem')).toHaveText([EDIT_ITEM, DELETE_ITEM]);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(postMore(page)).toBeFocused();
      await chooseFromPostMenu(page, EDIT_ITEM);
      const form = page.getByRole('form', { name: 'עריכת פוסט' });
      await expect(form).toBeVisible();
      await expect(form.getByRole('textbox')).toHaveValue('שאלה על שינה\nבשעות הלילה');
      await expect(form.getByText(FIXED_LINE, { exact: true })).toBeVisible();
      await expect(form.getByRole('radiogroup')).toHaveCount(0);
      await expect(form.getByRole('radio')).toHaveCount(0);
      await expect(form.getByRole('checkbox')).toHaveCount(0);
      await expect(form.getByText(NAME_NOTICE)).toHaveCount(0);
      await scan(page);
    });
  }
  test('[c11] saving shows the update and keeps the post everyone / untagged', async ({ page }) => {
    const net = await setupPosts(page, { posts: [proPost()], professional: true });
    await openPost(page, `/posts/${POST_ID}`);
    await chooseFromPostMenu(page, EDIT_ITEM);
    await page.getByRole('form', { name: 'עריכת פוסט' }).getByRole('textbox').fill('הטקסט החדש');
    await button(page, 'שמירה').click();
    await expect(page.getByRole('status').filter({ hasText: 'הפוסט עודכן' })).toBeVisible();
    await expect(main(page).getByText('הטקסט החדש')).toBeVisible();
    await expect(main(page).getByText('מי יראה את הפוסט: כולם')).toBeVisible();
    await expect(main(page).getByText(/^תגית:/)).toHaveCount(0);
    expect(net.edits).toHaveLength(1);
    expect(net.edits[0]).toMatchObject({ body: 'הטקסט החדש' });
    expect(net.edits[0]?.audience ?? 'everyone').toBe('everyone'); // never friends
    expect(net.edits[0]?.stageTag ?? null).toBeNull();
    expect(net.edits[0] ?? {}).not.toHaveProperty('isAnonymous');
  });
  test('[c11] cancel saves nothing', async ({ page }) => {
    const net = await setupPosts(page, { posts: [proPost()], professional: true });
    await openPost(page, `/posts/${POST_ID}`);
    await chooseFromPostMenu(page, EDIT_ITEM);
    await page.getByRole('form', { name: 'עריכת פוסט' }).getByRole('textbox').fill('לא יישמר');
    await button(page, 'ביטול').click();
    await expect(page.getByRole('form', { name: 'עריכת פוסט' })).toHaveCount(0);
    expect(net.edits).toEqual([]);
  });
  test('[c11] delete as F3.1 c18: the dialog, confirming goes to the feed with "הפוסט נמחק"', async ({ page }) => {
    const net = await setupPosts(page, { posts: [proPost()], professional: true });
    await openPost(page, `/posts/${POST_ID}`);
    await chooseFromPostMenu(page, DELETE_ITEM);
    const dialog = page.getByRole('alertdialog', { name: 'למחוק את הפוסט?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'ביטול', exact: true })).toBeFocused();
    await dialog.getByRole('button', { name: 'מחיקת הפוסט', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await expect(page.getByRole('status').filter({ hasText: 'הפוסט נמחק' })).toBeVisible();
    expect(net.deletes).toEqual([POST_ID]);
  });
  test('[c11] a Professional on another person\'s post sees neither the visible buttons nor the author menu items', async ({ page }) => {
    await setupPosts(page, { posts: [proPost({ isMine: false })], professional: true });
    await openPost(page, `/posts/${POST_ID}`);
    await expect(main(page).getByText('שאלה על שינה')).toBeVisible();
    await expect(button(page, 'עריכה')).toHaveCount(0);
    await expect(button(page, 'מחיקה')).toHaveCount(0);
    await postMore(page).click(); // another person's post still has a "⋯" (report), with no author items
    await expect(page.getByRole('menuitem').first()).toBeVisible();
    await expect(page.getByRole('menuitem', { name: EDIT_ITEM, exact: true })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: DELETE_ITEM, exact: true })).toHaveCount(0);
  });
});
