// I2 F2.2b1 on the profile page: the pregnancy's due-date edit and "הוספת הריון" (real browser, real session source, network
// stubbed). Derived from .work/journeys-children/spec.md only: criteria 14, 15, and 12, 13, 24 on those screens. The server and
// database halves (the server's own date window, 409 stage_conflict, the race, 404s, 403s, logs) are in
// apps/server/tests/db/journeys.db.test.ts and supabase/tests/54_journeys_write.sql: not repeated here.
// VAL-044 on the device date 15.06.2026: today-30 = 16.05.2026, today+300 = 11.04.2027 (ERR-003's range text is D.M.YYYY).
// The stub, texts and steps: e2e/support/journeys-stub.ts (shared with F2.2a's e2e/journeys.spec.ts).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { A_JOURNEYS, DESKTOP_1280, MOBILE, T, cancelButton, childEdit, describedBy, dueFrom, focused, main, openLoaded, order, saveButton, scan, setup, viewText } from './support/journeys-stub';
import type { Journey } from './support/journeys-stub';

test.use({ baseURL: APP, viewport: MOBILE });

// ---------------------------------------------------------------------------------------------------------------------
// F2.2b1: the pregnancy's due date (c14) and "הוספת הריון" (c15); c12, c13 and c24 on those screens.
const HAS_CHILD: Journey[] = [{ id: 'j-2', stage: 'has_child', dueDate: null }];
const dueGroup = (page: Page) => page.getByRole('group', { name: T.dueGroup, exact: true });
const dueDay = (page: Page) => dueGroup(page).getByLabel('יום', { exact: true });
const dueMonth = (page: Page) => dueGroup(page).getByLabel('חודש', { exact: true });
const dueYear = (page: Page) => dueGroup(page).getByLabel('שנה', { exact: true });
const pregnancyEdit = (page: Page) => childEdit(page, 'בהריון');
const addPregnancy = (page: Page) => page.getByRole('button', { name: 'הוספת הריון', exact: true });
async function fillDue(page: Page, [d, m, y]: [string, string, string]): Promise<void> {
  await dueDay(page).fill(d);
  await dueMonth(page).fill(m);
  await dueYear(page).fill(y);
}
async function openDueEdit(page: Page): Promise<void> {
  await openLoaded(page);
  await pregnancyEdit(page).click();
  await expect(dueGroup(page)).toBeVisible();
}
async function openAddPregnancy(page: Page): Promise<void> {
  await openLoaded(page);
  await addPregnancy(page).click();
  await expect(dueGroup(page)).toBeVisible();
}

