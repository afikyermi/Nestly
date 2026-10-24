// The SRS-audit fixes on the real Preview (21.10.2026), each checked from the other side (e2e-preview/README.md):
//   1. FR-SEARCH-001: a Regular user's People Search finds a fresh Professional, marked as one, and the result opens its Professional page.
//   2. FR-SET-001, FR-NOTIF-002: the Professional's Settings load: its edit-profile link is /pro/profile, its notification categories show and
//      none of them is a children's birthday, the blocked list shows, and no section fails.
//   3. BR-037, AC-046: a parent signs up with a child born on today's date (Israel) a year ago; a Friend accepts the parent's request and,
//      on the Friend's own notifications page, sees "יום הולדת לילד או לילדה של <parent>", with no child's name, age or date.
// Every user is fresh (the cleanup sweep's email pattern). No recovery attempts are made.
import { randomBytes } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';
import { createBypassRouteHandler } from './support/bypass.ts';
import { expect, test } from './support/fixtures.ts';
import { generateTestUser, type TestUser } from './support/test-user.ts';

const emailField = (page: Page) => page.getByRole('textbox', { name: 'אימייל', exact: true });
const passwordField = (page: Page) => page.getByLabel('סיסמה', { exact: true });
const newUser = (): TestUser => generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');

/** A family name of six random Hebrew letters, so this run's people are found by name and nobody else. */
function uniqueName(): string {
  const letters = 'אבגדהוזחטיכלמנסעפצקרשת';
  return [...randomBytes(6)].map((b) => letters[b % letters.length]).join('');
}

/** Step 2 and the recovery questions, as every flow signs up; returns the Authorization header of the first request. */
async function credentialsAndAnswers(page: Page, u: TestUser): Promise<string> {
  await emailField(page).fill(u.email);
  await passwordField(page).fill(u.password);
  const box = page.getByRole('checkbox', { name: /אישור תנאי השימוש/ });
  await box.focus();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
  await page.getByRole('button', { name: 'יצירת חשבון', exact: true }).click();
  await expect(page).toHaveURL(/\/recovery-questions$/);
  await page.getByLabel(/חיית המחמד/).fill(u.answers.pet);
  await page.getByLabel(/כינו אתכם/).fill(u.answers.nickname);
  const bell = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/notifications' && r.request().method() === 'GET');
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page).toHaveURL(/\/(feed|home)$/);
  const authorization = (await (await bell).request().headerValue('authorization')) ?? '';
  expect(authorization).toMatch(/^Bearer /);
  return authorization;
}

async function signUpRegular(page: Page, fullName: string): Promise<string> {
  await page.goto('/register');
  await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
  await page.getByLabel(/^שם מלא/).fill(fullName);
  await page.getByRole('button', { name: 'המשך', exact: true }).click();
  return credentialsAndAnswers(page, newUser());
}

/** One API call from the page with the user's Authorization header: status and parsed body. */
async function api(page: Page, authorization: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: unknown }> {
  const answer = await page.evaluate(
    async ({ auth, url, method, body }) => {
      const headers: Record<string, string> = { authorization: auth };
      if (body !== undefined) headers['content-type'] = 'application/json';
      const r = await fetch(url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: r.status, text: await r.text() };
    },
    { auth: authorization, url: path, method: init.method ?? 'GET', body: init.body },
  );
  const parsed: unknown = answer.text === '' ? null : JSON.parse(answer.text);
  return { status: answer.status, body: parsed };
}

/** The people of a People Search answer. */
function peopleOf(body: unknown): Array<{ userId: string; fullName: string; isProfessional: boolean }> {
  const people: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'people') : undefined;
  if (!Array.isArray(people)) return [];
  return people.flatMap((p: unknown) => {
    if (typeof p !== 'object' || p === null) return [];
    const userId: unknown = Reflect.get(p, 'userId');
    const fullName: unknown = Reflect.get(p, 'fullName');
    const isProfessional: unknown = Reflect.get(p, 'isProfessional');
    return typeof userId === 'string' && typeof fullName === 'string' && typeof isProfessional === 'boolean' ? [{ userId, fullName, isProfessional }] : [];
  });
}

