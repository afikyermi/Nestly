// I3 F3.7 report (real browser, network stubbed): the entry points on the feed card, the shared sheet/window primitive, the report sheet and its outcomes.
// Derived from .work/report/spec.md criteria 9-13 and 15 and .work/report/screen.md (roles and Hebrew names) only. The stubs play the server:
// e2e/support/feed-stub.ts (the feed), report-stub.ts (POST /api/reports). The post page and the comments are e2e/report-post-comments.spec.ts; the
// profile button and the rules page are e2e/report-profile-rules.spec.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { EMAIL, scan } from './support/journeys-stub';
import { anonymous, id, named, originalOf, pageOf, range, setupFeed, share } from './support/feed-stub';
import type { FeedNet, Unit } from './support/feed-stub';
import type { StoredPost } from './support/posts-stub';
import { gate, stubReports } from './support/report-stub';
import type { ReportsNet } from './support/report-stub';
import {
  KEYS, REASONS, T, TITLE, cancelButton, choose, detailsBox, expectFocusIn, expectFocusRing, expectTouchTarget, menu, radios, scrollY, sendButton, sheet, status,
} from './support/report-ui';
import { afterPaint } from './support/post-menu';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;

const stored = (n: number): StoredPost => ({ id: id(n), body: `גוף הפוסט ${n}`, audience: 'everyone', stageTag: null, createdAt: '2026-06-14T09:00:00.000Z', isMine: false });
/** 1 named, 2 anonymous, 3 a share (its original is not reportable from it), 4 mine, 5 named. */
const mixed = (): Unit[] => [named(1), anonymous(2), share(3, originalOf(9)), named(4, { isMine: true }), named(5)];

async function start(page: Page, items: Unit[] = mixed()): Promise<{ feed: FeedNet; reports: ReportsNet }> {
  const feed = await setupFeed(page, () => pageOf(items, null), { posts: items.map((_u, i) => stored(i + 1)) });
  const reports = await stubReports(page);
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.waitForLoadState('networkidle');
  feed.armed = true;
  await page.goto('/feed');
  await expect(cards(page).first()).toBeVisible();
  return { feed, reports };
}
const cards = (page: Page) => page.getByRole('feed', { name: 'פוסטים בפיד' }).getByRole('article');
const more = (card: ReturnType<typeof cards>) => card.getByRole('button', { name: T.moreOfPost, exact: true });
const reportItem = (page: Page) => page.getByRole('menuitem', { name: T.reportPost, exact: true });
/** Opens the report sheet from card `n` (0-based) with the mouse. */
async function openFrom(page: Page, n: number): Promise<void> {
  await more(cards(page).nth(n)).click();
  await reportItem(page).click();
  await expect(sheet(page, 'post')).toBeVisible();
}