test.describe('F2.2b c14 [VAL-044 DR-5] editing the due date', () => {
  test('[F2.2b c14] the pregnancy\'s "עריכה" opens "תאריך לידה משוער (לא חובה)" in three fields: day, month, year, with the stored date', async ({ page }) => {
    await setup(page);
    await openDueEdit(page);
    expect(Number(await dueDay(page).inputValue())).toBe(1);
    expect(Number(await dueMonth(page).inputValue())).toBe(3);
    expect(await dueYear(page).inputValue()).toBe('2027');
  });

  for (const [label, date, shown, iso] of [
    ['today-30 (16.05.2026)', ['16', '5', '2026'], '16.05.2026', '2026-05-16'],
    ['today+300 (11.04.2027)', ['11', '4', '2027'], '11.04.2027', '2027-04-11'],
  ] as const) {
    test(`[F2.2b c14 VAL-044] accepted: ${label}: one PUT for the pregnancy, the view shows it, also after a reload`, async ({ page }) => {
      const net = await setup(page);
      await openDueEdit(page);
      await fillDue(page, [date[0], date[1], date[2]]);
      await saveButton(page).click();
      await expect(main(page).getByText(`בהריון · תאריך לידה משוער: ${shown}`)).toBeVisible();
      expect(net.sent).toHaveLength(1);
      expect(net.sent[0]?.method).toBe('PUT');
      expect(net.sent[0]?.path).toBe('/api/journeys/j-1');
      expect(dueFrom(net.sent[0]?.body ?? {})).toBe(iso);
      for (const forbidden of ['userId', 'user_id', 'stage', 'id']) expect(Object.keys(net.sent[0]?.body ?? {})).not.toContain(forbidden);
      await page.reload();
      await expect(main(page).getByText(`בהריון · תאריך לידה משוער: ${shown}`)).toBeVisible();
    });
  }

  for (const [label, date] of [
    ['today-31 (15.05.2026)', ['15', '5', '2026']],
    ['today+301 (12.04.2027)', ['12', '4', '2027']],
  ] as const) {
    test(`[F2.2b c14 VAL-044 ERR-003] refused: ${label}: the registration range text, nothing sent, focus in the date, tied by aria-describedby`, async ({ page }) => {
      const net = await setup(page);
      await openDueEdit(page);
      await fillDue(page, [date[0], date[1], date[2]]);
      await saveButton(page).click();
      await expect(main(page).getByText(T.dueRange)).toBeVisible();
      expect(net.sent).toHaveLength(0);
      await expect(dueGroup(page).locator('*:focus')).toHaveCount(1);
      expect(await describedBy(focused(page))).toContain(T.dueRange);
    });
  }

  for (const [label, date] of [
    ['the month missing', ['16', '', '2026']],
    ['only the year', ['', '', '2027']],
    ['only the day', ['1', '', '']],
  ] as const) {
    test(`[F2.2b c14 VAL-044] partial (${label}): "${T.duePartial}", nothing sent`, async ({ page }) => {
      const net = await setup(page);
      await openDueEdit(page);
      await fillDue(page, [date[0], date[1], date[2]]);
      await saveButton(page).click();
      await expect(main(page).getByText(T.duePartial)).toBeVisible();
      expect(net.sent).toHaveLength(0);
    });
  }

  test('[F2.2b c14 DR-5] all three cleared: saved as null, the view reads "תאריך לידה משוער: לא צוין", also after a reload', async ({ page }) => {
    const net = await setup(page);
    await openDueEdit(page);
    await fillDue(page, ['', '', '']);
    await saveButton(page).click();
    await expect(main(page).getByText(T.pregnantNoDate)).toBeVisible();
    expect(net.sent).toHaveLength(1);
    expect(net.sent[0]?.method).toBe('PUT');
    expect(dueFrom(net.sent[0]?.body ?? {})).toBeNull();
    expect(net.journeys.find((j) => j.stage === 'pregnant')?.dueDate).toBeNull();
    await page.reload();
    await expect(main(page).getByText(T.pregnantNoDate)).toBeVisible();
  });
});

test.describe('F2.2b c15 [VAL-039 AC-089] adding a pregnancy', () => {
  test('[F2.2b c15] neither planning nor pregnant: "הוספת הריון" opens the empty date; an empty save adds the pregnancy, shown before has_child', async ({ page }) => {
    const net = await setup(page, { journeys: HAS_CHILD });
    await openAddPregnancy(page);
    for (const field of [dueDay(page), dueMonth(page), dueYear(page)]) await expect(field).toHaveValue('');
    await saveButton(page).click();
    await expect(main(page).getByText(T.pregnantNoDate)).toBeVisible();
    expect(net.sent).toHaveLength(1);
    expect(net.sent[0]?.method).toBe('POST');
    expect(net.sent[0]?.path).toBe('/api/journeys');
    expect(dueFrom(net.sent[0]?.body ?? {})).toBeNull();
    for (const forbidden of ['userId', 'user_id', 'stage', 'id']) expect(Object.keys(net.sent[0]?.body ?? {})).not.toContain(forbidden);
    const check = async () => {
      const text = await viewText(page);
      const at = order(text, ['בהריון', T.hasChild, 'נועה · בת · 04.05.2023']);
      expect(at[0], text).toBeGreaterThanOrEqual(0);
      expect([...at].sort((x, y) => x - y)).toEqual(at);
      await expect(addPregnancy(page)).toHaveCount(0);
    };
    await check();
    await page.reload();
    await expect(main(page).getByText(T.pregnantNoDate)).toBeVisible();
    await check();
  });

  test('[F2.2b c15 c14] a pregnancy added with a due date shows it', async ({ page }) => {
    const net = await setup(page, { journeys: HAS_CHILD });
    await openAddPregnancy(page);
    await fillDue(page, ['1', '1', '2027']);
    await saveButton(page).click();
    await expect(main(page).getByText('בהריון · תאריך לידה משוער: 01.01.2027')).toBeVisible();
    expect(dueFrom(net.sent[0]?.body ?? {})).toBe('2027-01-01');
  });

  test('[F2.2b c15 c14 VAL-044] the add form takes the c14 rules: today+301 shows the range text and sends nothing', async ({ page }) => {
    const net = await setup(page, { journeys: HAS_CHILD });
    await openAddPregnancy(page);
    await fillDue(page, ['12', '4', '2027']);
    await saveButton(page).click();
    await expect(main(page).getByText(T.dueRange)).toBeVisible();
    expect(net.sent).toHaveLength(0);
  });

  for (const [label, journeys] of [
    ['pregnant and has_child', A_JOURNEYS],
    ['pregnant only', [{ id: 'j-1', stage: 'pregnant', dueDate: null }]],
  ] as const) {
    test(`[F2.2b c15] with a pregnancy present (${label}) "הוספת הריון" is not shown`, async ({ page }) => {
      await setup(page, { journeys: [...journeys] });
      await openLoaded(page);
      await expect(pregnancyEdit(page)).toHaveCount(1);
      await expect(addPregnancy(page)).toHaveCount(0);
    });
  }
});

