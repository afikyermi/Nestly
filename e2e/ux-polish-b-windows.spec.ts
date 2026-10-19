// I3 ux-polish-b (real browser, network stubbed): Back and an outside press on every confirmation (c4), the side menu (c6) and a sheet whose send is
// pending (c6). Derived from .work/ux-polish-b/spec.md criteria 4, 6, 12 and screen.md "Windows" (dialog names, focus after cancel) only.
// Not repeated here (one layer per behaviour): the sheets' Back / Esc / outside press with no request (share-in-feed, share-link, report*.spec.ts, "שיתוף
// Nestly" included); Esc and "ביטול" of each confirmation (their own specs); a confirmation whose request is pending (c5: ux-polish-b.spec.ts).
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, DRAWER_TITLE, MENU_BUTTON, NAV, open as openSeam, pathOf, recordRequests } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { A_JOURNEYS, EMAIL, PLANNING, childRow, main, openLoaded, scan, setup } from './support/journeys-stub';
import type { Journey } from './support/journeys-stub';
import { MIRI, setupFriends } from './support/friends-stub';
import { TAL, TAL_ID, act, world } from './support/profiles-fixtures';
import { TEXT, setupProfiles } from './support/profiles-stub';
import { id, named, pageOf, range } from './support/feed-stub';
import { setupShare } from './support/share-stub';
import { feedCards, openFeedAt } from './support/composer';
import { OTHERS_ID, POST_ID, setupPosts } from './support/posts-stub';
import type { StoredPost } from './support/posts-stub';
import { setupComments, top } from './support/comments-stub';
import { gate, stubReports } from './support/report-stub';
import { T as REPORT, choose, sendButton, sheet } from './support/report-ui';
import { DELETE_ITEM, chooseFromPostMenu, postMore } from './support/post-menu';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;
const PASSWORD = 'Zq-7-unique-pw-marker-91';
const PROBE = '/feed?probe=1';
const NOA = 'נועה · בת · 04.05.2023';
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.waitForLoadState('networkidle');
}

/** One confirmation: how to reach it, its opener (where focus must return), how many requests the screen made, and whether Back has left the screen. */
interface Ctx {
  opener: Locator;
  openDialog: () => Promise<void>;
  requests: () => number;
  left: () => boolean;
  /** The page scrolls (a long feed): the scroll must not move. */
  scrolls?: boolean;
}
interface Site {
  name: string;
  start: (page: Page) => Promise<Ctx>;
}
const stored = (n: number): StoredPost => ({ id: id(n), body: `גוף הפוסט ${n}`, audience: 'everyone', stageTag: null, createdAt: '2026-06-14T09:00:00.000Z', isMine: true });
const leftPath = (page: Page, path: string) => () => pathOf(page) !== path;

async function journeysSite(page: Page, journeys: Journey[], opener: (p: Page) => Locator): Promise<Ctx> {
  const net = await setup(page, { journeys: [...journeys] });
  await openLoaded(page);
  const target = opener(page);
  return { opener: target, openDialog: () => target.click(), requests: () => net.sent.length, left: leftPath(page, '/profile') };
}

