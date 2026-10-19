// I3 F3.2b c20 (CRITIC 2): the remembered feed belongs to one user. Derived from .work/feed-view/spec.md c20 and findings-b.md; roles and
// names from screen.md. Same stub as e2e/feed.spec.ts; the token's `sub` is what the stub's Auth names (e2e/support/feed-stub.ts).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { EMAIL } from './support/journeys-stub';
import { EMPTY, USER_B, id, pageOf, range, setupFeed, tokenFor } from './support/feed-stub';
import type { FeedNet } from './support/feed-stub';

test.use({ baseURL: APP });

const MENU = 'פתיחת התפריט';
const cards = (page: Page) => page.getByRole('feed', { name: 'פוסטים בפיד' }).getByRole('article');
const body = (page: Page, n: number) => page.getByText(`גוף הפוסט ${n}`, { exact: true });
const forA = (cursor: string | null) => (cursor === null ? pageOf(range(1, 12), null) : EMPTY);
const forB = () => pageOf(range(51, 62), null);
const post3 = { id: id(3), body: 'גוף הפוסט 3', audience: 'everyone' as const, stageTag: null, createdAt: '2026-06-14T09:00:00.000Z', isMine: false };

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
}
/** Signs in as A, opens the feed afresh (the sign-in landing request is not recorded) and goes to a post page. */
async function startOnPost(page: Page, net: FeedNet): Promise<void> {
  await signIn(page);
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.waitForLoadState('networkidle');
  net.armed = true;
  await page.goto('/feed');
  await expect(cards(page)).toHaveCount(12);
  await cards(page).nth(2).getByRole('link').click();
  await expect.poll(() => pathOf(page)).toBe(`/posts/${id(3)}`);
}

test.describe('F3.2b c20 [FR-FEED-004 NFR-SEC-001] the remembered feed belongs to one user', () => {
  test("[c20] sign-out, then another user signs in: the feed is B's alone, fetched anew, nothing of A's", async ({ page }) => {
    let who: 'A' | 'B' = 'A';
    const net = await setupFeed(page, (cursor) => (who === 'A' ? forA(cursor) : forB()), { posts: [post3] });
    await startOnPost(page, net);
    await page.getByRole('button', { name: MENU }).click();
    await page.getByRole('button', { name: 'התנתקות', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/');
    who = 'B';
    net.sub = USER_B;
    await signIn(page);
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await expect(cards(page)).toHaveCount(12);
    await expect(body(page, 51)).toHaveCount(1);
    await expect(body(page, 1)).toHaveCount(0);
    await expect(body(page, 3)).toHaveCount(0);
    expect(net.cursors).toEqual([null, null]);
  });

  test("[c20] the token changes to another user without a sign-out: Back does not restore the first user's cards, it fetches", async ({ page }) => {
    let who: 'A' | 'B' = 'A';
    const net = await setupFeed(page, (cursor) => (who === 'A' ? forA(cursor) : forB()), { posts: [post3] });
    await startOnPost(page, net);
    // The post page has settled before the swap, so no in-flight refresh can write A's session back over B's.
    await expect(page.getByText('גוף הפוסט 3', { exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    // Another tab signed in as B: the shared session storage now holds B's token; this tab was never signed out.
    const swapped = await page.evaluate((token) => {
      const key = 'nestly-auth';
      const raw = window.localStorage.getItem(key);
      if (raw === null) return false;
      const stored: unknown = JSON.parse(raw);
      if (typeof stored !== 'object' || stored === null) return false;
      window.localStorage.setItem(key, JSON.stringify({ ...stored, access_token: token }));
      return true;
    }, tokenFor(USER_B));
    expect(swapped, 'the session is stored under nestly-auth').toBe(true);
    who = 'B';
    net.sub = USER_B; // any refresh from here on names B
    await page.goBack();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await expect(body(page, 51)).toHaveCount(1);
    await expect(body(page, 1)).toHaveCount(0);
    expect(net.cursors).toEqual([null, null]);
  });
});
