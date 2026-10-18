// Shared by e2e/user-profile.spec.ts (c25, c27, c29) and e2e/user-profile-actions.spec.ts (c26, c28, c30): fixtures and steps for the
// I2 F2.4c2 profile screen tests. Derived from .work/friends/spec.md only; see the header of user-profile.spec.ts.
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { EMAIL, MOBILE, DESKTOP_1280, main } from './journeys-stub';
import { pathOf } from '../app-helpers';
import { DANA, MIRI, YOSSI } from './friends-stub';
import { ID, TEXT, entry, friendsOf } from './profiles-stub';
import type { ProfilesNet, Rel, Stored, View } from './profiles-stub';

export const PASSWORD = 'Zq-7-unique-pw-marker-91';
export const SIZES = [
  { label: 'phone', viewport: MOBILE },
  { label: 'desktop', viewport: DESKTOP_1280 },
] as const;

// ---- fixtures: every value is a number or string the spec fixes or a free choice of this test --------------------------------
export const NOA_ID = ID(21);
export const RAZ_ID = ID(22);
export const TAL_ID = ID(23);
export const LIOR_ID = ID(24);
export const SHIR_ID = ID(25);
export const PRO_ID = ID(26);
export const BARE_ID = ID(27);
export const base = (fullName: string, over: Partial<View> = {}): View => ({
  fullName, gender: 'woman', childrenCount: 2, childAges: [{ years: 3, months: 5 }, { years: 1, months: 3 }], isPregnant: true,
  showsEmptyJourneySentence: false, relationship: 'none', friends: [entry(DANA), entry(YOSSI)], mutualFriends: [entry(MIRI)], ...over,
});
export const NOA = 'נועה בן דוד';
export const RAZ = 'רז אלון';
export const TAL = 'טל ברק';
export const LIOR = 'ליאור שחר';
export const SHIR = 'שיר גולן';
export const PRO = 'מקצוען פרטי';
export const BARE = 'בר נחום';
export const RESTRICTED_B = (name: string, rel: Rel | null, over: Partial<View> = {}): View =>
  base(name, { gender: null, childAges: null, relationship: rel, ...over });
export const WHEN_FRIEND: Partial<View> = { gender: 'woman', childAges: [{ years: 2, months: 5 }] };
export const AGES_FRIEND = 'שנתיים ו-5 חודשים';

export function world(over: Record<string, Stored> = {}): Record<string, Stored> {
  return {
    [NOA_ID]: { view: base(NOA) },
    [RAZ_ID]: { view: RESTRICTED_B(RAZ, 'none'), whenFriend: WHEN_FRIEND },
    [TAL_ID]: { view: RESTRICTED_B(TAL, 'friends'), whenFriend: WHEN_FRIEND },
    [LIOR_ID]: { view: RESTRICTED_B(LIOR, 'received'), whenFriend: WHEN_FRIEND },
    [SHIR_ID]: { view: RESTRICTED_B(SHIR, 'sent'), whenFriend: WHEN_FRIEND },
    [PRO_ID]: { view: base(PRO, { relationship: null }) },
    [BARE_ID]: { view: base(BARE, { gender: null, childrenCount: 0, childAges: [], isPregnant: false, relationship: 'none' }) },
    [DANA.userId]: { view: base(DANA.fullName, { friends: [], mutualFriends: [] }) },
    ...over,
  };
}

// ---- locators and steps ----------------------------------------------------------------------------------------------------
export const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true });
export const dialog = (page: Page) => page.getByRole('alertdialog').or(page.getByRole('dialog'));
/** A button of the given verb whose accessible name also carries the person's name (c30). */
export const act = (page: Page, verb: string, who: string): Locator =>
  main(page).getByRole('button', { name: new RegExp(`${esc(verb)}.*${esc(who)}|${esc(who)}.*${esc(verb)}`) });
export const isDisabled = (button: Locator) => button.evaluate((el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true');
export const settle = (page: Page) => page.waitForTimeout(400);
export const mark = (page: Page) => page.evaluate(() => Reflect.set(window, '__profileNoReload', 1));
export const marked = (page: Page) => page.evaluate(() => Reflect.get(window, '__profileNoReload') === 1);
export const viewsOf = (net: ProfilesNet, id: string): number => net.views.filter((v) => v === id).length;
export const text = async (page: Page): Promise<string> => (await main(page).innerText()).replace(/\s+/g, ' ');
export const storageDump = (page: Page): Promise<string> =>
  page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));

export async function signIn(page: Page): Promise<void> {
  // DOM-ready is enough: the next steps wait for their own elements, and a slow subresource must not hold "load" for 30 s.
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  // Wait for the app's final landing (/feed, SIGNED_IN_LANDING), not just "left /login": after login the app navigates again, and a
  // goto issued meanwhile aborts with net::ERR_ABORTED (frame detached).
  await expect.poll(() => pathOf(page)).toBe('/feed');
}
/** Signed in, straight to /u/<id> (a full load: the real session survives it), the person's name on screen. */
export async function openProfile(page: Page, id: string, name: string): Promise<void> {
  await signIn(page);
  await page.goto(`/u/${id}`, { waitUntil: 'domcontentloaded' });
  expect(pathOf(page)).toBe(`/u/${id}`);
  // 20 s, not the 5 s default: with 8 browsers on one machine the profile request can take longer than 5 s; a wrong screen still fails.
  await expect(main(page).getByText(name, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
}
/** The outermost element that holds this heading and none of the other list's heading: that list's section. */
export function listSection(page: Page, name: string, other: string): Locator {
  return main(page)
    .locator('*')
    .filter({ has: heading(page, name) })
    .filter({ hasNot: heading(page, other) })
    .first();
}
export const friendsSection = (page: Page, owner: string) => listSection(page, friendsOf(owner), TEXT.mutual);
export const mutualSection = (page: Page, owner: string) => listSection(page, TEXT.mutual, friendsOf(owner));
export const sectionText = async (section: Locator, name: string): Promise<string> => ((await section.innerText()).replace(name, '').replace(/\s+/g, ' ')).trim();
