// I3 F3.2b (real browser, real session source, network stubbed). Derived from .work/feed-view/spec.md criteria 13-20 and screen.md (roles and
// Hebrew names) only; the unit-tagged criteria (14, 15, 17) are asserted here on the real DOM (ORCHESTRATOR, Gate 1: one layer, no component
// name in screen.md). The stub plays the server: e2e/support/feed-stub.ts. Visual baselines: none (no story ids; debt recorded by ORCHESTRATOR).
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { EMAIL, main, scan } from './support/journeys-stub';
import { EMPTY, anonymous, id, named, originalOf, pageOf, range, setupFeed, share } from './support/feed-stub';
import type { FeedNet } from './support/feed-stub';
import type { StoredPost } from './support/posts-stub';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;
// The feed load-failure text (screen.md, screen challenge 3, ERR-004).
const LOAD_FAILED = 'לא הצלחנו לטעון את הפיד. אפשר לנסות שוב';

/** Signs in (the landing page's own feed request is not recorded), then opens the feed afresh. */
async function open(page: Page, net: FeedNet, path = '/feed'): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.waitForLoadState('networkidle');
  net.armed = true;
  await page.goto(path);
}
const list = (page: Page) => page.getByRole('feed', { name: 'פוסטים בפיד' });
const cards = (page: Page) => list(page).getByRole('article');
const retry = (page: Page) => page.getByRole('button', { name: 'נסו שוב', exact: true });
const loadedStatus = (page: Page) => page.getByRole('status').filter({ hasText: /^(נטענו \d+ פוסטים נוספים|נטען פוסט אחד נוסף)$/ });
const toEnd = (page: Page) => cards(page).last().scrollIntoViewIfNeeded();
const holdNext = (net: FeedNet): (() => void) => {
  let release = (): void => undefined;
  net.hold = new Promise<void>((resolve) => {
    release = () => {
      net.hold = null;
      resolve();
    };
  });
  return release;
};
/** Two pages: 1..12 then `second` after cursor "c+1/=" (an opaque value that needs URL-encoding); later pages are empty. */
const twoPages = (second: ReturnType<typeof range>, extra = {}): FeedNet['answer'] => (cursor) =>
  cursor === null ? pageOf(range(1, 12), 'c+1/=') : pageOf(second, null, extra);
const timeLink = (card: Locator) => card.locator('a:has(time)');
/** Any button that is not a card's like, the "חזרה למעלה" or the composer's "פרסום" (taller cards now reach its threshold): a "more" control would be one (F3.2b c18: none). */
// F3.9 c8 amendment: every card also has its "⋯" menu button ("פעולות נוספות לפוסט"); it is not a "load more" control.
const moreButtons = (page: Page) => main(page).getByRole('button', { name: /^(?!לייק|חזרה למעלה|פרסום|פעולות נוספות לפוסט|שיתוף בפיד|שיתוף קישור|תגובות|שליחה|פעולות נוספות לתגובה)/ }); // ux-polish-a: the comments button, the field's "שליחה" and the comment "⋯" belong to the card
const hasLinkTo = (card: Locator, href: string) => expect(timeLink(card)).toHaveAttribute('href', href);