test.describe('F3.7 c9 [FR-MOD-001] the entry point on the feed card', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c9] ${label}: "דיווח על הפוסט" is in the "⋯" menu of every card that is not mine (named, anonymous, share), and not in mine`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      for (const n of [0, 1, 2, 4]) {
        await more(cards(page).nth(n)).click();
        await expect(menu(page)).toBeVisible();
        await expect(reportItem(page)).toHaveCount(1);
        await page.keyboard.press('Escape');
        await expect(menu(page)).toHaveCount(0);
      }
      await more(cards(page).nth(3)).click();
      await expect(menu(page)).toBeVisible();
      await expect(reportItem(page)).toHaveCount(0);
      await expect(menu(page).getByRole('menuitem', { name: 'עריכת הפוסט', exact: true })).toHaveCount(1); // F3.9's own-card items stay
    });
    test(`[c9] ${label}: Esc, an outside click and Back each close the menu with focus back on its "⋯"; Back stays in the feed`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      const button = more(cards(page).nth(0));
      for (const close of ['Escape', 'outside', 'Back'] as const) {
        await button.click();
        await expect(menu(page)).toBeVisible();
        await afterPaint(page);
        if (close === 'Escape') await page.keyboard.press('Escape');
        else if (close === 'outside') await page.mouse.click(5, 5);
        else await page.goBack();
        await expect(menu(page), close).toHaveCount(0);
        expect(pathOf(page), close).toBe('/feed');
        await expect(button, close).toBeFocused();
      }
    });
  }
});

test.describe('F3.7 c10 [direction "דפוסי אינטראקציה"] the shared sheet / window', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c10] ${label}: a dialog with aria-modal; a bottom sheet below 1024 px, a small centred window from 1024 px; the page behind is blurred 4px and inert`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      await openFrom(page, 0);
      const box = sheet(page, 'post');
      await expect(box).toHaveAttribute('aria-modal', 'true');
      await expect(page.getByRole('heading', { level: 2, name: TITLE.post, exact: true })).toBeVisible();
      const rect = await box.boundingBox();
      expect(rect).not.toBeNull();
      const r = rect ?? { x: 0, y: 0, width: 0, height: 0 };
      if (viewport.width < 1024) {
        expect(Math.round(r.y + r.height), 'its bottom edge is the screen bottom').toBe(viewport.height);
        expect(Math.round(r.width), 'full width').toBe(viewport.width);
      } else {
        expect(r.width, 'a small window').toBeLessThan(viewport.width / 2 + 1);
        expect(Math.abs(r.x + r.width / 2 - viewport.width / 2), 'centred across').toBeLessThanOrEqual(2);
        expect(Math.abs(r.y + r.height / 2 - viewport.height / 2), 'centred down').toBeLessThanOrEqual(2);
      }
      const blurred = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter((el) => getComputedStyle(el).backdropFilter === 'blur(4px)').length);
      expect(blurred, 'one layer computes backdrop-filter: blur(4px)').toBeGreaterThanOrEqual(1);
      await expect(page.getByRole('feed', { name: 'פוסטים בפיד' }), 'the feed is out of the accessibility tree').toHaveCount(0);
      await expect(page.getByRole('banner'), 'the top bar is inert too').toHaveCount(0);
    });
    test(`[c10] ${label}: the feed neither scrolls nor navigates behind it; Esc, an outside press, "ביטול" and Back close it with no request and focus back on "⋯"`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page, range(1, 12));
      const button = more(cards(page).nth(1));
      await button.scrollIntoViewIfNeeded();
      const closers = ['Escape', 'outside', 'cancel', 'Back'] as const;
      for (const close of closers) {
        const at = await scrollY(page);
        await button.click();
        await reportItem(page).click();
        const box = sheet(page, 'post');
        await expect(box).toBeVisible();
        await page.mouse.move(viewport.width / 2, 20);
        await page.mouse.wheel(0, 600);
        await page.keyboard.press('PageDown');
        expect(await scrollY(page), `${close}: no scroll behind`).toBe(at);
        expect(pathOf(page), `${close}: the address`).toBe('/feed');
        await afterPaint(page);
        if (close === 'Escape') await page.keyboard.press('Escape');
        else if (close === 'outside') await page.mouse.click(3, 3);
        else if (close === 'cancel') await cancelButton(box).click();
        else await page.goBack();
        await expect(box, close).toHaveCount(0);
        expect(pathOf(page), `${close}: still the feed`).toBe('/feed');
        expect(await scrollY(page), `${close}: same place`).toBe(at);
        await expect(button, `${close}: focus returns`).toBeFocused();
        await expect(cards(page)).toHaveCount(12);
      }
      expect(reports.sent, 'closing sends nothing').toEqual([]);
    });
  }
});

