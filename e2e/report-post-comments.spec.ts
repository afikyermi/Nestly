// I3 F3.7 report (real browser, network stubbed): the post page's "⋯" and the "⋯" on every comment and reply. Derived from .work/report/spec.md
// criteria 8, 9, 13 and 15 and .work/report/screen.md (roles and Hebrew names) only. The stubs play the server: e2e/support/comments-stub.ts (the
// post and its thread), report-stub.ts (POST /api/reports). The feed card's entry point and the sheet itself are e2e/report.spec.ts.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { EMAIL, scan } from './support/journeys-stub';
import { OTHERS_ID, POST_ID } from './support/posts-stub';
import { cid, comment, setupComments, top } from './support/comments-stub';
import type { StubTop } from './support/comments-stub';
import { gate, stubReports } from './support/report-stub';
import type { ReportsNet } from './support/report-stub';
import { KEYS, T, cancelButton, choose, expectFocusIn, expectTouchTarget, focusedText, menu, radios, sendButton, sheet, status } from './support/report-ui';
import { afterPaint } from './support/post-menu';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;

/** A: another's named comment with another's reply. B: the anonymous post's author ("המחבר"), not mine. C: mine, with another's reply. D: another's, with my reply. */
const thread = (): StubTop[] => [
  top(1, 'שלום מנועה', [comment(11, 'תגובה לנועה')], { author: { name: 'נועה' } }),
  top(2, 'תשובה מהמחברת', [], { byAuthor: true, author: undefined }),
  top(3, 'הדעה שלי', [comment(12, 'השבה על שלי', { author: { name: 'יעל' } })], { isMine: true, author: { name: 'דנה כהן' } }),
  top(4, 'ללא שם', [comment(13, 'השבה שלי', { isMine: true, author: { name: 'דנה כהן' } })]),
];
const COMMENTS = 7;

async function start(page: Page, postId = OTHERS_ID, tops: StubTop[] = thread()): Promise<{ reports: ReportsNet }> {
  await setupComments(page, tops);
  const reports = await stubReports(page);
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.goto(`/posts/${postId}`);
  await expect(page.getByRole('region', { name: 'תגובות', exact: true })).toBeVisible();
  return { reports };
}
const list = (page: Page) => page.getByRole('list', { name: 'רשימת התגובות', exact: true });
/** A comment by a text only it holds (a reply's text also sits inside its parent, hence the innermost match for replies). */
const top$ = (page: Page, text: string) => list(page).getByRole('listitem').filter({ hasText: text }).first();
const reply$ = (page: Page, text: string) => list(page).getByRole('listitem').filter({ hasText: text }).last();
const moreOf = (item: Locator) => item.getByRole('button', { name: T.moreOfComment, exact: true }).first();
const postMore = (page: Page) => page.getByRole('main').getByRole('button', { name: T.moreOfPost, exact: true });
const reportComment = (page: Page) => page.getByRole('menuitem', { name: T.reportComment, exact: true });
const postHeading = (page: Page) => page.getByRole('main').getByText('פוסט של מישהי אחרת');

test.describe('F3.7 c9 [FR-MOD-001] the post page "⋯"', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c9] ${label}: another's post has a "⋯" with "דיווח על הפוסט"; the menu closes on Esc, an outside click and Back with focus back on it`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      const button = postMore(page);
      await expect(button).toHaveCount(1);
      for (const close of ['Escape', 'outside', 'Back'] as const) {
        await button.click();
        await expect(menu(page), close).toBeVisible();
        await expect(page.getByRole('menuitem', { name: T.reportPost, exact: true }), close).toHaveCount(1, { timeout: 3000 });
        await afterPaint(page);
        if (close === 'Escape') await page.keyboard.press('Escape');
        else if (close === 'outside') await page.mouse.click(5, 5);
        else await page.goBack();
        await expect(menu(page), close).toHaveCount(0);
        expect(pathOf(page), `${close} stays on the post`).toBe(`/posts/${OTHERS_ID}`);
        await expect(button, close).toBeFocused();
      }
    });
    test(`[c9] ${label}: my own post has the "⋯" with its own actions (ux-polish-b c3) and no report entry`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page, POST_ID);
      await expect(page.getByRole('main').getByText('שאלה על שינה')).toBeVisible();
      await postMore(page).click(); // ux-polish-b c3 supersedes: the author's edit and delete are in this "⋯"
      await expect(page.getByRole('menuitem', { name: 'עריכת הפוסט', exact: true })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'מחיקת הפוסט', exact: true })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: T.reportPost, exact: true })).toHaveCount(0);
    });
  }
});