test.describe('F3.2b c13 [FR-FEED-001] the landing route', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c13] ${label}: main, h1 "הפיד", the form "כתיבת פוסט" above the list, cards in server order, the only product request is GET /feed; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupFeed(page, () => pageOf([named(3), named(1), named(2)], null));
      await open(page, net);
      await expect(page.getByRole('heading', { level: 1, name: 'הפיד', exact: true })).toBeVisible();
      await expect(main(page)).toBeVisible();
      await expect(cards(page)).toHaveCount(3);
      expect(await cards(page).evaluateAll((els) => els.map((e) => e.textContent?.match(/גוף הפוסט \d/)?.[0]))).toEqual(['גוף הפוסט 3', 'גוף הפוסט 1', 'גוף הפוסט 2']);
      const write = page.getByRole('form', { name: 'כתיבת פוסט' }); // feed-composer c1: the always-open form, no button or link
      await expect(write).toBeVisible();
      await expect(page.getByRole('button', { name: 'כתיבת פוסט' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'כתיבת פוסט' })).toHaveCount(0);
      const [w, l] = [await write.boundingBox(), await list(page).boundingBox()];
      expect(w?.y ?? 0).toBeLessThan(l?.y ?? 0);
      expect(net.methods).toEqual(['GET']);
      expect(new Set(net.apiPaths)).toEqual(new Set(['/api/me', '/api/profile', '/api/feed', '/api/stories', '/api/admin/access', '/api/notifications'])); // I5: the Stories tray loads with the feed; I4: the menu asks whether the account is staff; I7: the bell
      await scan(page);
    });
  }
  // Amended by professional-posting c12 (Afik 19.10, DR-1): a Professional reads the feed. Supersedes F3.2b c13 ("a Professional still sees the placeholder").
  test('[c13][professional-posting c12] a Professional sees the list, not the placeholder: the cards are there and no alert', async ({ page }) => {
    const net = await setupFeed(page, () => pageOf(range(1, 3), null), { professional: true });
    await open(page, net);
    await expect(page.getByRole('heading', { level: 1, name: 'הפיד', exact: true })).toBeVisible();
    await expect(cards(page)).toHaveCount(3);
    await page.waitForTimeout(500); // the profile check answers after the list; the placeholder must not appear later
    await expect(main(page).getByText('המסך הזה ייפתח בקרוב.')).toHaveCount(0);
    await expect(main(page).getByRole('alert')).toHaveCount(0);
    await expect(cards(page)).toHaveCount(3);
    expect(net.methods.every((m) => m === 'GET')).toBe(true);
  });
  test('[c13][c14] keyboard: after the composer’s "פרסום" the Tab order is, per card in server order, "לייק", then "תגובות", then "שיתוף בפיד", then "שיתוף קישור", then its time link, then its "⋯" menu button (screen.md; F3.9 c8, F3.5 and F3.6 amend F3.2b); the focus is visible', async ({ page }) => {
    const net = await setupFeed(page, () => pageOf(range(1, 4), null));
    await open(page, net);
    await expect(cards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'פרסום', exact: true }).focus();
    // A card may take a stop of its own (APG feed: tabindex 0): such stops (the article itself) are dropped.
    const stops: string[] = [];
    for (let i = 0; i < 120 && stops.length < 32; i += 1) {
      await page.keyboard.press('Tab');
      const at = await page.locator('*:focus').evaluate((e) => {
        const st = getComputedStyle(e);
        return { tag: e.tagName, href: e.getAttribute('href'), ring: st.outlineStyle !== 'none' && st.outlineWidth !== '0px' };
      });
      expect(at.ring, 'visible focus').toBe(true);
      if (at.tag !== 'ARTICLE') stops.push(at.href ?? at.tag);
    }
    expect(stops).toEqual([1, 2, 3, 4].flatMap((n) => ['BUTTON', 'BUTTON', 'BUTTON', 'BUTTON', `/posts/${id(n)}`, 'BUTTON', 'TEXTAREA', 'BUTTON'])); // F3.5 c9, F3.6 c3: "שיתוף בפיד" and "שיתוף קישור" follow "תגובות"; F3.9 c8: the "⋯" button follows the time link; ux-polish-a c9: "תגובות" is a BUTTON and the field and "שליחה" close the card
  });
});

