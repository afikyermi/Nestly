// I3 feed-composer (real browser, real session source, network stubbed). Derived from .work/feed-composer/spec.md criteria 1, 2, 4, 5, 6, 9, 11, 12
// and screen.md (roles and Hebrew names) only. One layer per behaviour: c3 (the F3.1/F3.4 form rules) is apps/web/tests/posts-composer.test.tsx plus the
// amended e2e/posts.spec.ts and e2e/anonymous-post.spec.ts, which also hold c7, c8 (the new card) and c10 (failures); the empty state's button (c1) is the
// amended e2e/feed.spec.ts, which also holds the Tab order from the button to the cards (c12); baselines are e2e/feed-composer.visual.spec.ts and
// e2e/anonymous-post.visual.spec.ts. The stub plays the server: e2e/support/feed-stub.ts, posts-stub.ts.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, MENU_BUTTON, NAV, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { CORS, EMAIL, json, main, scan } from './support/journeys-stub';
import { EMPTY, USER_B, named, pageOf, range, setupFeed } from './support/feed-stub';
import type { FeedNet } from './support/feed-stub';
import {
  PUBLISHED,
  acceptLeave,
  anonToggle,
  audienceGroup,
  bodyBox,
  choice,
  composer,
  feedCards,
  feedList,
  feedStatus,
  openComposer,
  openFeedAt,
  publishButton,
  timeLinkOf,
} from './support/composer';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;
const FEED = () => pageOf(range(1, 3), null);
const CHECKING = 'בודקים אם אפשר לכתוב פוסט';

const feedAt = async (page: Page, answer: FeedNet['answer'] = FEED, count = 3) => {
  const net = await setupFeed(page, answer);
  await openFeedAt(page, net);
  await expect(feedCards(page)).toHaveCount(count);
  return net;
};
/** True when `a` comes before `b` in the document. */
async function before(a: Locator, b: Locator): Promise<boolean> {
  const handle = await b.elementHandle();
  if (handle === null) throw new Error('no element to compare with');
  return a.evaluate((x, y) => Boolean(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING), handle);
}
const timeLink = timeLinkOf;
const toEnd = (page: Page) => feedCards(page).last().scrollIntoViewIfNeeded();
const storageText = (page: Page) => page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
const historyLength = (page: Page) => page.evaluate(() => history.length);
const cardTexts = (page: Page) => feedCards(page).evaluateAll((els) => els.map((e) => e.textContent ?? ''));
const nav = (page: Page) => page.getByRole('navigation', { name: NAV });
/** Two pages: the first 12, then `second()` after cursor "c1". */
const twoPages = (second: () => ReturnType<typeof range>, extra = {}): FeedNet['answer'] => (cursor) =>
  cursor === null ? pageOf(range(1, 12), 'c1') : pageOf(second(), null, extra);

