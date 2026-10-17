// I2 F2.2a journeys and children on the profile page: view, add, edit (real browser, real session source, network stubbed).
// Derived from .work/journeys-children/spec.md only: criteria 1, 2, 3, 4, 6 (the web half), 8, 12, 13. The server and database
// halves (5, 6's 409 and races, 7, 9, 10, 11) are in apps/server/tests and supabase/tests/51_children_write.sql: not repeated here.
// The stub, texts and steps: e2e/support/journeys-stub.ts (shared with F2.2b's e2e/journeys-pregnancy.spec.ts).
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { A_KIDS, DESKTOP_1280, MOBILE, PLANNING, SEX, T, addButton, cancelButton, childEdit, dateGroup, dayInput, describedBy, fillChild, focused, isoFrom, main, monthInput, nameInput, openAdd, openLoaded, openProfile, order, retryButton, saveButton, scan, setup, sexSelect, tenKids, viewText, yearInput } from './support/journeys-stub';
import type { Sex } from './support/journeys-stub';

test.use({ baseURL: APP, viewport: MOBILE });

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2a c1 c2 [FR-PROFILE-002 PG-012] the view', () => {
  test('[F2.2a c1] pregnant with a due date, has_child, two children by slot, each with "עריכה"', async ({ page }) => {
    await setup(page);
    await openLoaded(page);
    const text = await viewText(page);
    const at = order(text, [T.section, T.pregnant, T.hasChild, 'נועה · בת · 04.05.2023', 'איתי · בן · 10.01.2025']);
    for (const i of at) expect(i, text).toBeGreaterThanOrEqual(0);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    await expect(childEdit(page, 'נועה · בת · 04.05.2023')).toHaveCount(1);
    await expect(childEdit(page, 'איתי · בן · 10.01.2025')).toHaveCount(1);
    expect(text).toMatch(/שם מלא[:\s]+דנה כהן/);
  });

  test('[F2.2a c2] a due date null reads "תאריך לידה משוער: לא צוין"', async ({ page }) => {
    await setup(page, { journeys: [{ id: 'j-1', stage: 'pregnant', dueDate: null }], kids: [] });
    await openLoaded(page);
    expect(await viewText(page)).toContain(T.pregnantNoDate);
  });

  test('[F2.2a c2] planning only: "מתכננים", no child rows, and "הוספת ילד"', async ({ page }) => {
    await setup(page, { journeys: PLANNING, kids: [] });
    await openLoaded(page);
    expect(await viewText(page)).toContain(T.planning);
    await expect(main(page).getByRole('button', { name: /עריכה/ })).toHaveCount(1); // the F2.1 profile's own
    await expect(addButton(page)).toBeEnabled();
  });

  test('[F2.2a c2] while GET is pending: a loading state, no rows, no add or edit control', async ({ page }) => {
    const net = await setup(page);
    let release: () => void = () => undefined;
    net.holdGet = new Promise<void>((resolve) => { release = resolve; });
    await openProfile(page);
    await expect.poll(() => net.gets).toBeGreaterThan(0);
    const text = await viewText(page);
    for (const absent of ['נועה', 'איתי', T.pregnant, T.hasChild]) expect(text).not.toContain(absent);
    await expect(addButton(page)).toHaveCount(0);
    release();
    await expect(addButton(page)).toBeVisible();
    await expect(childEdit(page, 'נועה · בת · 04.05.2023')).toHaveCount(1);
  });

  for (const failure of [500, 503, 'abort'] as const) {
    test(`[F2.2a c2 ERR-004] GET ${String(failure)}: the load-failed text and "נסו שוב", which repeats the GET; the F2.1 fields still render`, async ({ page }) => {
      const net = await setup(page);
      net.get = failure;
      await openProfile(page);
      await expect(main(page).getByText(T.loadFailed)).toBeVisible();
      expect(await viewText(page)).toMatch(/שם מלא[:\s]+דנה כהן/);
      expect(await viewText(page)).not.toContain('נועה');
      await expect(addButton(page)).toHaveCount(0);
      const before = net.gets;
      net.get = 200;
      await retryButton(page).click();
      await expect.poll(() => net.gets).toBeGreaterThan(before);
      await expect(childEdit(page, 'נועה · בת · 04.05.2023')).toHaveCount(1);
      await expect(main(page).getByText(T.loadFailed)).toHaveCount(0);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2a c3 [FR-REG-003 VAL-043 VAL-006 VAL-005] adding a child', () => {
  test('[F2.2a c3] the form: "שם", "מין" with בן / בת / עוד לא ידוע, "תאריך לידה" in day, month, year', async ({ page }) => {
    await setup(page);
    await openAdd(page);
    await expect(nameInput(page)).toHaveValue('');
    const options = (await sexSelect(page).locator('option').allTextContents()).map((o) => o.trim());
    for (const label of Object.values(SEX)) expect(options).toContain(label);
    for (const field of [dayInput(page), monthInput(page), yearInput(page)]) await expect(field).toHaveValue('');
  });

  test('[F2.2a c3] "ביטול" closes the form and sends nothing', async ({ page }) => {
    const net = await setup(page);
    await openAdd(page);
    await fillChild(page, 'מיכל', 'girl', ['1', '2', '2024']);
    await cancelButton(page).click();
    await expect(nameInput(page)).toHaveCount(0);
    await expect(addButton(page)).toBeVisible();
    expect(net.sent).toHaveLength(0);
    expect(await viewText(page)).not.toContain('מיכל');
  });

  test('[F2.2a c3] a valid save: one POST with the three fields; the child appears last, also after a full reload', async ({ page }) => {
    const net = await setup(page);
    await openAdd(page);
    await fillChild(page, 'מיכל', 'unknown', ['7', '3', '2026']);
    await saveButton(page).click();
    await expect(childEdit(page, 'מיכל · עוד לא ידוע · 07.03.2026')).toHaveCount(1);
    expect(net.sent).toHaveLength(1);
    expect(net.sent[0]?.method).toBe('POST');
    expect(net.sent[0]?.path).toBe('/api/children');
    expect(String(net.sent[0]?.body.name).trim()).toBe('מיכל');
    expect(net.sent[0]?.body.sex).toBe('unknown');
    expect(isoFrom(net.sent[0]?.body ?? {})).toBe('2026-03-07');
    for (const forbidden of ['userId', 'user_id', 'slot', 'id']) expect(Object.keys(net.sent[0]?.body ?? {})).not.toContain(forbidden);
    const check = async () => {
      const text = await viewText(page);
      const at = order(text, ['נועה · בת · 04.05.2023', 'איתי · בן · 10.01.2025', 'מיכל · עוד לא ידוע · 07.03.2026']);
      expect([...at].sort((x, y) => x - y)).toEqual(at);
      expect(at[0]).toBeGreaterThanOrEqual(0);
    };
    await check();
    await page.reload();
    await expect(childEdit(page, 'מיכל · עוד לא ידוע · 07.03.2026')).toHaveCount(1);
    await check();
  });

  test('[F2.2a c3 c7] planning only: adding the first child shows it, and after a reload "יש לנו ילד או ילדה" too', async ({ page }) => {
    await setup(page, { journeys: PLANNING, kids: [] });
    await openAdd(page);
    await fillChild(page, 'נועה', 'girl', ['4', '5', '2023']);
    await saveButton(page).click();
    await expect(childEdit(page, 'נועה · בת · 04.05.2023')).toHaveCount(1);
    await page.reload();
    await expect(childEdit(page, 'נועה · בת · 04.05.2023')).toHaveCount(1);
    expect(await viewText(page)).toContain(T.hasChild);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2a c4 [VAL-043 VAL-006 VAL-005 ERR-003] validation in the browser, nothing sent', () => {
  type Case = [string, string | null, Sex | null, [string, string, string] | null, string, (page: Page) => Locator];
  const CASES: Case[] = [
    ['name empty', '', 'girl', ['4', '5', '2023'], T.nameRequired, nameInput],
    ['name of spaces', '    ', 'girl', ['4', '5', '2023'], T.nameRequired, nameInput],
    ['61 characters after trim', ` ${'נ'.repeat(61)} `, 'girl', ['4', '5', '2023'], T.nameLength, nameInput],
    ['no sex', 'נועה', null, ['4', '5', '2023'], T.sexRequired, sexSelect],
    ['date empty', 'נועה', 'girl', null, T.dateRequired, dayInput],
    ['date partial', 'נועה', 'girl', ['4', '', '2023'], T.dateRequired, dayInput],
    ['31.02.2024', 'נועה', 'girl', ['31', '2', '2024'], T.dateNotReal, dayInput],
    ['tomorrow (16.06.2026)', 'נועה', 'girl', ['16', '6', '2026'], T.dateFuture, dayInput],
    ['31.12.1899', 'נועה', 'girl', ['31', '12', '1899'], T.dateFloor, dayInput],
  ];
  for (const [label, name, sex, date, message, field] of CASES) {
    test(`[F2.2a c4] ${label}: "${message}", no request, focus on the field, tied by aria-describedby`, async ({ page }) => {
      const net = await setup(page);
      await openAdd(page);
      await fillChild(page, name, sex, date);
      await saveButton(page).click();
      await expect(main(page).getByText(message)).toBeVisible();
      expect(net.sent).toHaveLength(0);
      const target = field === dayInput ? focused(page) : field(page);
      if (field === dayInput) await expect(dateGroup(page).locator('*:focus')).toHaveCount(1);
      else await expect(target).toBeFocused();
      expect(await describedBy(target)).toContain(message);
    });
  }

  test('[F2.2a c4] all three missing: three messages, focus on the first invalid field (the name)', async ({ page }) => {
    const net = await setup(page);
    await openAdd(page);
    await saveButton(page).click();
    for (const m of [T.nameRequired, T.sexRequired, T.dateRequired]) await expect(main(page).getByText(m)).toBeVisible();
    await expect(nameInput(page)).toBeFocused();
    expect(net.sent).toHaveLength(0);
  });

  test('[F2.2a c4] messages appear only after the first Save, not while typing or on blur', async ({ page }) => {
    await setup(page);
    await openAdd(page);
    await nameInput(page).fill('');
    await page.keyboard.press('Tab');
    await dayInput(page).fill('31');
    await monthInput(page).fill('2');
    await page.keyboard.press('Tab');
    for (const m of [T.nameRequired, T.sexRequired, T.dateRequired, T.dateNotReal]) await expect(main(page).getByText(m)).toHaveCount(0);
  });

  for (const [label, name, date, shown] of [
    ['1 character, today (15.06.2026)', 'א', ['15', '6', '2026'], 'א · בת · 15.06.2026'],
    ['60 characters, 01.01.1900', 'נ'.repeat(60), ['1', '1', '1900'], `${'נ'.repeat(60)} · בת · 01.01.1900`],
    ['a name between spaces is stored trimmed', '  רוני  ', ['29', '2', '2024'], 'רוני · בת · 29.02.2024'],
  ] as const) {
    test(`[F2.2a c4] accepted: ${label}`, async ({ page }) => {
      const net = await setup(page);
      await openAdd(page);
      await fillChild(page, name, 'girl', [date[0], date[1], date[2]]);
      await saveButton(page).click();
      await expect(childEdit(page, shown)).toHaveCount(1);
      expect(net.sent).toHaveLength(1);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2a c6 [VAL-040 AC-090] ten children', () => {
  test('[F2.2a c6] with 10 children "הוספת ילד" is disabled and "אפשר להוסיף עד 10 ילדים" shows', async ({ page }) => {
    const net = await setup(page, { kids: tenKids() });
    await openProfile(page);
    await expect(childEdit(page, 'ילד 10 · בן · 01.01.2020')).toHaveCount(1);
    await expect(addButton(page)).toBeDisabled();
    await expect(main(page).getByText(T.limit)).toBeVisible();
    await addButton(page).click({ force: true, timeout: 2000 }).catch(() => undefined);
    await expect(nameInput(page)).toHaveCount(0);
    expect(net.sent).toHaveLength(0);
  });

  test('[F2.2a c6] with 9 children "הוספת ילד" is enabled and the limit text is absent', async ({ page }) => {
    await setup(page, { kids: tenKids().slice(0, 9) });
    await openLoaded(page);
    await expect(addButton(page)).toBeEnabled();
    await expect(main(page).getByText(T.limit)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2a c8 [FR-PROFILE-002 DR-5] editing a child', () => {
  test('[F2.2a c8] "עריכה" opens the form filled with the child\'s values', async ({ page }) => {
    await setup(page);
    await openLoaded(page);
    await childEdit(page, 'איתי · בן · 10.01.2025').click();
    await expect(nameInput(page)).toHaveValue('איתי');
    await expect(sexSelect(page).locator('option:checked')).toHaveText(SEX.boy);
    expect(Number(await dayInput(page).inputValue())).toBe(10);
    expect(Number(await monthInput(page).inputValue())).toBe(1);
    expect(await yearInput(page).inputValue()).toBe('2025');
  });

  test('[F2.2a c8] a save sends one PUT for that child; the order is unchanged and the new values survive a reload', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await childEdit(page, 'נועה · בת · 04.05.2023').click();
    await fillChild(page, 'נועה רות', 'unknown', ['5', '6', '2023']);
    await saveButton(page).click();
    await expect(childEdit(page, 'נועה רות · עוד לא ידוע · 05.06.2023')).toHaveCount(1);
    expect(net.sent).toHaveLength(1);
    expect(net.sent[0]?.method).toBe('PUT');
    expect(net.sent[0]?.path).toBe(`/api/children/${A_KIDS[0]?.id ?? ''}`);
    expect(net.kids.map((k) => k.name)).toEqual(['נועה רות', 'איתי']);
    for (const forbidden of ['userId', 'user_id', 'slot', 'id']) expect(Object.keys(net.sent[0]?.body ?? {})).not.toContain(forbidden);
    await page.reload();
    await expect(childEdit(page, 'נועה רות · עוד לא ידוע · 05.06.2023')).toHaveCount(1);
    const text = await viewText(page);
    expect(text.indexOf('נועה רות · עוד לא ידוע · 05.06.2023')).toBeLessThan(text.indexOf('איתי · בן · 10.01.2025'));
  });

  test('[F2.2a c8] "ביטול" sends nothing and the view keeps the stored values; reopening shows them again', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await childEdit(page, 'איתי · בן · 10.01.2025').click();
    await fillChild(page, 'שם אחר', 'girl', ['1', '1', '2020']);
    await cancelButton(page).click();
    expect(net.sent).toHaveLength(0);
    await expect(childEdit(page, 'איתי · בן · 10.01.2025')).toHaveCount(1);
    await childEdit(page, 'איתי · בן · 10.01.2025').click();
    await expect(nameInput(page)).toHaveValue('איתי');
  });

  test('[F2.2a c8 c4] the edit form validates like the add form: an emptied name is refused, nothing sent', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await childEdit(page, 'איתי · בן · 10.01.2025').click();
    await nameInput(page).fill('');
    await saveButton(page).click();
    await expect(main(page).getByText(T.nameRequired)).toBeVisible();
    await expect(nameInput(page)).toBeFocused();
    expect(net.sent).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2a c12 [ERR-004 ERR-038] saving: failure, in flight, success', () => {
  for (const failure of [500, 'abort'] as const) {
    test(`[F2.2a c12] POST ${String(failure)}: the form keeps its input, the text in role="alert"; a second Save succeeds`, async ({ page }) => {
      const net = await setup(page);
      await openAdd(page);
      net.write = failure;
      await fillChild(page, 'מיכל', 'girl', ['7', '3', '2024']);
      await saveButton(page).click();
      await expect(page.getByRole('alert').filter({ hasText: T.saveFailed })).toBeVisible();
      await expect(nameInput(page)).toHaveValue('מיכל');
      await expect(sexSelect(page).locator('option:checked')).toHaveText(SEX.girl);
      expect(Number(await dayInput(page).inputValue())).toBe(7);
      await expect(saveButton(page)).toBeEnabled();
      net.write = 200;
      await saveButton(page).click();
      await expect(childEdit(page, 'מיכל · בת · 07.03.2024')).toHaveCount(1);
      expect(net.sent).toHaveLength(2);
    });
  }

  test('[F2.2a c12] PUT 500: the edit form keeps its input and shows the alert', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await childEdit(page, 'איתי · בן · 10.01.2025').click();
    net.write = 500;
    await nameInput(page).fill('איתי חדש');
    await saveButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: T.saveFailed })).toBeVisible();
    await expect(nameInput(page)).toHaveValue('איתי חדש');
  });

  test('[F2.2a c12] while a save is in flight Save is disabled; pressing it twice sends one request', async ({ page }) => {
    const net = await setup(page);
    await openAdd(page);
    let release: () => void = () => undefined;
    net.holdWrite = new Promise<void>((resolve) => { release = resolve; });
    await fillChild(page, 'מיכל', 'girl', ['7', '3', '2024']);
    await saveButton(page).click();
    await expect.poll(() => net.sent.length).toBe(1);
    await expect(saveButton(page)).toBeDisabled();
    await saveButton(page).click({ force: true, timeout: 2000 }).catch(() => undefined);
    await page.keyboard.press('Enter');
    release();
    await expect(childEdit(page, 'מיכל · בת · 07.03.2024')).toHaveCount(1);
    expect(net.sent).toHaveLength(1);
  });

  test('[F2.2a c12] an add succeeds: "הפרטים נשמרו" in role="status", focus back on "הוספת ילד"', async ({ page }) => {
    await setup(page);
    await openAdd(page);
    await fillChild(page, 'מיכל', 'girl', ['7', '3', '2024']);
    await saveButton(page).click();
    await expect(page.getByRole('status').filter({ hasText: T.saved })).toBeVisible();
    await expect(addButton(page)).toBeFocused();
  });

  test('[F2.2a c12] an edit succeeds: the status, and focus back on that child\'s "עריכה"', async ({ page }) => {
    await setup(page);
    await openLoaded(page);
    await childEdit(page, 'איתי · בן · 10.01.2025').click();
    await nameInput(page).fill('איתן');
    await saveButton(page).click();
    await expect(page.getByRole('status').filter({ hasText: T.saved })).toBeVisible();
    await expect(childEdit(page, 'איתן · בן · 10.01.2025')).toBeFocused();
  });

  test('[F2.2a c12 ERR-038] a save whose token refresh is refused: the session ends, login with the expired text', async ({ page }) => {
    const net = await setup(page, {}, true);
    await openAdd(page);
    net.refreshOk = false;
    await fillChild(page, 'מיכל', 'girl', ['7', '3', '2024']);
    await saveButton(page).click();
    await expect.poll(() => pathOf(page)).toBe('/login');
    await expect(page.getByText(T.expired)).toBeVisible();
  });

  test('[F2.2a c12 ERR-038] a write the server refuses with 401: login with the expired text', async ({ page }) => {
    const net = await setup(page);
    await openAdd(page);
    net.write = 401;
    net.me = 401;
    await fillChild(page, 'מיכל', 'girl', ['7', '3', '2024']);
    await saveButton(page).click();
    await expect.poll(() => pathOf(page)).toBe('/login');
    await expect(page.getByText(T.expired)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2a c13 [S3 NFR-A11Y-001] keyboard only', () => {
  test('[F2.2a c13] add by keyboard: Enter on "הוספת ילד", type, choose, fill the date, Enter on "שמירה"', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await addButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(nameInput(page)).toBeVisible();
    await nameInput(page).focus();
    await page.keyboard.type('מיכל');
    await page.keyboard.press('Tab');
    await expect(sexSelect(page)).toBeFocused();
    await sexSelect(page).selectOption({ label: SEX.girl });
    await page.keyboard.press('Tab');
    await expect(dateGroup(page).locator('*:focus')).toHaveCount(1);
    await page.keyboard.type('7');
    await page.keyboard.press('Tab');
    await page.keyboard.type('3');
    await page.keyboard.press('Tab');
    await page.keyboard.type('2024');
    await saveButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(childEdit(page, 'מיכל · בת · 07.03.2024')).toHaveCount(1);
    expect(net.sent).toHaveLength(1);
  });

  test('[F2.2a c13] edit and cancel by keyboard: Enter on a child\'s "עריכה", Enter on "ביטול" sends nothing', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await childEdit(page, 'איתי · בן · 10.01.2025').focus();
    await page.keyboard.press('Enter');
    await expect(nameInput(page)).toHaveValue('איתי');
    await cancelButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(nameInput(page)).toHaveCount(0);
    expect(net.sent).toHaveLength(0);
  });

  test('[F2.2a c13] Tab from the page start reaches "הוספת ילד" and every child\'s "עריכה"', async ({ page }) => {
    await setup(page);
    await openLoaded(page);
    const reached = new Set<string>();
    const targets: Array<[string, Locator]> = [
      ['add', addButton(page)],
      ['noa', childEdit(page, 'נועה · בת · 04.05.2023')],
      ['itai', childEdit(page, 'איתי · בן · 10.01.2025')],
    ];
    for (let i = 0; i < 60 && reached.size < targets.length; i += 1) {
      await page.keyboard.press('Tab');
      for (const [label, target] of targets) {
        if (await target.evaluate((el) => el === document.activeElement)) reached.add(label);
      }
    }
    expect([...reached].sort()).toEqual(['add', 'itai', 'noa']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
for (const vp of [{ name: '375', size: MOBILE }, { name: '1280', size: DESKTOP_1280 }]) {
  test.describe(`F2.2a c13 [S3 NFR-A11Y-001] axe at ${vp.name}, RTL`, () => {
    test.use({ viewport: vp.size });

    test(`[F2.2a c13 c1] journey-view (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openLoaded(page);
      await scan(page);
    });
    test(`[F2.2a c13 c2] journey-view-empty (${vp.name})`, async ({ page }) => {
      await setup(page, { journeys: PLANNING, kids: [] });
      await openLoaded(page);
      await scan(page);
    });
    test(`[F2.2a c13 c2] journey-load-failed (${vp.name})`, async ({ page }) => {
      const net = await setup(page);
      net.get = 500;
      await openProfile(page);
      await expect(main(page).getByText(T.loadFailed)).toBeVisible();
      await scan(page);
    });
    test(`[F2.2a c13 c3] child-form (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openAdd(page);
      await scan(page);
    });
    test(`[F2.2a c13 c4] child-form-errors (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openAdd(page);
      await saveButton(page).click();
      await expect(main(page).getByText(T.nameRequired)).toBeVisible();
      await scan(page);
    });
    test(`[F2.2a c13 c6] children-limit (${vp.name})`, async ({ page }) => {
      await setup(page, { kids: tenKids() });
      await openProfile(page);
      await expect(main(page).getByText(T.limit)).toBeVisible();
      await scan(page);
    });
    test(`[F2.2a c13 c12] journey-save-failed (${vp.name})`, async ({ page }) => {
      const net = await setup(page);
      await openAdd(page);
      net.write = 500;
      await fillChild(page, 'מיכל', 'girl', ['7', '3', '2024']);
      await saveButton(page).click();
      await expect(page.getByRole('alert').filter({ hasText: T.saveFailed })).toBeVisible();
      await scan(page);
    });
  });
}