test.describe('F2.2b c12 c24 [ERR-004 ERR-037 ERR-038] saving the pregnancy form', () => {
  for (const failure of [500, 'abort'] as const) {
    test(`[F2.2b c12] PUT ${String(failure)}: the form keeps its input, the text in role="alert"; a second Save succeeds`, async ({ page }) => {
      const net = await setup(page);
      await openDueEdit(page);
      net.write = failure;
      await fillDue(page, ['16', '5', '2026']);
      await saveButton(page).click();
      await expect(page.getByRole('alert').filter({ hasText: T.saveFailed })).toBeVisible();
      expect(Number(await dueDay(page).inputValue())).toBe(16);
      expect(Number(await dueMonth(page).inputValue())).toBe(5);
      await expect(saveButton(page)).toBeEnabled();
      net.write = 200;
      await saveButton(page).click();
      await expect(main(page).getByText('בהריון · תאריך לידה משוער: 16.05.2026')).toBeVisible();
      expect(net.sent).toHaveLength(2);
    });
  }

  test('[F2.2b c12] POST 500 on "הוספת הריון": the form stays with the alert, no pregnancy shown', async ({ page }) => {
    const net = await setup(page, { journeys: HAS_CHILD });
    await openAddPregnancy(page);
    net.write = 500;
    await fillDue(page, ['1', '1', '2027']);
    await saveButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: T.saveFailed })).toBeVisible();
    expect(await dueYear(page).inputValue()).toBe('2027');
    expect(await viewText(page)).not.toContain('בהריון');
  });

  test('[F2.2b c12] while a due-date save is in flight Save is disabled; pressing it twice sends one request', async ({ page }) => {
    const net = await setup(page);
    await openDueEdit(page);
    let release: () => void = () => undefined;
    net.holdWrite = new Promise<void>((resolve) => { release = resolve; });
    await fillDue(page, ['16', '5', '2026']);
    await saveButton(page).click();
    await expect.poll(() => net.sent.length).toBe(1);
    await expect(saveButton(page)).toBeDisabled();
    await saveButton(page).click({ force: true, timeout: 2000 }).catch(() => undefined);
    await page.keyboard.press('Enter');
    release();
    await expect(main(page).getByText('בהריון · תאריך לידה משוער: 16.05.2026')).toBeVisible();
    expect(net.sent).toHaveLength(1);
  });

  test('[F2.2b c12] a due-date edit succeeds: "הפרטים נשמרו" in role="status", focus back on the pregnancy\'s "עריכה"', async ({ page }) => {
    await setup(page);
    await openDueEdit(page);
    await fillDue(page, ['16', '5', '2026']);
    await saveButton(page).click();
    await expect(page.getByRole('status').filter({ hasText: T.saved })).toBeVisible();
    await expect(pregnancyEdit(page)).toBeFocused();
  });

  test('[F2.2b c24 ERR-037] a due-date save answered 403 (account stopped): the ERR-037 text', async ({ page }) => {
    const net = await setup(page);
    await openDueEdit(page);
    net.write = 403;
    net.me = 'unavailable';
    await fillDue(page, ['16', '5', '2026']);
    await saveButton(page).click();
    await expect(page.getByText(T.stopped).first()).toBeVisible();
    expect(net.sent).toHaveLength(1);
  });

  test('[F2.2b c24 ERR-038] a "הוספת הריון" save the server refuses with 401: login with the expired text', async ({ page }) => {
    const net = await setup(page, { journeys: HAS_CHILD });
    await openAddPregnancy(page);
    net.write = 401;
    net.me = 401;
    await saveButton(page).click();
    await expect.poll(() => pathOf(page)).toBe('/login');
    await expect(page.getByText(T.expired)).toBeVisible();
  });
});

