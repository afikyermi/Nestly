// I2 F2.4c2 copy link (c26), actions by state (c28), accessibility and keyboard (c30). Second half of user-profile.spec.ts, split for the
// 800-line budget; fixtures are in support/profiles-fixtures.ts. Derived from .work/friends/spec.md only.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP } from './app-helpers';
import { MOBILE, main, scan } from './support/journeys-stub';
import { DANA, MIRI, YOSSI } from './support/friends-stub';
import { OWN_ID, TEXT, friendsOf, setupProfiles } from './support/profiles-stub';
import { AGES_FRIEND, LIOR, LIOR_ID, NOA, NOA_ID, PRO, PRO_ID, RAZ, RAZ_ID, SHIR, SHIR_ID, SIZES, TAL, TAL_ID, act, dialog, heading, isDisabled, mark, marked, openProfile, settle, signIn, text, viewsOf, world } from './support/profiles-fixtures';

test.use({ baseURL: APP, viewport: MOBILE });

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.4c2 c26 [FR-PRIV-001 "Profile/Deep Link" NFR-SEC-006 (4)] copy my profile link on FriendsPage', () => {
  const ownUrl = `${APP}/u/${OWN_ID}`;
  const copyButton = (page: Page) => page.getByRole('button', { name: TEXT.copy, exact: true });
  const copiedStatus = (page: Page) => page.getByRole('status').filter({ hasText: TEXT.copied });

  async function openFriends(page: Page): Promise<void> {
    await signIn(page);
    await page.goto('/friends');
    await expect(copyButton(page)).toBeVisible();
  }
  /** True when the URL is on screen as selectable text: an element's text or an input's value, and user-select is not none. */
  const selectableUrl = (page: Page, url: string) =>
    page.evaluate((u) => {
      const els = Array.from(document.querySelectorAll('main *'));
      return els.some((el) => {
        const holds = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value === u : el.children.length === 0 && (el.textContent ?? '').includes(u);
        return holds && getComputedStyle(el).userSelect !== 'none';
      });
    }, url);

  test('[F2.4c2 c26] the button is on the page with lists', async ({ page }) => {
    await setupProfiles(page, world());
    await openFriends(page);
  });

  test('[F2.4c2 c26] the button is on the page with all three lists empty', async ({ page }) => {
    await setupProfiles(page, world(), { incoming: [], sent: [], friends: [] });
    await openFriends(page);
  });

  test('[F2.4c2 c26] pressing it writes the absolute URL of my own /u/:userId and nothing else; "הקישור הועתק" appears in role="status"', async ({ page }) => {
    await setupProfiles(page, world());
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP });
    await openFriends(page);
    await expect(copiedStatus(page)).toHaveCount(0);
    await copyButton(page).click();
    await expect(copiedStatus(page)).toBeVisible();
    const written = await page.evaluate(() => navigator.clipboard.readText());
    expect(written).toBe(ownUrl);
    const u = new URL(written);
    expect(u.search, 'no other parameter').toBe('');
    expect(u.hash).toBe('');
    expect(written).not.toContain(encodeURIComponent('דנה'));
    expect(written).not.toContain('e2e-access-token');
  });

  test('[F2.4c2 c26] a refused clipboard: no "הקישור הועתק", the same URL appears as selectable text', async ({ page }) => {
    await setupProfiles(page, world());
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')), readText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
      });
      document.execCommand = () => false;
    });
    await openFriends(page);
    await copyButton(page).click();
    await expect.poll(() => selectableUrl(page, ownUrl)).toBe(true);
    await expect(copiedStatus(page)).toHaveCount(0);
  });

  test('[F2.4c2 c26] no clipboard API at all: the same URL appears as selectable text, no success message', async ({ page }) => {
    await setupProfiles(page, world());
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      document.execCommand = () => false;
    });
    await openFriends(page);
    await copyButton(page).click();
    await expect.poll(() => selectableUrl(page, ownUrl)).toBe(true);
    await expect(copiedStatus(page)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.4c2 c28 [FR-REL-001] actions by state', () => {
  const ALL = [TEXT.send, TEXT.undo, TEXT.accept, TEXT.decline, TEXT.remove] as const;
  const states: Array<[string, string, string, readonly string[]]> = [
    ['none', RAZ_ID, RAZ, [TEXT.send]],
    ['sent', SHIR_ID, SHIR, [TEXT.undo]],
    ['received', LIOR_ID, LIOR, [TEXT.accept, TEXT.decline]],
    ['friends', TAL_ID, TAL, [TEXT.remove]],
  ];
  for (const [state, id, name, verbs] of states) {
    test(`[F2.4c2 c28] relationship ${state}: exactly ${verbs.join(' + ')}, each named with ${name}`, async ({ page }) => {
      await setupProfiles(page, world());
      await openProfile(page, id, name);
      for (const verb of ALL) await expect(act(page, verb, name), verb).toHaveCount(verbs.includes(verb) ? 1 : 0);
    });
  }

  test('[F2.4c2 c28][F3.7 c9] P as viewer (relationship null): no relationship action; the one button left is "דיווח על הפרופיל", the lists stay', async ({ page }) => {
    await setupProfiles(page, world());
    await openProfile(page, PRO_ID, PRO);
    await expect(main(page).getByRole('button')).toHaveCount(1);
    await expect(main(page).getByRole('button', { name: `דיווח על הפרופיל של ${PRO}`, exact: true })).toHaveCount(1);
    await expect(heading(page, friendsOf(PRO))).toBeVisible();
  });

  test('[F2.4c2 c28] none -> send: POST /api/friend-requests {targetUserId} only; the state becomes "ביטול הבקשה" with no reload', async ({ page }) => {
    const net = await setupProfiles(page, world());
    await openProfile(page, RAZ_ID, RAZ);
    await mark(page);
    await act(page, TEXT.send, RAZ).click();
    await expect(act(page, TEXT.undo, RAZ)).toBeVisible();
    await expect(act(page, TEXT.send, RAZ)).toHaveCount(0);
    expect(await marked(page), 'no reload').toBe(true);
    expect(net.acts.map((a) => `${a.method} ${a.path}`)).toEqual(['POST /api/friend-requests']);
    const sent: unknown = JSON.parse(net.acts[0]?.raw ?? 'null');
    expect(sent).toEqual({ targetUserId: RAZ_ID });
  });

  test('[F2.4c2 c28] sent -> cancel: DELETE /api/friend-requests/:id; the state becomes "שליחת בקשת חברות" with no reload', async ({ page }) => {
    const net = await setupProfiles(page, world());
    await openProfile(page, SHIR_ID, SHIR);
    await mark(page);
    await act(page, TEXT.undo, SHIR).click();
    await expect(act(page, TEXT.send, SHIR)).toBeVisible();
    await expect(act(page, TEXT.undo, SHIR)).toHaveCount(0);
    expect(await marked(page)).toBe(true);
    expect(net.acts.map((a) => `${a.method} ${a.path}`)).toEqual([`DELETE /api/friend-requests/${SHIR_ID}`]);
  });

  test('[F2.4c2 c28] received -> accept: POST .../accept, no body; the profile is fetched once more and now shows the Friend view', async ({ page }) => {
    const net = await setupProfiles(page, world());
    await openProfile(page, LIOR_ID, LIOR);
    const before = viewsOf(net, LIOR_ID);
    expect(await text(page)).not.toContain(AGES_FRIEND);
    await mark(page);
    await act(page, TEXT.accept, LIOR).click();
    await expect(act(page, TEXT.remove, LIOR)).toBeVisible();
    await expect(main(page).getByText(AGES_FRIEND).first()).toBeVisible();
    await settle(page);
    expect(viewsOf(net, LIOR_ID), 'exactly one more open after accept').toBe(before + 1);
    expect(await marked(page)).toBe(true);
    expect(net.acts.map((a) => `${a.method} ${a.path}`)).toEqual([`POST /api/friend-requests/${LIOR_ID}/accept`]);
    expect(net.acts[0]?.raw ?? null).toBeNull();
    await expect(act(page, TEXT.accept, LIOR)).toHaveCount(0);
  });

  test('[F2.4c2 c28] received -> decline: POST .../decline; the state becomes "שליחת בקשת חברות"', async ({ page }) => {
    const net = await setupProfiles(page, world());
    await openProfile(page, LIOR_ID, LIOR);
    await act(page, TEXT.decline, LIOR).click();
    await expect(act(page, TEXT.send, LIOR)).toBeVisible();
    await expect(act(page, TEXT.accept, LIOR)).toHaveCount(0);
    expect(net.acts.map((a) => `${a.method} ${a.path}`)).toEqual([`POST /api/friend-requests/${LIOR_ID}/decline`]);
  });

  test('[F2.4c2 c28] friends -> remove: F2.4b\'s dialog names the person; "ביטול" sends nothing; "הסרה" sends one DELETE, refetches once, drops the Friend view', async ({ page }) => {
    const net = await setupProfiles(page, world());
    await openProfile(page, TAL_ID, TAL);
    await expect(main(page).getByText(AGES_FRIEND).first()).toBeVisible();
    await act(page, TEXT.remove, TAL).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText(TAL);
    await dialog(page).getByRole('button', { name: TEXT.dialogCancel, exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await settle(page);
    expect(net.acts).toHaveLength(0);
    const before = viewsOf(net, TAL_ID);
    await act(page, TEXT.remove, TAL).click();
    await dialog(page).getByRole('button', { name: TEXT.dialogRemove, exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(act(page, TEXT.send, TAL)).toBeVisible();
    await settle(page);
    expect(net.acts.map((a) => `${a.method} ${a.path}`)).toEqual([`DELETE /api/friends/${TAL_ID}`]);
    expect(viewsOf(net, TAL_ID), 'exactly one more open after remove').toBe(before + 1);
    expect(await text(page), 'back to the non-Friend view of a restricted profile').not.toContain(AGES_FRIEND);
  });

  const presses: Array<[string, string, string, string]> = [
    ['send', RAZ_ID, RAZ, TEXT.send],
    ['cancel', SHIR_ID, SHIR, TEXT.undo],
    ['accept', LIOR_ID, LIOR, TEXT.accept],
    ['decline', LIOR_ID, LIOR, TEXT.decline],
  ];
  for (const [label, id, name, verb] of presses) {
    test(`[F2.4c2 c28] a double press on ${label} sends one request and the button is disabled in flight`, async ({ page }) => {
      const net = await setupProfiles(page, world());
      await openProfile(page, id, name);
      let release: () => void = () => undefined;
      net.holdWrite = new Promise<void>((resolve) => {
        release = resolve;
      });
      const button = act(page, verb, name);
      await button.dblclick();
      await expect.poll(() => net.acts.length).toBeGreaterThan(0);
      await settle(page);
      expect(await isDisabled(button), 'disabled in flight').toBe(true);
      release();
      await settle(page);
      expect(net.acts).toHaveLength(1);
    });
  }

  test('[F2.4c2 c28] a double press on the dialog\'s "הסרה" sends one DELETE', async ({ page }) => {
    const net = await setupProfiles(page, world());
    await openProfile(page, TAL_ID, TAL);
    await act(page, TEXT.remove, TAL).click();
    let release: () => void = () => undefined;
    net.holdWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    await dialog(page).getByRole('button', { name: TEXT.dialogRemove, exact: true }).dblclick();
    await expect.poll(() => net.acts.length).toBeGreaterThan(0);
    await settle(page);
    release();
    await expect(act(page, TEXT.send, TAL)).toBeVisible();
    await settle(page);
    expect(net.acts).toHaveLength(1);
  });

  const conflicts: Array<[string, string, string, string]> = [
    ['accept', LIOR_ID, LIOR, TEXT.accept],
    ['decline', LIOR_ID, LIOR, TEXT.decline],
    ['cancel', SHIR_ID, SHIR, TEXT.undo],
  ];
  for (const [label, id, name, verb] of conflicts) {
    test(`[F2.4c2 c28 ERR-004] ${label} answered 409 request_gone: the profile is fetched again, "הבקשה כבר לא זמינה" is shown, the new state is drawn`, async ({ page }) => {
      const net = await setupProfiles(page, world());
      await openProfile(page, id, name);
      const before = viewsOf(net, id);
      net.write = 409;
      await act(page, verb, name).click();
      await expect(page.getByText(TEXT.gone)).toBeVisible();
      await expect.poll(() => viewsOf(net, id)).toBeGreaterThan(before);
      await expect(act(page, TEXT.send, name)).toBeVisible();
    });
  }

  test('[F2.4c2 c28] a send answered 409 (request_exists): the profile is fetched again and shows the true state', async ({ page }) => {
    const net = await setupProfiles(page, world());
    await openProfile(page, RAZ_ID, RAZ);
    const before = viewsOf(net, RAZ_ID);
    net.write = 409;
    net.conflictCode = 'request_exists';
    net.afterConflict = 'sent';
    await act(page, TEXT.send, RAZ).click();
    await expect.poll(() => viewsOf(net, RAZ_ID)).toBeGreaterThan(before);
    await expect(act(page, TEXT.undo, RAZ)).toBeVisible();
  });

  // Decided by ORCHESTRATOR (return to SPEC): a remove answered 409 or 404 shows F2.4b's remove text, accept/decline/cancel keep "הבקשה כבר לא זמינה".
  for (const status of [409, 404] as const) {
    test(`[F2.4c2 c28] remove answered ${String(status)}: the profile is fetched again and "האדם הזה כבר לא ברשימת החברים" is shown`, async ({ page }) => {
      const net = await setupProfiles(page, world());
      await openProfile(page, TAL_ID, TAL);
      const before = viewsOf(net, TAL_ID);
      await act(page, TEXT.remove, TAL).click();
      const stored = net.profiles[TAL_ID];
      if (stored === undefined) throw new Error('fixture');
      stored.view = { ...stored.view, relationship: 'none' };
      net.write = status;
      await dialog(page).getByRole('button', { name: TEXT.dialogRemove, exact: true }).click();
      await expect.poll(() => viewsOf(net, TAL_ID)).toBeGreaterThan(before);
      await expect(page.getByText(TEXT.removeGone)).toBeVisible();
      await expect(act(page, TEXT.send, TAL)).toBeVisible();
    });
  }

  test('[F2.4c2 c28] an action that fails (500): the state is unchanged, a non-empty role="alert", the button is usable again', async ({ page }) => {
    const net = await setupProfiles(page, world());
    await openProfile(page, RAZ_ID, RAZ);
    net.write = 500;
    await act(page, TEXT.send, RAZ).click();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ }).first()).toBeVisible();
    await expect(act(page, TEXT.send, RAZ)).toBeEnabled();
    await expect(act(page, TEXT.undo, RAZ)).toHaveCount(0);
    net.write = 200;
    await act(page, TEXT.send, RAZ).click();
    await expect(act(page, TEXT.undo, RAZ)).toBeVisible();
    expect(net.acts).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.4c2 c30 [S3 NFR-A11Y-001] axe, RTL, phone and desktop, keyboard, names', () => {
  const shots: Array<[string, string, string]> = [
    ['user-profile', NOA_ID, NOA],
    ['user-profile-restricted', RAZ_ID, RAZ],
    ['user-profile-friend', TAL_ID, TAL],
    ['user-profile with a received request', LIOR_ID, LIOR],
    ['user-profile with a sent request', SHIR_ID, SHIR],
  ];
  for (const { label, viewport } of SIZES) {
    for (const [name, id, who] of shots) {
      test(`[F2.4c2 c30] ${label}: zero axe violations, RTL, no horizontal scroll on ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await setupProfiles(page, world());
        await openProfile(page, id, who);
        await scan(page);
      });
    }
    test(`[F2.4c2 c30] ${label}: zero axe violations on user-profile with the remove dialog open`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setupProfiles(page, world());
      await openProfile(page, TAL_ID, TAL);
      await act(page, TEXT.remove, TAL).click();
      await expect(dialog(page)).toBeVisible();
      await scan(page);
    });
    for (const [name, mode, id] of [['user-profile-unavailable', 404, NOA_ID], ['user-profile-rate-limited', 429, NOA_ID], ['user-profile-load-failed', 500, NOA_ID]] as const) {
      test(`[F2.4c2 c30] ${label}: zero axe violations, RTL, no horizontal scroll on ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const net = await setupProfiles(page, world());
        net.mode[id] = mode;
        await signIn(page);
        await page.goto(`/u/${id}`);
        await expect.poll(() => net.views.length).toBeGreaterThan(0);
        await settle(page);
        expect((await text(page)).trim().length, 'the failure message is on screen').toBeGreaterThan(0);
        await scan(page);
      });
    }
    test(`[F2.4c2 c30] ${label}: zero axe violations on FriendsPage with the copy button, default, copied and refused`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setupProfiles(page, world());
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP });
      await signIn(page);
      await page.goto('/friends');
      await expect(page.getByRole('button', { name: TEXT.copy, exact: true })).toBeVisible();
      await scan(page);
      await page.getByRole('button', { name: TEXT.copy, exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: TEXT.copied })).toBeVisible();
      await scan(page);
    });
    test(`[F2.4c2 c30] ${label}: zero axe violations on FriendsPage when the clipboard is refused (the link shown as text)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setupProfiles(page, world());
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } });
        document.execCommand = () => false;
      });
      await signIn(page);
      await page.goto('/friends');
      await page.getByRole('button', { name: TEXT.copy, exact: true }).click();
      await expect(main(page).getByText(`${APP}/u/${OWN_ID}`).first()).toBeVisible();
      await scan(page);
    });
  }

  /** Tab through main until every button and /u/ link in it took focus. */
  async function reachAll(page: Page): Promise<{ total: number; seen: number }> {
    const total = await main(page).locator('button, a[href]').evaluateAll((els) => {
      els.forEach((el, i) => el.setAttribute('data-kb', String(i)));
      return els.length;
    });
    await page.evaluate(() => {
      const a = document.activeElement;
      if (a instanceof HTMLElement) a.blur();
    });
    const seen = new Set<string>();
    for (let i = 0; i < 100 && seen.size < total; i += 1) {
      await page.keyboard.press('Tab');
      const tag = await page.evaluate(() => document.activeElement?.getAttribute('data-kb') ?? null);
      if (tag !== null) seen.add(tag);
    }
    return { total, seen: seen.size };
  }

  test('[F2.4c2 c30] keyboard: every action and every list link takes focus by Tab alone, and "אישור" works from Enter', async ({ page }) => {
    const net = await setupProfiles(page, world());
    await openProfile(page, LIOR_ID, LIOR);
    const { total, seen } = await reachAll(page);
    expect(total, 'accept + decline + 3 list links').toBeGreaterThanOrEqual(5);
    expect(seen, 'every button and link in main took focus').toBe(total);
    await act(page, TEXT.accept, LIOR).focus();
    await page.keyboard.press('Enter');
    await expect(act(page, TEXT.remove, LIOR)).toBeVisible();
    expect(net.acts.map((a) => a.path)).toEqual([`/api/friend-requests/${LIOR_ID}/accept`]);
  });

  test('[F2.4c2 c30] keyboard: the remove dialog keeps Tab inside it and returns focus to "הסרה מהחברים" on "ביטול" and on Escape', async ({ page }) => {
    await setupProfiles(page, world());
    await openProfile(page, TAL_ID, TAL);
    const opener = act(page, TEXT.remove, TAL);
    const inside = () => page.evaluate(() => (document.activeElement?.closest('[role="alertdialog"], [role="dialog"]') ?? null) !== null);
    for (const close of ['cancel', 'escape'] as const) {
      await opener.focus();
      await page.keyboard.press('Enter');
      await expect(dialog(page)).toBeVisible();
      expect(await inside(), 'focus starts inside').toBe(true);
      for (let i = 0; i < 5; i += 1) {
        await page.keyboard.press('Tab');
        expect(await inside(), `Tab ${String(i + 1)} stays inside`).toBe(true);
      }
      if (close === 'cancel') await dialog(page).getByRole('button', { name: TEXT.dialogCancel, exact: true }).click();
      else await page.keyboard.press('Escape');
      await expect(dialog(page)).toHaveCount(0);
      await expect(opener, `focus back on the opener after ${close}`).toBeFocused();
    }
  });

  test('[F2.4c2 c30] keyboard: the copy button on FriendsPage is reachable by Tab and works from Enter', async ({ page }) => {
    await setupProfiles(page, world());
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP });
    await signIn(page);
    await page.goto('/friends');
    const copy = page.getByRole('button', { name: TEXT.copy, exact: true });
    await expect(copy).toBeVisible();
    await copy.evaluate((el) => el.setAttribute('data-kb', 'copy'));
    await page.evaluate(() => {
      const a = document.activeElement;
      if (a instanceof HTMLElement) a.blur();
    });
    let reached = false;
    for (let i = 0; i < 60 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      reached = (await page.evaluate(() => document.activeElement?.getAttribute('data-kb'))) === 'copy';
    }
    expect(reached, 'Tab reaches the copy button').toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: TEXT.copied })).toBeVisible();
  });

  test('[F2.4c2 c30] names: every action carries the profile owner\'s name and every list link carries its own person\'s name', async ({ page }) => {
    await setupProfiles(page, world());
    await signIn(page);
    for (const [id, who] of [[LIOR_ID, LIOR], [RAZ_ID, RAZ], [SHIR_ID, SHIR], [TAL_ID, TAL]] as const) {
      await page.goto(`/u/${id}`);
      await expect(main(page).getByText(who, { exact: true }).first()).toBeVisible();
      const buttons = await main(page).getByRole('button').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent ?? ''));
      expect(buttons.length).toBeGreaterThan(0);
      for (const b of buttons) expect(b, `button "${b}" names ${who}`).toContain(who);
      const links = await main(page).locator('a[href*="/u/"]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent ?? ''));
      expect(links.length).toBeGreaterThan(0);
      const people = [DANA, YOSSI, MIRI].map((p) => p.fullName);
      for (const l of links) expect(people.some((p) => l.includes(p)), `link "${l}" carries a person's name`).toBe(true);
    }
  });
});
