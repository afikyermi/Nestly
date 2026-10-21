// Professionals and services (I11; FR-REG-001, FR-PROREG-001/002, FR-SERV-001..006, FR-SERV-011, FR-FOLLOW-001, FR-PRO-001, FR-PRO-003): the main flow
// of each new screen on a desktop browser, network stubbed (e2e/support/professionals-stub.ts). The rules (who follows, who offers help and how often,
// who reads an anonymous author, who reviews, who edits an article) are pgTAP's (file 97) and tests/db/professionals.db.test.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP_1280, EMAIL, main } from './support/journeys-stub';
import { CONV, DANA, OFFER, POST, PID, setupProfessionals, ARTICLE } from './support/professionals-stub';
import { choose, sendButton, sheet } from './support/report-ui';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

const PASSWORD = 'Zq-7-unique-pw-marker-91';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}

test.describe('[I11 FR-SERV-001 FR-SERV-002 AC-009] the directory', () => {
  test('the list filters by field and a card leads to the Professional page', async ({ page }) => {
    const net = await setupProfessionals(page);
    await signIn(page);
    await page.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('link', { name: 'יועצים' }).click();
    await expect.poll(() => pathOf(page)).toBe('/services');
    const results = main(page).getByRole('list', { name: 'תוצאות' });
    await expect(results).toContainText('שי שינה');
    await main(page).getByLabel('תחום', { exact: true }).selectOption('doula');
    await main(page).getByRole('button', { name: 'הצגת תוצאות' }).click();
    await expect(results).not.toContainText('שי שינה');
    expect(net.sent.some((s) => s.path === '/api/professionals' && s.query.includes('field=doula'))).toBe(true);
    await results.getByRole('link', { name: 'דנה דולה' }).click();
    await expect.poll(() => pathOf(page)).toBe(`/pros/${DANA}`);
  });
});

