// The side menu of a staff account (FR-SET-001, FR-NOTIF-002; SRS audit 21.10.2026): a staff account has no profile and no notification
// settings, so its menu's Settings items are "פרטיות ואבטחה" and "תנאים ופרטיות" only (the community sections stay for every other account:
// e2e/settings-menu.spec.ts). Desktop, network stubbed (e2e/support/admin-stub.ts).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, MENU_BUTTON, pathOf, stubAccountKind } from './app-helpers';
import { DESKTOP_1280, EMAIL } from './support/journeys-stub';
import { setupAdmin } from './support/admin-stub';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

const PASSWORD = 'Zq-7-unique-pw-marker-91';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}

test('[FR-SET-001 FR-NOTIF-002 SRS audit] a staff account\'s menu offers only the Privacy and Terms sections of Settings', async ({ page }) => {
  await setupAdmin(page, { role: 'moderator', permissions: ['REPORTS_VIEW'] });
  await stubAccountKind(page, 'staff');
  await signIn(page);
  await page.getByRole('button', { name: MENU_BUTTON, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'תפריט' });
  await expect(drawer.getByRole('link', { name: 'פרטיות ואבטחה' })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'תנאים ופרטיות' })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'חשבון', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('link', { name: 'התראות', exact: true })).toHaveCount(0);
  await drawer.getByRole('link', { name: 'פרטיות ואבטחה' }).click();
  await expect.poll(() => pathOf(page)).toBe('/settings');
  await expect(page.getByRole('heading', { level: 2, name: 'התראות' })).toHaveCount(0);
});
