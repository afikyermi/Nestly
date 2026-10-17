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

interface Seen {
  baseline: string[];
  /** The key that appeared in sessionStorage at the redirect, and its value as written by the app. */
  key: string | null;
  written: string | null;
}

/**
 * The provider: authorize is answered with a redirect back to the app's return route. `rewrite` (tampering) runs in the page at the
 * moment of the redirect, on the entry the app has just written, before the app is left.
 */
async function stubGoogle(page: Page, rewrite?: (now: number) => string | null): Promise<Seen> {
  const seen: Seen = { baseline: [], key: null, written: null };
  await page.route(`${AUTHORIZE}**`, async (route) => {
    const now = await page.evaluate(() => Date.now());
    const entries = await session(page);
    seen.key = Object.keys(entries).find((k) => !seen.baseline.includes(k)) ?? null;
    seen.written = seen.key === null ? null : (entries[seen.key] ?? null);
    if (rewrite !== undefined && seen.key !== null) {
      const value = rewrite(now);
      await page.evaluate(
        (a: { k: string; v: string | null }) => {
          if (a.v === null) sessionStorage.removeItem(a.k);
          else sessionStorage.setItem(a.k, a.v);
        },
        { k: seen.key, v: value },
      );
    }
    await route.fulfill({ status: 302, headers: { location: `${APP}/auth/google?code=e2e-code` } });
  });
  return seen;
}

/** A Guest opens B's link, is taken to Login, and presses "המשך עם Google". */
async function guestToGoogle(page: Page, seen: Seen): Promise<void> {
  await page.goto(`/u/${NOA_ID}`);
  await expect.poll(() => pathOf(page)).toBe('/login');
  seen.baseline = Object.keys(await session(page));
  await page.getByRole('button', { name: GOOGLE, exact: true }).click();
}