test.describe('[I11 FR-SERV-003 FR-FOLLOW-001 FR-SERV-004 FR-SERV-011] a Professional page', () => {
  test('follow, a review on an answered inquiry, the article with its note, and a message with no approval', async ({ page }) => {
    const net = await setupProfessionals(page);
    await signIn(page);
    await page.goto(`/pros/${DANA}`);
    await expect(main(page).getByRole('heading', { level: 1, name: 'דנה דולה' })).toBeVisible();
    await expect(main(page).getByText('יועץ · דולה')).toBeVisible();
    await expect(main(page).getByText('האחריות לתוכנו היא שלו')).toBeVisible();
    await main(page).getByRole('button', { name: 'מעקב', exact: true }).click();
    await expect(main(page).getByRole('button', { name: 'הפסקת מעקב' })).toBeVisible();
    expect(net.sent).toContainEqual(expect.objectContaining({ method: 'PUT', path: `/api/professionals/${DANA}/follow` }));

    const review = main(page).getByRole('form', { name: 'כתיבת ביקורת' });
    await review.getByLabel('דירוג', { exact: true }).selectOption('5');
    await review.getByLabel('הביקורת', { exact: true }).fill('מקצועית ונעימה');
    await review.getByRole('button', { name: 'פרסום הביקורת' }).click();
    await expect(main(page).getByText('הביקורת פורסמה. תודה!')).toBeVisible();
    expect(net.sent).toContainEqual(expect.objectContaining({ method: 'POST', path: `/api/professionals/${DANA}/reviews`, body: { rating: 5, text: 'מקצועית ונעימה' } }));

    await main(page).getByRole('button', { name: 'שליחת הודעה' }).click();
    await main(page).getByLabel('הודעה', { exact: true }).fill('שלום, אשמח לשמוע על ליווי לידה');
    await main(page).getByRole('button', { name: 'שליחה', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe(`/chat/${CONV}`);
    expect(net.sent).toContainEqual(expect.objectContaining({ method: 'POST', path: '/api/chat/start', body: { userId: DANA, text: 'שלום, אשמח לשמוע על ליווי לידה' } }));
  });
});

test.describe('[I11 FR-PRO-001 AC-018 FR-SERV-005] the Professional home', () => {
  test('a dashboard in place of the parent home, and Offer Help on a post that asks for help', async ({ page }) => {
    const net = await setupProfessionals(page, { kind: 'professional' });
    await signIn(page);
    await page.goto('/home');
    await expect(main(page).getByRole('heading', { level: 1, name: 'לוח הבקרה' })).toBeVisible();
    // Afik 21.10.2026 (§9.8): waiting for you → help requests with today's count → metrics → completeness → content results → promotion
    const headings = await main(page).getByRole('heading', { level: 2 }).allTextContents();
    expect(headings).toEqual(['מחכה לך', 'פוסטים שמבקשים עזרה', 'הנתונים שלך', 'השלמת הפרופיל', 'תוצאות התוכן', 'קידום']);
    const waiting = main(page).getByRole('list', { name: 'מחכה לך' });
    await expect(waiting.getByRole('link', { name: '2 שיחות עם הודעות שלא נקראו' })).toBeVisible();
    await expect(waiting.getByRole('link', { name: 'הצעת עזרה אחת אושרה' })).toHaveAttribute('href', '/offers');
    await expect(main(page).getByText('הצעות עזרה היום: 0 מתוך 10')).toBeVisible();
    await expect(main(page).getByText('75% (3/4)')).toBeVisible();
    await expect(main(page).getByRole('progressbar', { name: 'השלמת הפרופיל' })).toHaveAttribute('aria-valuenow', '75');
    await expect(main(page).getByText('חסר: שם העסק, על השירות')).toBeVisible();
    await expect(main(page).getByText('התשלום מדומה והמחירים לדוגמה', { exact: false })).toBeVisible();
    const help = main(page).getByRole('list', { name: 'פוסטים שמבקשים עזרה' });
    await expect(help).toContainText('פוסט אנונימי');
    await help.getByRole('button', { name: 'הצעת עזרה' }).click();
    await help.getByLabel('ההודעה הראשונה', { exact: true }).fill('אני יועצת הנקה, אשמח לעזור');
    await help.getByRole('button', { name: 'שליחת ההצעה' }).click();
    await expect(main(page).getByText('ההצעה נשלחה. אם תאושר, תיפתח שיחה.')).toBeVisible();
    await expect(help).toContainText('נשלחה הצעה');
    expect(net.sent).toContainEqual(expect.objectContaining({ method: 'POST', path: `/api/posts/${POST}/offer-help`, body: { text: 'אני יועצת הנקה, אשמח לעזור' } }));
  });
});

test.describe('[I11 FR-SERV-006 AC-012] Offer Help on my post', () => {
  test('accepting an offer opens the conversation', async ({ page }) => {
    const net = await setupProfessionals(page);
    await signIn(page);
    await page.goto('/offers');
    const received = main(page).getByRole('list', { name: 'הצעות שקיבלת' });
    await expect(received).toContainText('אשמח לעזור, יש לי ניסיון של 9 שנים');
    await received.getByRole('button', { name: 'אישור ופתיחת שיחה' }).click();
    await expect.poll(() => pathOf(page)).toBe(`/chat/${CONV}`);
    expect(net.sent).toContainEqual(expect.objectContaining({ method: 'POST', path: `/api/outreach/${OFFER}/accept` }));
  });
});

test.describe('[I11 FR-PRO-003 AC-094] articles', () => {
  test('a Professional publishes an article', async ({ page }) => {
    const net = await setupProfessionals(page, { kind: 'professional' });
    await signIn(page);
    await page.goto('/pro/articles');
    await main(page).getByRole('button', { name: 'מאמר חדש' }).click();
    await main(page).getByLabel('כותרת', { exact: true }).fill('הנקה בשבוע הראשון');
    await main(page).getByLabel('תחום', { exact: true }).selectOption('lactation');
    await main(page).getByLabel('המאמר', { exact: true }).fill('גוף');
    await main(page).getByRole('button', { name: 'פרסום', exact: true }).click();
    await expect(main(page).getByRole('list', { name: 'מאמרים' })).toContainText('הנקה בשבוע הראשון');
    expect(net.sent).toContainEqual(expect.objectContaining({ method: 'POST', path: '/api/professional/articles', body: { title: 'הנקה בשבוע הראשון', body: 'גוף', field: 'lactation', status: 'published' } }));
  });
});

test.describe('[I11 FR-SERV-003] the profile edit', () => {
  test('the owner saves its Professional profile', async ({ page }) => {
    const net = await setupProfessionals(page, { kind: 'professional' });
    await signIn(page);
    await page.goto('/pro/profile');
    const years = main(page).getByLabel('שנות ניסיון', { exact: true });
    await expect(years).toHaveValue('5');
    await years.fill('6');
    await main(page).getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(main(page).getByText('נשמר.')).toBeVisible();
    expect(net.sent).toContainEqual(expect.objectContaining({ method: 'PUT', path: '/api/professional/profile', body: expect.objectContaining({ yearsExperience: 6, field: 'lactation' }) }));
  });
});

test.describe('[I11 FR-REG-001 FR-PROREG-001 FR-PROREG-002] a Professional registers', () => {
  test('the personal step 1 leads to the Professional form; step 2 creates a Professional account', async ({ page }) => {
    const net = await setupProfessionals(page);
    await page.route('**/auth/v1/signup', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' },
        body: JSON.stringify({
          access_token: 'e2e-pro-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: 4102444800,
          refresh_token: 'e2e-refresh',
          user: { id: 'f0000000-0000-4000-8000-0000000000f9', aud: 'authenticated', role: 'authenticated', email: 'pro@example.com', identities: [{ identity_id: 'f0000000-0000-4000-8000-0000000000fa', id: 'f0000000-0000-4000-8000-0000000000f9', provider: 'email' }], app_metadata: {}, user_metadata: {}, created_at: '2026-10-14T10:00:00Z' },
        }),
      }),
    );
    await page.goto('/register');
    await page.getByRole('button', { name: 'נרשמים כבעלי מקצוע? להרשמה לחשבון מקצועי' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'פרטים מקצועיים' })).toBeVisible();
    await page.getByRole('button', { name: 'המשך' }).click();
    await expect(page.getByText('יש לבחור תחום')).toBeVisible();
    await page.getByLabel('שם מלא', { exact: true }).fill('דנה דולה');
    await page.getByLabel('תחום', { exact: true }).selectOption('doula');
    await page.getByLabel('שנות ניסיון', { exact: true }).fill('9');
    await page.getByLabel('אזור', { exact: false }).selectOption('tel_aviv');
    await page.getByRole('button', { name: 'המשך' }).click();
    // Afik 21.10.2026: the qualification declaration is required
    await expect(page.getByText('יש לאשר את ההצהרה כדי להמשיך')).toBeVisible();
    await page.getByRole('checkbox', { name: 'הצהרה: יש לי ההכשרה והרישיון הנדרשים בתחום שבחרתי' }).check();
    await page.getByRole('button', { name: 'המשך' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'פרטי התחברות' })).toBeVisible();
    await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill('pro@example.com');
    await page.getByLabel('סיסמה', { exact: true }).fill('correct horse 42');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'יצירת חשבון' }).click();
    await expect.poll(() => net.sent.filter((s) => s.path === '/api/register/professional').length).toBe(1);
    expect(net.sent.find((s) => s.path === '/api/register/professional')?.body).toEqual({
      fullName: 'דנה דולה',
      businessName: null,
      gender: null,
      field: 'doula',
      fieldOther: null,
      yearsExperience: 9,
      area: 'tel_aviv',
      about: null,
      priceFrom: null,
      consent: true,
      qualification: true,
    });
  });
});