test.describe('F3.7 c11 [AC-106, BR-075] the report sheet', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c11] ${label}: the intro, "מה הבעיה?" with exactly eight radios in FR-MOD-001 order, none chosen, focus on the first; the text field, the rules link, send and cancel`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      await openFrom(page, 0);
      const box = sheet(page, 'post');
      await expect(box).toHaveAccessibleDescription(T.intro);
      const group = box.getByRole('radiogroup', { name: T.legend, exact: true });
      await expect(group).toBeVisible();
      await expect(group.getByText(T.legend, { exact: true })).toBeVisible();
      await expect(radios(box)).toHaveCount(8);
      for (const [i, name] of REASONS.entries()) {
        await expect(radios(box).nth(i)).toHaveAccessibleName(name);
        await expect(radios(box).nth(i)).not.toBeChecked();
      }
      await expect(radios(box).first(), 'child safety comes first and holds the focus').toBeFocused();
      await expect(box.getByRole('radio', { name: REASONS[6], exact: true })).toHaveAccessibleDescription(T.spamHint);
      await expect(detailsBox(box)).toHaveValue('');
      await expect(detailsBox(box)).toHaveAttribute('dir', 'auto');
      await expect(detailsBox(box)).toHaveAccessibleDescription(new RegExp(T.detailsHint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      const rules = box.getByRole('link', { name: `${T.rules} (נפתח בכרטיסייה חדשה)`, exact: true });
      await expect(rules).toHaveAttribute('href', '/community-rules');
      await expect(rules).toHaveAttribute('target', '_blank');
      await expect(rules).toHaveAttribute('rel', /noopener/);
      await expect(sendButton(box)).toBeVisible();
      await expect(cancelButton(box)).toBeVisible();
    });
    test(`[c11] ${label}: the arrow keys move the choice; the rules open in a new tab and what was chosen and written stays`, async ({ page, context }) => {
      await page.setViewportSize(viewport);
      await start(page);
      await openFrom(page, 0);
      const box = sheet(page, 'post');
      await page.keyboard.press('ArrowDown');
      await expect(radios(box).nth(1), 'the next reason in reading order').toBeChecked();
      await choose(box, 3);
      await detailsBox(box).fill('כתבו כאן את מספר הטלפון שלי');
      const popup = context.waitForEvent('page');
      await box.getByRole('link', { name: /כללי הקהילה/ }).click();
      const tab = await popup;
      await tab.waitForLoadState('domcontentloaded');
      expect(new URL(tab.url()).pathname).toBe('/community-rules');
      await tab.close();
      await expect(box).toBeVisible();
      await expect(radios(box).nth(3)).toBeChecked();
      await expect(detailsBox(box)).toHaveValue('כתבו כאן את מספר הטלפון שלי');
      expect(pathOf(page)).toBe('/feed');
    });
    test(`[c11] ${label}: the counter speaks from 100 characters left and counts past the limit; none before`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      await openFrom(page, 0);
      const box = sheet(page, 'post');
      await detailsBox(box).fill('א'.repeat(399));
      await expect(box.getByRole('status')).toHaveText('');
      await detailsBox(box).fill('א'.repeat(400));
      await expect(box.getByRole('status')).toHaveText('נותרו 100 תווים');
      await detailsBox(box).fill('א'.repeat(500));
      await expect(box.getByRole('status')).toHaveText('לא נותרו תווים');
      await detailsBox(box).fill('א'.repeat(501));
      await expect(box.getByRole('status')).toHaveText('הטקסט ארוך בתו אחד מהמותר');
      await detailsBox(box).fill('א'.repeat(510));
      await expect(box.getByRole('status')).toHaveText('הטקסט ארוך ב-10 תווים מהמותר');
    });
  }
});

test.describe('F3.7 c12 [FR-MOD-001, Q1] a send that is refused at the screen', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c12] ${label}: no reason, "אחר" without text, over 500 (VAL-048, §11.9) and a NUL each show their message and put focus on the field, with no request`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      await openFrom(page, 0);
      const box = sheet(page, 'post');
      await sendButton(box).click();
      await expect(box.getByText(T.noReason, { exact: true })).toBeVisible();
      await expect(radios(box).first()).toBeFocused();
      await choose(box, 7);
      await sendButton(box).click();
      await expect(box.getByText(T.otherEmpty, { exact: true })).toBeVisible();
      await expect(detailsBox(box)).toBeFocused();
      await detailsBox(box).fill('   \n ');
      await sendButton(box).click();
      await expect(detailsBox(box), 'blank is no text').toBeFocused();
      await expect(box.getByText(T.otherEmpty, { exact: true })).toBeVisible();
      await detailsBox(box).fill('א'.repeat(501));
      await sendButton(box).click();
      await expect(box.getByText(T.tooLong, { exact: true })).toBeVisible();
      await expect(detailsBox(box)).toBeFocused();
      await choose(box, 1);
      await detailsBox(box).fill('a\u0000b');
      await sendButton(box).click();
      await expect(box.getByText(T.nul, { exact: true })).toBeVisible();
      await expect(detailsBox(box)).toBeFocused();
      expect(reports.sent, 'nothing was sent').toEqual([]);
      await expect(box).toBeVisible();
    });
    test(`[c12] ${label}: while sending the button is "שולחים" and disabled, and a double press makes one request`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      const held = gate();
      reports.hold = held.promise;
      await openFrom(page, 0);
      const box = sheet(page, 'post');
      await choose(box, 1);
      const send = sendButton(box);
      await send.dblclick();
      await expect(box.getByRole('button', { name: T.sending, exact: true })).toBeVisible();
      expect(await box.getByRole('button', { name: T.sending, exact: true }).evaluate((el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true')).toBe(true);
      await page.keyboard.press('Enter');
      expect(reports.sent.length, 'one request in flight').toBe(1);
      held.release();
      await expect(box).toHaveCount(0);
      expect(reports.sent.length, 'still one').toBe(1);
    });
  }
});