test.describe('feed-composer c1 [FR-FEED-002 FR-FEED-001] the idle composer', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c1 c12] ${label}: the form "כתיבת פוסט" between the status region and the list holds only the text field and "פרסום" (44x44); no button or link "כתיבת פוסט", no checkbox or radio; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await feedAt(page);
      const form = composer(page);
      await expect(form).toHaveCount(1);
      await expect(form).toBeVisible();
      expect(await before(feedStatus(page), form), 'after the status region').toBe(true);
      expect(await before(form, feedList(page)), 'before the list').toBe(true);
      await expect(form.getByRole('textbox')).toHaveCount(1);
      await expect(bodyBox(page)).toBeVisible();
      await expect(form.getByRole('button')).toHaveCount(1);
      await expect(publishButton(page)).toBeVisible();
      expect(await before(bodyBox(page), publishButton(page))).toBe(true);
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await expect(page.getByRole('radio')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'כתיבת פוסט' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'כתיבת פוסט' })).toHaveCount(0);
      const box = await publishButton(page).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      await scan(page);
    });
  }
  test('[c1] the right check did not answer (profile 5xx): no form, and the feed still loads', async ({ page }) => {
    const net = await setupFeed(page, FEED);
    await page.route('**/api/profile', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      return json(route, 500, { error: 'internal' });
    });
    await openFeedAt(page, net);
    await expect(feedCards(page)).toHaveCount(3);
    await page.waitForTimeout(500); // the check answers after the list may; the form must not appear later
    await expect(composer(page)).toHaveCount(0);
    await expect(bodyBox(page)).toHaveCount(0);
  });
  test('[c1] while the right is being checked there is no form and the status says so; the form appears when the check allows', async ({ page }) => {
    const net = await setupFeed(page, FEED);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/profile', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      if (net.armed) await held;
      return json(route, 200, { fullName: 'דנה כהן', parentGender: 'woman' });
    });
    await openFeedAt(page, net);
    await expect(feedStatus(page)).toHaveText(CHECKING);
    await expect(composer(page)).toHaveCount(0);
    release();
    await expect(composer(page)).toBeVisible();
    await expect(feedStatus(page)).not.toHaveText(CHECKING);
  });
  test('[c1] an empty feed: the form, in the same place and above the empty text, is the only action', async ({ page }) => {
    await feedAt(page, () => EMPTY, 0);
    await expect(main(page).getByText('עוד אין פוסטים בפיד', { exact: true })).toBeVisible();
    await expect(composer(page)).toBeVisible();
    expect(await before(feedStatus(page), composer(page))).toBe(true);
    expect(await before(composer(page), main(page).getByText('עוד אין פוסטים בפיד', { exact: true }))).toBe(true);
    await expect(main(page).getByRole('button')).toHaveCount(1); // "פרסום" only
    await expect(page.getByRole('button', { name: 'כתיבת פוסט' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'כתיבת פוסט' })).toHaveCount(0);
  });
  test('[c1][D1] the form stays in its place and is not remounted when the feed\'s first page arrives', async ({ page }) => {
    const net = await setupFeed(page, FEED);
    let release: () => void = () => undefined;
    net.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await openFeedAt(page, net);
    await expect(bodyBox(page)).toBeVisible();
    await expect(feedCards(page)).toHaveCount(0);
    await bodyBox(page).evaluate((el) => Reflect.set(el, '__same', 1));
    const top = (await composer(page).boundingBox())?.y ?? -1;
    release();
    await expect(feedCards(page)).toHaveCount(3);
    expect(await bodyBox(page).evaluate((el) => Number(Reflect.get(el, '__same')))).toBe(1);
    expect(Math.abs(((await composer(page).boundingBox())?.y ?? -2) - top)).toBeLessThanOrEqual(1);
  });
});