/** Today in Israel as day, month and year (the server judges a birthday by Israel's date). */
function israelToday(): { day: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 'NaN');
  return { day: get('day'), month: get('month'), year: get('year') };
}

test('[FR-SEARCH-001 FR-SET-001 FR-NOTIF-002 BR-037 AC-046] the SRS-audit fixes, each seen from the other side', async ({ page, browser, baseURL, bypassSecret }, info) => {
  // Three fresh accounts sign up on a cold Preview (each sign-up can take 10 s or more): 3 minutes, not the config's 90 s.
  test.setTimeout(180_000);
  if (baseURL === undefined) throw new Error('preview-e2e: no baseURL');
  const origin = new URL(baseURL).origin;
  const contexts: BrowserContext[] = [];
  const open = async (): Promise<Page> => {
    const context = await browser.newContext({ baseURL });
    await context.route(`${origin}/**`, createBypassRouteHandler(origin, bypassSecret));
    contexts.push(context);
    return context.newPage();
  };
  try {
    // 1 + 2. A Professional signs up; its Settings load
    const family = uniqueName();
    const proName = `דנה ${family}`;
    await page.goto('/register');
    await page.getByRole('button', { name: 'נרשמים כבעלי מקצוע? להרשמה לחשבון מקצועי', exact: true }).click();
    await page.getByLabel(/^שם מלא/).fill(proName);
    await page.getByLabel(/^תחום/).selectOption('doula');
    await page.getByLabel(/^שנות ניסיון/).fill('5');
    await page.getByRole('checkbox', { name: 'הצהרה: יש לי ההכשרה והרישיון הנדרשים בתחום שבחרתי' }).check();
    await page.getByRole('button', { name: 'המשך', exact: true }).click();
    await credentialsAndAnswers(page, newUser());
    await page.goto('/settings');
    const settings = page.getByRole('main');
    await expect(settings.getByRole('link', { name: 'עריכת פרופיל', exact: true })).toHaveAttribute('href', '/pro/profile');
    await expect(settings.getByRole('heading', { level: 2, name: 'התראות' })).toBeVisible();
    await expect(settings.getByText('ביקורות חדשות על הפרופיל המקצועי')).toBeVisible();
    await expect(settings.getByText(/ימי הולדת/)).toHaveCount(0);
    await expect(settings.getByRole('heading', { name: 'משתמשים חסומים' })).toBeVisible();
    await expect(settings.getByRole('radio', { name: /^פרופיל פתוח/ })).toHaveCount(0);
    await expect(settings.getByRole('button', { name: 'נסו שוב' })).toHaveCount(0);

    // 1. a Regular user finds the Professional in People, marked, opening its Professional page
    const seeker = await open();
    const seekerAuth = await signUpRegular(seeker, `נעמה ${uniqueName()}`);
    const found = await api(seeker, seekerAuth, '/api/search', { method: 'POST', body: { q: proName, type: 'people' } });
    expect(found.status).toBe(200);
    const pro = peopleOf(found.body).find((person) => person.fullName === proName);
    expect(pro?.isProfessional, 'the Professional is found and marked').toBe(true);
    await seeker.goto('/feed');
    // A phone's top bar has the search icon, which opens the search page; a wider screen has the field in the top bar
    if ((seeker.viewportSize()?.width ?? 1280) < 768) {
      await seeker.getByRole('banner').getByRole('link', { name: 'חיפוש', exact: true }).click();
      await expect(seeker).toHaveURL(/\/search$/);
    }
    // Each step is checked on its own (nightly 24.10 failed on desktop with only "no link"): Enter opens /search, the search the screen
    // shows answers 200 (its time is logged), then the result. The waiter is set before typing: on desktop the top bar's dropdown may run
    // the search first, and the results screen then reuses its answer.
    const searched = seeker.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/search', { timeout: 60_000 });
    searched.catch(() => undefined); // a step before it may fail first; the wait is awaited below
    const box = seeker.getByRole('searchbox', { name: 'חיפוש אנשים ופוסטים' }).first();
    const asked = Date.now();
    await box.fill(proName);
    await box.press('Enter');
    await expect(seeker).toHaveURL(/\/search$/);
    const answer = await searched;
    console.log(`[${info.project.name}] POST /api/search from the search screen answered ${answer.status()} after ${Date.now() - asked} ms`);
    expect(answer.status(), 'the search the screen shows').toBe(200);
    const link = seeker.getByRole('main').getByRole('link', { name: `לעמוד המקצועי של ${proName}` });
    await expect(link).toBeVisible({ timeout: 30_000 });
    await expect(link).toContainText('חשבון מקצועי');
    await expect(link).toHaveAttribute('href', `/pros/${pro?.userId ?? ''}`);

    // 3. a parent with a child born today a year ago; a Friend sees the birthday on its own notifications page
    const parentPage = await open();
    const parentName = `רונית ${uniqueName()}`;
    await parentPage.goto('/register');
    await parentPage.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /יש לנו ילד או ילדה/ }).click();
    await parentPage.getByLabel(/^שם מלא/).fill(parentName);
    await parentPage.getByRole('group', { name: 'ילד או ילדה 1', exact: true }).getByLabel('שם', { exact: true }).fill('נועה');
    await parentPage.getByRole('group', { name: 'נועה', exact: true }).getByLabel('מין', { exact: true }).selectOption({ label: 'בת' });
    const today = israelToday();
    const birth = parentPage.getByRole('group', { name: 'נועה', exact: true }).getByRole('group', { name: 'תאריך לידה', exact: true });
    await birth.getByLabel('יום', { exact: true }).fill(String(today.day));
    await birth.getByLabel('חודש', { exact: true }).fill(String(today.month));
    await birth.getByLabel('שנה', { exact: true }).fill(String(today.year - 1));
    await parentPage.getByRole('button', { name: 'המשך', exact: true }).click();
    const parentAuth = await credentialsAndAnswers(parentPage, newUser());

    const friendPage = await open();
    const friendName = `מיכל ${uniqueName()}`;
    const friendAuth = await signUpRegular(friendPage, friendName);
    const friend = peopleOf((await api(parentPage, parentAuth, '/api/search', { method: 'POST', body: { q: friendName, type: 'people' } })).body).find((p) => p.fullName === friendName);
    expect(friend, 'the parent finds the Friend-to-be').toBeDefined();
    const parent = peopleOf((await api(friendPage, friendAuth, '/api/search', { method: 'POST', body: { q: parentName, type: 'people' } })).body).find((p) => p.fullName === parentName);
    expect(parent, 'the Friend-to-be finds the parent').toBeDefined();
    expect((await api(parentPage, parentAuth, '/api/friend-requests', { method: 'POST', body: { targetUserId: friend?.userId } })).status).toBe(201);
    expect((await api(friendPage, friendAuth, `/api/friend-requests/${parent?.userId ?? ''}/accept`, { method: 'POST' })).status).toBe(200);

    await friendPage.goto('/notifications');
    const sentence = `יום הולדת לילד או לילדה של ${parentName}`;
    await expect(friendPage.getByRole('main').getByText(sentence)).toBeVisible();
    await expect(friendPage.getByRole('main').getByText('נועה')).toHaveCount(0);
    // the parent is not told of its own child's birthday
    await parentPage.goto('/notifications');
    await expect(parentPage.getByRole('main').getByText(/יום הולדת לילד/)).toHaveCount(0);
  } finally {
    for (const context of contexts) await context.close();
  }
});
