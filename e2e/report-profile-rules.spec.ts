// I3 F3.7 report (real browser, network stubbed): the report button on another person's profile and the Community Rules page (PG-049) with its side-menu
// item. Derived from .work/report/spec.md criteria 9, 13, 14 and 15 and .work/report/screen.md (roles and Hebrew names) and BR-075 (docs/srs/08-business-rules.md)
// only. The profile is played by e2e/support/profiles-stub.ts, the report by report-stub.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, CLOSE, DRAWER_TITLE, MENU_BUTTON, open, pathOf, recordRequests } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { main, scan } from './support/journeys-stub';
import { OWN_ID, setupProfiles } from './support/profiles-stub';
import { BARE_ID, LIOR, LIOR_ID, NOA, NOA_ID, PRO, PRO_ID, RAZ, RAZ_ID, SHIR, SHIR_ID, TAL, TAL_ID, openProfile, signIn, world } from './support/profiles-fixtures';
import { stubReports } from './support/report-stub';
import type { ReportsNet } from './support/report-stub';
import { KEYS, T, cancelButton, choose, expectFocusRing, expectTouchTarget, radios, sendButton, sheet, status } from './support/report-ui';
import { afterPaint } from './support/post-menu';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;

const reportButton = (page: Page) => main(page).getByRole('button', { name: new RegExp(`^${T.reportProfile} של .+`) });
async function profile(page: Page, id: string, name: string): Promise<ReportsNet> {
  await setupProfiles(page, world());
  const reports = await stubReports(page);
  await openProfile(page, id, name);
  return reports;
}

test.describe('F3.7 c9 [FR-MOD-001] the report button on a profile', () => {
  const loaded: Array<[string, string, string]> = [
    ['open, no relationship', NOA_ID, NOA],
    ['restricted, no relationship', RAZ_ID, RAZ],
    ['restricted, friends', TAL_ID, TAL],
    ['restricted, request received', LIOR_ID, LIOR],
    ['restricted, request sent', SHIR_ID, SHIR],
    ['a Professional viewer (no relationship actions)', PRO_ID, PRO],
  ];
  for (const [state, pid, name] of loaded) {
    test(`[c9] ${state}: exactly one "דיווח על הפרופיל" button`, async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await profile(page, pid, name);
      await expect(reportButton(page)).toHaveCount(1);
    });
  }
  test('[c9] none while the profile is unavailable or failed to load, and none on my own profile', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const net = await setupProfiles(page, world());
    await stubReports(page);
    await signIn(page);
    const missing = 'd0000000-0000-4000-8000-0000000000ff';
    await page.goto(`/u/${missing}`, { waitUntil: 'domcontentloaded' });
    await expect(main(page).getByText('הפרופיל לא זמין')).toBeVisible();
    await expect(reportButton(page)).toHaveCount(0);
    net.mode[BARE_ID] = 500;
    await page.goto(`/u/${BARE_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(main(page).getByRole('button', { name: T.retry, exact: true })).toBeVisible();
    await expect(reportButton(page)).toHaveCount(0);
    await page.goto(`/u/${OWN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await expect(reportButton(page)).toHaveCount(0);
  });
});