test.describe('feed-composer c2 [FR-FEED-002] the options appear in place', () => {
  for (const { label, viewport } of SIZES) {
    for (const how of ['click', 'Tab'] as const) {
      test(`[c2] ${label}: focus into the text field by ${how} shows the options after it in F3.4 order, then "פרסום"; URL, requests, history and cards unchanged, the form keeps its place, no dialog`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const net = await feedAt(page);
        const cardsBefore = await cardTexts(page);
        const entries = await historyLength(page);
        const urlBefore = page.url();
        const top = (await composer(page).boundingBox())?.y ?? -1;
        await expect(anonToggle(page)).toHaveCount(0);
        if (how === 'click') await bodyBox(page).click();
        else {
          await page.getByRole('heading', { level: 1, name: 'הפיד' }).focus();
          await page.keyboard.press('Tab');
        }
        await expect(bodyBox(page)).toBeFocused();
        const form = composer(page);
        const parts = [bodyBox(page), anonToggle(page), audienceGroup(page), form.getByRole('radiogroup', { name: /תגית/ }), publishButton(page)];
        for (let i = 0; i + 1 < parts.length; i += 1) {
          const [a, b] = [parts[i], parts[i + 1]];
          if (a === undefined || b === undefined) throw new Error('missing part');
          await expect(a).toBeVisible();
          expect(await before(a, b), `part ${i} before part ${i + 1}`).toBe(true);
        }
        await expect(page.getByText('השם שלכם יוצג לכל מי שיכול לראות את הפוסט')).toBeVisible();
        expect(page.url()).toBe(urlBefore);
        expect(await historyLength(page)).toBe(entries);
        expect(net.cursors, 'no GET /feed on engaging').toEqual([null]);
        expect(await cardTexts(page)).toEqual(cardsBefore);
        expect(Math.abs(((await form.boundingBox())?.y ?? -2) - top), 'the form keeps its place').toBeLessThanOrEqual(1);
        expect(await before(form, feedList(page))).toBe(true);
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('alertdialog')).toHaveCount(0);
      });
    }
  }
  test('[c2] pressing an option while the text is still blank keeps the options (focus stays in the form) and selects it', async ({ page }) => {
    await feedAt(page);
    await openComposer(page);
    await choice(page, 'חברים בלבד').click();
    await expect(anonToggle(page)).toBeVisible();
    await expect(page.getByRole('radio', { name: 'חברים בלבד' })).toBeChecked();
    await anonToggle(page).check();
    await expect(anonToggle(page)).toBeChecked();
  });
  test('[c2] the options stay while focus is anywhere in the form or the text is non-blank, and hide when focus leaves a blank field', async ({ page }) => {
    await feedAt(page);
    const leave = () => page.getByRole('heading', { level: 1, name: 'הפיד' }).click();
    await openComposer(page);
    await publishButton(page).focus(); // focus moved off the text, still in the form
    await expect(anonToggle(page)).toBeVisible();
    await bodyBox(page).fill('יש כאן טקסט');
    await leave();
    await expect(anonToggle(page)).toBeVisible(); // non-blank: stays after focus left
    await bodyBox(page).fill('');
    await leave();
    await expect(anonToggle(page)).toBeHidden();
    await expect(audienceGroup(page)).toBeHidden();
    await expect(composer(page)).toBeVisible();
    await bodyBox(page).fill('   \n ');
    await leave();
    await expect(anonToggle(page)).toBeHidden(); // spaces only are blank
    await expect(bodyBox(page)).toBeVisible();
  });
});

