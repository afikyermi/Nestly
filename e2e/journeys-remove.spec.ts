// I2 F2.2b2 on the profile page: the confirmation dialog, removing a child, ending the pregnancy, the birth and planning ->
// pregnant (real browser, real session source, network stubbed). Derived from .work/journeys-children/spec.md only: criteria 16,
// 17, 19-26 as the user sees them; texts are the spec's (Q1). The database and server halves (hard delete, 404s for others' ids,
// has_child under concurrency, forced failures, 403s, logs) are in supabase/tests/54_journeys_write.sql and
// apps/server/tests/db/journeys-remove.db.test.ts: not repeated here. The stub plays the server: e2e/support/journeys-stub.ts.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { A_JOURNEYS, A_KIDS, DESKTOP_1280, MOBILE, PLANNING, T, addButton, cancelButton, childRow, describedBy, fillChild, main, nameInput, openLoaded, saveButton, scan, setup, sexSelect, tenKids, viewText, yearInput } from './support/journeys-stub';
import type { Journey } from './support/journeys-stub';

test.use({ baseURL: APP, viewport: MOBILE });

const Q = {
  removeNoa: 'להסיר את נועה?',
  removeTail: 'הפרטים יימחקו ולא ניתן לשחזר אותם',
  end: 'לסיים את מסלול ההריון?',
  planning: "מסלול 'מתכננים' יסתיים ויימחק",
  failed: 'הפעולה לא הצליחה. אפשר לנסות שוב',
  none: 'עוד לא נבחר שלב במסע',
} as const;
const NOA = 'נועה · בת · 04.05.2023';
const ITAI = 'איתי · בן · 10.01.2025';
const PREGNANT_ONLY: Journey[] = [{ id: 'j-1', stage: 'pregnant', dueDate: '2027-03-01' }];
const HAS_CHILD: Journey[] = [{ id: 'j-2', stage: 'has_child', dueDate: null }];

const dialog = (page: Page) => page.getByRole('alertdialog');
/** The dialog's confirming button: its one button that is not "ביטול". */
const confirmIn = (page: Page) => dialog(page).getByRole('button', { name: /^(?!ביטול$).+/ });
const dialogCancel = (page: Page) => dialog(page).getByRole('button', { name: 'ביטול', exact: true });
const removeOf = (page: Page, row: string) => childRow(page, row).getByRole('button', { name: 'הסרה', exact: true });
const endButton = (page: Page) => main(page).getByRole('button', { name: 'סיום מסלול ההריון', exact: true });
const birthButton = (page: Page) => main(page).getByRole('button', { name: 'הלידה התרחשה', exact: true });
const addPregnancy = (page: Page) => main(page).getByRole('button', { name: 'הוספת הריון', exact: true });
const heading = (page: Page) => page.getByRole('heading', { level: 2, name: T.section, exact: true });
/** Confirm, then wait until the dialog is gone: while it is open aria-modal hides the page, so an absence check would be vacuous. */
async function confirmDone(page: Page): Promise<void> {
  await confirmIn(page).click();
  await expect(dialog(page)).toHaveCount(0);
}
const inDialog = (page: Page) => page.evaluate(() => document.activeElement?.closest('[role="alertdialog"]') !== null);