test.describe('F3.7 c10 c13 [FR-MOD-001] reporting a profile', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c13][c1] ${label}: the sheet is "דיווח על פרופיל" with the eight reasons; 201 closes it, says "הדיווח נשלח. הצוות יבדוק אותו", changes nothing and focuses the button; the body names the account only`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const reports = await profile(page, RAZ_ID, RAZ);
      const before = (await main(page).innerText()).replace(/\s+/g, ' ');
      await reportButton(page).click();
      const box = sheet(page, 'user');
      await expect(box).toBeVisible();
      await expect(radios(box)).toHaveCount(8);
      await choose(box, 0);
      await sendButton(box).click();
      await expect(box).toHaveCount(0);
      await expect(status(page, T.received)).toBeVisible();
      await expect(reportButton(page)).toBeFocused();
      expect(pathOf(page)).toBe(`/u/${RAZ_ID}`);
      expect(reports.sent).toEqual([{ targetKind: 'user', targetId: RAZ_ID, reason: KEYS[0] }].map((b) => expect.objectContaining(b)));
      expect(Object.keys(reports.sent[0] ?? {}).every((k) => ['targetKind', 'targetId', 'reason', 'details'].includes(k))).toBe(true);
      const after = (await main(page).innerText()).replace(/\s+/g, ' ');
      const plain = (text: string) => text.replace(T.received, '').replace(/\s+/g, ' ').trim();
      expect(plain(after)).toBe(plain(before));
    });
    test(`[c10] ${label}: Esc, an outside press, "ביטול" and Back close the sheet with no request, on the same address, focus on the button`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const reports = await profile(page, RAZ_ID, RAZ);
      for (const close of ['Escape', 'outside', 'cancel', 'Back'] as const) {
        await reportButton(page).click();
        const box = sheet(page, 'user');
        await expect(box).toBeVisible();
        await expect(radios(box).first()).toBeFocused();
        // Ready = the layer's own post-open work has run (Radix arms its outside-press listener, the screen pushes its Back entry, in the frames after it shows): two frames and a task, no clock.
        await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 0)))));
        await afterPaint(page);
        if (close === 'Escape') await page.keyboard.press('Escape');
        else if (close === 'outside') await page.mouse.click(3, 3);
        else if (close === 'cancel') await cancelButton(box).click();
        else await page.goBack();
        await expect(box, close).toHaveCount(0);
        expect(pathOf(page), close).toBe(`/u/${RAZ_ID}`);
        await expect(reportButton(page), close).toBeFocused();
      }
      expect(reports.sent).toEqual([]);
    });
    test(`[c13] ${label}: 409 and 404 close the sheet with their texts; a failed send keeps it with the alert and the input; the profile stays`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const reports = await profile(page, RAZ_ID, RAZ);
      for (const [answer, text] of [[409, T.already], [404, T.unavailable]] as const) {
        reports.answer = answer;
        await reportButton(page).click();
        await choose(sheet(page, 'user'), 5);
        await sendButton(sheet(page, 'user')).click();
        await expect(sheet(page, 'user')).toHaveCount(0);
        await expect(status(page, text)).toBeVisible();
        await expect(main(page).getByText(RAZ, { exact: true }).first()).toBeVisible();
        await expect(reportButton(page)).toBeFocused();
      }
      reports.answer = 500;
      await reportButton(page).click();
      const box = sheet(page, 'user');
      await choose(box, 5);
      await sendButton(box).click();
      await expect(box.getByRole('alert').filter({ hasText: T.failed })).toBeVisible();
      await expect(radios(box).nth(5)).toBeChecked();
    });
    test(`[c15] ${label}: axe is clean with the button and with the sheet; the button is at least 44x44 with a visible focus; keyboard only reaches a sent report`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const reports = await profile(page, RAZ_ID, RAZ);
      await scan(page);
      await expectTouchTarget(reportButton(page), 'report button');
      await expectFocusRing(reportButton(page), 'report button');
      await page.keyboard.press('Enter');
      const box = sheet(page, 'user');
      await expect(radios(box).first()).toBeFocused();
      await scan(page);
      await page.keyboard.press('ArrowDown');
      await sendButton(box).focus();
      await page.keyboard.press('Enter');
      await expect(box).toHaveCount(0);
      expect(reports.sent[0]).toMatchObject({ targetKind: 'user', targetId: RAZ_ID, reason: KEYS[1] });
    });
  }
});

// BR-075, docs/srs/08-business-rules.md: the title of each of the eight rules and the first words of its sentence, in order.
const RULES: Array<[string, string]> = [
  ['כבוד הדדי', 'בלי העלבות, שיימינג או בריונות'],
  ['משתפים ניסיון, לא מאבחנים', 'בלי אבחנות ובלי מינון תרופות, ובמצב דחוף פונים לרופא או ל-101'],
  ['פרטיות', 'בלי פרטים מזהים של אחרים, צילומי שיחות או תמונות של ילדים של אחרים בלי רשות'],
  ['שמירה על ילדים', 'בלי תוכן שמסכן ילד'],
  ['בלי ספאם ופרסום לא קשור', 'פרסום רק ב-Marketplace ובפרופיל מקצועי'],
  ['בלי תוכן מיני, אלים או מסית', ''],
  ['זהות אמיתית', 'בלי התחזות'],
  ['מדווחים במקום להתווכח', ''],
];

test.describe('F3.7 c14 [BR-075, PG-049] the community rules page', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c14] ${label}: h1 "כללי הקהילה", BR-075's eight rules in order in a list, a link on rule 2 to the hotlines page, the closing line; no request`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const requests = recordRequests(page);
      await open(page, '/community-rules', 'signed-in');
      await expect(page.getByRole('heading', { level: 1, name: T.rules, exact: true })).toBeVisible();
      const list = main(page).getByRole('list', { name: T.rules, exact: true });
      await expect(list.getByRole('listitem')).toHaveCount(8);
      for (const [i, [title, sentence]] of RULES.entries()) {
        const item = list.getByRole('listitem').nth(i);
        await expect(item.locator('strong, b').first(), `rule ${i + 1} title`).toHaveText(title);
        if (sentence !== '') await expect(item, `rule ${i + 1} sentence`).toContainText(sentence);
      }
      await expect(list.getByRole('listitem').nth(6)).toContainText('פוסט אנונימי');
      const link = list.getByRole('listitem').nth(1).getByRole('link', { name: 'מוקדי רפואה', exact: true });
      await expect(link).toHaveAttribute('href', '/medical-hotlines');
      await expect(list.getByRole('link')).toHaveCount(1);
      await expect(main(page).getByText('הפרת כלל מובילה להסרת התוכן ולצעדי אכיפה')).toBeVisible();
      const own = requests.filter((u) => new URL(u).pathname.startsWith('/api/'));
      expect(own, 'a static page makes no API request').toEqual([]);
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
    test(`[c14][c15] ${label}: axe is clean, RTL, every link and menu target is at least 44x44`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page, '/community-rules', 'signed-in');
      await expect(page.getByRole('heading', { level: 1, name: T.rules, exact: true })).toBeVisible();
      await scan(page);
      await expectTouchTarget(main(page).getByRole('link', { name: 'מוקדי רפואה', exact: true }), 'rule 2 link');
    });
  }
  test('[c14] the side menu holds "כללי הקהילה" right after "חברים", as a link to /community-rules; choosing it opens the page and closes the menu', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await open(page, '/feed', 'signed-in');
    await page.getByRole('button', { name: MENU_BUTTON, exact: true }).click();
    const drawer = page.getByRole('dialog', { name: DRAWER_TITLE });
    await expect(drawer).toBeVisible();
    const names = await drawer.locator('a[href]').evaluateAll((els) => els.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()));
    const friends = names.indexOf('חברים');
    expect(friends).toBeGreaterThanOrEqual(0);
    expect(names[friends + 1]).toBe(T.rules);
    const item = drawer.getByRole('link', { name: T.rules, exact: true });
    await expect(item).toHaveAttribute('href', '/community-rules');
    await expectTouchTarget(item, 'menu item');
    await item.click();
    await expect.poll(() => pathOf(page)).toBe('/community-rules');
    await expect(page.getByRole('dialog', { name: DRAWER_TITLE })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: T.rules, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: CLOSE })).toHaveCount(0);
  });
  test('[c14] a Guest does not get the page: it redirects to login', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await open(page, '/community-rules', 'signed-out');
    await expect.poll(() => pathOf(page)).not.toBe('/community-rules');
    await expect(page.getByRole('heading', { level: 1, name: T.rules, exact: true })).toHaveCount(0);
  });
});
