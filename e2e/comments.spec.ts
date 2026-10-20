// I3 F3.3 w1 (real browser, network stubbed): comments and likes on /posts/:id. Derived from .work/comments-likes/spec.md criteria 15-19 and the w1
// half of 20, and from screen.md (roles and Hebrew names) only. Server half is F3.3 b1/b2's; the feed card is w2's. The stub plays the server:
// e2e/support/comments-stub.ts. Criterion 15's markup claims (nested lists, names, dir) are asserted here through the accessibility tree, not twice.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { EMAIL, scan } from './support/journeys-stub';
import { OTHERS_ID } from './support/posts-stub';
import { cid, comment, setupComments, top } from './support/comments-stub';
import type { CommentsNet, StubTop } from './support/comments-stub';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;
const POST = `/posts/${OTHERS_ID}`;
const SCRIPT = 'window.__x=1';
const MINE_BODY = `שלי\nשורה שניה <script>${SCRIPT}</script>`;
const LOAD_FAILED = 'לא הצלחנו לטעון את התגובות. אפשר לנסות שוב';
const REPLIES_FAILED = 'לא הצלחנו לטעון את ההשבות. אפשר לנסות שוב';
const SEND_FAILED = 'התגובה לא נשלחה. אפשר לנסות שוב';
const LIKE_FAILED = 'הלייק לא נשמר. אפשר לנסות שוב';
const NAME_NOTICE_COMMENT = 'השם שלכם יוצג לכל מי שיכול לראות את התגובה';

/** A: named, 2 likes, one anonymous-name reply. B: the anonymous post's author. C: mine, with another's reply. D: no name, with my reply. */
const thread = (): StubTop[] => [
  top(1, 'שלום מנועה', [comment(11, 'תגובה לנועה')], { author: { name: 'נועה' }, likeCount: 2 }),
  top(2, 'תשובה מהמחברת', [], { byAuthor: true, author: undefined }),
  top(3, MINE_BODY, [comment(12, 'השבה על שלי', { author: { name: 'יעל' } })], { isMine: true, author: { name: 'דנה כהן' } }),
  top(4, 'ללא שם', [comment(13, 'השבה שלי', { isMine: true, author: { name: 'דנה כהן' } })]),
];
const many = (n: number, prefix = 'קומה'): StubTop[] => Array.from({ length: n }, (_v, i) => top(100 + i, `${prefix} ${String(i + 1).padStart(2, '0')}`));