test.describe('feed-composer c4 [FR-FEED-002] no cancel, Esc changes nothing', () => {
  test('[c4] there is no "ביטול" in the form, idle or engaged', async ({ page }) => {
    await feedAt(page);
    await expect(page.getByRole('button', { name: 'ביטול' })).toHaveCount(0);
    await openComposer(page);
    await expect(page.getByRole('button', { name: 'ביטול' })).toHaveCount(0);
  });
  test('[c4] Esc in the text, the checkbox, a radio and "פרסום" changes nothing: text, choices, focus and options stay; no confirm dialog', async ({ page }) => {
    const net = await feedAt(page);
    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.type());
      void d.dismiss();
    });
    await openComposer(page);
    await bodyBox(page).fill('טקסט שלא משתנה');
    await choice(page, 'חברים בלבד').click();
    await choice(page, 'בהריון').click();
    const spots = [bodyBox(page), anonToggle(page), page.getByRole('radio', { name: 'חברים בלבד' }), publishButton(page)];
    for (const spot of spots) {
      await spot.focus();
      await page.keyboard.press('Escape');
      await expect(spot).toBeFocused();
      await expect(bodyBox(page)).toHaveValue('טקסט שלא משתנה');
      await expect(page.getByRole('radio', { name: 'חברים בלבד' })).toBeChecked();
      await expect(page.getByRole('radio', { name: 'בהריון' })).toBeChecked();
      await expect(anonToggle(page)).not.toBeChecked();
      await expect(anonToggle(page)).toBeVisible();
    }
    expect(dialogs, 'no confirm dialog').toEqual([]);
    expect(net.creates).toEqual([]);
  });
  test('[c4] while "מפרסמים" is shown, Esc does nothing; the post then completes', async ({ page }) => {
    const net = await feedAt(page);
    let release: () => void = () => undefined;
    net.holdCreate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await openComposer(page);
    await bodyBox(page).fill('בדרך לשרת');
    await publishButton(page).click();
    await expect(page.getByRole('button', { name: 'מפרסמים', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(bodyBox(page)).toHaveValue('בדרך לשרת');
    release();
    await expect(feedCards(page)).toHaveCount(4);
    expect(net.creates).toHaveLength(1);
  });
});

test.describe('feed-composer c5 [FR-FEED-002] the composition survives leaving the feed, not the session', () => {
  async function composeAnonymous(page: Page) {
    await openComposer(page);
    await bodyBox(page).fill('שאלה רגישה שנשארת');
    await anonToggle(page).check();
  }
  async function expectKeptAnonymous(page: Page) {
    await expect(bodyBox(page)).toHaveValue('שאלה רגישה שנשארת'); // the field shows the kept text on return
    await bodyBox(page).click(); // and, on focus, the same choices
    await expect(anonToggle(page)).toBeChecked();
    await expect(audienceGroup(page)).toHaveCount(0);
  }
  for (const { label, viewport } of SIZES) {
    test(`[c5] ${label}: to a card's page and Back, or to /profile and back by the nav link: the field shows the same text and, on focus, the same choices; storage holds neither text nor flag`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await feedAt(page);
      await composeAnonymous(page);
      await timeLink(feedCards(page).first()).click();
      await expect.poll(() => pathOf(page)).toBe('/posts/e0000000-0000-4000-8000-000000000001');
      await page.goBack();
      await expect.poll(() => pathOf(page)).toBe('/feed');
      await expect(feedCards(page)).toHaveCount(3);
      await expectKeptAnonymous(page);
      expect(await storageText(page)).not.toMatch(/anonym|שאלה רגישה/i);

      await nav(page).getByRole('link', { name: 'פרופיל', exact: true }).click();
      await expect.poll(() => pathOf(page)).toBe('/profile');
      await nav(page).getByRole('link', { name: 'פיד', exact: true }).click();
      await expect.poll(() => pathOf(page)).toBe('/feed');
      await expect(feedCards(page)).toHaveCount(3);
      await expectKeptAnonymous(page);
      expect(await storageText(page)).not.toMatch(/anonym|שאלה רגישה/i);
    });
  }
  for (const [who, other] of [['the same user', false], ['another user', true]] as const) {
    test(`[c5] after sign-out and sign-in as ${who}: an empty new composition (unchecked)`, async ({ page }) => {
      const net = await feedAt(page);
      await composeAnonymous(page);
      await page.getByRole('button', { name: MENU_BUTTON }).click();
      await page.getByRole('button', { name: 'התנתקות', exact: true }).click();
      await expect.poll(() => pathOf(page)).toBe('/');
      if (other) net.sub = USER_B;
      await page.locator('main a[href="/login"]').click(); // in the app, so only the sign-out can have cleared it
      await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
      await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
      await page.getByRole('button', { name: 'התחברות', exact: true }).click();
      await expect.poll(() => pathOf(page)).not.toBe('/login');
      if (pathOf(page) !== '/feed') await nav(page).getByRole('link', { name: 'פיד', exact: true }).click();
      await expect.poll(() => pathOf(page)).toBe('/feed');
      await expect(bodyBox(page)).toHaveValue('');
      await bodyBox(page).click();
      await expect(anonToggle(page)).not.toBeChecked();
      await expect(audienceGroup(page)).toBeVisible();
    });
  }
  test('[c5] a reload gives an empty new composition (unchecked)', async ({ page }) => {
    await feedAt(page);
    await composeAnonymous(page);
    acceptLeave(page); // unsent text asks before leaving (c6); the test leaves
    await page.reload();
    await expect(feedCards(page)).toHaveCount(3);
    await expect(bodyBox(page)).toHaveValue('');
    await expect(anonToggle(page)).toBeHidden(); // idle
    await bodyBox(page).click();
    await expect(anonToggle(page)).not.toBeChecked();
    expect(await storageText(page)).not.toMatch(/anonym|שאלה רגישה/i);
  });
});

