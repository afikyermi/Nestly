// I3 F3.1b (real browser, real session source, network stubbed). Derived from .work/post-create/spec.md criteria 14, 17, 18 and
// screen.md (roles and Hebrew names); the unit half (15, 16) is apps/web/tests/posts-composer.test.tsx. The server half is F3.1a's.
// The stub plays the server: e2e/support/posts-stub.ts. Visual baselines are not listed here: SPEC names no story ids yet (see report).
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { EMAIL, main, scan } from './support/journeys-stub';
import { MINE, OTHERS, POST_ID, setupPosts } from './support/posts-stub';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;
const FAILED = 'הפרסום לא הצליח. אפשר לנסות שוב';
const POST_PATH = /^\/posts\/d0000000-/;

async function open(page: Page, path: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.goto(path);
}
const body = (page: Page) => page.getByRole('textbox', { name: 'מה תרצו לשתף?' });
const publish = (page: Page) => page.getByRole('button', { name: 'פרסום', exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const dialog = (page: Page) => page.getByRole('alertdialog', { name: 'למחוק את הפוסט?' });
/** The radio input is visually hidden; its card (the label text) is what a person presses. */
const card = (page: Page, name: string) => page.getByRole('radiogroup').getByText(name, { exact: true });
const choose = (page: Page, name: string) => card(page, name).click();
const heightOf = async (el: Locator) => (await el.boundingBox())?.height ?? 0;

test.describe('F3.1b c14 [FR-FEED-002] the entry point', () => {
  test('[c14] a Regular sees "כתיבת פוסט" on the feed, it leads to /posts/new; no anonymous control anywhere', async ({ page }) => {
    await setupPosts(page);
    await open(page, '/feed');
    const link = page.getByRole('link', { name: 'כתיבת פוסט', exact: true });
    await expect(link).toHaveAttribute('href', '/posts/new');
    await link.click();
    await expect(page.getByRole('heading', { level: 1, name: 'כתיבת פוסט' })).toBeVisible();
    expect(pathOf(page)).toBe('/posts/new');
    await expect(page.getByText(/אנונימי/)).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('switch')).toHaveCount(0);
  });
  test('[c14] a Professional has no link on the feed, and /posts/new shows "הפעולה אינה זמינה" without the form', async ({ page }) => {
    await setupPosts(page, { professional: true });
    await open(page, '/feed');
    await expect(page.getByRole('heading', { level: 1, name: 'פיד' })).toBeVisible();
    await page.waitForTimeout(500); // the posting-right check answers after the heading; a link must not appear later
    await expect(page.getByRole('link', { name: 'כתיבת פוסט' })).toHaveCount(0);
    await page.goto('/posts/new');
    await expect(page.getByRole('heading', { level: 1, name: 'כתיבת פוסט' })).toBeVisible();
    await expect(main(page).getByText('הפעולה אינה זמינה')).toBeVisible();
    await expect(body(page)).toHaveCount(0);
    await expect(publish(page)).toHaveCount(0);
  });
});

test.describe('F3.1b c17 [FR-FEED-002 ERR-004] publishing', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c17] ${label}: a post with "חברים בלבד" and a tag lands on its page: status, text, audience, tag, back link; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupPosts(page);
      await open(page, '/posts/new');
      await expect(page.getByText('השם שלכם יוצג לכל מי שיכול לראות את הפוסט')).toBeVisible();
      await expect(page.getByRole('radio', { name: 'כולם' })).toBeChecked();
      await expect(page.getByRole('radio', { name: 'בלי תגית' })).toBeChecked();
      await scan(page);
      await body(page).fill('שלום לכולם\nשאלה קטנה');
      await choose(page, 'חברים בלבד');
      await choose(page, 'בהריון');
      await publish(page).click();
      await expect(page.getByRole('status').filter({ hasText: 'הפוסט פורסם' })).toBeVisible();
      expect(pathOf(page)).toMatch(POST_PATH);
      expect(net.creates).toEqual([{ body: 'שלום לכולם\nשאלה קטנה', audience: 'friends', stageTag: 'pregnant' }]);
      await expect(main(page).getByText('שלום לכולם')).toBeVisible();
      await expect(main(page).getByText('מי יראה את הפוסט: חברים בלבד')).toBeVisible();
      await expect(main(page).getByText('תגית: בהריון')).toBeVisible();
      await expect(page.getByRole('link', { name: 'חזרה לפיד' })).toHaveAttribute('href', '/feed');
      await scan(page);
    });
  }
  test('[c17] "הפוסט פורסם" shows only right after publishing: not after "חזרה לפיד" then Back, nor after reload', async ({ page }) => {
    await setupPosts(page);
    await open(page, '/posts/new');
    await body(page).fill('רק עכשיו');
    await publish(page).click();
    const status = page.getByRole('status').filter({ hasText: 'הפוסט פורסם' });
    await expect(status).toBeVisible();
    const postPath = pathOf(page);
    await page.getByRole('link', { name: 'חזרה לפיד' }).click();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await page.goBack();
    await expect.poll(() => pathOf(page)).toBe(postPath);
    await expect(main(page).getByText('רק עכשיו')).toBeVisible();
    await expect(status).toHaveCount(0);
    await page.reload();
    await expect(main(page).getByText('רק עכשיו')).toBeVisible();
    await expect(status).toHaveCount(0);
  });
  test('[c17] no tag chosen: no tag line on the page, and stageTag is null or absent in the request', async ({ page }) => {
    const net = await setupPosts(page);
    await open(page, '/posts/new');
    await body(page).fill('הודעה פשוטה');
    await publish(page).click();
    await expect(main(page).getByText('הודעה פשוטה')).toBeVisible();
    await expect(main(page).getByText(/^תגית:/)).toHaveCount(0);
    expect(net.creates[0]?.stageTag ?? null).toBeNull();
  });
  for (const [name, status] of [['403', 403], ['5xx', 500], ['network', 'abort']] as const) {
    test(`[c17] ${name}: the composer stays, text and choices kept, a Hebrew alert with no technical detail`, async ({ page }) => {
      const net = await setupPosts(page);
      net.create = status;
      await open(page, '/posts/new');
      await body(page).fill('הטקסט שלי');
      await choose(page, 'חברים בלבד');
      await publish(page).click();
      await expect(page.getByRole('alert').filter({ hasText: FAILED })).toBeVisible();
      expect(pathOf(page)).toBe('/posts/new');
      await expect(body(page)).toHaveValue('הטקסט שלי');
      await expect(page.getByRole('radio', { name: 'חברים בלבד' })).toBeChecked();
      expect(await page.getByRole('alert').first().innerText()).not.toMatch(/403|500|not_allowed|server_error|fetch/i);
    });
  }
  test('[c17 c16] a double click on "פרסום" sends one request; the pending button is "מפרסמים" and disabled', async ({ page }) => {
    const net = await setupPosts(page);
    let release: () => void = () => undefined;
    net.holdCreate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await open(page, '/posts/new');
    await body(page).fill('פעם אחת');
    await publish(page).dblclick();
    await expect(button(page, 'מפרסמים')).toBeDisabled();
    release();
    await expect.poll(() => pathOf(page)).toMatch(POST_PATH);
    expect(net.creates).toHaveLength(1);
  });
  test('[c17 c16] keyboard only: Tab reaches the audience group, the tag group and "פרסום"; Enter on it publishes', async ({ page }) => {
    const net = await setupPosts(page);
    await open(page, '/posts/new');
    await body(page).focus();
    await page.keyboard.type('בלי עכבר');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio', { name: 'כולם' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio', { name: 'בלי תגית' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(publish(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => pathOf(page)).toMatch(POST_PATH);
    expect(net.creates).toHaveLength(1);
  });
  test('[c16] phone: the submit button and every radio option are at least 44 px tall', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await setupPosts(page);
    await open(page, '/posts/new');
    expect(await heightOf(publish(page))).toBeGreaterThanOrEqual(44);
    for (const name of ['כולם', 'חברים בלבד', 'בלי תגית', 'מתכננים', 'בהריון', 'יש לנו ילד או ילדה']) {
      expect(await heightOf(card(page, name).locator('xpath=ancestor-or-self::label[1]')), name).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('F3.1b c18 [FR-FEED-002] the own-post page', () => {
  test('[c18] the author sees "עריכה" and "מחיקה"; another person\'s post shows neither; a missing one shows the 404 text and link', async ({ page }) => {
    await setupPosts(page);
    await open(page, `/posts/${POST_ID}`);
    await expect(main(page).getByText('שאלה על שינה')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'הפוסט פורסם' })).toHaveCount(0); // a status text only right after publishing
    await expect(button(page, 'עריכה')).toBeVisible();
    await expect(button(page, 'מחיקה')).toBeVisible();
    await page.goto(`/posts/${OTHERS.id}`);
    await expect(main(page).getByText('פוסט של מישהי אחרת')).toBeVisible();
    await expect(button(page, 'עריכה')).toHaveCount(0);
    await expect(button(page, 'מחיקה')).toHaveCount(0);
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
    await button(page, 'עריכה').click();
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
    await button(page, 'עריכה').click();
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
    await button(page, 'עריכה').click();
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
      await button(page, 'מחיקה').click();
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page)).toContainText('המחיקה מיידית ולצמיתות');
      await expect(dialog(page).getByRole('button', { name: 'ביטול', exact: true })).toBeFocused();
      await scan(page);
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toHaveCount(0);
      await button(page, 'מחיקה').click();
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
    await button(page, 'מחיקה').click();
    await dialog(page).getByRole('button', { name: 'מחיקת הפוסט', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'המחיקה לא הצליחה. אפשר לנסות שוב' })).toBeVisible();
    await expect(dialog(page)).toBeVisible();
    net.remove = 204;
    await dialog(page).getByRole('button', { name: 'מחיקת הפוסט', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await expect(page.getByRole('status').filter({ hasText: 'הפוסט נמחק' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'פיד' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'הפוסט נמחק' })).toHaveCount(0);
    expect(net.deletes).toEqual([POST_ID, POST_ID]);
    expect(net.posts.some((p) => p.id === MINE.id)).toBe(false);
  });
});
