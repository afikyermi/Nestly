// I2 F2.4b FriendsPage, PG-036 (real browser, real session source, network stubbed). Derived from .work/friends/spec.md only:
// criteria 13, 14, 15 and "Gate 1 clarifications (F2.4a)" for the routes and bodies the page calls. Hebrew strings are the spec's.
// The spec gives no text for the empty lists (Q1 "defaults"), the load-failure message or the action-failure message, so those are
// asserted by structure (a non-empty text, `role="alert"`), never by wording. The API half (lists, ownership, 404/409) is
// apps/server/tests and supabase/tests: not repeated here. The stub plays the server: e2e/support/friends-stub.ts.
// Visual baselines for `friends`, `friends-empty`, `friends-remove` are the entries in e2e/visual-screens.ts.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, MENU_BUTTON, pathOf } from './app-helpers';
import { DESKTOP_1280, EMAIL, MOBILE, main, scan } from './support/journeys-stub';
import { AVI, DANA, MIRI, NOAM, TEXT, YOSSI, setupFriends } from './support/friends-stub';
import type { FriendsNet, Person } from './support/friends-stub';

test.use({ baseURL: APP, viewport: MOBILE });

const PASSWORD = 'Zq-7-unique-pw-marker-91';
const SIZES = [
  { label: 'phone', viewport: MOBILE },
  { label: 'desktop', viewport: DESKTOP_1280 },
] as const;

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}
/** Signed in, straight to /friends (a full load: the real session survives it). */
async function openFriends(page: Page): Promise<void> {
  await signIn(page);
  await page.goto('/friends');
  expect(pathOf(page)).toBe('/friends');
  await expect(heading(page, TEXT.incoming)).toBeVisible();
}