test.describe('F3.2b c14 c15 c17 [FR-FEED-001 BR-065] the card', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c14][c15] ${label}: a named card — author, audience, tag, plain-text body, the time link only, no button; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const body = 'שורה ראשונה\nשורה שניה <script>alert(1)</script>';
      const net = await setupFeed(page, () =>
        pageOf([
          named(1, { author: { name: 'דנה כהן' }, audience: 'friends', stageTag: 'pregnant', body, createdAt: '2026-06-14T09:30:00.000Z' }),
          named(2, { author: { name: null } }),
          named(3),
        ], null));
      await open(page, net);
      await expect(cards(page)).toHaveCount(3);
      await expect(list(page)).toHaveAttribute('role', 'feed');
      for (let i = 0; i < 3; i += 1) {
        const c = cards(page).nth(i);
        await expect(c).toHaveAttribute('aria-posinset', String(i + 1));
        await expect(c).toHaveAttribute('aria-setsize', '-1');
        await expect(c.getByRole('button')).toHaveCount(i === 0 ? 4 : 6); // ux-polish-a c9: the comments button and the field's "שליחה" join; F3.3 c13 + F3.9 c8: the like and the "⋯" menu button; F3.5 c9 + F3.6 c3: a card that is for everyone and not mine adds "שיתוף בפיד" and "שיתוף קישור" (card 1 is friends-only)
        await expect(c.getByRole('link')).toHaveCount(1); // the time link only: ux-polish-a c9 made "תגובות" a button
        await expect(timeLink(c)).toHaveAttribute('href', `/posts/${id(i + 1)}`);
        await expect(c.locator('img, [role="img"]')).toHaveCount(0);
        await expect(c.locator('time')).toHaveCount(1);
      }
      const first = cards(page).first();
      await expect(page.getByRole('article', { name: 'דנה כהן', exact: true })).toHaveCount(1);
      await expect(first.locator('time')).toHaveAttribute('datetime', '2026-06-14T09:30:00.000Z');
      await expect(timeLink(first).locator('time')).toHaveCount(1);
      await expect(first).toContainText('חברים בלבד');
      await expect(first).toContainText('בהריון');
      const text = first.locator('[dir="auto"]');
      expect(await text.innerText()).toContain('שורה ראשונה\nשורה שניה <script>alert(1)</script>');
      await expect(main(page).locator('script')).toHaveCount(0);
      await expect(page.getByRole('article', { name: 'מהקהילה', exact: true })).toHaveCount(1);
      await expect(cards(page).nth(2)).toContainText('כולם');
      for (const label2 of ['מתכננים', 'בהריון', 'יש לנו ילד או ילדה']) await expect(cards(page).nth(2)).not.toContainText(label2);
      await expect(page.getByText(/^\d+$/)).toHaveCount(0); // no counts
      await scan(page);
    });
    test(`[c17] ${label}: a share — sharer text above the quote with the original's header; a gone original says so and stays listed`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupFeed(page, () => pageOf([share(1, originalOf(5)), share(2, { available: false }), named(3)], null));
      await open(page, net);
      await expect(cards(page)).toHaveCount(3);
      const a = cards(page).nth(0);
      await expect(page.getByRole('article', { name: 'כותבת מספר 1', exact: true })).toHaveCount(1);
      const quote = a.locator('blockquote');
      await expect(quote).toHaveCount(1);
      await expect(quote).toContainText('גוף המקור 5');
      await expect(quote).toContainText('מחברת המקור 5');
      await expect(quote).toContainText('כולם');
      await expect(quote.locator('time')).toHaveCount(1);
      await expect(quote.getByRole('link')).toHaveCount(0);
      await expect(quote.locator('img')).toHaveCount(0);
      const sharer = a.getByText('מה שהוספתי 1', { exact: true });
      expect(await sharer.evaluate((s, q) => Boolean(s.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING), await quote.elementHandle())).toBe(true);
      await expect(a.getByRole('button')).toHaveCount(6); // ux-polish-a c9 adds the comments button and the field's "שליחה"; the like and the "⋯" menu button (F3.9 c8), "שיתוף בפיד" and "שיתוף קישור" of its available everyone original (F3.5 c9, F3.6 c3)
      const gone = cards(page).nth(1);
      await expect(gone).toContainText('הפוסט המקורי כבר לא זמין');
      await expect(gone.locator('blockquote')).toHaveCount(0);
      await expect(gone).toContainText('מה שהוספתי 2');
      await expect(gone.getByRole('button')).toHaveCount(4); // ux-polish-a c9: comments and "שליחה" join; a gone original does not take the share's own like away (the like and the "⋯" menu button, F3.9 c8)
      await scan(page);
    });
  }
});