test.describe('F3.7 c13 [FR-MOD-001] outcomes on the post page', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c13] ${label}: 201 closes the sheet and replaces the post with the post-reported text and "חזרה לפיד", focus on it; the link goes to the feed`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      await postMore(page).click();
      await page.getByRole('menuitem', { name: T.reportPost, exact: true }).click();
      await choose(sheet(page, 'post'), 5);
      await sendButton(sheet(page, 'post')).click();
      await expect(sheet(page, 'post')).toHaveCount(0);
      await expect(page.getByText(T.postReported, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: T.backToFeed, exact: true })).toBeVisible();
      await expect(postHeading(page)).toHaveCount(0);
      expect(reports.sent.map((b) => [b.targetKind, b.targetId, b.reason])).toEqual([['post', OTHERS_ID, KEYS[5]]]);
      await expect(page.locator(':focus')).toContainText(/הדיווח נשלח|חזרה לפיד/);
      await page.getByRole('link', { name: T.backToFeed, exact: true }).click();
      await expect.poll(() => pathOf(page)).toBe('/feed');
    });
    test(`[c13] ${label}: 409 closes with the already-reported text; 404 closes with the unavailable text and the post stays`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      reports.answer = 404;
      await postMore(page).click();
      await page.getByRole('menuitem', { name: T.reportPost, exact: true }).click();
      await choose(sheet(page, 'post'), 1);
      await sendButton(sheet(page, 'post')).click();
      await expect(sheet(page, 'post')).toHaveCount(0);
      await expect(status(page, T.unavailable)).toBeVisible();
      await expect(postHeading(page)).toBeVisible();
      await expect(postMore(page), 'focus on the opener').toBeFocused();
      reports.answer = 409;
      await postMore(page).click();
      await page.getByRole('menuitem', { name: T.reportPost, exact: true }).click();
      await choose(sheet(page, 'post'), 1);
      await sendButton(sheet(page, 'post')).click();
      await expect(sheet(page, 'post')).toHaveCount(0);
      await expect(page.getByText(T.already, { exact: true }).first()).toBeVisible();
    });
    test(`[c13] ${label}: a failed send keeps the sheet with the input and the alert; Back closes the sheet and stays on the post`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      reports.answer = 500;
      await postMore(page).click();
      await page.getByRole('menuitem', { name: T.reportPost, exact: true }).click();
      const box = sheet(page, 'post');
      await choose(box, 6);
      await sendButton(box).click();
      await expect(box.getByRole('alert').filter({ hasText: T.failed })).toBeVisible();
      await expect(radios(box).nth(6)).toBeChecked();
      await afterPaint(page);
      await page.goBack();
      await expect(box).toHaveCount(0);
      expect(pathOf(page)).toBe(`/posts/${OTHERS_ID}`);
      await expect(postHeading(page)).toBeVisible();
      await expect(postMore(page)).toBeFocused();
      expect(reports.sent).toHaveLength(1);
    });
  }
});

test.describe('F3.7 c9 [FR-MOD-001, F3.3 c18] one "⋯" on every comment and reply', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c9] ${label}: ${COMMENTS} comments and replies each have one "⋯"; F3.3's visible "מחיקה" button is gone; mine offer "מחיקה", others' "דיווח על התגובה"`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      await expect(list(page).getByRole('button', { name: T.moreOfComment, exact: true })).toHaveCount(COMMENTS);
      await expect(list(page).getByRole('button', { name: 'מחיקה', exact: true })).toHaveCount(0);
      const cases: Array<[Locator, string]> = [
        [top$(page, 'שלום מנועה'), T.reportComment],
        [reply$(page, 'תגובה לנועה'), T.reportComment],
        [top$(page, 'תשובה מהמחברת'), T.reportComment], // "המחבר" is someone else's
        [top$(page, 'הדעה שלי'), 'מחיקה'],
        [reply$(page, 'השבה על שלי'), T.reportComment],
        [reply$(page, 'השבה שלי'), 'מחיקה'],
      ];
      for (const [item, only] of cases) {
        await moreOf(item).click();
        await expect(menu(page)).toBeVisible();
        await expect(menu(page).getByRole('menuitem')).toHaveCount(1);
        await expect(menu(page).getByRole('menuitem', { name: only, exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menu(page)).toHaveCount(0);
        await expect(moreOf(item)).toBeFocused();
      }
    });
    for (const order of ['post first', 'comment first'] as const) {
      test(`[c9] ${label}: two menus on one page (${order}): Back closes the open one and stays on the post; the next Back leaves, with no dead entry`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await start(page);
        const postUrl = `/posts/${OTHERS_ID}`;
        const commentButton = moreOf(top$(page, 'שלום מנועה'));
        const [first, second] = order === 'post first' ? [postMore(page), commentButton] : [commentButton, postMore(page)];
        await first.click();
        await expect(menu(page)).toBeVisible();
        // ux-polish-b c8: with a menu open, one press on another "⋯" closes the first and opens the other.
        await second.click();
        await expect(menu(page)).toBeVisible();
        await expect(second).toHaveAttribute('aria-expanded', 'true');
        await expect(first).toHaveAttribute('aria-expanded', 'false');
        await page.goBack();
        await expect(menu(page)).toHaveCount(0);
        expect(pathOf(page)).toBe(postUrl);
        await page.goBack();
        await expect.poll(() => pathOf(page), 'the next Back leaves the post').not.toBe(postUrl);
      });
    }
    test(`[c9] ${label}: the comment menu closes on Esc, an outside click and Back with focus on its "⋯"; Back stays on the post`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      const button = moreOf(top$(page, 'שלום מנועה'));
      for (const close of ['Escape', 'outside', 'Back'] as const) {
        await button.click();
        await expect(menu(page)).toBeVisible();
        await afterPaint(page);
        if (close === 'Escape') await page.keyboard.press('Escape');
        else if (close === 'outside') await page.mouse.click(5, 5);
        else await page.goBack();
        await expect(menu(page), close).toHaveCount(0);
        expect(pathOf(page), close).toBe(`/posts/${OTHERS_ID}`);
        await expect(button, close).toBeFocused();
      }
    });
    test(`[c9] ${label}: "מחיקה" in my comment's menu opens F3.3's confirmation; cancelling returns focus to the "⋯", confirming deletes with the same status`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      const confirm = page.getByRole('alertdialog', { name: 'למחוק את התגובה?', exact: true });
      const button = moreOf(top$(page, 'הדעה שלי'));
      await button.click();
      await page.getByRole('menuitem', { name: 'מחיקה', exact: true }).click();
      await expect(confirm).toContainText('המחיקה מיידית ולצמיתות');
      await page.keyboard.press('Escape');
      await expect(confirm).toHaveCount(0);
      await expect(button).toBeFocused();
      await button.click();
      await page.getByRole('menuitem', { name: 'מחיקה', exact: true }).click();
      await confirm.getByRole('button', { name: 'מחיקת התגובה', exact: true }).click();
      await expect(confirm).toHaveCount(0);
      await expect(page.getByText('הדעה שלי', { exact: true })).toHaveCount(0);
    });
  }
});