const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true });
const dialog = (page: Page) => page.getByRole('alertdialog').or(page.getByRole('dialog'));
/** The outermost element that holds this heading and none of the other two: that list's section. */
function section(page: Page, name: string): Locator {
  const others = [TEXT.incoming, TEXT.sent, TEXT.friends].filter((h) => h !== name);
  return main(page)
    .locator('*')
    .filter({ has: heading(page, name) })
    .filter({ hasNot: page.getByRole('heading', { name: new RegExp(`^(${others.join('|')})$`) }) })
    .first();
}
/** A button of the given verb whose accessible name also carries the person's name (c15 "named with the person's name"). */
const actionOf = (scope: Locator, verb: string, who: Person) => scope.getByRole('button', { name: new RegExp(`${verb}.*${who.fullName}|${who.fullName}.*${verb}`) });
const isDisabled = (button: Locator) =>
  button.evaluate((el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true');
const settle = (page: Page) => page.waitForTimeout(400);
const mark = (page: Page) => page.evaluate(() => Reflect.set(window, '__friendsNoReload', 1));
const marked = (page: Page) => page.evaluate(() => Reflect.get(window, '__friendsNoReload') === 1);
const sectionText = async (page: Page, name: string) => ((await section(page, name).innerText()).replace(name, '').replace(/\s+/g, ' ')).trim();

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.4b c13 [PG-036 FR-MENU-001] the menu item and the three lists', () => {
  test('[F2.4b c13] a signed-in Regular opens the menu, sees "חברים", follows it to /friends: three headed lists in order', async ({ page }) => {
    await setupFriends(page);
    await signIn(page);
    await page.getByRole('button', { name: MENU_BUTTON }).click();
    await page.getByRole('link', { name: TEXT.menu, exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/friends');
    await expect(heading(page, TEXT.friends)).toBeVisible();
    const text = (await main(page).innerText()).replace(/\s+/g, ' ');
    const at = [TEXT.incoming, TEXT.sent, TEXT.friends].map((h) => text.indexOf(h));
    expect(at.every((i) => i >= 0), 'all three headings').toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  test('[F2.4b c13] each list holds its entries with its own buttons: incoming אישור + דחייה, sent ביטול, friends הסרה', async ({ page }) => {
    await setupFriends(page);
    await openFriends(page);
    const incoming = section(page, TEXT.incoming);
    const sent = section(page, TEXT.sent);
    const friends = section(page, TEXT.friends);
    for (const who of [DANA, YOSSI]) {
      await expect(incoming.getByText(who.fullName).first()).toBeVisible();
      await expect(actionOf(incoming, TEXT.accept, who)).toHaveCount(1);
      await expect(actionOf(incoming, TEXT.decline, who)).toHaveCount(1);
    }
    await expect(sent.getByText(NOAM.fullName).first()).toBeVisible();
    await expect(actionOf(sent, TEXT.cancel, NOAM)).toHaveCount(1);
    for (const who of [MIRI, AVI]) {
      await expect(friends.getByText(who.fullName).first()).toBeVisible();
      await expect(actionOf(friends, TEXT.remove, who)).toHaveCount(1);
    }
    await expect(incoming.getByText(MIRI.fullName)).toHaveCount(0);
    await expect(friends.getByText(DANA.fullName)).toHaveCount(0);
  });

  test('[F2.4b c13 Q1] empty lists: the three headings stay, each with its own non-empty text and no buttons', async ({ page }) => {
    await setupFriends(page, { incoming: [], sent: [], friends: [] });
    await openFriends(page);
    const texts: string[] = [];
    for (const h of [TEXT.incoming, TEXT.sent, TEXT.friends]) {
      const t = await sectionText(page, h);
      expect(t.length, `${h} has an empty text`).toBeGreaterThan(0);
      await expect(section(page, h).getByRole('button')).toHaveCount(0);
      texts.push(t);
    }
    expect(new Set(texts).size, 'each list has its own empty text').toBe(3);
  });

  test('[F2.4b c13] accept moves the entry from incoming into "החברים שלי" without a reload: one POST for that id, no body', async ({ page }) => {
    const net = await setupFriends(page);
    await openFriends(page);
    await mark(page);
    await actionOf(section(page, TEXT.incoming), TEXT.accept, DANA).click();
    await expect(section(page, TEXT.incoming).getByText(DANA.fullName)).toHaveCount(0);
    await expect(section(page, TEXT.friends).getByText(DANA.fullName).first()).toBeVisible();
    await expect(actionOf(section(page, TEXT.friends), TEXT.remove, DANA)).toHaveCount(1);
    await expect(section(page, TEXT.incoming).getByText(YOSSI.fullName).first()).toBeVisible();
    expect(await marked(page), 'the page was not reloaded').toBe(true);
    expect(net.actions.map((a) => `${a.method} ${a.path}`)).toEqual([`POST /api/friend-requests/${DANA.userId}/accept`]);
    expect(net.actions[0]?.raw ?? null, 'no body').toBeNull();
  });

  test('[F2.4b c13] decline and cancel take the entry out of its list and add it to no other', async ({ page }) => {
    const net = await setupFriends(page);
    await openFriends(page);
    await actionOf(section(page, TEXT.incoming), TEXT.decline, YOSSI).click();
    await expect(main(page).getByText(YOSSI.fullName)).toHaveCount(0);
    await actionOf(section(page, TEXT.sent), TEXT.cancel, NOAM).click();
    await expect(main(page).getByText(NOAM.fullName)).toHaveCount(0);
    expect(net.actions.map((a) => `${a.method} ${a.path}`)).toEqual([
      `POST /api/friend-requests/${YOSSI.userId}/decline`,
      `DELETE /api/friend-requests/${NOAM.userId}`,
    ]);
    await expect(section(page, TEXT.friends).getByText(YOSSI.fullName)).toHaveCount(0);
  });

  test('[F2.4b c13] remove: a dialog names that Friend with "הסרה" and "ביטול"; "ביטול" sends nothing and keeps the entry', async ({ page }) => {
    const net = await setupFriends(page);
    await openFriends(page);
    await actionOf(section(page, TEXT.friends), TEXT.remove, MIRI).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText(MIRI.fullName);
    await expect(dialog(page)).not.toContainText(AVI.fullName);
    await expect(dialog(page).getByRole('button', { name: TEXT.remove, exact: true })).toBeVisible();
    await dialog(page).getByRole('button', { name: TEXT.cancel, exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await settle(page);
    expect(net.actions).toHaveLength(0);
    await expect(section(page, TEXT.friends).getByText(MIRI.fullName).first()).toBeVisible();
  });

  test('[F2.4b c13] remove confirmed: one DELETE for that Friend, the entry leaves the list, the other stays', async ({ page }) => {
    const net = await setupFriends(page);
    await openFriends(page);
    await actionOf(section(page, TEXT.friends), TEXT.remove, MIRI).click();
    await dialog(page).getByRole('button', { name: TEXT.remove, exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(main(page).getByText(MIRI.fullName)).toHaveCount(0);
    await expect(section(page, TEXT.friends).getByText(AVI.fullName).first()).toBeVisible();
    expect(net.actions.map((a) => `${a.method} ${a.path}`)).toEqual([`DELETE /api/friends/${MIRI.userId}`]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.4b c14 [ERR-004] loading, load failure, action failure, double press, request_gone', () => {
  test('[F2.4b c14] while loading no list is shown (no heading, no entry, no empty text); then the lists appear', async ({ page }) => {
    const net = await setupFriends(page);
    let release: () => void = () => undefined;
    net.holdGet = new Promise<void>((resolve) => {
      release = resolve;
    });
    await signIn(page);
    await page.goto('/friends');
    await expect.poll(() => net.gets).toBeGreaterThan(0);
    await settle(page);
    for (const h of [TEXT.incoming, TEXT.sent, TEXT.friends]) await expect(heading(page, h)).toHaveCount(0);
    await expect(main(page).getByRole('button', { name: new RegExp(`${TEXT.accept}|${TEXT.remove}|${TEXT.cancel}`) })).toHaveCount(0);
    await expect(main(page).getByText(DANA.fullName)).toHaveCount(0);
    release();
    await expect(heading(page, TEXT.incoming)).toBeVisible();
    await expect(main(page).getByText(DANA.fullName).first()).toBeVisible();
  });

  for (const failure of [500, 'abort'] as const) {
    test(`[F2.4b c14] load failure (${String(failure)}): a message and "נסו שוב", no list; retry loads the lists`, async ({ page }) => {
      const net = await setupFriends(page);
      net.get = failure;
      await signIn(page);
      await page.goto('/friends');
      const retry = page.getByRole('button', { name: TEXT.retry, exact: true });
      await expect(retry).toBeVisible();
      const text = (await main(page).innerText()).replace(TEXT.retry, '').trim();
      expect(text.length, 'a message is shown beside the button').toBeGreaterThan(0);
      for (const h of [TEXT.incoming, TEXT.sent, TEXT.friends]) await expect(heading(page, h)).toHaveCount(0);
      await expect(main(page).getByText(DANA.fullName)).toHaveCount(0);
      net.get = 200;
      await retry.click();
      await expect(heading(page, TEXT.friends)).toBeVisible();
      await expect(main(page).getByText(DANA.fullName).first()).toBeVisible();
      await expect(retry).toHaveCount(0);
    });
  }

  const actions: Array<[string, (p: Page) => Locator, Person, (p: Page) => Promise<void>]> = [
    ['accept', (p) => actionOf(section(p, TEXT.incoming), TEXT.accept, DANA), DANA, () => Promise.resolve()],
    ['decline', (p) => actionOf(section(p, TEXT.incoming), TEXT.decline, YOSSI), YOSSI, () => Promise.resolve()],
    ['cancel', (p) => actionOf(section(p, TEXT.sent), TEXT.cancel, NOAM), NOAM, () => Promise.resolve()],
    [
      'remove',
      (p) => actionOf(section(p, TEXT.friends), TEXT.remove, MIRI),
      MIRI,
      async (p) => {
        await dialog(p).getByRole('button', { name: TEXT.remove, exact: true }).click();
      },
    ],
  ];
  for (const [label, button, who, confirm] of actions) {
    for (const failure of [500, 'abort'] as const) {
      test(`[F2.4b c14] ${label} fails (${String(failure)}): the entry stays, the message is a role="alert", the action can be tried again`, async ({ page }) => {
        const net = await setupFriends(page);
        await openFriends(page);
        net.write = failure;
        await button(page).click();
        await confirm(page);
        const alert = page.getByRole('alert').filter({ hasText: /\S/ });
        await expect(alert.first()).toBeVisible();
        // aria-modal hides <main> from role queries while the remove dialog is open, so the entry is looked up by CSS.
        await expect(page.locator('main').getByText(who.fullName).first()).toBeAttached();
        expect(net.actions).toHaveLength(1);
        // Not moved into Friends by the failed accept.
        if (label === 'accept') await expect(section(page, TEXT.friends).getByText(who.fullName)).toHaveCount(0);
        net.write = 200;
        if (label === 'remove') {
          // c14 does not close the dialog on failure: it stays open with its alert, and its own "הסרה" tries again.
          await expect(dialog(page)).toBeVisible();
          await expect(dialog(page).getByRole('alert').filter({ hasText: /\S/ }).first()).toBeVisible();
          await confirm(page);
        } else {
          await expect(button(page)).toBeEnabled();
          await button(page).click();
        }
        await expect.poll(() => net.actions.length).toBe(2);
      });
    }
  }

  test('[F2.4b c14] a double press on "אישור" sends exactly one request, and the button is disabled while it is in flight', async ({ page }) => {
    const net = await setupFriends(page);
    await openFriends(page);
    let release: () => void = () => undefined;
    net.holdWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    const button = actionOf(section(page, TEXT.incoming), TEXT.accept, DANA);
    await button.dblclick();
    await expect.poll(() => net.actions.length).toBeGreaterThan(0);
    await settle(page);
    expect(await isDisabled(button), 'disabled in flight').toBe(true);
    release();
    await expect(section(page, TEXT.friends).getByText(DANA.fullName).first()).toBeVisible();
    await settle(page);
    expect(net.actions).toHaveLength(1);
  });

  test('[F2.4b c14] a double press on the dialog\'s "הסרה" sends exactly one DELETE', async ({ page }) => {
    const net = await setupFriends(page);
    await openFriends(page);
    await actionOf(section(page, TEXT.friends), TEXT.remove, MIRI).click();
    let release: () => void = () => undefined;
    net.holdWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    await dialog(page).getByRole('button', { name: TEXT.remove, exact: true }).dblclick();
    await expect.poll(() => net.actions.length).toBeGreaterThan(0);
    await settle(page);
    release();
    await expect(main(page).getByText(MIRI.fullName)).toHaveCount(0);
    await settle(page);
    expect(net.actions).toHaveLength(1);
  });

  for (const [label, button] of [
    ['accept', (p: Page) => actionOf(section(p, TEXT.incoming), TEXT.accept, DANA)],
    ['decline', (p: Page) => actionOf(section(p, TEXT.incoming), TEXT.decline, DANA)],
    ['cancel', (p: Page) => actionOf(section(p, TEXT.sent), TEXT.cancel, NOAM)],
  ] as const) {
    test(`[F2.4b c14 ERR-004] ${label} answered 409 request_gone: the list is fetched again and "הבקשה כבר לא זמינה" is shown`, async ({ page }) => {
      const net: FriendsNet = await setupFriends(page);
      await openFriends(page);
      const getsBefore = net.gets;
      net.write = 409;
      await button(page).click();
      await expect(page.getByText(TEXT.gone)).toBeVisible();
      await expect.poll(() => net.gets).toBeGreaterThan(getsBefore);
      // The stub has dropped the request, as the real other side would have: the reloaded list no longer shows it.
      await expect(main(page).getByText(label === 'cancel' ? NOAM.fullName : DANA.fullName)).toHaveCount(0);
      await expect(section(page, TEXT.friends).getByText(DANA.fullName)).toHaveCount(0);
      await expect(section(page, TEXT.friends).getByText(MIRI.fullName).first()).toBeVisible();
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.4b c15 [S3 NFR-A11Y-001] accessibility: axe, RTL, focus, keyboard, accessible names', () => {
  for (const { label, viewport } of SIZES) {
    test(`[F2.4b c15] ${label}: zero axe violations, RTL, no horizontal scroll on friends`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setupFriends(page);
      await openFriends(page);
      await expect(main(page).getByText(DANA.fullName).first()).toBeVisible();
      await scan(page);
    });
    test(`[F2.4b c15] ${label}: zero axe violations, RTL, no horizontal scroll on friends-empty`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setupFriends(page, { incoming: [], sent: [], friends: [] });
      await openFriends(page);
      await scan(page);
    });
    test(`[F2.4b c15] ${label}: zero axe violations, RTL, no horizontal scroll on friends-remove (dialog open)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setupFriends(page);
      await openFriends(page);
      await actionOf(section(page, TEXT.friends), TEXT.remove, MIRI).click();
      await expect(dialog(page)).toBeVisible();
      await scan(page);
    });
  }

  test('[F2.4b c15] the dialog moves focus in, keeps Tab and Shift+Tab inside it, and returns focus to the opener on "ביטול" and on Escape', async ({ page }) => {
    await setupFriends(page);
    await openFriends(page);
    const opener = actionOf(section(page, TEXT.friends), TEXT.remove, MIRI);
    const inside = () => page.evaluate(() => (document.activeElement?.closest('[role="alertdialog"], [role="dialog"]') ?? null) !== null);
    const onOpener = () => opener.evaluate((el) => el === document.activeElement);
    for (const close of ['cancel', 'escape'] as const) {
      await opener.focus();
      await page.keyboard.press('Enter');
      await expect(dialog(page)).toBeVisible();
      expect(await inside(), 'focus starts inside the dialog').toBe(true);
      for (let i = 0; i < 6; i += 1) {
        await page.keyboard.press('Tab');
        expect(await inside(), `Tab ${String(i + 1)} stays inside`).toBe(true);
      }
      for (let i = 0; i < 6; i += 1) {
        await page.keyboard.press('Shift+Tab');
        expect(await inside(), `Shift+Tab ${String(i + 1)} stays inside`).toBe(true);
      }
      if (close === 'cancel') await dialog(page).getByRole('button', { name: TEXT.cancel, exact: true }).click();
      else await page.keyboard.press('Escape');
      await expect(dialog(page)).toHaveCount(0);
      expect(await onOpener(), `focus returns to the "${TEXT.remove}" button after ${close}`).toBe(true);
    }
  });

  test('[F2.4b c15] every action button is reachable by Tab alone, and "אישור" works from the keyboard', async ({ page }) => {
    const net = await setupFriends(page);
    await openFriends(page);
    const total = await main(page).getByRole('button').evaluateAll((els) => {
      els.forEach((el, i) => el.setAttribute('data-kb', String(i)));
      return els.length;
    });
    expect(total, 'accept+decline x2, cancel, remove x2').toBeGreaterThanOrEqual(7);
    await page.evaluate(() => {
      const a = document.activeElement;
      if (a instanceof HTMLElement) a.blur();
    });
    const seen = new Set<string>();
    for (let i = 0; i < 80 && seen.size < total; i += 1) {
      await page.keyboard.press('Tab');
      const tag = await page.evaluate(() => document.activeElement?.getAttribute('data-kb') ?? null);
      if (tag !== null) seen.add(tag);
    }
    expect([...seen].length, 'every button in main took focus').toBe(total);
    await actionOf(section(page, TEXT.incoming), TEXT.accept, DANA).focus();
    await page.keyboard.press('Enter');
    await expect(section(page, TEXT.friends).getByText(DANA.fullName).first()).toBeVisible();
    expect(net.actions.map((a) => a.path)).toEqual([`/api/friend-requests/${DANA.userId}/accept`]);
  });

  test('[F2.4b c15] every action button is named with its person: the verb and that person\'s name', async ({ page }) => {
    await setupFriends(page);
    await openFriends(page);
    const everyName = await main(page).getByRole('button').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent ?? ''));
    const people = [DANA, YOSSI, NOAM, MIRI, AVI].map((p) => p.fullName);
    for (const name of everyName) {
      expect(people.some((p) => name.includes(p)), `"${name}" carries a person's name`).toBe(true);
    }
    for (const [scope, verb, who] of [
      [TEXT.incoming, TEXT.accept, DANA], [TEXT.incoming, TEXT.decline, DANA], [TEXT.incoming, TEXT.accept, YOSSI], [TEXT.incoming, TEXT.decline, YOSSI],
      [TEXT.sent, TEXT.cancel, NOAM], [TEXT.friends, TEXT.remove, MIRI], [TEXT.friends, TEXT.remove, AVI],
    ] as const) {
      await expect(actionOf(section(page, scope), verb, who), `${verb} / ${who.fullName}`).toHaveCount(1);
    }
  });
});