async function open(page: Page, path: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.goto(path);
}
async function start(page: Page, tops: StubTop[] = thread(), tweak: (net: CommentsNet) => void = () => undefined): Promise<CommentsNet> {
  const net = await setupComments(page, tops);
  tweak(net);
  await open(page, POST);
  return net;
}
const region = (page: Page) => page.getByRole('region', { name: 'תגובות', exact: true });
const heading = (page: Page) => page.getByRole('heading', { level: 2, name: 'תגובות', exact: true });
const list = (page: Page) => page.getByRole('list', { name: 'רשימת התגובות', exact: true });
const btn = (scope: Page | Locator, name: string) => scope.getByRole('button', { name, exact: true });
const status = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
const alert = (page: Page, text: string) => page.getByRole('alert').filter({ hasText: text });
/** A top-level comment by a text only it holds (a reply's text also sits inside its parent, hence first()). */
const item = (page: Page, text: string) => list(page).getByRole('listitem').filter({ hasText: text }).first();
/** A reply: the innermost match. */
const reply = (page: Page, text: string) => list(page).getByRole('listitem').filter({ hasText: text }).last();
// F3.7 c9: the visible delete button moved into the comment's "⋯" menu ("פעולות נוספות לתגובה" -> menuitem "מחיקה"; F3.3's confirmation follows).
const moreBtn = (scope: Locator) => scope.getByRole('button', { name: 'פעולות נוספות לתגובה', exact: true }).first();
const menuItem = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true });
async function openDelete(page: Page, scope: Locator): Promise<void> {
  await moreBtn(scope).click();
  await menuItem(page, 'מחיקה').click();
}
async function offersDelete(page: Page, scope: Locator): Promise<boolean> {
  await moreBtn(scope).click();
  const offered = (await menuItem(page, 'מחיקה').count()) === 1;
  await page.keyboard.press('Escape');
  return offered;
}
/** The post's like: the first "לייק" in the region (top of it, c15). */
const postLike = (page: Page) => btn(region(page), 'לייק').first();
const box = (page: Page) => page.getByRole('textbox', { name: 'כתיבת תגובה', exact: true });
const form = (page: Page) => page.getByRole('form', { name: 'כתיבת תגובה', exact: true });
const confirm = (page: Page) => page.getByRole('alertdialog', { name: 'למחוק את התגובה?', exact: true });
const focusedText = (page: Page) => page.evaluate(() => document.activeElement?.textContent ?? '');
function gate(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test.describe('F3.3 c15 [FR-FEED-001] the thread', () => {
  test('[c15] region "תגובות" holds the post like then the thread in oldest-first order; replies nest in a list "השבות"; time is not a link', async ({ page }) => {
    await start(page);
    await expect(region(page)).toBeVisible();
    await expect(heading(page)).toHaveAttribute('id', 'comments');
    await expect(postLike(page)).toBeVisible();
    const text = (await list(page).innerText()).replace(/\s+/g, ' ');
    const at = ['שלום מנועה', 'תשובה מהמחברת', 'שורה שניה', 'ללא שם'].map((s) => text.indexOf(s));
    expect(at.every((n) => n >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    const nested = item(page, 'שלום מנועה').getByRole('list', { name: 'השבות', exact: true });
    await expect(nested.getByRole('listitem')).toHaveCount(1);
    await expect(nested).toContainText('תגובה לנועה');
    await expect(list(page).locator('time[datetime]')).toHaveCount(7);
    await expect(list(page).getByRole('link')).toHaveCount(0);
  });
  test('[c15] name is author.name, else "מהקהילה"; each comment is a listitem named by its author', async ({ page }) => {
    await start(page);
    await expect(list(page).getByRole('listitem', { name: 'נועה', exact: true })).toHaveCount(1);
    await expect(list(page).getByRole('listitem', { name: 'דנה כהן', exact: true })).toHaveCount(2); // C and my reply under D
    await expect(list(page).getByRole('listitem', { name: 'מהקהילה', exact: true })).toHaveCount(2); // D and the reply under A
    await expect(list(page).getByRole('listitem', { name: 'יעל', exact: true })).toHaveCount(1);
  });
  test('[c15] the body is plain text: line breaks kept, dir=auto, a <script> shows as text and does not run', async ({ page }) => {
    await start(page);
    const para = region(page).locator('p[dir="auto"]').filter({ hasText: 'שורה שניה' });
    await expect(para).toHaveCount(1);
    expect(await para.innerText()).toBe(MINE_BODY);
    expect(await page.evaluate((): unknown => Reflect.get(window, '__x'))).toBeUndefined();
    await expect(para.locator('script')).toHaveCount(0);
  });
  test('[c15][c16][F3.7 c9] no visible "מחיקה" button; "מחיקה" is offered in the menu of my comments only; "השבה" only on top-level comments', async ({ page }) => {
    await start(page);
    await expect(btn(list(page), 'מחיקה')).toHaveCount(0);
    expect(await offersDelete(page, item(page, 'שלי\nשורה'))).toBe(true);
    expect(await offersDelete(page, reply(page, 'השבה שלי'))).toBe(true);
    expect(await offersDelete(page, item(page, 'שלום מנועה'))).toBe(false);
    expect(await offersDelete(page, item(page, 'תשובה מהמחברת'))).toBe(false);
    await expect(btn(list(page), 'השבה')).toHaveCount(4);
    await expect(list(page).getByRole('list', { name: 'השבות' }).getByRole('button', { name: 'השבה', exact: true })).toHaveCount(0);
  });
});

test.describe('F3.3 c16 [AC-076, VAL-036, BR-062] "המחבר"', () => {
  test('[c16] byAuthor without author shows "המחבר": no name, avatar, link or author data in the DOM; a stranger sees no delete', async ({ page }) => {
    await start(page);
    const b = list(page).getByRole('listitem', { name: 'המחבר', exact: true });
    await expect(b).toHaveCount(1);
    await expect(b).toContainText('תשובה מהמחברת');
    await expect(b.getByRole('img')).toHaveCount(0);
    await expect(b.getByRole('link')).toHaveCount(0);
    expect(await offersDelete(page, b)).toBe(false);
    const html = await b.evaluate((el) => el.outerHTML);
    expect(html).not.toMatch(/נועה|דנה|מהקהילה|data-testid|href=|src=/);
    expect(html).not.toContain(OTHERS_ID);
  });
  test('[c16] byAuthor with isMine and no author shows "המחבר" and a delete button (the anonymous post author, G2)', async ({ page }) => {
    await start(page, [top(7, 'אני כתבתי', [], { byAuthor: true, isMine: true, author: undefined })]);
    const b = list(page).getByRole('listitem', { name: 'המחבר', exact: true });
    expect(await offersDelete(page, b)).toBe(true);
    await expect(page.getByText('דנה כהן')).toHaveCount(0);
  });
});

test.describe('F3.3 c19 [FR-FEED-001] paging, states and errors', () => {
  test('[c19] 25 comments: 20 and "עוד תגובות"; the next page appends in order and the button goes away', async ({ page }) => {
    const net = await start(page, many(25));
    await expect(list(page).locator(':scope > li')).toHaveCount(20);
    await btn(region(page), 'עוד תגובות').click();
    await expect(list(page).locator(':scope > li')).toHaveCount(25);
    await expect(btn(region(page), 'עוד תגובות')).toHaveCount(0);
    const text = await list(page).innerText();
    const at = [1, 20, 21, 25].map((n) => text.indexOf(`קומה ${String(n).padStart(2, '0')}`));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(at[0]).toBeGreaterThanOrEqual(0);
    expect(net.calls.filter((c) => c.includes('cursor='))).toHaveLength(1);
  });
  test('[c19] "עוד תגובות" failing keeps the list, alerts after it with "נסו שוב", and retries the same cursor', async ({ page }) => {
    const net = await start(page, many(25), (n) => {
      n.fail.more = 500;
    });
    await btn(region(page), 'עוד תגובות').click();
    await expect(region(page).getByRole('alert').filter({ hasText: 'לא הצלחנו לטעון עוד תגובות. אפשר לנסות שוב' })).toBeVisible();
    await expect(list(page).locator(':scope > li')).toHaveCount(20);
    net.fail.more = null;
    await btn(region(page), 'נסו שוב').click();
    await expect(list(page).locator(':scope > li')).toHaveCount(25);
    const cursors = net.calls.filter((c) => c.includes('cursor='));
    expect(cursors).toHaveLength(2);
    expect(cursors[1]).toBe(cursors[0]);
  });
  test('[c19] 25 replies: 3 inline and "הצגת עוד השבות"; pending "טוענים"; pages append without repeats; focus lands on the first new reply when the button goes', async ({ page }) => {
    const replies = Array.from({ length: 25 }, (_v, i) => comment(200 + i, `ענה ${String(i + 1).padStart(2, '0')}`));
    const net = await start(page, [top(9, 'שרשור ארוך', replies), top(10, 'שכן')]);
    const own = item(page, 'שרשור ארוך');
    await expect(own.getByRole('listitem')).toHaveCount(3);
    const g = gate();
    net.holdReplies = g.promise;
    await btn(own, 'הצגת עוד השבות').click();
    await expect(btn(own, 'טוענים')).toBeVisible();
    g.release();
    net.holdReplies = null;
    await expect(own.getByRole('listitem')).toHaveCount(20);
    await expect(btn(own, 'הצגת עוד השבות')).toBeFocused();
    await btn(own, 'הצגת עוד השבות').click();
    await expect(own.getByRole('listitem')).toHaveCount(25);
    await expect(btn(own, 'הצגת עוד השבות')).toHaveCount(0);
    expect(await focusedText(page)).toContain('ענה 21');
    expect(new Set(await own.getByRole('listitem').allInnerTexts()).size).toBe(25);
    await expect(btn(item(page, 'שכן'), 'הצגת עוד השבות')).toHaveCount(0);
  });
  test('[c19] "הצגת עוד השבות" failing keeps the replies, alerts under that comment with "נסו שוב"; retry works; a vanished parent says "התגובה אינה זמינה"', async ({ page }) => {
    const replies = Array.from({ length: 6 }, (_v, i) => comment(300 + i, `מענה ${i + 1}`));
    const net = await start(page, [top(9, 'שרשור', replies)], (n) => {
      n.fail.replies = 500;
    });
    const own = item(page, 'שרשור');
    await btn(own, 'הצגת עוד השבות').click();
    await expect(own.getByRole('alert').filter({ hasText: REPLIES_FAILED })).toBeVisible();
    await expect(own.getByRole('listitem')).toHaveCount(3);
    net.fail.replies = null;
    await btn(own, 'נסו שוב').click();
    await expect(own.getByRole('listitem')).toHaveCount(6);
  });
  test('[c19] a 404 on the replies shows "התגובה אינה זמינה" in that comment\'s block', async ({ page }) => {
    await start(page, [top(9, 'שרשור', Array.from({ length: 5 }, (_v, i) => comment(300 + i, `מענה ${i + 1}`)))], (n) => {
      n.repliesGone = true;
    });
    await btn(item(page, 'שרשור'), 'הצגת עוד השבות').click();
    await expect(item(page, 'שרשור').getByText('התגובה אינה זמינה')).toBeVisible();
  });
  test('[c19] loading shows "טוענים את התגובות" and the composer waits no longer than the thread', async ({ page }) => {
    const g = gate();
    const net = await setupComments(page, thread());
    net.holdThread = g.promise;
    await open(page, POST);
    await expect(page.getByText('טוענים את התגובות')).toBeVisible();
    g.release();
    await expect(list(page)).toBeVisible();
    await expect(page.getByText('טוענים את התגובות')).toHaveCount(0);
  });
  test('[c19] empty: the invitation shows and the composer stays', async ({ page }) => {
    await start(page, []);
    await expect(page.getByText('עוד אין תגובות. אפשר לכתוב את התגובה הראשונה')).toBeVisible();
    await expect(box(page)).toBeVisible();
    await expect(btn(form(page), 'שליחה')).toBeVisible();
  });
  test('[c19] a thread load failure shows the alert and "נסו שוב", which loads it', async ({ page }) => {
    const net = await start(page, thread(), (n) => {
      n.fail.thread = 500;
    });
    await expect(alert(page, LOAD_FAILED)).toBeVisible();
    net.fail.thread = null;
    await btn(region(page), 'נסו שוב').click();
    await expect(list(page)).toBeVisible();
    await expect(alert(page, LOAD_FAILED)).toHaveCount(0);
  });
  test('[c19] a missing post (404) keeps the unchanged page: no region, no thread, no composer, no comments request', async ({ page }) => {
    const net = await start(page, thread(), (n) => {
      n.read = 404;
    });
    await expect(page.getByRole('heading', { level: 1, name: 'פוסט' })).toBeVisible();
    await page.waitForTimeout(500); // a thread request would follow the post read; it must not appear later
    await expect(region(page)).toHaveCount(0);
    await expect(heading(page)).toHaveCount(0);
    await expect(box(page)).toHaveCount(0);
    expect(net.calls.filter((c) => c.includes('/comments'))).toEqual([]);
  });
  test('[c20] the page calls only its own endpoints', async ({ page }) => {
    const net = await start(page);
    await expect(list(page)).toBeVisible();
    await postLike(page).click();
    await expect(btn(region(page), 'לייק, 1')).toBeVisible();
    expect(net.stray.filter((c) => c !== 'GET /api/feed' && c !== 'GET /api/admin/access' && c !== 'GET /api/stories' && c !== 'GET /api/notifications')).toEqual([]); // the login lands on the feed first (with its Stories tray, I5); the shell asks for staff access and the bell's notifications
  });
});

test.describe('F3.3 c15/c19 [FR-FEED-001] likes', () => {
  test('[c15] the post like toggles: count and pressed state follow, PUT then DELETE on the post', async ({ page }) => {
    const net = await start(page);
    const like = postLike(page);
    await expect(like).toHaveAttribute('aria-pressed', 'false');
    await like.click();
    await expect(btn(region(page), 'לייק, 1')).toHaveAttribute('aria-pressed', 'true');
    await btn(region(page), 'לייק, 1').click();
    await expect(postLike(page)).toHaveAttribute('aria-pressed', 'false');
    expect(net.calls.filter((c) => c.endsWith('/like'))).toEqual([`PUT /api/posts/${OTHERS_ID}/like`, `DELETE /api/posts/${OTHERS_ID}/like`]);
  });
  test('[c15] a liked post arrives pressed, with its count', async ({ page }) => {
    await start(page, thread(), (n) => {
      n.post = { likeCount: 5, likedByMe: true };
    });
    await expect(btn(region(page), 'לייק, 5')).toHaveAttribute('aria-pressed', 'true');
  });
  test('[c15] a comment like toggles on that comment only', async ({ page }) => {
    const net = await start(page);
    const a = item(page, 'שלום מנועה');
    await btn(a, 'לייק, 2').click();
    await expect(btn(a, 'לייק, 3')).toHaveAttribute('aria-pressed', 'true');
    await expect(btn(item(page, 'תשובה מהמחברת'), 'לייק')).toHaveAttribute('aria-pressed', 'false');
    expect(net.calls.filter((c) => c.endsWith('/like'))).toEqual([`PUT /api/comments/${cid(1)}/like`]);
  });
  test('[c19] a reply can be liked', async ({ page }) => {
    const net = await start(page);
    await btn(reply(page, 'תגובה לנועה'), 'לייק').click();
    await expect(btn(reply(page, 'תגובה לנועה'), 'לייק, 1')).toHaveAttribute('aria-pressed', 'true');
    expect(net.calls).toContain(`PUT /api/comments/${cid(11)}/like`);
  });
  test('[c19] a failed like reverts count and state and says "הלייק לא נשמר. אפשר לנסות שוב"', async ({ page }) => {
    await start(page, thread(), (n) => {
      n.fail.likePost = 500;
      n.fail.likeComment = 'abort';
    });
    await postLike(page).click();
    await expect(status(page, LIKE_FAILED)).toBeVisible();
    await expect(postLike(page)).toHaveAttribute('aria-pressed', 'false');
    const a = item(page, 'שלום מנועה');
    await btn(a, 'לייק, 2').click();
    await expect(status(page, LIKE_FAILED)).toBeVisible();
    await expect(btn(a, 'לייק, 2')).toHaveAttribute('aria-pressed', 'false');
  });
});

// Amended by professional-posting c12 (Afik 19.10, DR-1): a Professional reads the thread, likes, comments and replies, and the composer shows no name notice
// (no name is shown for them, DR-3). Supersedes F3.3 c15 ("sees the post but no like, no comment box, ..."), which asserted the old 403.
test.describe('F3.3 c15 [FR-FEED-001] [professional-posting c12] a Professional', () => {
  test('[c15][professional-posting c12] sees the thread, "לייק", the comment box and "השבה"; the box and the reply box carry no name notice; no alert', async ({ page }) => {
    await setupComments(page, thread(), { professional: true });
    await open(page, POST);
    await expect(page.getByRole('heading', { level: 1, name: 'פוסט' })).toBeVisible();
    await expect(item(page, 'שלום מנועה')).toBeVisible();
    await expect(postLike(page)).toBeVisible();
    await expect(box(page)).toBeVisible();
    await expect(btn(item(page, 'שלום מנועה'), 'השבה')).toBeVisible();
    await expect(page.getByText(NAME_NOTICE_COMMENT)).toHaveCount(0);
    await btn(item(page, 'שלום מנועה'), 'השבה').click();
    await expect(page.getByRole('textbox', { name: 'כתיבת השבה', exact: true })).toBeVisible();
    await expect(page.getByText(NAME_NOTICE_COMMENT)).toHaveCount(0);
    await expect(alert(page, LOAD_FAILED)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'נסו שוב', exact: true })).toHaveCount(0);
  });
  test('[c15][professional-posting c12] a Professional sends a comment: it is added with "התגובה נוספה", and likes the post', async ({ page }) => {
    const net = await setupComments(page, thread(), { professional: true });
    await open(page, POST);
    await box(page).fill('תגובה לדוגמה');
    await btn(form(page), 'שליחה').click();
    await expect(status(page, 'התגובה נוספה')).toBeVisible();
    expect(net.sends).toEqual([{ body: 'תגובה לדוגמה' }]);
    await postLike(page).click();
    await expect(btn(region(page), 'לייק, 1').first()).toHaveAttribute('aria-pressed', 'true');
    expect(net.calls).toContain(`PUT /api/posts/${OTHERS_ID}/like`);
  });
  test("[c15][professional-posting c12] a comment whose author.name is null shows 'מהקהילה' as its name, also when it is the Professional's own", async ({ page }) => {
    await setupComments(page, [top(1, 'התגובה שלי', [], { isMine: true, author: { name: null } })], { professional: true });
    await open(page, POST);
    await expect(list(page).getByRole('listitem', { name: 'מהקהילה', exact: true })).toHaveCount(1);
  });
});

test.describe('F3.3 c17 [VAL-036] the composer', () => {
  test('[c17] a NUL character gets its own message and nothing is sent', async ({ page }) => {
    const net = await start(page);
    await box(page).fill('שלום\u0000עולם');
    await btn(form(page), 'שליחה').click();
    await expect(form(page).getByText('יש בטקסט תו שאי אפשר לשמור. אפשר להסיר אותו ולנסות שוב')).toBeVisible();
    await expect(form(page).getByText(/ארוכה/)).toHaveCount(0);
    expect(net.sends).toEqual([]);
  });
  test('[c17] the counter counts the trimmed text: 1,000 characters and a trailing newline are not "over" and are sent', async ({ page }) => {
    const net = await start(page);
    await box(page).fill(`${'א'.repeat(1000)}\n`);
    await expect(form(page).getByText('לא נותרו תווים')).toBeVisible();
    await expect(form(page).getByText(/ארוכה/)).toHaveCount(0);
    await btn(form(page), 'שליחה').click();
    await expect(status(page, 'התגובה נוספה')).toBeVisible();
    expect(net.sends).toHaveLength(1);
  });
  test('[c17] blank or spaces: the field message shows, the box is focused and invalid, nothing is sent', async ({ page }) => {
    const net = await start(page);
    await box(page).fill('   ');
    await btn(form(page), 'שליחה').click();
    await expect(form(page).getByText('יש לכתוב משהו לפני השליחה')).toBeVisible();
    await expect(box(page)).toBeFocused();
    await expect(box(page)).toHaveAttribute('aria-invalid', 'true');
    expect(await box(page).getAttribute('aria-describedby')).toBeTruthy();
    expect(net.sends).toEqual([]);
  });
  test('[c17] 1,001 characters: the too-long message shows, the text stays, nothing is sent; 1,000 is sent', async ({ page }) => {
    const net = await start(page);
    await box(page).fill('א'.repeat(1001));
    await btn(form(page), 'שליחה').click();
    await expect(form(page).getByText('התגובה ארוכה מדי. אפשר לקצר אותה עד 1,000 תווים')).toBeVisible();
    await expect(box(page)).toHaveValue('א'.repeat(1001));
    expect(net.sends).toEqual([]);
    await box(page).fill('א'.repeat(1000));
    await btn(form(page), 'שליחה').click();
    await expect.poll(() => net.sends.length).toBe(1);
    expect(String(net.sends[0]?.body)).toHaveLength(1000);
  });
  test('[c17] the counter appears at 100 left or fewer and speaks the limit', async ({ page }) => {
    await start(page);
    const f = form(page);
    await box(page).fill('א'.repeat(899));
    await expect(f.getByText(/נותרו \d+ תווים|נותר תו אחד|לא נותרו תווים|ארוכה ב/)).toHaveCount(0);
    await box(page).fill('א'.repeat(900));
    await expect(f.getByText('נותרו 100 תווים')).toBeVisible();
    await box(page).fill('א'.repeat(999));
    await expect(f.getByText('נותר תו אחד')).toBeVisible();
    await box(page).fill('א'.repeat(1000));
    await expect(f.getByText('לא נותרו תווים')).toBeVisible();
    await box(page).fill('א'.repeat(1005));
    await expect(f.getByText('התגובה ארוכה ב-5 תווים מהמותר')).toBeVisible();
    await box(page).fill('א'.repeat(1001));
    await expect(f.getByText('התגובה ארוכה בתו אחד מהמותר')).toBeVisible();
  });
  test('[c17] a sent comment appends the server\'s version (trimmed), clears the box and says "התגובה נוספה"', async ({ page }) => {
    const net = await start(page);
    await box(page).fill('  תודה רבה  ');
    await btn(form(page), 'שליחה').click();
    await expect(status(page, 'התגובה נוספה')).toBeVisible();
    await expect(box(page)).toHaveValue('');
    expect(net.sends.map((s) => String(s.body).trim())).toEqual(['תודה רבה']);
    const last = list(page).locator(':scope > li').last();
    await expect(last).toContainText('תודה רבה');
    expect(await offersDelete(page, last)).toBe(true);
  });
  test('[c17] a failed send keeps the text and alerts "התגובה לא נשלחה. אפשר לנסות שוב"; the next try works', async ({ page }) => {
    const net = await start(page, thread(), (n) => {
      n.fail.send = 500;
    });
    await box(page).fill('טקסט שחשוב לשמור');
    await btn(form(page), 'שליחה').click();
    await expect(alert(page, SEND_FAILED)).toBeVisible();
    await expect(box(page)).toHaveValue('טקסט שחשוב לשמור');
    net.fail.send = null;
    await btn(form(page), 'שליחה').click();
    await expect(status(page, 'התגובה נוספה')).toBeVisible();
  });
  test('[c17] a double click sends once, with "שולחים" disabled meanwhile', async ({ page }) => {
    const net = await start(page);
    const g = gate();
    net.holdSend = g.promise;
    await box(page).fill('פעם אחת');
    await btn(form(page), 'שליחה').dblclick();
    await expect(btn(form(page), 'שולחים')).toBeDisabled();
    await page.waitForTimeout(300);
    g.release();
    await expect(status(page, 'התגובה נוספה')).toBeVisible();
    expect(net.sends).toHaveLength(1);
  });
  test('[c17] a reply: "השבה" opens the box with focus, the send names the parent, the reply lands under it, "ביטול" returns focus', async ({ page }) => {
    const net = await start(page);
    const a = item(page, 'ללא שם');
    await btn(a, 'השבה').click();
    const replyBox = page.getByRole('textbox', { name: 'כתיבת השבה', exact: true });
    await expect(replyBox).toBeFocused();
    await btn(page.getByRole('form', { name: 'כתיבת השבה', exact: true }), 'ביטול').click();
    await expect(replyBox).toHaveCount(0);
    await expect(btn(a, 'השבה')).toBeFocused();
    await btn(a, 'השבה').click();
    await replyBox.fill('הנה תשובה');
    await btn(page.getByRole('form', { name: 'כתיבת השבה', exact: true }), 'שליחה').click();
    await expect(status(page, 'התגובה נוספה')).toBeVisible();
    expect(net.sends).toEqual([{ body: 'הנה תשובה', parentId: cid(4) }]);
    await expect(a.getByRole('list', { name: 'השבות' })).toContainText('הנה תשובה');
  });
  test('[c17] a blank reply shows the field message with focus on the reply box', async ({ page }) => {
    const net = await start(page);
    await btn(item(page, 'ללא שם'), 'השבה').click();
    await btn(page.getByRole('form', { name: 'כתיבת השבה', exact: true }), 'שליחה').click();
    await expect(page.getByText('יש לכתוב משהו לפני השליחה')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'כתיבת השבה', exact: true })).toBeFocused();
    expect(net.sends).toEqual([]);
  });
  test('[c17] keyboard only: type, Tab to "שליחה", Enter sends', async ({ page }) => {
    const net = await start(page);
    await box(page).focus();
    await page.keyboard.type('בלי עכבר');
    await page.keyboard.press('Tab');
    await expect(btn(form(page), 'שליחה')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(status(page, 'התגובה נוספה')).toBeVisible();
    expect(net.sends).toEqual([{ body: 'בלי עכבר' }]);
  });
});

