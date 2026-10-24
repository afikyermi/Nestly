// The admin screens (I4; FR-MOD-002, FR-MOD-003, FR-ADMIN-005; AC-022, AC-029, AC-106, AC-107): the main flow of each new screen on a desktop
// browser, network stubbed (e2e/support/admin-stub.ts). The rules (keys, ladder, audit) are pgTAP's and tests/db/admin.db.test.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, MENU_BUTTON, pathOf } from './app-helpers';
import { DESKTOP_1280, EMAIL, main } from './support/journeys-stub';
import { CHILD_REPORT, ID, POST_CHILD, POST_SPAM, USER_RINA, setupAdmin } from './support/admin-stub';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

const PASSWORD = 'Zq-7-unique-pw-marker-91';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}

test.describe('[I4] the admin shell', () => {
  test('[I4 FR-ADMIN-004 · I14c §9.6] a staff account sees "ניהול" in the menu and /admin opens its home (the Admin\'s home)', async ({ page }) => {
    await setupAdmin(page);
    await signIn(page);
    await page.getByRole('button', { name: MENU_BUTTON }).click();
    await page.getByRole('link', { name: 'ניהול', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'ניהול' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'בית הניהול' })).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'מסכי הניהול' });
    await expect(tabs.getByRole('link')).toHaveText(['בית הניהול', 'דיווחים', 'משתמשים', 'יומן פעולות', 'מדריכים', 'תמונות לבדיקה', 'צוות', 'מוצרים ממומנים', 'קידומים']); // I14c the home; I5 the image queue; I14 the team (the Admin's); I12 Sponsored Products (the Admin's)
  });

  test('[I4 AC-031] an account that is not staff has no admin entry and /admin leads back to the feed', async ({ page }) => {
    await setupAdmin(page, { staff: false });
    await signIn(page);
    await page.getByRole('button', { name: MENU_BUTTON }).click();
    await expect(page.getByRole('link', { name: 'ניהול', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto('/admin');
    await expect.poll(() => pathOf(page)).toBe('/feed');
  });

  test('[I4 AC-031 · I14c §9.6] a Moderator sees its "my work" and only the screens its keys allow', async ({ page }) => {
    await setupAdmin(page, { role: 'moderator', permissions: ['AUDIT_LOG_VIEW'] });
    await signIn(page);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 2, name: 'העבודה שלי' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'מסכי הניהול' }).getByRole('link')).toHaveText(['העבודה שלי', 'יומן פעולות']);
  });
});

test.describe('[I4 FR-MOD-003] the moderation queue', () => {
  test('[I4 AC-106 AC-107] the queue lists "content endangering a child" first; opening an item shows its reports and the copy of the text', async ({ page }) => {
    await setupAdmin(page);
    await signIn(page);
    await page.goto('/admin/reports');
    const items = page.getByRole('list', { name: 'דיווחים פתוחים' }).getByRole('listitem');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('תוכן שמסכן ילד');
    await expect(items.first()).toContainText('עדיפות עליונה');
    await expect(items.first()).toContainText('3 דיווחים');
    await items.first().getByRole('button', { name: 'פתיחת הדיווח' }).click();
    await expect(main(page).getByText('הטקסט בעת הדיווח: טקסט הפוסט שדווח').first()).toBeVisible();
    await expect(main(page).getByRole('heading', { name: /פרטי הדיווח/ })).toBeVisible();
  });

  test('[I4 AC-022 AC-029] hiding a reported post needs a reason, closes the report and leaves the queue', async ({ page }) => {
    const net = await setupAdmin(page);
    await signIn(page);
    await page.goto('/admin/reports');
    await page.getByRole('listitem').filter({ hasText: 'ספאם' }).getByRole('button', { name: 'פתיחת הדיווח' }).click();
    const actions = page.getByRole('group', { name: 'טיפול' });
    await actions.getByRole('button', { name: 'הסתרת התוכן וסגירת הדיווח' }).click();
    await expect(actions.getByText('יש לכתוב סיבה')).toBeVisible();
    expect(net.sent).toHaveLength(0);
    await actions.getByLabel('סיבה (נרשמת ביומן)').fill('פרסום ללא שיתוף ידע');
    await actions.getByRole('button', { name: 'הסתרת התוכן וסגירת הדיווח' }).click();
    await expect(page.getByText('הדיווח נסגר')).toBeVisible();
    expect(net.sent).toEqual([
      {
        method: 'POST',
        path: '/api/admin/reports/handle',
        body: { targetKind: 'post', targetId: POST_SPAM, resolution: 'action_taken', moderation: { status: 'hidden', reason: 'פרסום ללא שיתוף ידע' } },
      },
    ]);
    await expect(page.getByRole('list', { name: 'דיווחים פתוחים' }).getByRole('listitem')).toHaveCount(1);
  });

  test('[I4 AC-110] a child-safety report offers the immediate ban in the enforcement panel, with a reason', async ({ page }) => {
    const net = await setupAdmin(page);
    await signIn(page);
    await page.goto('/admin/reports');
    await page.getByRole('listitem').filter({ hasText: 'תוכן שמסכן ילד' }).getByRole('button', { name: 'פתיחת הדיווח' }).click();
    const panel = page.getByRole('region', { name: 'אכיפה' });
    await panel.getByLabel('פעולה').selectOption({ label: 'חסימה' });
    await panel.getByLabel('סיבה (נרשמת ביומן)').fill('תוכן שמסכן ילד');
    await panel.getByRole('checkbox', { name: /חסימה מיידית/ }).check();
    await panel.getByRole('button', { name: 'ביצוע הפעולה' }).click();
    await expect(page.getByText('הפעולה בוצעה')).toBeVisible();
    // the ban cites the child-safety report, not the post's older report of another reason
    expect(net.sent[0]).toMatchObject({ path: '/api/admin/enforcements', body: { userId: USER_RINA, kind: 'ban', reason: 'תוכן שמסכן ילד', childSafety: true, reportId: CHILD_REPORT } });
    void POST_CHILD;
  });
});