test.describe('feed-composer c6 [FR-FEED-002] the browser asks before leaving, only with unsent text', () => {
  test.use({ viewport: DESKTOP });
  /** Reloads, accepting whatever prompt appears, and returns the kinds of prompt seen. */
  async function reloadSeen(page: Page): Promise<string[]> {
    const seen: string[] = [];
    const take = (d: { type(): string; accept(): Promise<void> }) => {
      seen.push(d.type());
      void d.accept();
    };
    page.on('dialog', take);
    await page.reload();
    await expect(feedCards(page)).toHaveCount(3);
    page.off('dialog', take);
    return seen;
  }
  test('[c6] a reload with non-blank text asks', async ({ page }) => {
    await feedAt(page);
    await openComposer(page);
    await bodyBox(page).fill('לא נשלח');
    expect(await reloadSeen(page)).toEqual(['beforeunload']);
  });
  test('[c6] closing the tab with non-blank text asks', async ({ page }) => {
    await feedAt(page);
    await openComposer(page);
    await bodyBox(page).fill('לא נשלח');
    const asked = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const dialog = await asked;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.accept();
  });
  test('[c6] no prompt with an empty composer, with spaces only, after the text is erased, or right after a success', async ({ page }) => {
    await feedAt(page);
    expect(await reloadSeen(page), 'idle, nothing typed').toEqual([]);
    await openComposer(page);
    expect(await reloadSeen(page), 'engaged, nothing typed').toEqual([]);
    await openComposer(page);
    await bodyBox(page).fill('   \n  ');
    expect(await reloadSeen(page), 'spaces only').toEqual([]);
    await openComposer(page);
    await bodyBox(page).fill('נמחק');
    await bodyBox(page).fill('');
    expect(await reloadSeen(page), 'text erased').toEqual([]);
    await openComposer(page);
    await bodyBox(page).fill('נשלח');
    await publishButton(page).click();
    await expect(feedCards(page)).toHaveCount(4);
    expect(await reloadSeen(page), 'right after a success').toEqual([]);
  });
});