async function setup(page: Page, rewrite?: (now: number) => string | null): Promise<{ net: ProfilesNet; seen: Seen }> {
  const net = await setupProfiles(page, world());
  const seen = await stubGoogle(page, rewrite);
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
    expect(seen.key, 'an entry was written right before the redirect').not.toBeNull();
    const entry: unknown = JSON.parse(seen.written ?? 'null');
    expect(entry).toEqual({ path: `/u/${NOA_ID}`, at: expect.any(Number) });
    expect(net.views).toEqual([NOA_ID]);
  });

  test('[F2.4c2 c27] after the landing the entry is gone (read once) and no profile text is in local or session storage; a reload does not return to it from storage', async ({ page }) => {
    const { seen } = await setup(page);
    await guestToGoogle(page, seen);
    await expect.poll(() => pathOf(page)).toBe(`/u/${NOA_ID}`);
    await expect(main(page).getByText(NOA, { exact: true }).first()).toBeVisible();
    await settle(page);
    expect(Object.keys(await session(page)), 'the one-shot entry was removed').not.toContain(seen.key ?? '');
    await expectNoProfileInStorage(page, 'after landing');
  });

  test('[F2.4c2 c27] after sign-out the entry is absent and no profile text is in local or session storage', async ({ page }) => {
    const { seen } = await setup(page);
    await guestToGoogle(page, seen);
    await expect(main(page).getByText(NOA, { exact: true }).first()).toBeVisible();
    await signOut(page);
    expect(Object.keys(await session(page))).not.toContain(seen.key ?? '');
    await expectNoProfileInStorage(page, 'after sign-out');
    expect(await page.evaluate(() => document.body.innerText)).not.toContain(NOA);
  });

  test('[F2.4c2 c27] an entry left by a Google start that never came back is removed by sign-out', async ({ page }) => {
    const net = await setupProfiles(page, world());
    const seen: Seen = { baseline: [], key: null, written: null };
    await page.route(`${AUTHORIZE}**`, async (route) => {
      const entries = await session(page);
      seen.key = Object.keys(entries).find((k) => !seen.baseline.includes(k)) ?? null;
      await route.abort('aborted');
    });
    await guestToGoogle(page, seen);
    await expect.poll(() => seen.key).not.toBeNull();
    await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
    await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'התחברות', exact: true }).click();
    await expect.poll(() => pathOf(page)).not.toBe('/login');
    await signOut(page);
    expect(Object.keys(await session(page)), 'the entry is removed on sign-out').not.toContain(seen.key ?? '');
    expect(net.acts).toEqual([]);
  });

  const lands = 'the normal landing (no profile, no viewer call), the entry removed';
  const tampered: Array<[string, (now: number) => string | null]> = [
    ['a non-profile path', (now) => JSON.stringify({ path: '/settings', at: now })],
    ['a path outside the app', (now) => JSON.stringify({ path: `https://evil.example/u/${NOA_ID}`, at: now })],
    ['a protocol-relative path', (now) => JSON.stringify({ path: `//evil.example/u/${NOA_ID}`, at: now })],
    ['a bad uuid', (now) => JSON.stringify({ path: '/u/not-a-uuid', at: now })],
    ['a path with extra segments', (now) => JSON.stringify({ path: `/u/${NOA_ID}/../../settings`, at: now })],
    ['a path with a query', (now) => JSON.stringify({ path: `/u/${NOA_ID}?next=https://evil.example`, at: now })],
    ['an entry 11 minutes old', (now) => JSON.stringify({ path: `/u/${NOA_ID}`, at: now - 11 * MIN })],
    ['an entry from the future', (now) => JSON.stringify({ path: `/u/${NOA_ID}`, at: now + 60 * MIN })],
    ['no `at`', () => JSON.stringify({ path: `/u/${NOA_ID}` })],
    ['an `at` that is a string', () => JSON.stringify({ path: `/u/${NOA_ID}`, at: 'now' })],
    ['a value that is not JSON', () => 'not json {'],
  ];
  for (const [label, rewrite] of tampered) {
    test(`[F2.4c2 c27] a tampered entry (${label}) lands on ${lands}`, async ({ page }) => {
      const { net, seen } = await setup(page, rewrite);
      await guestToGoogle(page, seen);
      await expect.poll(() => pathOf(page)).toBe('/feed');
      await settle(page);
      expect(net.views, 'no viewer call').toEqual([]);
      expect(await page.content()).not.toContain(NOA);
      expect(Object.keys(await session(page))).not.toContain(seen.key ?? '');
    });
  }

  test('[F2.4c2 c27] an entry 9 minutes old is still honoured (the limit is 10)', async ({ page }) => {
    const { net, seen } = await setup(page, (now) => JSON.stringify({ path: `/u/${NOA_ID}`, at: now - 9 * MIN }));
    await guestToGoogle(page, seen);
    await expect.poll(() => pathOf(page)).toBe(`/u/${NOA_ID}`);
    expect(viewsOf(net, NOA_ID)).toBe(1);
  });

  test('[F2.4c2 c27] Google from a plain Login (no profile link) writes no entry and lands on the normal landing', async ({ page }) => {
    const { net, seen } = await setup(page);
    await page.goto('/login');
    seen.baseline = Object.keys(await session(page));
    await page.getByRole('button', { name: GOOGLE, exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    expect(seen.key, 'no entry for a Login that did not come from a profile').toBeNull();
    expect(net.views).toEqual([]);
  });

  // ---- stale note (CRITIC's last bug): the note must not outlive the Google step it was written for ----
  interface Provider {
    complete: boolean;
    /** sessionStorage as it was at each authorize request. */
    atRedirect: Array<Record<string, string>>;
  }
  /** The provider with a switch: abandoned (aborted) or completed (302 back to the app). */
  async function switchableGoogle(page: Page): Promise<Provider> {
    const p: Provider = { complete: false, atRedirect: [] };
    await page.route(`${AUTHORIZE}**`, async (route) => {
      p.atRedirect.push(await session(page));
      if (p.complete) await route.fulfill({ status: 302, headers: { location: `${APP}/auth/google?code=e2e-code` } });
      else await route.abort('aborted');
    });
    return p;
  }
  /** Guest at /u/X -> Login -> Google, abandoned; returns the key of the note written. */
  async function abandonedStart(page: Page, p: Provider): Promise<string> {
    const seen: Seen = { baseline: [], key: null, written: null };
    await guestToGoogle(page, seen);
    await expect.poll(() => p.atRedirect.length).toBeGreaterThan(0);
    const last = p.atRedirect[p.atRedirect.length - 1] ?? {};
    const key = Object.keys(last).find((k) => !seen.baseline.includes(k));
    expect(key, 'the profile link left a note').toBeDefined();
    return key ?? '';
  }

  test('[F2.4c2 c27] a Google step abandoned from /u/X, then a plain Login -> Google that completes: the user lands on /feed, no viewer call for X', async ({ page }) => {
    const net = await setupProfiles(page, world());
    const p = await switchableGoogle(page);
    const key = await abandonedStart(page, p);
    p.complete = true;
    await page.goto('/login');
    expect(Object.keys(await session(page)), 'the stale note is gone after the fresh load').not.toContain(key);
    await page.getByRole('button', { name: GOOGLE, exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await settle(page);
    expect(net.views).toEqual([]);
    expect(await page.content()).not.toContain(NOA);
  });

  for (const path of ['/login', '/register', '/'] as const) {
    test(`[F2.4c2 c27] a note present at a fresh load of ${path} (not googleEntry) is gone after that load`, async ({ page }) => {
      await setupProfiles(page, world());
      const p = await switchableGoogle(page);
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
    const p = await switchableGoogle(page);
    const key = await abandonedStart(page, p);
    await page.locator('a[href="/register"]').first().click();
    await expect.poll(() => pathOf(page)).toBe('/register');
    expect(Object.keys(await session(page)), 'still there: no fresh load happened').toContain(key);
    const before = p.atRedirect.length;
    await page.getByRole('button', { name: GOOGLE, exact: true }).click();
    await expect.poll(() => p.atRedirect.length).toBeGreaterThan(before);
    expect(Object.keys(p.atRedirect[p.atRedirect.length - 1] ?? {}), 'the old note is removed by the plain start').not.toContain(key);
    expect(net.views).toEqual([]);
  });
});