test.describe('F3.3 c18 [FR-FEED-001] delete my comment', () => {
  test('[c18] the dialog names the stakes; cancel is focused; Esc and cancel change nothing', async ({ page }) => {
    const net = await start(page);
    await openDelete(page, item(page, 'שלי\nשורה'));
    await expect(confirm(page)).toBeVisible();
    await expect(confirm(page)).toContainText('המחיקה מיידית ולצמיתות');
    await expect(confirm(page)).toContainText('גם ההשבות אליה יימחקו');
    await expect(btn(confirm(page), 'ביטול')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm(page)).toHaveCount(0);
    await openDelete(page, item(page, 'שלי\nשורה'));
    await btn(confirm(page), 'ביטול').click();
    await expect(confirm(page)).toHaveCount(0);
    expect(net.calls.filter((c) => c.startsWith('DELETE /api/comments/'))).toEqual([]);
    await expect(item(page, 'שלי\nשורה')).toBeVisible();
  });
  test('[c18] a reply\'s dialog does not mention replies', async ({ page }) => {
    await start(page);
    await openDelete(page, reply(page, 'השבה שלי'));
    await expect(confirm(page)).toContainText('המחיקה מיידית ולצמיתות');
    await expect(confirm(page)).not.toContainText('גם ההשבות');
  });
  test('[c18] confirming removes the comment and its replies, says "התגובה נמחקה" and focuses the heading', async ({ page }) => {
    const net = await start(page);
    await openDelete(page, item(page, 'שלי\nשורה'));
    await btn(confirm(page), 'מחיקת התגובה').click();
    await expect(confirm(page)).toHaveCount(0);
    await expect(page.getByText('שורה שניה')).toHaveCount(0);
    await expect(page.getByText('השבה על שלי')).toHaveCount(0);
    await expect(item(page, 'שלום מנועה')).toBeVisible();
    await expect(status(page, 'התגובה נמחקה')).toBeVisible();
    await expect(heading(page)).toBeFocused();
    expect(net.calls.filter((c) => c.startsWith('DELETE /api/comments/'))).toEqual([`DELETE /api/comments/${cid(3)}`]);
  });
  test('[c18] a failed delete keeps the dialog with the alert; the next confirm deletes', async ({ page }) => {
    const net = await start(page, thread(), (n) => {
      n.fail.remove = 500;
    });
    await openDelete(page, reply(page, 'השבה שלי'));
    await btn(confirm(page), 'מחיקת התגובה').click();
    await expect(confirm(page).getByRole('alert').filter({ hasText: 'המחיקה לא הצליחה. אפשר לנסות שוב' })).toBeVisible();
    await expect(confirm(page)).toBeVisible();
    await expect(page.getByText('השבה שלי')).toBeVisible();
    net.fail.remove = null;
    await btn(confirm(page), 'מחיקת התגובה').click();
    await expect(page.getByText('השבה שלי')).toHaveCount(0);
    await expect(status(page, 'התגובה נמחקה')).toBeVisible();
  });
  test('[c18][F3.7 c9] keyboard only: Enter on the "⋯" and on "מחיקה" opens the dialog on cancel; Tab reaches the confirm button', async ({ page }) => {
    await start(page);
    await moreBtn(item(page, 'שלי\nשורה')).focus();
    await page.keyboard.press('Enter');
    await expect(menuItem(page, 'מחיקה')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(btn(confirm(page), 'ביטול')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(btn(confirm(page), 'מחיקת התגובה')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm(page)).toHaveCount(0);
  });
});

test.describe('F3.3 c20 [NFR accessibility] axe, touch size, focus', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c20] ${label}: the thread passes axe; like, reply and the comment menu button are at least 44x44 with a visible focus`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      await expect(list(page)).toBeVisible();
      await scan(page);
      for (const control of [postLike(page), btn(item(page, 'שלום מנועה'), 'לייק, 2'), btn(item(page, 'שלום מנועה'), 'השבה'), moreBtn(item(page, 'שלי\nשורה'))]) {
        const size = await control.boundingBox();
        expect(size?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(size?.height ?? 0).toBeGreaterThanOrEqual(44);
        await page.keyboard.press('Tab');
        await control.focus();
        const ring = await control.evaluate((el) => {
          const s = getComputedStyle(el);
          return (s.outlineStyle !== 'none' && s.outlineWidth !== '0px') || s.boxShadow !== 'none';
        });
        expect(ring).toBe(true);
      }
    });
    test(`[c20] ${label}: the open reply box and the delete dialog pass axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await start(page);
      await btn(item(page, 'ללא שם'), 'השבה').click();
      await scan(page);
      await openDelete(page, item(page, 'שלי\nשורה'));
      await expect(confirm(page)).toBeVisible();
      await scan(page);
    });
    test(`[c20] ${label}: the load error and the empty state pass axe`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await start(page, [], (n) => {
        n.fail.thread = 500;
      });
      await expect(alert(page, LOAD_FAILED)).toBeVisible();
      await scan(page);
      net.fail.thread = null;
      await btn(region(page), 'נסו שוב').click();
      await expect(page.getByText('עוד אין תגובות. אפשר לכתוב את התגובה הראשונה')).toBeVisible();
      await scan(page);
    });
  }
});