async function openRemoveNoa(page: Page): Promise<void> {
  await openLoaded(page);
  await removeOf(page, NOA).click();
  await expect(dialog(page)).toBeVisible();
}
/** "הוספת הריון" while planning: the confirmation and the c14 date, in whichever order the screen asks for them, then saved. */
async function planningToPregnant(page: Page, confirm: boolean): Promise<void> {
  await addPregnancy(page).click();
  const dateGroup = page.getByRole('group', { name: T.dueGroup, exact: true });
  for (let step = 0; step < 4; step += 1) {
    if (await dialog(page).isVisible()) {
      if (!confirm) return dialogCancel(page).click();
      await confirmIn(page).click();
    } else if (await dateGroup.isVisible()) {
      await saveButton(page).click();
    } else if (await main(page).getByText('בהריון').first().isVisible()) return;
    await page.waitForTimeout(150);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2b c16 [DR-1 DR-3] every destructive action asks first; "ביטול", Escape or closing sends nothing', () => {
  const opens: Array<[string, Journey[], (page: Page) => Locator, string, string]> = [
    ['"הסרה" on נועה', A_JOURNEYS, (page) => removeOf(page, NOA), Q.removeNoa, `${Q.removeNoa} ${Q.removeTail}`],
    ['"סיום מסלול ההריון"', A_JOURNEYS, endButton, Q.end, `${Q.end} ${Q.removeTail}`],
    ['"הוספת הריון" while planning', PLANNING, addPregnancy, Q.planning, Q.planning],
  ];
  for (const [label, journeys, opener, name, text] of opens) {
    for (const how of ['ביטול', 'Escape'] as const) {
      test(`[F2.2b c16] ${label}: the dialog names the item ("${name}"); ${how} sends nothing, the view is unchanged`, async ({ page }) => {
        const net = await setup(page, { journeys: [...journeys] });
        await openLoaded(page);
        const before = await viewText(page);
        await opener(page).click();
        await expect(page.getByRole('alertdialog', { name: new RegExp(name.replace(/[?']/g, '.')) })).toBeVisible();
        expect((await dialog(page).innerText()).replace(/\s+/g, ' ')).toContain(text);
        if (how === 'Escape') await page.keyboard.press('Escape');
        else await dialogCancel(page).click();
        await expect(dialog(page)).toHaveCount(0);
        expect(net.sent).toHaveLength(0);
        expect(await viewText(page)).toBe(before);
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2b c17 c19 c21 [DR-1 VAL-040 DR-4 DR-6] removing a child', () => {
  test('[F2.2b c17] confirmed: one DELETE for that child with no body; the row is gone, also after a reload; "יש לנו ילד או ילדה" stays', async ({ page }) => {
    const net = await setup(page);
    await openRemoveNoa(page);
    await confirmDone(page);
    await expect(main(page).getByText(NOA)).toHaveCount(0);
    expect(net.sent).toHaveLength(1);
    expect(net.sent[0]?.method).toBe('DELETE');
    expect(net.sent[0]?.path).toBe(`/api/children/${A_KIDS[0]?.id ?? ''}`);
    expect(net.sent[0]?.raw ?? null, 'the DELETE carries no body').toBeNull();
    await expect(main(page).getByText(ITAI)).toBeVisible();
    await expect(main(page).getByText(T.hasChild)).toBeVisible();
    await page.reload();
    await expect(main(page).getByText(ITAI)).toBeVisible();
    await expect(main(page).getByText(NOA)).toHaveCount(0);
  });

  test('[F2.2b c17 VAL-040] at 10, remove one: "הוספת ילד" is enabled again, the limit text goes, and a new child shows last', async ({ page }) => {
    const kids = tenKids();
    await setup(page, { journeys: HAS_CHILD, kids });
    await openLoaded(page);
    await expect(addButton(page)).toHaveAttribute('aria-disabled', 'true');
    await removeOf(page, 'ילד 3 ·').click();
    await confirmDone(page);
    await expect(main(page).getByText('ילד 3 ·')).toHaveCount(0);
    await expect(addButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(main(page).getByText(T.limit)).toHaveCount(0);
    await addButton(page).click();
    await fillChild(page, 'חדשה', 'girl', ['1', '6', '2026']);
    await saveButton(page).click();
    await expect(main(page).getByText('חדשה · בת · 01.06.2026')).toBeVisible();
    const text = await viewText(page);
    expect(text.indexOf('חדשה ·')).toBeGreaterThan(text.indexOf('ילד 10 ·'));
  });

  test('[F2.2b c19 c21 DR-6] has_child only, the last child removed: "עוד לא נבחר שלב במסע" with "הוספת הריון" and "הוספת ילד"', async ({ page }) => {
    await setup(page, { journeys: HAS_CHILD, kids: [A_KIDS[0] ?? { id: 'x', name: 'נועה', sex: 'girl', birthDate: '2023-05-04' }] });
    await openRemoveNoa(page);
    await confirmDone(page);
    await expect(main(page).getByText(Q.none)).toBeVisible();
    await expect(main(page).getByText(T.hasChild)).toHaveCount(0);
    await expect(addPregnancy(page)).toBeVisible();
    await expect(addButton(page)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2b c20 c21 c17 [DR-1 DR-2r DR-6] ending the pregnancy', () => {
  test('[F2.2b c20 DR-2r] the dialog asks no reason: no field of any kind; confirmed, one DELETE with no body; "בהריון" gone', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await endButton(page).click();
    await expect(dialog(page)).toBeVisible();
    for (const role of ['textbox', 'combobox', 'radio', 'checkbox', 'listbox', 'spinbutton'] as const) await expect(dialog(page).getByRole(role)).toHaveCount(0);
    await confirmDone(page);
    await expect(main(page).getByText('בהריון')).toHaveCount(0);
    expect(net.sent).toHaveLength(1);
    expect(net.sent[0]?.method).toBe('DELETE');
    expect(net.sent[0]?.path).toBe('/api/journeys/j-1');
    expect(net.sent[0]?.raw ?? null).toBeNull();
    await expect(main(page).getByText(T.hasChild)).toBeVisible();
    await expect(main(page).getByText(NOA)).toBeVisible();
  });

  test('[F2.2b c21 c17 c15] the only journey ended: "עוד לא נבחר שלב במסע"; "הוספת הריון" then adds a new pregnancy', async ({ page }) => {
    const net = await setup(page, { journeys: PREGNANT_ONLY, kids: [] });
    await openLoaded(page);
    await endButton(page).click();
    await confirmDone(page);
    await expect(main(page).getByText(Q.none)).toBeVisible();
    await expect(addButton(page)).toBeVisible();
    await addPregnancy(page).click();
    await saveButton(page).click();
    await expect(main(page).getByText(T.pregnantNoDate)).toBeVisible();
    expect(net.sent.map((s) => s.method)).toEqual(['DELETE', 'POST']);
    await expect(main(page).getByText(Q.none)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2b c22 [DR-2 DR-4] "הלידה התרחשה"', () => {
  test('[F2.2b c22] opens the c3 form, empty; a save sends one birth POST; the pregnancy is gone and the child shows last', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await birthButton(page).click();
    await expect(nameInput(page)).toBeVisible();
    await expect(nameInput(page)).toHaveValue('');
    await expect(yearInput(page)).toHaveValue('');
    await fillChild(page, 'תינוקת', 'girl', ['10', '6', '2026']);
    await saveButton(page).click();
    await expect(main(page).getByText('תינוקת · בת · 10.06.2026')).toBeVisible();
    expect(net.sent).toHaveLength(1);
    expect(net.sent[0]?.method).toBe('POST');
    expect(net.sent[0]?.path).toBe('/api/journeys/j-1/birth');
    for (const forbidden of ['userId', 'user_id', 'slot', 'id', 'stage']) expect(Object.keys(net.sent[0]?.body ?? {})).not.toContain(forbidden);
    await expect(main(page).getByText('בהריון')).toHaveCount(0);
    const text = await viewText(page);
    expect(text.indexOf('תינוקת ·')).toBeGreaterThan(text.indexOf('איתי ·'));
    await page.reload();
    await expect(main(page).getByText('תינוקת · בת · 10.06.2026')).toBeVisible();
    await expect(main(page).getByText('בהריון')).toHaveCount(0);
  });

  test('[F2.2b c22 c7] pregnant only: after the birth "יש לנו ילד או ילדה" appears', async ({ page }) => {
    await setup(page, { journeys: PREGNANT_ONLY, kids: [] });
    await openLoaded(page);
    await birthButton(page).click();
    await fillChild(page, 'תינוקת', 'girl', ['10', '6', '2026']);
    await saveButton(page).click();
    await expect(main(page).getByText(T.hasChild)).toBeVisible();
  });

  test('[F2.2b c22] "ביטול" sends nothing and the pregnancy stays', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await birthButton(page).click();
    await fillChild(page, 'תינוקת', null, null);
    await cancelButton(page).click();
    expect(net.sent).toHaveLength(0);
    await expect(main(page).getByText(T.pregnant)).toBeVisible();
  });

  test('[F2.2b c22 c4] the c4 rules: an empty save shows "יש למלא שם", "יש לבחור מין", "יש למלא תאריך לידה" and sends nothing', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await birthButton(page).click();
    await saveButton(page).click();
    for (const text of [T.nameRequired, T.sexRequired, T.dateRequired]) await expect(main(page).getByText(text)).toBeVisible();
    expect(net.sent).toHaveLength(0);
    await expect(nameInput(page)).toBeFocused();
  });

  test('[F2.2b c22 c6 VAL-040] with 10 children the server answers 409: the form shows "אפשר להוסיף עד 10 ילדים", the pregnancy kept', async ({ page }) => {
    await setup(page, { journeys: A_JOURNEYS, kids: tenKids() });
    await openLoaded(page);
    await birthButton(page).click();
    await fillChild(page, 'תינוקת', 'girl', ['10', '6', '2026']);
    await saveButton(page).click();
    await expect(main(page).getByText(T.limit).first()).toBeVisible();
    await expect(nameInput(page)).toHaveValue('תינוקת');
    await expect(sexSelect(page)).toBeVisible();
    await cancelButton(page).click();
    await expect(main(page).getByText(T.pregnant)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2b c23 [DR-3 VAL-039] planning -> pregnant', () => {
  for (const [label, journeys] of [['planning only', PLANNING], ['planning and has_child', [...PLANNING, ...HAS_CHILD]]] as const) {
    test(`[F2.2b c23] ${label}: after the confirmation one POST carrying it; the view shows "בהריון" and no "מתכננים"`, async ({ page }) => {
      const net = await setup(page, { journeys: [...journeys] });
      await openLoaded(page);
      await planningToPregnant(page, true);
      await expect(main(page).getByText(T.pregnantNoDate)).toBeVisible();
      await expect(main(page).getByText(T.planning, { exact: true })).toHaveCount(0);
      expect(net.sent).toHaveLength(1);
      expect(net.sent[0]?.method).toBe('POST');
      expect(net.sent[0]?.path).toBe('/api/journeys');
      expect(net.sent[0]?.body.endPlanning).toBe(true);
      await page.reload();
      await expect(main(page).getByText(T.pregnantNoDate)).toBeVisible();
      await expect(main(page).getByText(T.planning, { exact: true })).toHaveCount(0);
    });
  }

  test('[F2.2b c23 c16] the confirmation cancelled: nothing sent, "מתכננים" stays', async ({ page }) => {
    const net = await setup(page, { journeys: PLANNING });
    await openLoaded(page);
    await planningToPregnant(page, false);
    await expect(dialog(page)).toHaveCount(0);
    expect(net.sent).toHaveLength(0);
    await expect(main(page).getByText(T.planning, { exact: true })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2b c25 c24 [ERR-004 Q3 ERR-037 ERR-038] a dialog in flight', () => {
  test('[F2.2b c25] confirm is disabled in flight; a double press and Enter send one request; success: "הפרטים נשמרו" in role="status"', async ({ page }) => {
    const net = await setup(page);
    await openRemoveNoa(page);
    let release: () => void = () => undefined;
    net.holdWrite = new Promise<void>((resolve) => { release = resolve; });
    await confirmIn(page).click();
    await expect.poll(() => net.sent.length).toBe(1);
    await expect(confirmIn(page)).toBeDisabled();
    await confirmIn(page).click({ force: true, timeout: 2000 }).catch(() => undefined);
    await page.keyboard.press('Enter');
    release();
    await expect(page.getByRole('status').filter({ hasText: T.saved })).toBeVisible();
    expect(net.sent).toHaveLength(1);
    await expect(main(page).getByText(NOA)).toHaveCount(0);
  });

  for (const failure of [500, 503, 'abort'] as const) {
    test(`[F2.2b c25 ERR-004] ${String(failure)}: the dialog stays open with "${Q.failed}" in role="alert", the child still shown; a retry works`, async ({ page }) => {
      const net = await setup(page);
      await openRemoveNoa(page);
      net.write = failure;
      await confirmIn(page).click();
      await expect(page.getByRole('alert').filter({ hasText: Q.failed })).toBeVisible();
      await expect(dialog(page)).toBeVisible();
      await expect(confirmIn(page)).toBeEnabled();
      // aria-modal hides the page from the accessibility tree while the dialog is open: the row is checked on screen, by DOM.
      await expect(page.locator('main').getByText(NOA)).toBeVisible();
      net.write = 200;
      await confirmIn(page).click();
      await expect(dialog(page)).toHaveCount(0);
      await expect(main(page).getByText(NOA)).toHaveCount(0);
      expect(net.sent).toHaveLength(2);
    });
  }

  test('[F2.2b c25 Q3] the child was removed in another tab: 404 -> the view refreshes from GET, the child absent, no error', async ({ page }) => {
    const net = await setup(page);
    await openRemoveNoa(page);
    net.kids = net.kids.filter((k) => k.name !== 'נועה');
    const gets = net.gets;
    await confirmIn(page).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => net.gets).toBeGreaterThan(gets);
    await expect(main(page).getByText(NOA)).toHaveCount(0);
    await expect(main(page).getByText(ITAI)).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: Q.failed })).toHaveCount(0);
    await expect(page.getByRole('alert').filter({ hasText: T.saveFailed })).toHaveCount(0);
  });

  test('[F2.2b c25 Q3] the pregnancy already ended elsewhere: 404 -> refreshed, "בהריון" absent, no error', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await endButton(page).click();
    net.journeys = net.journeys.filter((j) => j.stage !== 'pregnant');
    await confirmIn(page).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(main(page).getByText('בהריון')).toHaveCount(0);
    await expect(page.getByRole('alert').filter({ hasText: Q.failed })).toHaveCount(0);
  });

  test('[F2.2b c24 ERR-037] a removal answered 403 (account stopped): the dialog closes, the ERR-037 text, sent once', async ({ page }) => {
    const net = await setup(page);
    await openRemoveNoa(page);
    net.write = 403;
    net.me = 'unavailable';
    await confirmIn(page).click();
    await expect(page.getByText(T.stopped).first()).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
    expect(net.sent).toHaveLength(1);
  });

  test('[F2.2b c24 ERR-038] an end answered 401: the dialog closes, login with the expired text, sent once', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await endButton(page).click();
    net.write = 401;
    net.me = 401;
    await confirmIn(page).click();
    await expect.poll(() => pathOf(page)).toBe('/login');
    await expect(page.getByText(T.expired)).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
    expect(net.sent).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.2b c26 [S3 NFR-A11Y-001 Q4] the dialog by keyboard and screen reader', () => {
  test('[F2.2b c26] role="alertdialog", aria-modal, named by its question; the child\'s name in <bdi>; focus opens on "ביטול"', async ({ page }) => {
    await setup(page);
    await openRemoveNoa(page);
    await expect(page.getByRole('alertdialog', { name: /להסיר את נועה/ })).toBeVisible();
    await expect(dialog(page)).toHaveAttribute('aria-modal', 'true');
    await expect(dialog(page).locator('bdi', { hasText: 'נועה' })).not.toHaveCount(0);
    await expect(dialogCancel(page)).toBeFocused();
  });

  test('[F2.2b c26] Tab and Shift+Tab stay inside the dialog', async ({ page }) => {
    await setup(page);
    await openRemoveNoa(page);
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      expect(await inDialog(page), `Tab ${i + 1} left the dialog`).toBe(true);
    }
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await inDialog(page), `Shift+Tab ${i + 1} left the dialog`).toBe(true);
    }
  });

  for (const how of ['ביטול', 'Escape'] as const) {
    test(`[F2.2b c26] cancelled by ${how}: focus returns to the opening "הסרה"; for the end dialog to "סיום מסלול ההריון"`, async ({ page }) => {
      await setup(page);
      await openRemoveNoa(page);
      if (how === 'Escape') await page.keyboard.press('Escape');
      else await dialogCancel(page).click();
      await expect(removeOf(page, NOA)).toBeFocused();
      await endButton(page).click();
      await expect(dialog(page)).toBeVisible();
      if (how === 'Escape') await page.keyboard.press('Escape');
      else await dialogCancel(page).click();
      await expect(endButton(page)).toBeFocused();
    });
  }

  // Bug 18: Escape pressed the moment the dialog appears, before the router has committed the dialog's history entry. That entry, committed
  // after the close, was taken for a stale one and stepped over too: a second step back left the profile for the screen before it (/feed).
  test('[F2.2b c26] Escape the instant the dialog appears: the dialog closes and the profile stays', async ({ page }) => {
    await setup(page);
    await openLoaded(page);
    await page.evaluate(() => new Promise<void>((resolve) => {
      const watch = new MutationObserver(() => {
        if (document.querySelector('[role="alertdialog"]') === null) return;
        watch.disconnect();
        (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
        resolve();
      });
      watch.observe(document.body, { childList: true, subtree: true });
      const remove = [...document.querySelectorAll('main button')].find((b) => b.textContent?.trim() === 'הסרה');
      if (remove instanceof HTMLElement) remove.click();
    }));
    await expect(dialog(page)).toHaveCount(0);
    await expect(removeOf(page, NOA)).toBeFocused();
    // The second step back came a few milliseconds after the first had landed: give it time to show, then the profile must still be open.
    await page.waitForTimeout(500);
    expect(pathOf(page)).toBe('/profile');
    await expect(removeOf(page, NOA)).toBeFocused();
  });

  test('[F2.2b c26] after a delete, focus moves to the h2 "המסע שלי"', async ({ page }) => {
    await setup(page);
    await openRemoveNoa(page);
    await confirmIn(page).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(heading(page)).toBeFocused();
  });

  test('[F2.2b c26] "הסרה" keeps that name and is described by the child\'s row, as "עריכה"', async ({ page }) => {
    await setup(page);
    await openLoaded(page);
    for (const row of [NOA, ITAI]) {
      const button = removeOf(page, row);
      await expect(button).toHaveCount(1);
      expect((await describedBy(button)).replace(/\s+/g, ' ')).toContain(row);
    }
  });

  test('[F2.2b c26 c13] keyboard alone: Tab to "הסרה", Enter, Tab to the confirm, Enter: the child removed', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    let reached = false;
    for (let i = 0; i < 60 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      reached = await removeOf(page, NOA).evaluate((el) => el === document.activeElement);
    }
    expect(reached, 'Tab never reached the "הסרה" of נועה').toBe(true);
    await page.keyboard.press('Enter');
    await expect(dialogCancel(page)).toBeFocused();
    for (let i = 0; i < 4 && !(await confirmIn(page).evaluate((el) => el === document.activeElement)); i += 1) await page.keyboard.press('Tab');
    await expect(confirmIn(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveCount(0);
    await expect(main(page).getByText(NOA)).toHaveCount(0);
    expect(net.sent).toHaveLength(1);
  });

  test('[F2.2b c26 c13 c22] keyboard alone: Enter on "הלידה התרחשה", fill, Enter on "שמירה"', async ({ page }) => {
    const net = await setup(page);
    await openLoaded(page);
    await birthButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(nameInput(page)).toBeFocused();
    await page.keyboard.type('תינוקת');
    await sexSelect(page).selectOption({ label: 'בת' });
    await fillChild(page, null, null, ['10', '6', '2026']);
    await saveButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(main(page).getByText('תינוקת · בת · 10.06.2026')).toBeVisible();
    expect(net.sent).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
for (const vp of [{ name: '375', size: MOBILE }, { name: '1280', size: DESKTOP_1280 }]) {
  test.describe(`F2.2b c26 c13 [S3 NFR-A11Y-001] axe at ${vp.name}, RTL`, () => {
    test.use({ viewport: vp.size });

    test(`[F2.2b c26 c16] journey-confirm: the removal dialog (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openRemoveNoa(page);
      await scan(page);
    });
    test(`[F2.2b c26 c16 c20] journey-confirm: the end dialog (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openLoaded(page);
      await endButton(page).click();
      await expect(dialog(page)).toBeVisible();
      await scan(page);
    });
    test(`[F2.2b c26 c25] the dialog with its failure alert (${vp.name})`, async ({ page }) => {
      const net = await setup(page);
      await openRemoveNoa(page);
      net.write = 500;
      await confirmIn(page).click();
      await expect(page.getByRole('alert').filter({ hasText: Q.failed })).toBeVisible();
      await scan(page);
    });
    test(`[F2.2b c26 c21] journey-view-none (${vp.name})`, async ({ page }) => {
      await setup(page, { journeys: [], kids: [] });
      await openLoaded(page);
      await expect(main(page).getByText(Q.none)).toBeVisible();
      await scan(page);
    });
    test(`[F2.2b c26 c22] birth-form (${vp.name})`, async ({ page }) => {
      await setup(page);
      await openLoaded(page);
      await birthButton(page).click();
      await expect(nameInput(page)).toBeVisible();
      await scan(page);
    });
  });
}