test.describe('F3.2b c16 [BR-062] the anonymous unit', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c16] ${label}: in server order, header "אנונימי", no name, avatar or link but the time; nothing author-related in the DOM`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupFeed(page, () => pageOf([named(1), anonymous(2), named(3)], null));
      await open(page, net);
      await expect(cards(page)).toHaveCount(3);
      expect(await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-labelledby') !== null))).toEqual([true, true, true]);
      await expect(page.getByRole('article', { name: 'אנונימי', exact: true })).toHaveCount(1);
      const a = cards(page).nth(1);
      await expect(a).toContainText('גוף הפוסט 2');
      await expect(a.getByRole('link')).toHaveCount(1); // the time link only (ux-polish-a c9): no author link
      await expect(a.locator('img, [role="img"], svg:not([aria-hidden="true"])')).toHaveCount(0);
      await expect(a).not.toContainText('מהקהילה');
      await expect(a).not.toContainText('כותבת מספר 2');
      const ids = await a.evaluate((el) => [el, ...el.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid') ?? ''));
      expect(ids.filter((t) => /author|name|avatar|user/i.test(t))).toEqual([]);
      await scan(page);
    });
  }
  test('[c16] an anonymous unit that carries an author (a malformed answer) never puts the name in the page', async ({ page }) => {
    const net = await setupFeed(page, () => pageOf([named(1), anonymous(2, { author: { name: 'דנה סודית' } })], null));
    await open(page, net);
    await expect(page.getByRole('heading', { level: 1, name: 'הפיד', exact: true })).toBeVisible();
    await page.waitForTimeout(500); // the answer is read asynchronously; the name must not appear later
    expect(await page.content()).not.toContain('דנה סודית');
  });
});

test.describe('F3.2b c18 [FR-FEED-004] infinite scroll', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c18] ${label}: the end of the list requests the next page with the cursor, busy only while loading, one polite status, de-duplicated; no more button, no footer`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupFeed(page, twoPages([named(12), ...range(13, 16)]));
      await open(page, net);
      await expect(cards(page)).toHaveCount(12);
      await expect(list(page)).not.toHaveAttribute('aria-busy', 'true');
      await expect(moreButtons(page)).toHaveCount(0);
      await expect(main(page).locator('footer')).toHaveCount(0);
      const release = holdNext(net);
      await toEnd(page);
      await expect(list(page)).toHaveAttribute('aria-busy', 'true');
      release();
      await expect(cards(page)).toHaveCount(16); // id 12 came twice and is shown once
      await expect(list(page)).not.toHaveAttribute('aria-busy', 'true');
      await expect(loadedStatus(page)).toHaveText('נטענו 4 פוסטים נוספים');
      await expect(loadedStatus(page)).toHaveCount(1);
      expect(net.cursors).toEqual([null, 'c+1/=']);
      await expect(moreButtons(page)).toHaveCount(0);
      await expect(main(page).locator('footer')).toHaveCount(0);
      await scan(page);
    });
  }
  test('[c18] rapid scroll while a page loads sends one request; focus stays; new cards follow in tab order; nothing is requested after the last page', async ({ page }) => {
    const net = await setupFeed(page, twoPages(range(13, 16)));
    await open(page, net);
    await expect(cards(page)).toHaveCount(12);
    const keep = timeLink(cards(page).nth(2));
    await keep.focus();
    const release = holdNext(net);
    for (let i = 0; i < 5; i += 1) await toEnd(page);
    await expect(list(page)).toHaveAttribute('aria-busy', 'true');
    expect(net.cursors).toHaveLength(2);
    release();
    await expect(cards(page)).toHaveCount(16);
    await expect(keep).toBeFocused();
    await cards(page).nth(11).getByRole('button', { name: 'שליחה', exact: true }).focus(); // ux-polish-a c9: the field's "שליחה" is the last stop of a card
    // The next stop is the new card 13 itself or its link (a card may take a stop of its own).
    await page.keyboard.press('Tab');
    await expect(page.locator('article:has(*:focus), article:focus')).toContainText('גוף הפוסט 13');
    for (let i = 0; i < 3; i += 1) await toEnd(page);
    await page.waitForTimeout(500); // a generous bound: a request after nextCursor null would have been sent by now
    expect(net.cursors).toHaveLength(2);
    await expect(loadedStatus(page)).toHaveCount(1);
  });
  test('[c18] one new post after de-duplication is announced in the singular', async ({ page }) => {
    const net = await setupFeed(page, twoPages([named(12), named(13)]));
    await open(page, net);
    await expect(cards(page)).toHaveCount(12);
    await toEnd(page);
    await expect(cards(page)).toHaveCount(13);
    await expect(loadedStatus(page)).toHaveText('נטען פוסט אחד נוסף');
  });
  test('[c18] restarted:true replaces the list', async ({ page }) => {
    const net = await setupFeed(page, twoPages(range(100, 103), { restarted: true }));
    await open(page, net);
    await expect(cards(page)).toHaveCount(12);
    await toEnd(page);
    await expect(cards(page)).toHaveCount(4);
    await expect(page.getByText('גוף הפוסט 1', { exact: true })).toHaveCount(0);
    await expect(page.getByText('גוף הפוסט 100', { exact: true })).toHaveCount(1);
  });
});