test.describe('F3.7 c13 [FR-MOD-001, c8] reporting a comment', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c13][c1] ${label}: 201 on a comment closes the sheet, says "הדיווח נשלח. הצוות יבדוק אותו", changes nothing in the thread and puts focus on that "⋯"; the body names the comment only`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      const item = top$(page, 'שלום מנועה');
      await moreOf(item).click();
      await reportComment(page).click();
      const box = sheet(page, 'comment');
      await expect(box).toBeVisible();
      await expect(radios(box)).toHaveCount(8);
      await choose(box, 2);
      await sendButton(box).click();
      await expect(box).toHaveCount(0);
      await expect(status(page, T.received)).toBeVisible();
      await expect(list(page).getByRole('listitem')).toHaveCount(COMMENTS);
      await expect(item).toBeVisible();
      await expect(moreOf(item)).toBeFocused();
      expect(reports.sent).toHaveLength(1);
      expect(reports.sent[0]).toMatchObject({ targetKind: 'comment', targetId: cid(1), reason: KEYS[2] });
      expect(Object.keys(reports.sent[0] ?? {}).every((k) => ['targetKind', 'targetId', 'reason', 'details'].includes(k))).toBe(true);
    });
    test(`[c13][c8] ${label}: a reply and the anonymous post's author's comment ("המחבר") are reported by their comment ids only; no user report is offered`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      for (const [item, target] of [[reply$(page, 'תגובה לנועה'), cid(11)], [top$(page, 'תשובה מהמחברת'), cid(2)]] as const) {
        await moreOf(item).click();
        await expect(menu(page).getByRole('menuitem')).toHaveCount(1);
        await reportComment(page).click();
        await choose(sheet(page, 'comment'), 1);
        await sendButton(sheet(page, 'comment')).click();
        await expect(sheet(page, 'comment')).toHaveCount(0);
        expect(reports.sent.at(-1)).toMatchObject({ targetKind: 'comment', targetId: target });
      }
      expect(reports.sent.map((b) => b.targetKind)).toEqual(['comment', 'comment']);
      await expect(page.getByRole('link', { name: /דיווח על (המשתמש|הפרופיל)/ })).toHaveCount(0);
      await expect(page.getByRole('menuitem', { name: /דיווח על (המשתמש|הפרופיל|המחבר)/ })).toHaveCount(0);
    });
    test(`[c13] ${label}: 409 closes with the already-reported text and 404 with the unavailable text; the comment stays; a failure keeps the input`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      const item = top$(page, 'שלום מנועה');
      for (const [answer, text] of [[409, T.already], [404, T.unavailable]] as const) {
        reports.answer = answer;
        await moreOf(item).click();
        await reportComment(page).click();
        await choose(sheet(page, 'comment'), 0);
        await sendButton(sheet(page, 'comment')).click();
        await expect(sheet(page, 'comment')).toHaveCount(0);
        await expect(status(page, text)).toBeVisible();
        await expect(item).toBeVisible();
        await expect(list(page).getByRole('listitem')).toHaveCount(COMMENTS);
      }
      reports.answer = 'abort';
      await moreOf(item).click();
      await reportComment(page).click();
      const box = sheet(page, 'comment');
      await choose(box, 0);
      await sendButton(box).click();
      await expect(box.getByRole('alert').filter({ hasText: T.failed })).toBeVisible();
      await expect(radios(box).first()).toBeChecked();
      await cancelButton(box).click();
      await expect(moreOf(item)).toBeFocused();
    });
    test(`[c12] ${label}: a double press on send in a comment's sheet makes one request`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      const held = gate();
      reports.hold = held.promise;
      await moreOf(top$(page, 'שלום מנועה')).click();
      await reportComment(page).click();
      await choose(sheet(page, 'comment'), 1);
      await sendButton(sheet(page, 'comment')).dblclick();
      await expect(sheet(page, 'comment').getByRole('button', { name: T.sending, exact: true })).toBeVisible();
      held.release();
      await expect(sheet(page, 'comment')).toHaveCount(0);
      expect(reports.sent).toHaveLength(1);
    });
  }
});