const SITES: Site[] = [
  {
    name: '/feed "למחוק את הפוסט?"',
    start: async (page) => {
      const items = [...range(1, 8), named(9, { isMine: true }), ...range(10, 12)];
      const net = await setupShare(page, () => pageOf(items, null), { posts: [stored(9)] });
      await openFeedAt(page, net, PROBE);
      await expect(feedCards(page)).toHaveCount(12);
      const card = feedCards(page).nth(8);
      await card.scrollIntoViewIfNeeded();
      const opener = card.getByRole('button', { name: 'פעולות נוספות לפוסט', exact: true });
      return {
        opener,
        scrolls: true,
        openDialog: async () => {
          await opener.click();
          await page.getByRole('menuitem', { name: DELETE_ITEM, exact: true }).click();
        },
        requests: () => net.deletes.length,
        left: () => !page.url().includes('probe=1'),
      };
    },
  },
  {
    name: '/posts/:id "למחוק את הפוסט?"',
    start: async (page) => {
      const net = await setupPosts(page, { posts: [{ id: POST_ID, body: 'שאלה על שינה', audience: 'everyone', stageTag: null, createdAt: '2026-06-14T09:00:00.000Z', isMine: true }] });
      await signIn(page);
      await page.goto(`/posts/${POST_ID}`);
      await expect(main(page).getByText('שאלה על שינה')).toBeVisible();
      return { opener: postMore(page), openDialog: () => chooseFromPostMenu(page, DELETE_ITEM), requests: () => net.deletes.length, left: leftPath(page, `/posts/${POST_ID}`) };
    },
  },
  {
    name: '/u/:id "להסיר את {name} מהחברים?"',
    start: async (page) => {
      const net = await setupProfiles(page, world());
      await signIn(page);
      await page.goto(`/u/${TAL_ID}`);
      await expect(main(page).getByText(TAL, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
      const opener = act(page, TEXT.remove, TAL);
      return { opener, openDialog: () => opener.click(), requests: () => net.acts.length, left: leftPath(page, `/u/${TAL_ID}`) };
    },
  },
  {
    name: '/friends "להסיר את {name} מהחברים?"',
    start: async (page) => {
      const net = await setupFriends(page);
      await signIn(page);
      await page.goto('/friends');
      const opener = act(page, 'הסרה', MIRI.fullName);
      await expect(opener).toBeVisible();
      return { opener, openDialog: () => opener.click(), requests: () => net.actions.length, left: leftPath(page, '/friends') };
    },
  },
  {
    name: '/profile "להסיר את {name}?" (a child)',
    start: (page) => journeysSite(page, A_JOURNEYS, (p) => childRow(p, NOA).getByRole('button', { name: 'הסרה', exact: true })),
  },
  {
    name: '/profile "לסיים את מסלול ההריון?"',
    start: (page) => journeysSite(page, A_JOURNEYS, (p) => main(p).getByRole('button', { name: 'סיום מסלול ההריון', exact: true })),
  },
  {
    name: "/profile \"מסלול 'מתכננים' יסתיים ויימחק\"",
    start: (page) => journeysSite(page, PLANNING, (p) => main(p).getByRole('button', { name: 'הוספת הריון', exact: true })),
  },
];

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-b c4 [NFR-USAB-004] every confirmation: Back and a press on the backdrop are "ביטול"', () => {
  for (const { label, viewport } of SIZES) {
    for (const site of SITES) {
      test(`[ub c4][c12] ${label} ${site.name}: Back closes it with no request, same URL and scroll, focus on the opener; so does a backdrop press, never the action; axe 0; the next Back leaves the screen`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const ctx = await site.start(page);
        const url = page.url();
        for (const how of ['Back', 'backdrop'] as const) {
          await ctx.openDialog();
          const box = page.getByRole('alertdialog');
          await expect(box, `${how}: opens`).toBeVisible();
          if (how === 'Back') await scan(page);
          const at = await scrollY(page);
          if (how === 'Back') await page.goBack();
          else await page.mouse.click(3, 3);
          await expect(box, how).toHaveCount(0);
          expect(page.url(), `${how}: same URL`).toBe(url);
          expect(await scrollY(page), `${how}: same scroll`).toBe(at);
          await expect(ctx.opener, `${how}: focus on the opener`).toBeFocused();
          expect(ctx.requests(), `${how}: no request`).toBe(0);
        }
        await page.goBack();
        await expect.poll(ctx.left, 'the next Back leaves the screen as it would without the dialog').toBe(true);
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-b c6 [NFR-USAB-004] the side menu', () => {
  const hamburger = (page: Page) => page.getByRole('button', { name: MENU_BUTTON, exact: true });
  const drawer = (page: Page) => page.getByRole('dialog', { name: DRAWER_TITLE });
  /** Waits until the element stops moving (two reads of its box agree). */
  async function settled(target: Locator): Promise<void> {
    let last = '';
    await expect
      .poll(async () => {
        const now = JSON.stringify(await target.boundingBox());
        const same = now === last;
        last = now;
        return same;
      })
      .toBe(true);
  }
  /** /home, then /feed through the navigation, so the entry before /feed is /home. */
  async function atFeedAfterHome(page: Page): Promise<void> {
    await openSeam(page, '/home', 'signed-in');
    await page.getByRole('navigation', { name: NAV }).filter({ visible: true }).getByRole('link', { name: 'פיד', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/feed');
  }
  for (const { label, viewport } of SIZES) {
    test(`[ub c6] ${label}: Back, Esc and an outside press each close it with no request; the screen and URL stay; focus on "${MENU_BUTTON}"; the next Back leaves the screen; axe 0 while open`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await atFeedAfterHome(page);
      const requests = recordRequests(page);
      for (const how of ['Back', 'Esc', 'outside'] as const) {
        const before = requests.length;
        await hamburger(page).click();
        await expect(drawer(page), how).toBeVisible();
        await settled(drawer(page)); // its slide-in has ended: a press during the motion is not what a person's press is
        if (how === 'Back') await scan(page);
        if (how === 'Back') await page.goBack();
        else if (how === 'Esc') await page.keyboard.press('Escape');
        else await page.mouse.click(3, 3);
        await expect(drawer(page), how).toHaveCount(0);
        expect(pathOf(page), `${how}: still /feed`).toBe('/feed');
        await expect(hamburger(page), `${how}: focus`).toBeFocused();
        expect(requests.length, `${how}: no request`).toBe(before);
      }
      await page.goBack();
      await expect.poll(() => pathOf(page), 'the next Back leaves the screen').toBe('/home');
    });
  }
  test('[ub c6] an item that navigates still does; Back from its target returns to the screen with no menu open', async ({ page }) => {
    await atFeedAfterHome(page);
    await hamburger(page).click();
    await drawer(page).getByRole('link', { name: 'חשבון', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/settings');
    await expect(drawer(page)).toHaveCount(0);
    await page.goBack();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    await expect(drawer(page)).toHaveCount(0);
    await expect(hamburger(page)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ux-polish-b c6 [NFR-USAB-004] a sheet whose send is pending stays open', () => {
  test('[ub c6] "שיתוף בפיד": Back, Esc and an outside press leave the window open while the send is pending; one request; it closes when the send ends', async ({ page }) => {
    const net = await setupShare(page, () => pageOf([named(1)], null));
    await openFeedAt(page, net);
    const g = gate();
    net.holdShare = g.promise;
    await feedCards(page).first().getByRole('button', { name: 'שיתוף בפיד', exact: true }).click();
    const box = page.getByRole('dialog', { name: 'שיתוף בפיד', exact: true });
    await expect(box).toBeVisible();
    await box.getByRole('button', { name: 'שיתוף', exact: true }).click();
    await expect(box.getByRole('button', { name: 'משתפים', exact: true })).toBeVisible();
    await page.goBack();
    await expect(box).toBeVisible();
    expect(pathOf(page)).toBe('/feed');
    await page.keyboard.press('Escape');
    await expect(box).toBeVisible();
    await page.mouse.click(3, 3);
    await expect(box).toBeVisible();
    g.release();
    await expect(box).toHaveCount(0);
    expect(net.shares).toHaveLength(1);
    expect(pathOf(page)).toBe('/feed');
  });

  test('[ub c6] the report sheet: Back, Esc and an outside press leave it open while the send is pending; one request', async ({ page }) => {
    await setupComments(page, [top(1, 'שלום מנועה', [], { author: { name: 'נועה' } })]);
    const reports = await stubReports(page);
    await signIn(page);
    await page.goto(`/posts/${OTHERS_ID}`);
    await expect(page.getByRole('region', { name: 'תגובות', exact: true })).toBeVisible();
    const g = gate();
    reports.hold = g.promise;
    await page.getByRole('main').getByRole('button', { name: REPORT.moreOfPost, exact: true }).click();
    await page.getByRole('menuitem', { name: REPORT.reportPost, exact: true }).click();
    const box = sheet(page, 'post');
    await choose(box, 0);
    await sendButton(box).click();
    await expect(box.getByRole('button', { name: REPORT.sending, exact: true })).toBeVisible();
    await page.goBack();
    await expect(box).toBeVisible();
    expect(pathOf(page)).toBe(`/posts/${OTHERS_ID}`);
    await page.keyboard.press('Escape');
    await expect(box).toBeVisible();
    await page.mouse.click(3, 3);
    await expect(box).toBeVisible();
    g.release();
    await expect(box).toHaveCount(0);
    expect(reports.sent).toHaveLength(1);
  });
});