test.describe('[I11 follow-ups PG-039 FR-FOLLOW-001] the Professionals I follow', () => {
  test('the side menu leads to the list; "הפסקת מעקב" removes a Professional', async ({ page }) => {
    const net = await setupProfessionals(page, { following: true });
    await signIn(page);
    await page.getByRole('button', { name: 'פתיחת התפריט' }).click();
    await page.getByRole('link', { name: 'בעלי מקצוע במעקב' }).click();
    await expect.poll(() => pathOf(page)).toBe('/following');
    const list = main(page).getByRole('list', { name: 'בעלי מקצוע במעקב' });
    await expect(list.getByRole('link', { name: 'דנה דולה' })).toHaveAttribute('href', `/pros/${DANA}`);
    await list.getByRole('button', { name: 'הפסקת מעקב אחרי דנה דולה' }).click();
    await expect(main(page).getByText('המעקב אחרי דנה דולה הופסק.')).toBeVisible();
    await expect(main(page).getByText('עדיין אין בעלי מקצוע במעקב', { exact: false })).toBeVisible();
    expect(net.sent).toContainEqual(expect.objectContaining({ method: 'DELETE', path: `/api/professionals/${DANA}/follow` }));
  });
});

test.describe('[I11 follow-ups FR-MOD-001 FR-SERV-011 FR-PRO-003] reporting a review and an article', () => {
  test('each review and another Professional\'s article has a report action', async ({ page }) => {
    const net = await setupProfessionals(page);
    await signIn(page);
    await page.goto(`/pros/${DANA}`);
    await main(page).getByRole('button', { name: /^דיווח על הביקורת: ליווי מדהים/ }).click();
    await page.getByRole('menuitem', { name: 'דיווח על הביקורת' }).click();
    const box = sheet(page, 'review');
    await expect(box).toBeVisible();
    await choose(box, 1);
    await sendButton(box).click();
    await expect(box).toHaveCount(0);
    await expect(main(page).getByText('הדיווח נשלח. הצוות יבדוק אותו')).toBeVisible();
    expect(net.sent).toContainEqual({ method: 'POST', path: '/api/reports', query: '', body: { targetKind: 'review', targetId: PID(50), reason: 'harassment' } });
    await main(page).getByRole('button', { name: /^דיווח על המאמר: שלושה דברים/ }).click();
    await page.getByRole('menuitem', { name: 'דיווח על המאמר' }).click();
    const articleBox = sheet(page, 'article');
    await choose(articleBox, 4);
    await sendButton(articleBox).click();
    await expect(articleBox).toHaveCount(0);
    expect(net.sent).toContainEqual({ method: 'POST', path: '/api/reports', query: '', body: { targetKind: 'article', targetId: ARTICLE, reason: 'medical_misinformation' } });
  });
});