test.describe('[I4 FR-ADMIN-005] the audit log', () => {
  test('[I4 AC-029] the log lists the actions newest first, 50 at a time, and loads more on request', async ({ page }) => {
    await setupAdmin(page);
    await signIn(page);
    await page.goto('/admin/audit');
    const rows = page.getByRole('table').getByRole('row');
    await expect(rows).toHaveCount(3); // the header and two entries
    await expect(rows.nth(1)).toContainText('חסימת משתמש');
    await expect(rows.nth(1)).toContainText('סיבה לדוגמה');
    await page.getByRole('button', { name: 'טעינת עוד' }).click();
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(3)).toContainText('הענקת הרשאה');
    await expect(page.getByRole('button', { name: 'טעינת עוד' })).toHaveCount(0);
  });
});

test.describe('[I4 FR-MOD-002] accounts and enforcement', () => {
  test('[I4 AC-028 AC-107] a search finds the account; a suspension needs a duration and a reason and shows the new status', async ({ page }) => {
    const net = await setupAdmin(page);
    await signIn(page);
    await page.goto('/admin/users');
    await expect(page.getByText('לא נמצאו משתמשים')).toHaveCount(0);
    await page.getByLabel('חיפוש לפי שם').fill('רינה');
    await page.getByRole('button', { name: 'חיפוש', exact: true }).click();
    await page.getByRole('listitem').filter({ hasText: 'רינה כהן' }).getByRole('button', { name: 'פתיחה החשבון של רינה כהן' }).click();
    const panel = page.getByRole('region', { name: 'אכיפה' });
    await expect(panel).toContainText('המדרג מציע: אזהרה');
    await panel.getByRole('button', { name: 'ביצוע הפעולה' }).click();
    await expect(panel.getByText('יש לבחור פעולה')).toBeVisible();
    await panel.getByLabel('פעולה').selectOption({ label: 'השעיה' });
    await panel.getByLabel('משך ההשעיה').selectOption({ label: '3 ימים' });
    await panel.getByRole('button', { name: 'ביצוע הפעולה' }).click();
    await expect(panel.getByText('יש לכתוב סיבה')).toBeVisible();
    await panel.getByLabel('סיבה (נרשמת ביומן)').fill('הטרדה חוזרת');
    await panel.getByRole('button', { name: 'ביצוע הפעולה' }).click();
    await expect(page.getByText('הפעולה בוצעה')).toBeVisible();
    expect(net.sent[0]).toMatchObject({ body: { userId: USER_RINA, kind: 'suspension', durationHours: 72, reason: 'הטרדה חוזרת' } });
    await expect(page.getByRole('region', { name: 'אכיפה' })).toContainText('מושעה');
    expect(pathOf(page)).toBe('/admin/users');
  });
});

test.describe('[I5 Afik 20.10] the image approval queue', () => {
  test('[I5 BR-076] a CONTENT_MODERATE holder approves one image with the child mark and marks a suspicion on another; each leaves the queue', async ({ page }) => {
    const net = await setupAdmin(page, { role: 'moderator', permissions: ['CONTENT_MODERATE'] });
    await signIn(page);
    await page.goto('/admin/media');
    await expect(page.getByRole('heading', { level: 2, name: 'תמונות לבדיקה' })).toBeVisible();
    const items = page.getByRole('list', { name: 'תמונות שממתינות לבדיקה' }).getByRole('listitem');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('נחסמה בבדיקה');
    await items.first().getByRole('checkbox', { name: 'יש בתמונה ילד' }).check();
    await items.first().getByRole('button', { name: 'אישור', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'ההחלטה נשמרה' })).toBeVisible();
    await expect(items).toHaveCount(1);
    await items.first().getByRole('button', { name: 'חשד לפגיעה בילד' }).click();
    await expect(page.getByText('אין תמונות שממתינות לבדיקה')).toBeVisible();
    const decisions = net.sent.filter((s) => s.path.endsWith('/decision')).map((s) => s.body);
    expect(decisions).toEqual([
      { decision: 'approved', isChild: true },
      { decision: 'suspected', isChild: false },
    ]);
  });
});

test.describe('[I5 BR-076] an image removed after a report', () => {
  test('[I5 BR-076] CONTENT_MODERATE with REPORTS_VIEW removes a reported post\'s image that had passed', async ({ page }) => {
    const net = await setupAdmin(page);
    await signIn(page);
    await page.goto('/admin/reports');
    await page.getByRole('listitem').filter({ hasText: 'ספאם' }).getByRole('button', { name: 'פתיחת הדיווח' }).click();
    const images = page.getByRole('list', { name: 'התמונות בפוסט' });
    await images.getByRole('button', { name: 'הסרת התמונה', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'התמונה הוסרה' })).toBeVisible();
    await expect(images.getByText('התמונה לא אושרה לפי מדיניות התמונות')).toBeVisible();
    expect(net.sent.filter((s) => s.path.endsWith('/removal'))).toEqual([{ method: 'POST', path: `/api/admin/media/${ID(72)}/removal`, body: { suspected: false } }]);
  });
});