test.describe('feed-composer c9 [FR-FEED-002 FR-FEED-004] the new post is first, and only until the next snapshot', () => {
  const NEW = 'הפוסט החדש שלי';
  async function publishOne(page: Page) {
    await openComposer(page);
    await bodyBox(page).fill(NEW);
    await publishButton(page).click();
    await expect(feedCards(page)).toHaveCount(13);
    await expect(feedCards(page).first()).toContainText(NEW);
  }
  const newId = (net: FeedNet) => net.posts[net.posts.length - 1]?.id ?? '';

  for (const { label, viewport } of SIZES) {
    test(`[c9] ${label}: the new card stays first when the next page loads, once even if its id arrives; Back from a card page restores it first with the scroll`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const held: { net: FeedNet | null } = { net: null };
      // The server's second page carries the new post too (its own id), as a real next page may.
      const net = await feedAt(page, twoPages(() => [named(13, { id: held.net === null ? '' : newId(held.net), body: NEW }), ...range(14, 16)]), 12);
      held.net = net;
      await publishOne(page);
      await toEnd(page);
      await expect(feedCards(page)).toHaveCount(16); // 12 + the new one + 14..16 (its own id from the server is not a second card)
      await expect(feedCards(page).first()).toContainText(NEW);
      await expect(feedCards(page).first()).toHaveAttribute('aria-posinset', '1');
      expect((await cardTexts(page)).filter((t) => t.includes(NEW))).toHaveLength(1);
      expect(net.cursors).toEqual([null, 'c1']);

      // Back from another card's page: the list, the new card first and the scroll are put back.
      const target = feedCards(page).nth(14);
      await target.scrollIntoViewIfNeeded();
      const y = (await target.boundingBox())?.y ?? -1;
      await timeLink(target).click();
      await expect.poll(() => pathOf(page)).toMatch(/^\/posts\//);
      await page.goBack();
      await expect.poll(() => pathOf(page)).toBe('/feed');
      await expect(feedCards(page)).toHaveCount(16);
      await expect(feedCards(page).first()).toContainText(NEW);
      await expect.poll(async () => Math.abs(((await feedCards(page).nth(14).boundingBox())?.y ?? -2) - y)).toBeLessThanOrEqual(40);
      expect(net.cursors, 'Back asks nothing').toEqual([null, 'c1']);
      await expect(feedStatus(page)).not.toHaveText(PUBLISHED);
    });
  }
  test('[c9] the new post\'s own page shows no "הפוסט פורסם", and Back to the feed restores the new card first without repeating the status', async ({ page }) => {
    const net = await feedAt(page, () => pageOf(range(1, 12), null), 12);
    await publishOne(page);
    await expect(feedStatus(page)).toHaveText(PUBLISHED);
    await feedCards(page).first().scrollIntoViewIfNeeded();
    await timeLink(feedCards(page).first()).click();
    await expect.poll(() => pathOf(page)).toBe(`/posts/${newId(net)}`);
    await expect(main(page).getByText(NEW)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: PUBLISHED })).toHaveCount(0);
    await page.goBack();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await expect(feedCards(page).first()).toContainText(NEW);
    await expect(feedCards(page).first()).toHaveAttribute('aria-posinset', '1');
    await expect(feedStatus(page)).not.toHaveText(PUBLISHED);
    expect(net.cursors, 'Back asks nothing').toEqual([null]);
  });
  test('[c9] a reload shows only the server\'s order (the new post is not added) and no status', async ({ page }) => {
    const net = await feedAt(page, () => pageOf(range(1, 12), null), 12);
    await publishOne(page);
    await page.reload();
    await expect(feedCards(page)).toHaveCount(12);
    expect((await cardTexts(page)).filter((t) => t.includes(NEW))).toHaveLength(0);
    await expect(feedStatus(page)).not.toHaveText(PUBLISHED);
    expect(net.cursors).toEqual([null, null]);
  });
  test('[c9] going to /feed again by the nav link starts a new snapshot: only the server\'s order', async ({ page }) => {
    const net = await feedAt(page, () => pageOf(range(1, 12), null), 12);
    await publishOne(page);
    await nav(page).getByRole('link', { name: 'פרופיל', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/profile');
    await nav(page).getByRole('link', { name: 'פיד', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await expect(feedCards(page)).toHaveCount(12);
    expect((await cardTexts(page)).filter((t) => t.includes(NEW))).toHaveLength(0);
    await expect(feedStatus(page)).not.toHaveText(PUBLISHED);
    expect(net.cursors).toEqual([null, null]);
  });
  test('[c9] a `restarted` next page replaces the list: the new card is gone', async ({ page }) => {
    await feedAt(page, twoPages(() => range(100, 103), { restarted: true }), 12);
    await publishOne(page);
    await toEnd(page);
    await expect(feedCards(page)).toHaveCount(4);
    expect((await cardTexts(page)).filter((t) => t.includes(NEW))).toHaveLength(0);
  });
  test('[c9] a first-page retry shows only the server\'s order', async ({ page }) => {
    const net = await setupFeed(page, (_cursor, n) => (n === 0 ? 500 : pageOf(range(1, 3), null)));
    await openFeedAt(page, net);
    await expect(main(page).getByRole('alert')).toBeVisible();
    await openComposer(page);
    await bodyBox(page).fill(NEW);
    await publishButton(page).click();
    await expect(bodyBox(page)).toHaveValue(''); // the form resets and goes idle
    await page.getByRole('button', { name: 'נסו שוב', exact: true }).click();
    await expect(feedCards(page)).toHaveCount(3);
    expect((await cardTexts(page)).filter((t) => t.includes(NEW))).toHaveLength(0);
    expect(net.cursors).toEqual([null, null]);
    // A post sent during the first-error follows c9 (ORCHESTRATOR, lows round): the new snapshot is the server's order and focus goes to the heading.
    await expect(page.getByRole('heading', { level: 1, name: 'הפיד' })).toBeFocused();
  });
});

test.describe('feed-composer c11 [FR-FEED-002] /posts/new', () => {
  test('[c11] a Regular opening /posts/new ends on /feed with focus in the text field and the options shown; Back does not return to it; a reload shows the idle form; no page or h1 "כתיבת פוסט"', async ({ page }) => {
    const net = await setupFeed(page, FEED);
    await openFeedAt(page, net, '/feed');
    await expect(feedCards(page)).toHaveCount(3);
    await page.goto('/posts/new');
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await expect(composer(page)).toBeVisible();
    await expect(bodyBox(page)).toBeFocused();
    await expect(anonToggle(page)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'כתיבת פוסט' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'הפיד' })).toBeVisible();
    await page.goBack();
    expect(pathOf(page)).not.toBe('/posts/new');
    await page.goForward();
    await expect(feedCards(page)).toHaveCount(3);
    await page.reload();
    await expect(feedCards(page)).toHaveCount(3);
    expect(pathOf(page)).toBe('/feed');
    await expect(composer(page)).toBeVisible();
    await expect(bodyBox(page)).not.toBeFocused();
    await expect(anonToggle(page)).toBeHidden();
  });
  test('[c11] a guest opening /posts/new is turned away by the unchanged access decision (Q3: a Guest goes to /): no composer, not /posts/new', async ({ page }) => {
    await setupFeed(page, FEED);
    await page.goto('/posts/new');
    await expect.poll(() => pathOf(page)).toBe('/');
    await expect(composer(page)).toHaveCount(0);
    await expect(bodyBox(page)).toHaveCount(0);
  });
  // Amended by professional-posting c10 (Afik 19.10): a Professional has the composer, so /posts/new ends on /feed with focus in the text field.
  test('[c11][professional-posting c10] a Professional opening /posts/new ends on /feed with focus in the text field "מה תרצו לשתף?": the form is there, no page named "כתיבת פוסט"', async ({ page }) => {
    const net = await setupFeed(page, FEED, { professional: true });
    await openFeedAt(page, net, '/posts/new');
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await expect(composer(page)).toBeVisible();
    await expect(bodyBox(page)).toBeFocused();
    await expect(page.getByRole('heading', { level: 1, name: 'כתיבת פוסט' })).toHaveCount(0);
    await expect(main(page).getByText('המסך הזה ייפתח בקרוב.')).toHaveCount(0);
    await expect(page.getByText('הפעולה אינה זמינה')).toHaveCount(0);
  });
});