test.describe('[I11 follow-ups FR-SERV-005] a Professional\'s navigation and help requests', () => {
  test('the bottom navigation leads to the help requests; the menu has the business items and no Friends', async ({ page }) => {
    const net = await setupProfessionals(page, { kind: 'professional' });
    await signIn(page);
    const nav = page.getByRole('navigation', { name: 'ניווט ראשי' });
    expect(await nav.getByRole('link').allTextContents()).toEqual(['בית', 'פיד', 'בקשות עזרה', 'פרופיל']);
    await nav.getByRole('link', { name: 'בקשות עזרה' }).click();
    await expect.poll(() => pathOf(page)).toBe('/help-requests');
    await expect(main(page).getByRole('heading', { level: 1, name: 'בקשות עזרה' })).toBeVisible();
    await expect(main(page).getByText('הצעות עזרה היום: 0 מתוך 10')).toBeVisible();
    const help = main(page).getByRole('list', { name: 'פוסטים שמבקשים עזרה' });
    await help.getByRole('button', { name: 'הצעת עזרה' }).click();
    await help.getByLabel('ההודעה הראשונה', { exact: true }).fill('אשמח לעזור');
    await help.getByRole('button', { name: 'שליחת ההצעה' }).click();
    await expect(help).toContainText('נשלחה הצעה');
    expect(net.sent).toContainEqual(expect.objectContaining({ method: 'POST', path: `/api/posts/${POST}/offer-help` }));

    await page.getByRole('button', { name: 'פתיחת התפריט' }).click();
    const drawer = page.getByRole('dialog', { name: 'תפריט' });
    await expect(drawer.getByRole('link', { name: 'חברים', exact: true })).toHaveCount(0);
    for (const item of ['הפרופיל המקצועי שלי', 'המאמרים שלי', 'ההצעות שלי', 'קידום ותוצאות', 'חיוב ותשלומים', 'בעלי מקצוע במעקב', 'בעלי מקצוע']) {
      await expect(drawer.getByRole('link', { name: item, exact: true })).toBeVisible();
    }
    await drawer.getByRole('link', { name: 'קידום ותוצאות', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/pro/promotion');
    await expect(main(page).getByText('קידום בתשלום מגדיל את החשיפה בלבד', { exact: false })).toBeVisible();
  });
});