test.describe('F3.7 c13 [FR-MOD-001 "אישור קליטה"] outcomes on the feed', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c13][c1] ${label}: 201 on a post: the body is exactly {targetKind, targetId, reason, details}; the sheet closes, the card leaves the feed, focus moves to the next card, the polite status says so`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      await openFrom(page, 0);
      const box = sheet(page, 'post');
      await choose(box, 0);
      await detailsBox(box).fill('  פרטים  ');
      await sendButton(box).click();
      await expect(box).toHaveCount(0);
      await expect(cards(page)).toHaveCount(4);
      await expect(cards(page).filter({ hasText: 'גוף הפוסט 1' })).toHaveCount(0);
      await expect(status(page, T.postReported)).toBeVisible();
      expect(reports.sent).toHaveLength(1);
      const body = reports.sent[0] ?? {};
      expect(Object.keys(body).every((k) => ['targetKind', 'targetId', 'reason', 'details'].includes(k))).toBe(true);
      expect({ targetKind: body.targetKind, targetId: body.targetId, reason: body.reason }).toEqual({ targetKind: 'post', targetId: id(1), reason: KEYS[0] });
      expect(String(body.details).trim(), 'the text goes along (the server trims it)').toBe('פרטים');
      await expectFocusIn(page, cards(page).first(), 'the next card holds focus');
    });
    test(`[c13][c8] ${label}: reporting from a share card sends the share's own id; from an anonymous card, only its post id`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      await openFrom(page, 2);
      await choose(sheet(page, 'post'), 6);
      await sendButton(sheet(page, 'post')).click();
      await expect(sheet(page, 'post')).toHaveCount(0);
      await openFrom(page, 1);
      await choose(sheet(page, 'post'), 3);
      await sendButton(sheet(page, 'post')).click();
      await expect(sheet(page, 'post')).toHaveCount(0);
      expect(reports.sent.map((b) => [b.targetKind, b.targetId])).toEqual([['post', id(3)], ['post', id(2)]]);
      expect(JSON.stringify(reports.sent)).not.toMatch(/author|user|reporter/i);
    });
    test(`[c13] ${label}: 409 closes with the already-reported text and the post card is removed too; 404 closes with the unavailable text and the card stays`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      reports.answer = 409;
      await openFrom(page, 0);
      await choose(sheet(page, 'post'), 1);
      await sendButton(sheet(page, 'post')).click();
      await expect(sheet(page, 'post')).toHaveCount(0);
      await expect(status(page, T.already)).toBeVisible();
      await expect(cards(page).filter({ hasText: 'גוף הפוסט 1' })).toHaveCount(0);
      reports.answer = 404;
      await openFrom(page, 0); // the anonymous card is first now
      await choose(sheet(page, 'post'), 1);
      await sendButton(sheet(page, 'post')).click();
      await expect(sheet(page, 'post')).toHaveCount(0);
      await expect(status(page, T.unavailable)).toBeVisible();
      await expect(cards(page)).toHaveCount(4);
      await expect(more(cards(page).first()), 'focus on the opener').toBeFocused();
    });
    test(`[c13] ${label}: a network failure and a 500 keep the sheet and the input and show the ERR-004 alert; the next send goes through`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      await openFrom(page, 0);
      const box = sheet(page, 'post');
      await choose(box, 4);
      await detailsBox(box).fill('נוסח שלא ילך לאיבוד');
      for (const answer of ['abort', 500] as const) {
        reports.answer = answer;
        await sendButton(box).click();
        await expect(box.getByRole('alert').filter({ hasText: T.failed })).toBeVisible();
        await expect(box).toBeVisible();
        await expect(radios(box).nth(4)).toBeChecked();
        await expect(detailsBox(box)).toHaveValue('נוסח שלא ילך לאיבוד');
        await expect(sendButton(box)).toBeVisible();
      }
      expect(reports.sent).toHaveLength(2);
      reports.answer = 201;
      await sendButton(box).click();
      await expect(box).toHaveCount(0);
      expect(reports.sent).toHaveLength(3);
      expect(reports.sent[2]).toEqual(reports.sent[1]);
      await expect(cards(page).filter({ hasText: 'גוף הפוסט 1' })).toHaveCount(0);
    });
    test(`[c13] ${label}: a 401 is the expired-session flow (ERR-038), not a report error`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      reports.answer = 401;
      // The session check agrees the token is no longer accepted (as e2e/profile.spec.ts c16 does with /api/me).
      await page.route('**/api/me', (route) => route.fulfill({ status: 401, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'www-authenticate': 'Bearer' }, body: '{"error":"unauthenticated"}' }));
      await openFrom(page, 0);
      await choose(sheet(page, 'post'), 1);
      await sendButton(sheet(page, 'post')).click();
      await expect.poll(() => pathOf(page)).toBe('/login');
      await expect(page.getByText('ההתחברות פגה. אפשר להתחבר שוב')).toBeVisible();
    });
    test(`[c13] ${label}: the reported card stays out after going to another page and back (Back restores the feed)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      await openFrom(page, 0);
      await choose(sheet(page, 'post'), 1);
      await sendButton(sheet(page, 'post')).click();
      await expect(sheet(page, 'post')).toHaveCount(0);
      await cards(page).first().locator('a:has(time)').click(); // ux-polish-a c9: "תגובות" is a button now; the time link opens the post
      await expect.poll(() => pathOf(page)).toMatch(/^\/posts\//);
      await page.goBack();
      await expect.poll(() => pathOf(page)).toBe('/feed');
      await expect(cards(page).first()).toBeVisible();
      await expect(cards(page).filter({ hasText: 'גוף הפוסט 1' })).toHaveCount(0);
    });
    test(`[c13] ${label}: the last card reported leaves an empty feed and focus goes to the h1`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page, [named(1)]);
      await openFrom(page, 0);
      await choose(sheet(page, 'post'), 1);
      await sendButton(sheet(page, 'post')).click();
      await expect(cards(page)).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1, name: 'הפיד', exact: true })).toBeFocused();
    });
  }
});

test.describe('F3.7 c15 [NFR accessibility] axe, keyboard, touch size', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c15] ${label}: axe is clean with the card menu open`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      await more(cards(page).nth(0)).click();
      await expect(menu(page)).toBeVisible();
      await scan(page);
    });
    test(`[c15] ${label}: axe is clean with the sheet in every state (default, refused, failed, sending); RTL`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      await openFrom(page, 0);
      const box = sheet(page, 'post');
      await expect(box).toBeVisible();
      await scan(page);
      await sendButton(box).click();
      await expect(box.getByText(T.noReason, { exact: true })).toBeVisible();
      await scan(page);
      await choose(box, 7);
      await detailsBox(box).fill('א'.repeat(1003));
      await sendButton(box).click();
      await expect(box.getByText(T.tooLong, { exact: true })).toBeVisible();
      await scan(page);
      await detailsBox(box).fill('נוסח');
      reports.answer = 500;
      await sendButton(box).click();
      await expect(box.getByRole('alert').filter({ hasText: T.failed })).toBeVisible();
      await scan(page);
      const held = gate();
      reports.hold = held.promise;
      reports.answer = 201;
      await sendButton(box).click();
      await expect(box.getByRole('button', { name: T.sending, exact: true })).toBeVisible();
      await scan(page);
      held.release();
    });
    test(`[c15] ${label}: keyboard only, from the card's "⋯" to a sent report; every control is at least 44x44 with a visible focus`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      const button = more(cards(page).nth(0));
      await expectTouchTarget(button, '⋯');
      await expectFocusRing(button, '⋯');
      await page.keyboard.press('Enter');
      await expect(menu(page)).toBeVisible();
      for (const item of await menu(page).getByRole('menuitem').all()) await expectTouchTarget(item, 'menu item');
      expect(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'Enter puts focus on a menu item').toBe('menuitem');
      while ((await page.evaluate(() => document.activeElement?.textContent)) !== T.reportPost) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      const box = sheet(page, 'post');
      await expect(radios(box).first()).toBeFocused();
      const cardsOfReasons = await box.locator('fieldset label').all();
      expect(cardsOfReasons).toHaveLength(8);
      for (const card of cardsOfReasons) await expectTouchTarget(card, 'reason');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await expect(radios(box).nth(2)).toBeChecked();
      await page.keyboard.press('Tab');
      await expect(detailsBox(box)).toBeFocused();
      await page.keyboard.type('נוסח');
      await page.keyboard.press('Tab');
      const link = box.getByRole('link', { name: /כללי הקהילה/ });
      await expect(link).toBeFocused();
      await expectTouchTarget(link, 'rules link');
      await page.keyboard.press('Tab');
      await expect(sendButton(box)).toBeFocused();
      await expectTouchTarget(sendButton(box), 'send');
      await expectTouchTarget(cancelButton(box), 'cancel');
      await expectFocusRing(sendButton(box), 'send');
      await expectFocusRing(cancelButton(box), 'cancel');
      await sendButton(box).focus();
      await page.keyboard.press('Enter');
      await expect(box).toHaveCount(0);
      expect(reports.sent).toHaveLength(1);
      expect(reports.sent[0]?.reason).toBe(KEYS[2]);
    });
    test(`[c15] ${label}: Tab never leaves the open sheet`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      await openFrom(page, 0);
      const box = sheet(page, 'post');
      for (let i = 0; i < 14; i += 1) {
        await page.keyboard.press('Tab');
        await expectFocusIn(page, box, `Tab ${i + 1} stays inside`);
      }
      for (let i = 0; i < 14; i += 1) {
        await page.keyboard.press('Shift+Tab');
        await expectFocusIn(page, box, `Shift+Tab ${i + 1} stays inside`);
      }
    });
  }
});