test.describe('F3.2b c19 [ERR-004 ERR-027] first load, empty, errors', () => {
  test('[c19] first load: skeleton, no spinner; under reduced motion nothing animates', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const net = await setupFeed(page, () => pageOf(range(1, 3), null));
    const release = holdNext(net);
    await open(page, net);
    await expect(page.getByRole('heading', { level: 1, name: 'הפיד', exact: true })).toBeVisible();
    await expect.poll(() => net.cursors.length).toBe(1);
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    // The skeleton: a busy region of decorative blocks (aria-hidden) that takes room on the screen.
    const blocks = main(page).locator('[aria-busy="true"] [aria-hidden="true"]');
    expect(await blocks.count()).toBeGreaterThanOrEqual(3);
    await expect(blocks.first()).toBeVisible();
    expect((await blocks.first().boundingBox())?.height ?? 0).toBeGreaterThan(0);
    const animated = await main(page).evaluate((m) => [m, ...m.querySelectorAll('*')].filter((e) => getComputedStyle(e).animationName !== 'none').length);
    expect(animated).toBe(0);
    release();
    await expect(cards(page)).toHaveCount(3);
  });
  for (const { label, viewport } of SIZES) {
    test(`[c19] ${label}: empty — the text with no action of its own, the form "כתיבת פוסט" above it, an aria-hidden SVG; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupFeed(page, () => EMPTY);
      await open(page, net);
      await expect(main(page).getByText('עוד אין פוסטים בפיד', { exact: true })).toBeVisible();
      const form = main(page).getByRole('form', { name: 'כתיבת פוסט' }); // feed-composer c1: the form, in its place, is the only action
      await expect(form).toBeVisible();
      const [f, t] = [await form.boundingBox(), await main(page).getByText('עוד אין פוסטים בפיד', { exact: true }).boundingBox()];
      expect(f?.y ?? 0).toBeLessThan(t?.y ?? 0);
      await expect(main(page).getByRole('button', { name: 'כתיבת פוסט' })).toHaveCount(0);
      await expect(main(page).getByRole('link', { name: 'כתיבת פוסט' })).toHaveCount(0);
      await expect(main(page).getByRole('button')).toHaveCount(1); // the form's "פרסום" is the only button in the empty feed
      await expect(moreButtons(page)).toHaveCount(0);
      await expect(main(page).locator('svg[aria-hidden="true"]')).not.toHaveCount(0);
      await expect(cards(page)).toHaveCount(0);
      await scan(page);
    });
    test(`[c19] ${label}: a first-page error shows an alert and "נסו שוב", which asks for the first page again; axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupFeed(page, (_c, n) => (n === 0 ? 500 : pageOf(range(1, 3), null)));
      await open(page, net);
      const alert = main(page).getByRole('alert');
      await expect(alert).toContainText(LOAD_FAILED);
      expect(await alert.innerText()).not.toMatch(/500|internal|error|undefined|fetch|zod/i);
      await scan(page);
      await retry(page).click();
      await expect(cards(page)).toHaveCount(3);
      await expect(main(page).getByRole('alert')).toHaveCount(0);
      expect(net.cursors).toEqual([null, null]);
    });
    test(`[c19] ${label}: a later-page error keeps the cards, the alert follows the last one, "נסו שוב" re-sends the same cursor`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupFeed(page, (cursor, n) => (cursor === null ? pageOf(range(1, 12), 'c1') : n === 1 ? 500 : pageOf(range(13, 15), null)));
      await open(page, net);
      await expect(cards(page)).toHaveCount(12);
      await toEnd(page);
      const alert = main(page).getByRole('alert');
      await expect(alert).toContainText(LOAD_FAILED);
      await expect(cards(page)).toHaveCount(12);
      expect(await cards(page).last().evaluate((c, a) => Boolean(c.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING), await alert.elementHandle())).toBe(true);
      await scan(page);
      await retry(page).click();
      await expect(cards(page)).toHaveCount(15);
      await expect(main(page).getByRole('alert')).toHaveCount(0);
      expect(net.cursors).toEqual([null, 'c1', 'c1']);
    });
  }
});

