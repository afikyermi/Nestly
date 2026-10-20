// Blocking a user (FR-REL-002): the main flow on a desktop browser, network stubbed. Block from another person's profile (a dialog says what a
// block does, then the profile is no longer shown), and lift the block from the blocked list in Settings. The rules (mutual hiding, the
// Friendship ended, who may block) are pgTAP's (file 91) and tests/db/blocks.db.test.ts.
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { CORS, DESKTOP_1280, json, main } from './support/journeys-stub';
import { setupProfiles } from './support/profiles-stub';
import { LIOR, LIOR_ID, dialog, openProfile, world } from './support/profiles-fixtures';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

interface BlocksNet {
  blocked: Array<{ userId: string; fullName: string | null; blockedAt: string }>;
  calls: string[];
}

async function setupBlocks(page: Page): Promise<BlocksNet> {
  const net: BlocksNet = { blocked: [], calls: [] };
  await page.route(
    (url) => /^\/api\/users\/[^/]+\/block$/.test(url.pathname) || url.pathname === '/api/blocks',
    async (route: Route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const path = new URL(req.url()).pathname;
      net.calls.push(`${req.method()} ${path}`);
      if (path === '/api/blocks') return json(route, 200, { blocked: net.blocked });
      const id = decodeURIComponent(path.split('/')[3] ?? '');
      if (req.method() === 'PUT') net.blocked = [{ userId: id, fullName: LIOR, blockedAt: '2026-10-20T09:00:00.000Z' }, ...net.blocked.filter((b) => b.userId !== id)];
      else net.blocked = net.blocked.filter((b) => b.userId !== id);
      return route.fulfill({ status: 204, headers: CORS });
    },
  );
  await page.route('**/api/privacy', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, { profileVisibility: 'open', isEmptyJourneySentenceShown: true, isChildBirthdayShared: true });
  });
  return net;
}

test.describe('[FR-REL-002] blocking a user', () => {
  test('[FR-REL-002] block from the profile after a dialog that says what it does; the profile is no longer shown; the block is lifted in Settings', async ({ page }) => {
    await setupProfiles(page, world());
    const net = await setupBlocks(page);
    await openProfile(page, LIOR_ID, LIOR);

    // the dialog: nothing is sent before the confirmation; cancel sends nothing
    await main(page).getByRole('button', { name: `חסימה של ${LIOR}`, exact: true }).click();
    await expect(dialog(page)).toContainText(`לחסום את ${LIOR}?`);
    await expect(dialog(page)).toContainText('והחברות ביניכם תסתיים');
    await dialog(page).getByRole('button', { name: 'ביטול', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(net.calls).toEqual([]);

    await main(page).getByRole('button', { name: `חסימה של ${LIOR}`, exact: true }).click();
    await dialog(page).getByRole('button', { name: 'חסימה', exact: true }).click();
    await expect(main(page).getByRole('heading', { level: 1, name: 'החשבון נחסם' })).toBeVisible();
    expect(net.calls).toEqual([`PUT /api/users/${LIOR_ID}/block`]);
    await expect(main(page).getByText(LIOR, { exact: true })).toHaveCount(0);

    // the blocked list in Settings, reached from the screen's link
    await main(page).getByRole('link', { name: 'למשתמשים החסומים' }).click();
    await expect.poll(() => pathOf(page)).toBe('/settings');
    const list = main(page).getByRole('list', { name: 'משתמשים חסומים' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText(LIOR);
    await list.getByRole('button', { name: `ביטול החסימה של ${LIOR}`, exact: true }).click();
    await expect(main(page).getByText('אין משתמשים חסומים', { exact: false })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'החסימה בוטלה' })).toHaveCount(1);
    expect(net.calls).toContain(`DELETE /api/users/${LIOR_ID}/block`);
  });
});
