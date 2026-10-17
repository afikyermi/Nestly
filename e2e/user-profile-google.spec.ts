// I2 F2.4c2 c27 [FR-AUTH-004 NFR-SEC-005 A4]: a Guest who opens a profile link and signs in with Google lands on that profile. Added after
// CRITIC's finding; the DECIDED mechanism (ORCHESTRATOR, from the coordinator's message): a one-shot sessionStorage entry `{path, at}`,
// written right before the Google redirect and only for a valid `/u/<uuid>`, read once and removed on the googleEntry landing,
// re-validated, ignored after 10 minutes, removed on sign-out. The entry's key name is not fixed by the decision, so the tests find it as
// "the sessionStorage key that appeared at the Google redirect"; `at` is assumed to be epoch milliseconds (Date.now()).
// The provider is stubbed: the authorize request is answered with a 302 to /auth/google?code=..., and the Auth token endpoint answers a session.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, MENU_BUTTON, pathOf } from './app-helpers';
import { EMAIL, MOBILE } from './support/journeys-stub';
import { DANA, MIRI, YOSSI } from './support/friends-stub';
import { setupProfiles } from './support/profiles-stub';
import type { ProfilesNet } from './support/profiles-stub';
import { NOA, NOA_ID, PASSWORD, settle, storageDump, viewsOf, world } from './support/profiles-fixtures';
import { main } from './support/journeys-stub';

test.use({ baseURL: APP, viewport: MOBILE });

const GOOGLE = 'המשך עם Google';
const AUTHORIZE = 'https://e2e-stub.invalid/auth/v1/authorize';
const MIN = 60_000;

const session = (page: Page): Promise<Record<string, string>> =>
  page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));

/** What the landing page finds in sessionStorage instead of what the app wrote: a raw value, or an object {path, at}. */
type Plan = { raw: string } | { path: string; at: { offset: number } | { value: string } | null };

interface Seen {
  baseline: string[];
  /** The provider answers a redirect back to the app (true) or abandons the step (false). */
  complete: boolean;
  /** sessionStorage writes the page reported, in order (a binding survives navigation; nothing here calls into a navigating page). */
  writes: Array<{ op: 'set' | 'remove' | 'clear'; key: string; value: string | null }>;
  mark: number;
  live: Map<string, string>;
  /** The keys that were live in sessionStorage at each authorize request. */
  atRedirect: string[][];
}

/**
 * The provider. The authorize request is answered at once (a 302 back to the app, or an abort) and the route handler never calls into
 * the page: a page call during that navigation hangs. The entry is observed through a binding that logs sessionStorage writes, and
 * tampered with by an init script that runs on the landing document before the app does (`plan`).
 */
async function stubGoogle(page: Page, plan: Plan | null = null, complete = true): Promise<Seen> {
  const seen: Seen = { baseline: [], complete, writes: [], mark: 0, live: new Map(), atRedirect: [] };
  await page.exposeFunction('__ssLog', (op: 'set' | 'remove' | 'clear', key: string, value: string | null) => {
    seen.writes.push({ op, key, value });
    if (op === 'set') seen.live.set(key, value ?? '');
    else if (op === 'remove') seen.live.delete(key);
    else seen.live.clear();
  });
  await page.addInitScript(() => {
    const log = (op: string, key: string, value: string | null): void => {
      const fn: unknown = Reflect.get(window, '__ssLog');
      if (typeof fn === 'function') void Reflect.apply(fn, window, [op, key, value]);
    };
    const proto = Storage.prototype;
    const set: unknown = Reflect.get(proto, 'setItem');
    const remove: unknown = Reflect.get(proto, 'removeItem');
    const clear: unknown = Reflect.get(proto, 'clear');
    if (typeof set !== 'function' || typeof remove !== 'function' || typeof clear !== 'function') return;
    proto.setItem = function (k: string, v: string): void {
      Reflect.apply(set, this, [k, v]);
      if (this === window.sessionStorage) log('set', k, v);
    };
    proto.removeItem = function (k: string): void {
      Reflect.apply(remove, this, [k]);
      if (this === window.sessionStorage) log('remove', k, null);
    };
    proto.clear = function (): void {
      Reflect.apply(clear, this, []);
      if (this === window.sessionStorage) log('clear', '', null);
    };
  });
  await page.addInitScript((p: Plan | null) => {
    if (p === null || window.location.pathname !== '/auth/google') return;
    const keys = Object.keys(window.sessionStorage);
    const key = keys.length === 1 ? keys[0] : undefined;
    if (key === undefined) return;
    if ('raw' in p) {
      window.sessionStorage.setItem(key, p.raw);
      return;
    }
    const value: Record<string, unknown> = { path: p.path };
    if (p.at !== null) value['at'] = 'offset' in p.at ? Date.now() + p.at.offset : p.at.value;
    window.sessionStorage.setItem(key, JSON.stringify(value));
  }, plan);
  await page.route(`${AUTHORIZE}**`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    seen.atRedirect.push([...seen.live.keys()]);
    if (seen.complete) await route.fulfill({ status: 302, headers: { location: `${APP}/auth/google?code=e2e-code` } });
    else await route.abort('aborted');
  });
  return seen;
}