test.describe('F2.2b c13 [S3 NFR-A11Y-001] the pregnancy forms by keyboard alone', () => {
  test('[F2.2b c13 c14] Enter on the pregnancy\'s "עריכה", type the date, Enter on "שמירה"', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await pregnancyEdit(page).focus();
    await page.keyboard.press('Enter');
    await expect(dueGroup(page)).toBeVisible();
    await dueDay(page).focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('16');
    await page.keyboard.press('Tab');
    await expect(dueMonth(page)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('5');
    await page.keyboard.press('Tab');
    await expect(dueYear(page)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('2026');
    await saveButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(main(page).getByText('בהריון · תאריך לידה משוער: 16.05.2026')).toBeVisible();
    expect(net.sent).toHaveLength(1);
  });

  test('[F2.2b c13 c15] Tab reaches "הוספת הריון"; Enter opens it; Enter on "ביטול" sends nothing; Enter on "שמירה" adds', async ({ page }) => {
    const net = await setup(page, { journeys: HAS_CHILD });
    await openLoaded(page);
    let reached = false;
    for (let i = 0; i < 60 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      reached = await addPregnancy(page).evaluate((el) => el === document.activeElement);
    }
    expect(reached, 'Tab never reached "הוספת הריון"').toBe(true);
    await page.keyboard.press('Enter');
    await expect(dueGroup(page)).toBeVisible();
    await cancelButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(dueGroup(page)).toHaveCount(0);
    expect(net.sent).toHaveLength(0);
    await addPregnancy(page).focus();
    await page.keyboard.press('Enter');
    await saveButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(main(page).getByText(T.pregnantNoDate)).toBeVisible();
    expect(net.sent).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
for (const vp of [{ name: '375', size: MOBILE }, { name: '1280', size: DESKTOP_1280 }]) {
  test.describe(`F2.2b c13 [S3 NFR-A11Y-001] axe at ${vp.name}, RTL`, () => {
    test.use({ viewport: vp.size });

    test(`[F2.2b c13 c14] pregnancy-form (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openDueEdit(page);
      await scan(page);
    });
    test(`[F2.2b c13 c14] pregnancy-form-errors (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openDueEdit(page);
      await fillDue(page, ['12', '4', '2027']);
      await saveButton(page).click();
      await expect(main(page).getByText(T.dueRange)).toBeVisible();
      await scan(page);
    });
    test(`[F2.2b c13 c15] journey-view-add-pregnancy (${vp.name})`, async ({ page }) => {
      await setup(page, { journeys: HAS_CHILD });
      await openLoaded(page);
      await expect(addPregnancy(page)).toBeVisible();
      await scan(page);
    });
    test(`[F2.2b c13 c15] the add-pregnancy form (${vp.name})`, async ({ page }) => {
      await setup(page, { journeys: HAS_CHILD });
      await openAddPregnancy(page);
      await scan(page);
    });
  });
}