test.describe('F3.2b c20 [FR-FEED-004] back, reload, to top', () => {
  const stored = (n: number): StoredPost => ({ id: id(n), body: `גוף הפוסט ${n}`, audience: 'everyone', stageTag: null, createdAt: '2026-06-14T09:00:00.000Z', isMine: false });
  const pages = (): FeedNet['answer'] => (cursor) => (cursor === null ? pageOf(range(1, 12), 'c1') : cursor === 'c1' ? pageOf(range(13, 24), null) : EMPTY);
  for (const { label, viewport } of SIZES) {
    test(`[c20] ${label}: back from /posts/:id keeps the loaded cards and the scroll; a reload starts anew`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupFeed(page, pages(), { posts: [stored(20)] });
      await open(page, net);
      await expect(cards(page)).toHaveCount(12);
      await toEnd(page);
      await expect(cards(page)).toHaveCount(24);
      const target = cards(page).nth(19);
      await target.scrollIntoViewIfNeeded();
      const before = (await target.boundingBox())?.y ?? -1;
      await hasLinkTo(target, `/posts/${id(20)}`);
      await timeLink(target).click();
      await expect.poll(() => pathOf(page)).toBe(`/posts/${id(20)}`);
      await expect(page.getByRole('heading', { level: 1, name: 'פוסט', exact: true })).toBeVisible(); // the post page is rendered (the URL changes before the feed unmounts)
      await page.goBack();
      await expect.poll(() => pathOf(page)).toBe('/feed');
      await expect(cards(page)).toHaveCount(24);
      // The scroll is put back right after the cards render: poll, do not sample once.
      await expect.poll(async () => Math.abs(((await cards(page).nth(19).boundingBox())?.y ?? -2) - before)).toBeLessThanOrEqual(40);
      expect(net.cursors).toEqual([null, 'c1']);
      await page.reload();
      await expect(cards(page)).toHaveCount(12);
      expect(net.cursors).toEqual([null, 'c1', null]);
    });
    test(`[c20] ${label}: "חזרה למעלה" only after a long scroll, 44x44, moves focus to the heading`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await setupFeed(page, pages());
      await open(page, net);
      await expect(cards(page)).toHaveCount(12);
      const top = page.getByRole('button', { name: 'חזרה למעלה', exact: true });
      await expect(top).toHaveCount(0);
      await toEnd(page);
      await expect(cards(page)).toHaveCount(24);
      await toEnd(page);
      await expect(top).toBeVisible();
      const box = await top.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      await top.click();
      await expect(page.getByRole('heading', { level: 1, name: 'הפיד', exact: true })).toBeFocused();
    });
  }

  for (const width of [1024, 1280]) {
    test(`[c20] ${width}px: after a long scroll the "חזרה למעלה" box does not intersect main's box; icon-only from 1024 to 1279 with the name, text from 1280`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const net = await setupFeed(page, pages());
      await open(page, net);
      await expect(cards(page)).toHaveCount(12);
      await toEnd(page);
      await expect(cards(page)).toHaveCount(24);
      await toEnd(page);
      const top = page.getByRole('button', { name: 'חזרה למעלה', exact: true });
      await expect(top).toBeVisible();
      const [b, m] = [await top.boundingBox(), await main(page).boundingBox()];
      expect(b).not.toBeNull();
      expect(m).not.toBeNull();
      const [bb, mm] = [b ?? { x: 0, y: 0, width: 0, height: 0 }, m ?? { x: 0, y: 0, width: 0, height: 0 }];
      const apart = bb.x + bb.width <= mm.x || mm.x + mm.width <= bb.x || bb.y + bb.height <= mm.y || mm.y + mm.height <= bb.y;
      expect(apart, `button ${JSON.stringify(bb)} vs main ${JSON.stringify(mm)}`).toBe(true);
      const visibleText = (await top.innerText()).trim();
      if (width < 1280) expect(visibleText, 'icon-only').toBe('');
      else expect(visibleText).toContain('חזרה למעלה');
    });
  }
});