/** The entry the app wrote at the latest Google press: the first sessionStorage `set` since, of a key that was not there before. */
function noted(seen: Seen): { key: string; written: string } | null {
  const w = seen.writes.slice(seen.mark).find((x) => x.op === 'set' && !seen.baseline.includes(x.key));
  return w === undefined ? null : { key: w.key, written: w.value ?? '' };
}
const keyOf = (seen: Seen): string => noted(seen)?.key ?? '';

/** Presses "המשך עם Google" (the provider answers by itself). */
async function press(page: Page, seen: Seen): Promise<void> {
  seen.baseline = Object.keys(await session(page));
  seen.mark = seen.writes.length;
  await page.getByRole('button', { name: GOOGLE, exact: true }).click();
}

/** A Guest opens B's link, is taken to Login, and presses "המשך עם Google". */
async function guestToGoogle(page: Page, seen: Seen): Promise<void> {
  await page.goto(`/u/${NOA_ID}`);
  await expect.poll(() => pathOf(page)).toBe('/login');
  await press(page, seen);
}

async function setup(page: Page, plan: Plan | null = null, complete = true): Promise<{ net: ProfilesNet; seen: Seen }> {
  const net = await setupProfiles(page, world());
  const seen = await stubGoogle(page, plan, complete);
  return { net, seen };
}

const secrets = [NOA, DANA.fullName, YOSSI.fullName, MIRI.fullName, NOA_ID, DANA.userId];
async function expectNoProfileInStorage(page: Page, where: string): Promise<void> {
  const dump = await storageDump(page);
  for (const s of secrets) expect(dump, `${where}: storage holds "${s}"`).not.toContain(s);
}
async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: MENU_BUTTON }).click();
  await page.getByRole('button', { name: 'התנתקות', exact: true }).click();
  await expect.poll(() => pathOf(page)).toBe('/');
}