test.describe('F3.7 c15 [NFR accessibility] the comment menus and sheets', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c15] ${label}: axe is clean with the post menu open`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      await postMore(page).click();
      await expect(menu(page)).toBeVisible();
      await scan(page);
    });
    test(`[c15] ${label}: axe is clean with an own and another's comment menu open`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      await moreOf(top$(page, 'הדעה שלי')).click();
      await expect(menu(page)).toBeVisible();
      await scan(page);
      await page.keyboard.press('Escape');
      await moreOf(top$(page, 'שלום מנועה')).click();
      await expect(menu(page)).toBeVisible();
      await scan(page);
    });
    test(`[c15] ${label}: axe is clean with the thread and with the comment sheet open; every "⋯" and menu item is at least 44x44`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      await scan(page);
      await expectTouchTarget(moreOf(top$(page, 'שלום מנועה')), 'comment ⋯');
      await expectTouchTarget(postMore(page), 'post ⋯');
      await moreOf(top$(page, 'הדעה שלי')).click();
      await expectTouchTarget(page.getByRole('menuitem', { name: 'מחיקה', exact: true }), 'delete item');
      await page.keyboard.press('Escape');
      await moreOf(top$(page, 'שלום מנועה')).click();
      await expectTouchTarget(reportComment(page), 'report item');
      await reportComment(page).click();
      await expect(sheet(page, 'comment')).toBeVisible();
      await scan(page);
      await sendButton(sheet(page, 'comment')).click();
      await expect(sheet(page, 'comment').getByText(T.noReason, { exact: true })).toBeVisible();
      await scan(page);
    });
    test(`[c15] ${label}: keyboard only, a comment's "⋯" to a sent report, focus back on the "⋯"`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { reports } = await start(page);
      const button = moreOf(top$(page, 'שלום מנועה'));
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(menu(page)).toBeVisible();
      expect(await focusedText(page)).toBe(T.reportComment);
      await page.keyboard.press('Enter');
      const box = sheet(page, 'comment');
      await expect(radios(box).first()).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      await page.keyboard.type('פרטים');
      await sendButton(box).focus();
      await page.keyboard.press('Enter');
      await expect(box).toHaveCount(0);
      await expectFocusIn(page, top$(page, 'שלום מנועה'), 'focus returns into the commented item');
      await expect(button).toBeFocused();
      expect(reports.sent[0]).toMatchObject({ targetKind: 'comment', targetId: cid(1), reason: KEYS[1], details: 'פרטים' });
    });
  }
});