test.describe('feed-composer c12 [NFR-A11Y-001] size, motion and order', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c12] ${label}: "פרסום" is at least 44x44 px, idle and engaged`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await feedAt(page);
      for (const engaged of [false, true]) {
        if (engaged) await openComposer(page);
        const box = await publishButton(page).boundingBox();
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
    });
  }
  test('[c12] reduced motion: nothing in the page animates or transitions, idle or engaged', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await feedAt(page);
    const running = () =>
      main(page).evaluate((root) => {
        const nonZero = (value: string) => value.split(',').some((part) => Number.parseFloat(part.trim()) > 0);
        return [root, ...Array.from(root.querySelectorAll('*'))]
          .filter((el) => {
            const cs = getComputedStyle(el);
            return nonZero(cs.animationDuration) || nonZero(cs.transitionDuration);
          })
          .map((el) => el.tagName);
      });
    expect(await running()).toEqual([]);
    await openComposer(page);
    expect(await running()).toEqual([]);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
  test('[c12] otherwise the reveal of the options takes at most 250 ms (no longer animation or transition than that)', async ({ page }) => {
    await feedAt(page);
    await bodyBox(page).click();
    const longest = await page.evaluate(() =>
      Math.max(0, ...document.getAnimations().map((a) => {
        const t = a.effect?.getTiming();
        return Number(t?.duration ?? 0) + Number(t?.delay ?? 0);
      })),
    );
    expect(longest).toBeLessThanOrEqual(250);
    await expect(anonToggle(page)).toBeVisible();
  });
  test('[c12] Tab order: the text field first, then (options shown on focus) the options and "פרסום", then straight into the first card — no other stop', async ({ page }) => {
    await feedAt(page);
    await page.getByRole('heading', { level: 1, name: 'הפיד' }).focus();
    await page.keyboard.press('Tab');
    await expect(bodyBox(page)).toBeFocused();
    const stops: string[] = [];
    for (let i = 0; i < 6 && !(await publishButton(page).evaluate((el) => el === document.activeElement)); i += 1) {
      await page.keyboard.press('Tab');
      stops.push(await page.locator('*:focus').evaluate((el) => el.getAttribute('aria-label') ?? el.closest('label')?.textContent?.trim() ?? el.tagName));
    }
    await expect(publishButton(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('article:has(*:focus), article:focus').first()).toContainText('גוף הפוסט 1');
    expect(stops.length).toBe(5); // presses: the checkbox, the audience group, the tag group, "הוספת תמונה" (I5), then "פרסום" — nothing else (I11-C §13.1, OP-038: no help marking)
  });
});

test.describe('feed-composer c7 [FR-FEED-002] sent before the first page arrived', () => {
  test('[c7] a post sent while the first page is still loading shows its card (focused, with the status) above the list', async ({ page }) => {
    const net = await setupFeed(page, FEED);
    let release: () => void = () => undefined;
    net.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await openFeedAt(page, net);
    await expect(feedCards(page)).toHaveCount(0);
    await openComposer(page);
    await bodyBox(page).fill('נשלח מוקדם');
    await publishButton(page).click();
    const mine = page.getByRole('article').filter({ hasText: 'נשלח מוקדם' });
    await expect(mine).toBeVisible();
    await expect(mine).toBeFocused();
    await expect(feedStatus(page)).toHaveText(PUBLISHED);
    expect(net.creates).toHaveLength(1);
    expect(await before(composer(page), mine), 'the card is below the form').toBe(true);
    release();
    // The first page arrives: the post sent during the first load stays first, keeps focus and the status (c7).
    await expect(feedCards(page)).toHaveCount(4);
    await expect(feedCards(page).first()).toContainText('נשלח מוקדם');
    await expect(feedCards(page).first()).toHaveAttribute('aria-posinset', '1');
    await expect(feedCards(page).first()).toBeFocused();
    await expect(feedStatus(page)).toHaveText(PUBLISHED);
  });
});

test.describe('feed-composer c3 [FR-FEED-002] sending carried into the always-open form', () => {
  test('[c3 F3.1 c14] idle form, blank text, a pointer press on "פרסום" shows the empty-text message and focuses the field; nothing is sent', async ({ page }) => {
    const net = await feedAt(page);
    await expect(anonToggle(page)).toHaveCount(0);
    await publishButton(page).click();
    await expect(page.getByText('יש לכתוב משהו לפני הפרסום')).toBeVisible();
    await expect(bodyBox(page)).toBeFocused();
    await expect(bodyBox(page)).toHaveAttribute('aria-invalid', 'true');
    expect(net.creates).toEqual([]);
  });
  async function leaveAndReturn(page: Page) {
    await nav(page).getByRole('link', { name: 'פרופיל', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/profile');
    await nav(page).getByRole('link', { name: 'פיד', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/feed');
  }
  test('[c3 F3.1 c16] leaving the feed during "מפרסמים" and returning: still "מפרסמים", no second request, a newer draft is not wiped when the first post completes', async ({ page }) => {
    const net = await feedAt(page);
    let release: () => void = () => undefined;
    net.holdCreate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await openComposer(page);
    await bodyBox(page).fill('הטיוטה הראשונה');
    await publishButton(page).click();
    await expect(page.getByRole('button', { name: 'מפרסמים', exact: true })).toBeDisabled();
    await leaveAndReturn(page);
    await expect(feedCards(page)).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'מפרסמים', exact: true })).toBeDisabled();
    expect(net.creates, 'no second request').toHaveLength(1);
    await bodyBox(page).fill('טיוטה חדשה');
    release();
    await expect.poll(() => net.posts.length).toBeGreaterThan(2);
    await expect(page.getByRole('button', { name: 'פרסום', exact: true })).toBeEnabled();
    await expect(bodyBox(page)).toHaveValue('טיוטה חדשה');
    expect(net.creates).toHaveLength(1);
  });
  test('[c3 F3.1 c16] a post that fails after leaving the feed: the draft returns in the form', async ({ page }) => {
    const net = await feedAt(page);
    let release: () => void = () => undefined;
    net.holdCreate = new Promise<void>((resolve) => {
      release = resolve;
    });
    net.create = 500;
    await openComposer(page);
    await bodyBox(page).fill('הטיוטה שחוזרת');
    await publishButton(page).click();
    await expect(page.getByRole('button', { name: 'מפרסמים', exact: true })).toBeDisabled();
    await leaveAndReturn(page);
    release();
    await expect(page.getByRole('button', { name: 'פרסום', exact: true })).toBeEnabled();
    await expect(bodyBox(page)).toHaveValue('הטיוטה שחוזרת');
    expect(net.creates).toHaveLength(1);
  });
});
