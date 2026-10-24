// Layer 1 (Afik 24.10, decisions-in-force §14.1), the blocking half of the UI checks: every screen the pixel visual specs cover
// (e2e/*.visual.spec.ts), at phone (375x812) and desktop (1280x800) in one test, against the rules of e2e/support/layout-rules.ts:
// the screen's skeleton (headings, buttons, links, key texts by role and name), rtl, no horizontal scroll, no text cut off, no
// overlap, and axe. No images: a deliberate design change passes, only real breakage fails. The skeletons state what each screen
// is for, from its spec and SRS texts, not from its markup. The visual specs stay as they were and no longer block (ci.yml).
// Each test opens its own contexts on read-only stubs and shares no state, hooks or order with another: parallel (P3,
// tools/ci-browser.test.mjs PARALLEL_FILES).
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { APP, MENU_BUTTON, open, pathOf } from './app-helpers';
import { openStory } from './helpers';
import { SCREENS } from './visual-screens';
import { STORYBOOK_PORT } from '../playwright.ports';
import type { Screen } from './visual-screens';
import { button, heading, layoutProblems, link, role, text } from './support/layout-rules';
import type { Skeleton } from './support/layout-rules';
import { EMAIL } from './support/journeys-stub';
import { ANON_MINE, ANON_MINE_ID, ANON_OTHERS, ANON_OTHERS_ID, MINE, OTHERS, POST_ID, setupPosts } from './support/posts-stub';
import { setupComments, top } from './support/comments-stub';
import { id as feedId, named, pageOf, range, setupFeed, share } from './support/feed-stub';
import { id, originalOf, setupShare, shareView } from './support/share-stub';
import { EDIT_ITEM, chooseFromPostMenu, postMore } from './support/post-menu';
import { anonToggle, bodyBox, choice, feedCards, feedStatus, openComposer, openFeedAt, publishButton } from './support/composer';

test.describe.configure({ mode: 'parallel' });

const STORYBOOK = `http://127.0.0.1:${STORYBOOK_PORT}`;
const SIZES = [
  { label: '375', viewport: { width: 375, height: 812 } },
  { label: '1280', viewport: { width: 1280, height: 800 } },
] as const;
type Size = (typeof SIZES)[number];

/**
 * Opens the screen afresh at each size, in a context of its own (a signed-in session in storage would otherwise skip the second
 * sign-in), checks it there, and asserts once with both sizes' problems.
 */