test.describe('F2.4c2 c27 [FR-AUTH-004] Google sign-in from a profile link', () => {
  test('[F2.4c2 c27] Guest -> /u/B -> Login -> "המשך עם Google": the entry {path, at} is written for /u/B, and the Guest lands on B\'s profile', async ({ page }) => {
    const { net, seen } = await setup(page);
    await guestToGoogle(page, seen);
    await expect.poll(() => pathOf(page)).toBe(`/u/${NOA_ID}`);
    await expect(main(page).getByText(NOA, { exact: true }).first()).toBeVisible();
    expect(noted(seen), 'an entry was written right before the redirect').not.toBeNull();
    const entry: unknown = JSON.parse(noted(seen)?.written ?? 'null');
    expect(entry).toEqual({ path: `/u/${NOA_ID}`, at: expect.any(Number) });
    expect(net.views).toEqual([NOA_ID]);
  });

  test('[F2.4c2 c27] after the landing the entry is gone (read once) and no profile text is in local or session storage; a reload does not return to it from storage', async ({ page }) => {
    const { seen } = await setup(page);
    await guestToGoogle(page, seen);
    await expect.poll(() => pathOf(page)).toBe(`/u/${NOA_ID}`);
    await expect(main(page).getByText(NOA, { exact: true }).first()).toBeVisible();
    await settle(page);
    expect(Object.keys(await session(page)), 'the one-shot entry was removed').not.toContain(keyOf(seen));
    await expectNoProfileInStorage(page, 'after landing');
  });

  test('[F2.4c2 c27] after sign-out the entry is absent and no profile text is in local or session storage', async ({ page }) => {
    const { seen } = await setup(page);
    await guestToGoogle(page, seen);
    await expect(main(page).getByText(NOA, { exact: true }).first()).toBeVisible();
    await signOut(page);
    expect(Object.keys(await session(page))).not.toContain(keyOf(seen));
    await expectNoProfileInStorage(page, 'after sign-out');
    expect(await page.evaluate(() => document.body.innerText)).not.toContain(NOA);
  });

  test('[F2.4c2 c27] an entry left by a Google start that never came back is removed by sign-out', async ({ page }) => {
    const { net, seen } = await setup(page, null, false);
    await guestToGoogle(page, seen);
    await expect.poll(() => noted(seen)).not.toBeNull();
    await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
    await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'התחברות', exact: true }).click();
    await expect.poll(() => pathOf(page)).not.toBe('/login');
    await signOut(page);
    expect(Object.keys(await session(page)), 'the entry is removed on sign-out').not.toContain(keyOf(seen));
    expect(net.acts).toEqual([]);
  });

  const lands = 'the normal landing (no profile, no viewer call), the entry removed';
  const P = `/u/${NOA_ID}`;
  const tampered: Array<[string, Plan]> = [
    ['a non-profile path', { path: '/settings', at: { offset: 0 } }],
    ['a path outside the app', { path: `https://evil.example/u/${NOA_ID}`, at: { offset: 0 } }],
    ['a protocol-relative path', { path: `//evil.example/u/${NOA_ID}`, at: { offset: 0 } }],
    ['a bad uuid', { path: '/u/not-a-uuid', at: { offset: 0 } }],
    ['a path with extra segments', { path: `/u/${NOA_ID}/../../settings`, at: { offset: 0 } }],
    ['a path with a query', { path: `/u/${NOA_ID}?next=https://evil.example`, at: { offset: 0 } }],
    ['an entry 11 minutes old', { path: P, at: { offset: -11 * MIN } }],
    ['an entry from the future', { path: P, at: { offset: 60 * MIN } }],
    ['no `at`', { path: P, at: null }],
    ['an `at` that is a string', { path: P, at: { value: 'now' } }],
    ['a value that is not JSON', { raw: 'not json {' }],
  ];
  for (const [label, plan] of tampered) {
    test(`[F2.4c2 c27] a tampered entry (${label}) lands on ${lands}`, async ({ page }) => {
      const { net, seen } = await setup(page, plan);
      await guestToGoogle(page, seen);
      await expect.poll(() => pathOf(page)).toBe('/feed');
      await settle(page);
      expect(net.views, 'no viewer call').toEqual([]);
      expect(await page.content()).not.toContain(NOA);
      expect(Object.keys(await session(page))).not.toContain(keyOf(seen));
    });
  }

  test('[F2.4c2 c27] an entry 9 minutes old is still honoured (the limit is 10)', async ({ page }) => {
    const { net, seen } = await setup(page, { path: `/u/${NOA_ID}`, at: { offset: -9 * MIN } });
    await guestToGoogle(page, seen);
    await expect.poll(() => pathOf(page)).toBe(`/u/${NOA_ID}`);
    await expect.poll(() => viewsOf(net, NOA_ID)).toBe(1);
  });

  test('[F2.4c2 c27] Google from a plain Login (no profile link) writes no entry and lands on the normal landing', async ({ page }) => {
    const { net, seen } = await setup(page);
    await page.goto('/login');
    await press(page, seen);
    await expect.poll(() => pathOf(page)).toBe('/feed');
    expect(noted(seen), 'no entry for a Login that did not come from a profile').toBeNull();
    expect(net.views).toEqual([]);
  });

  // ---- stale note (CRITIC's last bug): the note must not outlive the Google step it was written for ----
  /** Guest at /u/X -> Login -> Google, abandoned; returns the key of the note written. */
  async function abandonedStart(page: Page, seen: Seen): Promise<string> {
    await guestToGoogle(page, seen);
    await expect.poll(() => noted(seen)).not.toBeNull();
    return keyOf(seen);
  }

  test('[F2.4c2 c27] a Google step abandoned from /u/X, then a plain Login -> Google that completes: the user lands on /feed, no viewer call for X', async ({ page }) => {
    const net = await setupProfiles(page, world());
    const p = await stubGoogle(page, null, false);
    const key = await abandonedStart(page, p);
    p.complete = true;
    // A new navigation to Login (a new history entry, null state). Going to the URL already shown would only reload the guard-created entry.
    await page.goto('/');
    await page.goto('/login');
    expect(Object.keys(await session(page)), 'the stale note is gone after the fresh load').not.toContain(key);
    await press(page, p);
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await settle(page);
    expect(net.views).toEqual([]);
    expect(await page.content()).not.toContain(NOA);
  });

  // c27's intended behaviour, not a defect: the Login entry the guard created from /u/X keeps the profile target in its router state, so
  // returning to that very entry (a reload restores history.state) and completing Google still leads to X.
  test('[F2.4c2 c27] returning to the guard-created Login entry (reload) and completing Google still leads to the profile X', async ({ page }) => {
    await setupProfiles(page, world());
    const p = await stubGoogle(page, null, false);
    await abandonedStart(page, p);
    p.complete = true;
    await page.reload();
    await press(page, p);
    await expect.poll(() => pathOf(page)).toBe(`/u/${NOA_ID}`);
  });

  for (const path of ['/login', '/register', '/'] as const) {
    test(`[F2.4c2 c27] a note present at a fresh load of ${path} (not googleEntry) is gone after that load`, async ({ page }) => {
      await setupProfiles(page, world());
      const p = await stubGoogle(page, null, false);
      const key = await abandonedStart(page, p);
      expect(Object.keys(await session(page))).toContain(key);
      await page.goto(path);
      await settle(page);
      expect(Object.keys(await session(page))).not.toContain(key);
      await expectNoProfileInStorage(page, `after loading ${path}`);
    });
  }

  test('[F2.4c2 c27] a plain Google start (Register, no target) removes an existing note before it redirects', async ({ page }) => {
    const net = await setupProfiles(page, world());
    const p = await stubGoogle(page, null, false);
    const key = await abandonedStart(page, p);
    await page.locator('a[href="/register"]').first().click();
    await expect.poll(() => pathOf(page)).toBe('/register');
    expect(Object.keys(await session(page)), 'still there: no fresh load happened').toContain(key);
    const hits = p.atRedirect.length;
    await press(page, p);
    await expect.poll(() => p.atRedirect.length).toBeGreaterThan(hits);
    expect(p.atRedirect[p.atRedirect.length - 1] ?? [], 'the old note is removed by the plain start').not.toContain(key);
    expect(net.views).toEqual([]);
  });
});