async function checkAtBothSizes(browser: Browser, baseURL: string, skeleton: Skeleton, show: (page: Page, size: Size) => Promise<void>): Promise<void> {
  const problems: string[] = [];
  for (const size of SIZES) {
    const context = await browser.newContext({ baseURL, viewport: size.viewport, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      await show(page, size);
      problems.push(...(await layoutProblems(page, skeleton)).map((p) => `@${size.label} ${p}`));
    } finally {
      await context.close();
    }
  }
  expect(problems).toEqual([]);
}

// ---- the screens of e2e/visual-screens.ts --------------------------------------------------------------------------------------

const FAILED_RETRY = 'נסו שוב';
const SAVE_FAILED = 'השמירה לא הצליחה. אפשר לנסות שוב';
const JOURNEYS = heading('המסע שלי', 2);
const REPORT_FORM: Skeleton = [
  role('radiogroup', 'מה הבעיה?'),
  role('radio', /^תוכן שמסכן ילד/),
  role('textbox', /^פרטים נוספים/),
  link(/^כללי הקהילה/),
  button('ביטול'),
];
const reportSheet = (title: string, ...more: Skeleton): Skeleton => [role('dialog', title), heading(title), ...REPORT_FORM, ...more];

const SKELETONS: Record<string, Skeleton> = {
  // F1.6: recovery for a Guest; the recovery questions, change and setup modes.
  recovery: [heading('שחזור סיסמה', 1), role('textbox', 'אימייל'), role('group', 'ענו על השתיים שבחרתם בהרשמה'), button('עדכון הסיסמה'), link('חזרה')],
  'recovery-questions-change': [
    heading('שאלות לשחזור סיסמה', 1),
    role('group', 'ענו על השתיים ששמרתם עכשיו'),
    role('group', 'בחרו שתיים מהשאלות החדשות וענו עליהן'),
    button('שמירה'),
  ],
  'recovery-questions-setup': [heading('שאלות לשחזור סיסמה', 1), role('group', 'בחרו שתיים מהשאלות וענו עליהן'), button('שמירה')],
  // F2.0: the forced new password; the password change.
  'set-new-password': [
    heading('קביעת סיסמה חדשה', 1),
    text('כדי להגן על החשבון, צריך לקבוע סיסמה חדשה. הסיסמה הקודמת בוטלה, וכל המכשירים האחרים נותקו מהחשבון.'),
    button('הצגת הסיסמה'),
    button('שמירת הסיסמה'),
  ],
  'password-change': [
    heading('החלפת סיסמה', 1),
    text('כדי להחליף את הסיסמה, צריך קודם לענות על שתי שאלות השחזור ששמרתם.'),
    role('group', 'ענו על השתיים ששמרתם עכשיו'),
    button('הצגת הסיסמה'),
    button('החלפת הסיסמה'),
  ],
  // F2.5: the side menu open over the feed.
  'side-menu-open': [heading('הפיד', 1), role('dialog', 'תפריט'), button('סגירת התפריט'), button('התנתקות')],
  settings: [
    heading('הגדרות', 1),
    heading('חשבון', 2),
    heading('פרטיות ואבטחה', 2),
    heading('תנאים ופרטיות', 2),
    link('עריכת פרופיל'),
    role('radiogroup', 'צפייה בפרופיל'),
    link('החלפת סיסמה'),
    link('תנאי השימוש'),
    link('מדיניות הפרטיות'),
  ],
  // F2.1: the own profile.
  'profile-view': [heading('פרופיל', 1), text('דנה כהן'), button('עריכה')],
  'profile-edit': [heading('פרופיל', 1), role('textbox', /^שם מלא/), button('שמירה'), button('ביטול')],
  'profile-edit-errors': [heading('פרופיל', 1), role('textbox', /^שם מלא/), text(/יש למלא שם מלא/), button('שמירה')],
  'profile-load-failed': [heading('פרופיל', 1), text('לא הצלחנו לטעון את הפרופיל. אפשר לנסות שוב'), button(FAILED_RETRY)],
  'profile-edit-save-failed': [heading('פרופיל', 1), text(SAVE_FAILED), button('שמירה'), button('ביטול')],
  // F2.2a, F2.2b: "המסע שלי".
  'journey-view': [JOURNEYS, text('נועה'), text('איתי'), button('הלידה התרחשה'), button('סיום מסלול ההריון'), button('הוספת ילד')],
  'journey-view-empty': [JOURNEYS, text('מתכננים'), button('הוספת ילד'), button('הוספת הריון')],
  'journey-load-failed': [JOURNEYS, text('לא הצלחנו לטעון את פרטי המסע. אפשר לנסות שוב'), button(FAILED_RETRY)],
  'child-form': [JOURNEYS, role('textbox', /^שם/), role('group', /^תאריך לידה/), button('שמירה'), button('ביטול')],
  'child-form-errors': [JOURNEYS, text(/יש למלא שם$/), text(/יש לבחור מין/), text(/יש למלא תאריך לידה/), button('שמירה')],
  'children-limit': [JOURNEYS, text(/^אפשר להוסיף עד \d+ ילדים$/), button('הוספת ילד')],
  'journey-save-failed': [JOURNEYS, text(SAVE_FAILED), button('שמירה'), button('ביטול')],
  'pregnancy-form': [JOURNEYS, role('group', /^תאריך לידה משוער/), button('שמירה'), button('ביטול')],
  'pregnancy-form-errors': [JOURNEYS, role('group', /^תאריך לידה משוער/), button('שמירה')],
  'journey-view-add-pregnancy': [JOURNEYS, text('יש לנו ילד או ילדה'), button('הוספת ילד'), button('הוספת הריון')],
  'journey-confirm': [role('alertdialog', 'להסיר את נועה?'), heading('להסיר את נועה?'), text('הפרטים יימחקו ולא ניתן לשחזר אותם'), button('הסרה'), button('ביטול')],
  'journey-confirm-planning': [role('alertdialog', "מסלול 'מתכננים' יסתיים ויימחק"), heading("מסלול 'מתכננים' יסתיים ויימחק"), button('הוספת הריון'), button('ביטול')],
  'journey-confirm-failed': [role('alertdialog', 'להסיר את נועה?'), heading('להסיר את נועה?'), text('הפעולה לא הצליחה. אפשר לנסות שוב'), button('הסרה'), button('ביטול')],
  'journey-view-none': [JOURNEYS, text('עוד לא נבחר שלב במסע'), button('הוספת ילד'), button('הוספת הריון')],
  'birth-form': [JOURNEYS, role('textbox', /^שם/), role('group', /^תאריך לידה/), button('שמירה'), button('ביטול')],
  // F2.3a: privacy.
  'privacy-settings': [
    heading('פרטיות ואבטחה', 2),
    role('radiogroup', 'צפייה בפרופיל'),
    role('checkbox', 'הצגת המשפט כשאין ילדים והריון'),
    role('checkbox', 'יום הולדת של ילד בהתראות לחברים'),
    button('שמירה'),
  ],
  'privacy-settings-load-failed': [heading('פרטיות ואבטחה', 2), text('לא הצלחנו לטעון את הגדרות הפרטיות. אפשר לנסות שוב'), button(FAILED_RETRY)],
  'privacy-settings-save-failed': [heading('פרטיות ואבטחה', 2), text(SAVE_FAILED), role('radiogroup', 'צפייה בפרופיל'), button('שמירה')],
  // F2.4b, F2.4c2: Friends.
  friends: [
    heading('חברים', 1),
    heading('בקשות שקיבלת', 2),
    heading('בקשות ששלחת', 2),
    heading('החברים שלי', 2),
    button('אישור בקשת החברות של דנה כהן'),
    button('דחייה בקשת החברות של דנה כהן'),
    button('ביטול בקשת החברות לנעם ברק'),
    button('הסרה של Avi Mizrahi'),
    button('העתקת הקישור לפרופיל שלי'),
  ],
  'friends-empty': [heading('חברים', 1), text('אין בקשות חברות שממתינות לתשובה'), text('אין בקשות ששלחת וממתינות לתשובה'), text('עדיין אין חברים ברשימה')],
  'friends-remove': [
    role('alertdialog', 'להסיר את מירי אברהם מהחברים?'),
    heading('להסיר את מירי אברהם מהחברים?'),
    text('אפשר לשלוח בקשת חברות חדשה בהמשך'),
    button('הסרה'),
    button('ביטול'),
  ],
  'friends-link-shown': [
    heading('חברים', 1),
    text('לא הצלחנו להעתיק. אפשר לסמן את הקישור ולהעתיק אותו'),
    text('https://app.nestly.example/u/7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a99'),
  ],
  // F2.4c2: another person's profile.
  'user-profile': [
    heading('נועה רז', 1),
    button('שליחת בקשת חברות לנועה רז'),
    heading('החברים של נועה רז', 2),
    heading('חברים משותפים', 2),
    button('דיווח על הפרופיל של נועה רז'),
    button('חסימה של נועה רז'),
  ],
  'user-profile-restricted': [heading('נועה רז', 1), button('שליחת בקשת חברות לנועה רז'), button('דיווח על הפרופיל של נועה רז')],
  'user-profile-friend': [heading('נועה רז', 1), button('הסרה מהחברים של נועה רז'), heading('החברים של נועה רז', 2), button('דיווח על הפרופיל של נועה רז')],
  'user-profile-unavailable': [heading('הפרופיל לא זמין', 1)],
  'user-profile-rate-limited': [heading('פרופיל', 1), text('נפתחו הרבה פרופילים בזמן קצר. אפשר לנסות שוב מאוחר יותר')],
  'user-profile-load-failed': [heading('פרופיל', 1), text('לא הצלחנו לטעון את הפרופיל. אפשר לנסות שוב'), button(FAILED_RETRY)],
  // F3.7: reporting.
  'report-sheet-post': reportSheet('דיווח על פוסט', button('שליחת הדיווח')),
  'report-sheet-comment': reportSheet('דיווח על תגובה', button('שליחת הדיווח')),
  'report-sheet-profile': reportSheet('דיווח על פרופיל', button('שליחת הדיווח')),
  'report-sheet-no-reason': reportSheet('דיווח על פוסט', text(/יש לבחור סיבה/), button('שליחת הדיווח')),
  'report-sheet-other-without-text': reportSheet('דיווח על פוסט', text(/בבחירת 'אחר' יש לכתוב מה הבעיה/), button('שליחת הדיווח')),
  'report-sheet-too-long': reportSheet('דיווח על פוסט', text(/הטקסט ארוך מדי/), button('שליחת הדיווח')),
  'report-sheet-sending': reportSheet('דיווח על פוסט', button('שולחים')),
  'report-sheet-failed': reportSheet('דיווח על פוסט', text('הדיווח לא נשלח. אפשר לנסות שוב'), button('שליחת הדיווח')),
  'comment-menu-others': [heading('תגובות', 2), role('menuitem', 'דיווח על התגובה')],
  'comment-menu-own': [heading('תגובות', 2), role('menuitem', 'מחיקה')],
  'comment-report-open': reportSheet('דיווח על תגובה', button('שליחת הדיווח')),
  'post-report-open': reportSheet('דיווח על פוסט', button('שליחת הדיווח')),
  'post-reported': [heading('פוסט', 1), text('הדיווח נשלח. הפוסט לא יוצג לכם יותר'), link('חזרה לפיד')],
  'post-report-unavailable': [heading('פוסט', 1), text('אי אפשר לדווח על זה. ייתכן שהתוכן כבר לא זמין'), button('פעולות נוספות לפוסט')],
  'user-profile-report-open': reportSheet('דיווח על פרופיל', button('שליחת הדיווח')),
  'community-rules': [heading('כללי הקהילה', 1), role('list', 'כללי הקהילה'), text('כבוד הדדי'), text('מדווחים במקום להתווכח'), link('מוקדי רפואה')],
};

test('[layer 1] every screen of e2e/visual-screens.ts has a skeleton here, and every skeleton a screen', () => {
  expect(Object.keys(SKELETONS).sort()).toEqual(SCREENS.map((s) => s.name).sort());
});

async function showScreen(page: Page, screen: Screen): Promise<void> {
  if (screen.kind === 'story') await openStory(page, screen.id);
  else {
    await open(page, screen.route, screen.state);
    if (screen.openMenu === true) await page.getByRole('button', { name: MENU_BUTTON }).click();
  }
}

for (const screen of SCREENS) {
  test(`[layer 1] ${screen.name}: skeleton, rtl, no horizontal scroll, no cut text, no overlap, axe at 375 and 1280`, async ({ browser }) => {
    test.setTimeout(60_000);
    const skeleton = SKELETONS[screen.name];
    if (skeleton === undefined) throw new Error(`no skeleton for ${screen.name}`);
    await checkAtBothSizes(browser, STORYBOOK, skeleton, (page) => showScreen(page, screen));
  });
}

// ---- the flows of the other visual specs (anonymous-post, feed-composer, professional-posting, share, ux-polish-b) ------------------

async function signInAt(page: Page, path: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.goto(path);
}

const FEED = heading('הפיד', 1);
const POST = heading('פוסט', 1);
const COMPOSER: Skeleton = [FEED, role('form', 'כתיבת פוסט'), role('textbox', 'מה תרצו לשתף?'), button('פרסום'), role('feed', 'פוסטים בפיד')];
const PRO_AUDIENCE: Skeleton = [role('radiogroup', 'מי יראה את הפוסט'), role('radio', 'כולם'), role('radio', 'עוקבים בלבד')];
const threeCards = async (page: Page) => {
  const net = await setupFeed(page, () => pageOf(range(1, 3), null));
  await openFeedAt(page, net);
  await expect(feedCards(page)).toHaveCount(3);
};

interface Flow {
  name: string;
  skeleton: Skeleton;
  show: (page: Page, size: Size) => Promise<void>;
}

const FLOWS: Flow[] = [
  // anonymous-post.visual.spec.ts (F3.4)
  {
    name: 'anonymous post: composer open, toggle unchecked',
    skeleton: [...COMPOSER, role('checkbox', 'פרסום אנונימי'), role('radiogroup', 'מי יראה את הפוסט')],
    show: async (page) => {
      await threeCards(page);
      await openComposer(page);
      await expect(anonToggle(page)).not.toBeChecked();
    },
  },
  {
    name: 'anonymous post: composer open, toggle checked',
    skeleton: [...COMPOSER, role('checkbox', 'פרסום אנונימי')],
    show: async (page) => {
      await threeCards(page);
      await openComposer(page);
      await anonToggle(page).check();
      await expect(page.getByRole('radiogroup', { name: 'מי יראה את הפוסט' })).toHaveCount(0);
    },
  },
  {
    name: 'anonymous post: post page as its real author',
    skeleton: [POST, text('פרסמתם את הפוסט הזה באופן אנונימי. רק אתם רואים את ההודעה הזו'), button('פעולות נוספות לפוסט'), heading('תגובות', 2)],
    show: async (page) => {
      await setupPosts(page, { posts: [MINE, ANON_MINE] });
      await signInAt(page, `/posts/${ANON_MINE_ID}`);
    },
  },
  {
    name: 'anonymous post: post page as a reader',
    skeleton: [POST, text('אנונימי'), text('שאלה אנונימית של מישהי'), heading('תגובות', 2)],
    show: async (page) => {
      await setupPosts(page, { posts: [OTHERS, ANON_OTHERS] });
      await signInAt(page, `/posts/${ANON_OTHERS_ID}`);
    },
  },
  {
    name: 'anonymous post: edit form',
    skeleton: [POST, role('form', 'עריכת פוסט'), text('הפוסט אנונימי ומוצג לכולם. אי אפשר לשנות את זה'), button('שמירה'), button('ביטול')],
    show: async (page) => {
      await setupPosts(page, { posts: [ANON_MINE] });
      await signInAt(page, `/posts/${ANON_MINE_ID}`);
      await chooseFromPostMenu(page, EDIT_ITEM);
    },
  },
  {
    name: 'anonymous post: comment thread, name notice (reader)',
    skeleton: [POST, heading('תגובות', 2), text('תגובה ראשונה'), text('השם שלכם יוצג לכל מי שיכול לראות את התגובה')],
    show: async (page) => {
      await setupComments(page, [top(1, 'תגובה ראשונה', [], { author: { name: 'נועה' } })], { posts: [ANON_OTHERS] });
      await signInAt(page, `/posts/${ANON_OTHERS_ID}`);
    },
  },
  {
    name: 'anonymous post: comment thread, "המחבר" notice (real author)',
    skeleton: [POST, heading('תגובות', 2), text('תגובה ראשונה'), text('בפוסט הזה התגובות שלכם מוצגות תחת "המחבר", בלי השם שלכם')],
    show: async (page) => {
      await setupComments(page, [top(1, 'תגובה ראשונה', [], { author: { name: 'נועה' } })], { posts: [ANON_MINE] });
      await signInAt(page, `/posts/${ANON_MINE_ID}`);
    },
  },
  // feed-composer.visual.spec.ts (feed composer)
  {
    name: 'feed composer: idle',
    skeleton: COMPOSER,
    show: async (page) => {
      await threeCards(page);
      await expect(bodyBox(page)).toBeVisible();
      await expect(anonToggle(page)).toHaveCount(0);
    },
  },
  {
    name: 'feed composer: engaged',
    skeleton: [...COMPOSER, role('radiogroup', 'מי יראה את הפוסט'), role('checkbox', 'פרסום אנונימי')],
    show: async (page) => {
      await threeCards(page);
      await openComposer(page);
      await bodyBox(page).fill('שאלה קטנה על שינה');
      await choice(page, 'חברים בלבד').click();
    },
  },
  {
    name: 'feed composer: after a success',
    skeleton: [...COMPOSER, text('הפוסט פורסם')],
    show: async (page) => {
      await threeCards(page);
      await openComposer(page);
      await bodyBox(page).fill('הפוסט הראשון שלי, עם שאלה קטנה על שינה');
      await choice(page, 'חברים בלבד').click();
      await choice(page, 'בהריון').click();
      await publishButton(page).click();
      await expect(feedCards(page)).toHaveCount(4);
      await expect(feedStatus(page)).toHaveText('הפוסט פורסם');
    },
  },
  // professional-posting.visual.spec.ts (a Professional's posting)
  {
    name: 'professional posting: composer idle',
    skeleton: COMPOSER,
    show: async (page) => {
      const net = await setupFeed(page, () => pageOf(range(1, 3), null), { professional: true });
      await openFeedAt(page, net);
      await expect(feedCards(page)).toHaveCount(3);
    },
  },
  {
    name: 'professional posting: composer engaged',
    // I11 (AC-130): the fixed line "הפוסט יוצג לכולם" gave way to the audience group "כולם" / "עוקבים בלבד".
    skeleton: [...COMPOSER, ...PRO_AUDIENCE],
    show: async (page) => {
      const net = await setupFeed(page, () => pageOf(range(1, 3), null), { professional: true });
      await openFeedAt(page, net);
      await expect(feedCards(page)).toHaveCount(3);
      await bodyBox(page).click();
      await bodyBox(page).fill('שאלה קטנה על שינה');
    },
  },
  {
    name: 'professional posting: own post, edit form',
    skeleton: [POST, role('form', 'עריכת פוסט'), ...PRO_AUDIENCE, button('שמירה'), button('ביטול')],
    show: async (page) => {
      await setupPosts(page, { posts: [{ ...MINE, stageTag: null }], professional: true });
      await signInAt(page, `/posts/${POST_ID}`);
      await chooseFromPostMenu(page, EDIT_ITEM);
    },
  },
  // share.visual.spec.ts (F3.5, F3.6)
  {
    name: 'sharing: share window',
    skeleton: [FEED, role('dialog', 'שיתוף בפיד'), heading('שיתוף בפיד'), role('textbox', 'הטקסט שלכם (לא חובה)'), role('radiogroup', 'מי יראה את השיתוף'), button('שיתוף'), button('ביטול')],
    show: async (page) => {
      const net = await setupShare(page, () => pageOf([named(1, { body: 'שאלה על שינה של תינוקות בני חצי שנה' })], null));
      await openFeedAt(page, net);
      await feedCards(page).first().getByRole('button', { name: 'שיתוף בפיד', exact: true }).click();
      await page.getByRole('dialog', { name: 'שיתוף בפיד' }).getByRole('textbox', { name: 'הטקסט שלכם (לא חובה)' }).fill('מצאתי את זה מועיל');
    },
  },
  {
    name: 'sharing: share window after a refusal',
    skeleton: [FEED, role('dialog', 'שיתוף בפיד'), text('אי אפשר לשתף את הפוסט הזה'), role('textbox', 'הטקסט שלכם (לא חובה)'), button('שיתוף')],
    show: async (page) => {
      const net = await setupShare(page, () => pageOf([named(1)], null));
      net.shareAnswer = 403;
      await openFeedAt(page, net);
      await feedCards(page).first().getByRole('button', { name: 'שיתוף בפיד', exact: true }).click();
      const box = page.getByRole('dialog', { name: 'שיתוף בפיד', exact: true });
      await box.getByRole('textbox', { name: 'הטקסט שלכם (לא חובה)', exact: true }).fill('מצאתי את זה מועיל');
      await box.getByRole('button', { name: 'שיתוף', exact: true }).click();
      await expect(box.getByRole('alert')).toHaveText('אי אפשר לשתף את הפוסט הזה');
    },
  },
  {
    name: 'sharing: post page of a share with its original',
    skeleton: [POST, text('המלצה חמה'), text('גוף הפוסט המקורי, כפי שנכתב'), link('לפוסט המקורי')],
    show: async (page) => {
      const net = await setupShare(page, () => pageOf([], null), { posts: [] });
      net.views[id(5)] = shareView(5, originalOf(9, { body: 'גוף הפוסט המקורי, כפי שנכתב', author: { name: 'מחברת המקור' } }), { sharerText: 'המלצה חמה', author: { name: 'המשתפת' } });
      await openFeedAt(page, net, `/posts/${id(5)}`);
    },
  },
  {
    name: 'sharing: post page of a share whose original is gone',
    skeleton: [POST, text('המלצה חמה'), text('הפוסט המקורי כבר לא זמין')],
    show: async (page) => {
      const net = await setupShare(page, () => pageOf([], null), { posts: [] });
      net.views[id(5)] = shareView(5, { available: false }, { sharerText: 'המלצה חמה', author: { name: 'המשתפת' } });
      await openFeedAt(page, net, `/posts/${id(5)}`);
    },
  },
  {
    name: 'sharing: ShareSheet of a post',
    skeleton: [FEED, role('dialog', 'שיתוף קישור'), heading('שיתוף קישור'), link(/^וואטסאפ/), link(/^אימייל/), button('העתקת קישור')],
    show: async (page) => {
      const net = await setupShare(page, () => pageOf([named(1), share(2, originalOf(9))], null));
      await openFeedAt(page, net);
      await feedCards(page).first().getByRole('button', { name: 'שיתוף קישור', exact: true }).click();
    },
  },
  {
    name: 'sharing: ShareSheet, copy failed',
    skeleton: [FEED, role('dialog', 'שיתוף קישור'), text('לא הצלחנו להעתיק. אפשר להעתיק את הקישור מהשדה'), role('textbox', 'הקישור')],
    show: async (page) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
        Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      });
      const net = await setupShare(page, () => pageOf([named(1)], null));
      await openFeedAt(page, net);
      await feedCards(page).first().getByRole('button', { name: 'שיתוף קישור', exact: true }).click();
      await page.getByRole('dialog', { name: 'שיתוף קישור', exact: true }).getByRole('button', { name: 'העתקת קישור', exact: true }).click();
    },
  },
  {
    name: 'sharing: ShareSheet of the site, from the side menu',
    skeleton: [FEED, role('dialog', 'שיתוף Nestly'), heading('שיתוף Nestly'), button('העתקת קישור')],
    show: async (page) => {
      const net = await setupShare(page, () => pageOf([named(1)], null));
      await openFeedAt(page, net);
      await page.getByRole('button', { name: MENU_BUTTON, exact: true }).click();
      await page.getByRole('dialog', { name: 'תפריט' }).getByRole('button', { name: 'שיתוף Nestly', exact: true }).click();
    },
  },
  // ux-polish-b.visual.spec.ts
  {
    name: 'ux-polish: an own feed card in edit, in place',
    skeleton: [FEED, role('form', 'עריכת פוסט'), button('שמירה'), button('ביטול')],
    show: async (page) => {
      const net = await setupFeed(page, () => pageOf([named(1), named(2, { isMine: true }), named(3)], null), {
        posts: [{ id: feedId(2), body: 'גוף הפוסט 2', audience: 'everyone', stageTag: null, createdAt: '2026-06-14T09:00:00.000Z', isMine: true }],
      });
      await openFeedAt(page, net);
      await expect(feedCards(page)).toHaveCount(3);
      const card = feedCards(page).nth(1);
      await card.getByRole('button', { name: 'פעולות נוספות לפוסט', exact: true }).click();
      await page.getByRole('menuitem', { name: EDIT_ITEM, exact: true }).click();
      await expect(card.getByRole('form', { name: 'עריכת פוסט' })).toBeVisible();
    },
  },
  {
    name: 'ux-polish: an own post page with its "⋯" open',
    skeleton: [POST, role('menuitem', 'עריכת הפוסט'), role('menuitem', 'מחיקת הפוסט')],
    show: async (page) => {
      await setupPosts(page, { posts: [{ ...MINE }] });
      await signInAt(page, `/posts/${POST_ID}`);
      await postMore(page).click();
    },
  },
  {
    name: 'ux-polish: "חזרה למעלה" after scrolling the feed (its tooltip on hover, where only the icon shows)',
    skeleton: [FEED, button('חזרה למעלה')],
    show: async (page, size) => {
      const net = await setupFeed(page, (cursor) => (cursor === null ? pageOf(range(1, 12), 'c1') : cursor === 'c1' ? pageOf(range(13, 24), null) : pageOf([], null)));
      await openFeedAt(page, net);
      await expect(feedCards(page)).toHaveCount(12);
      await feedCards(page).last().scrollIntoViewIfNeeded();
      await expect(feedCards(page)).toHaveCount(24);
      await feedCards(page).last().scrollIntoViewIfNeeded();
      const toTop = page.getByRole('button', { name: 'חזרה למעלה', exact: true });
      await expect(toTop).toBeVisible();
      // The tooltip is for the icon-only button (from 1024 px while the shell is narrower than 72rem); at 375 and 1280 the words show.
      if (size.viewport.width >= 1024 && (await page.getByText('חזרה למעלה', { exact: true }).isHidden())) {
        await toTop.hover();
        await expect(page.getByRole('tooltip')).toHaveText('חזרה למעלה');
      }
    },
  },
];

test.describe('[layer 1] flows', () => {
  for (const flow of FLOWS) {
    test(`[layer 1] ${flow.name}: skeleton, rtl, no horizontal scroll, no cut text, no overlap, axe at 375 and 1280`, async ({ browser }) => {
      test.setTimeout(90_000);
      await checkAtBothSizes(browser, APP, flow.skeleton, flow.show);
    });
  }
});
