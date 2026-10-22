// FR-NOTIF-001 / FR-NOTIF-002 / AC-040 / AC-041: the bell, the notifications page (PG-018) and the notification settings, main flows, desktop
// (real browser, real session source, network stubbed: e2e/support/notifications-stub.ts). The API half (who is notified, preferences honoured)
// is apps/server/tests/db/notifications.db.test.ts and supabase/tests/90_notifications_search.sql.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf, stubAccountKind } from './app-helpers';
import { DESKTOP_1280, EMAIL, main } from './support/journeys-stub';
import { COMMENT, REQUEST, setupNotifications } from './support/notifications-stub';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

/** The Notification Settings section (the Settings page also holds "פרטיות ואבטחה" and the privacy section's own alerts). */
const section = (page: Page) => page.locator('[data-settings-section="notifications"]');

async function signIn(page: Page): Promise<void> {
  await stubAccountKind(page);
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}

test.describe('[AC-040 FR-NOTIF-001] the bell and the dropdown', () => {
  test('[AC-040] the bell shows the unread count; the dropdown lists the notifications with their deep links; Mark all as read clears the count', async ({ page }) => {
    const net = await setupNotifications(page);
    await signIn(page);
    const bell = page.getByRole('button', { name: /התראות, 2 חדשות/ });
    await expect(bell).toBeVisible();
    await bell.click();
    const panel = page.getByRole('dialog', { name: 'התראות' });
    await expect(panel.getByRole('link', { name: /תגובה חדשה של דנה לוי על הפוסט שלך/ })).toHaveAttribute('href', `/posts/${COMMENT.targetId}`);
    await expect(panel.getByRole('link', { name: /בקשת חברות חדשה מיוסי כהן/ })).toHaveAttribute('href', `/u/${REQUEST.targetId}`);
    await panel.getByRole('button', { name: 'סימון הכול כנקרא' }).click();
    await expect(page.getByRole('button', { name: 'התראות', exact: true })).toBeVisible();
    expect(net.writes.map((w) => w.path)).toContain('/api/notifications/read-all');
  });

  test('[AC-040] choosing a notification marks it read and opens its target', async ({ page }) => {
    const net = await setupNotifications(page);
    await signIn(page);
    await page.getByRole('button', { name: /התראות, 2 חדשות/ }).click();
    await page.getByRole('link', { name: /תגובה חדשה של דנה לוי על הפוסט שלך/ }).click();
    await expect.poll(() => pathOf(page)).toBe(`/posts/${COMMENT.targetId}`);
    expect(net.writes.map((w) => w.path)).toContain(`/api/notifications/${COMMENT.id}/read`);
  });
});

test.describe('[AC-040 PG-018] the notifications page', () => {
  test('[AC-040] "כל ההתראות" opens the page: every notification, unread marked, Mark all as read', async ({ page }) => {
    const net = await setupNotifications(page);
    await signIn(page);
    await page.getByRole('button', { name: /התראות, 2 חדשות/ }).click();
    await page.getByRole('link', { name: 'כל ההתראות' }).click();
    await expect.poll(() => pathOf(page)).toBe('/notifications');
    await expect(page.getByRole('heading', { name: 'התראות', level: 1 })).toBeVisible();
    await expect(main(page).getByRole('link')).toHaveCount(3);
    await expect(main(page).getByText('חדשה', { exact: true })).toHaveCount(2);
    await main(page).getByRole('button', { name: 'סימון הכול כנקרא' }).click();
    await expect(main(page).getByText('חדשה', { exact: true })).toHaveCount(0);
    expect(net.writes.map((w) => w.path)).toContain('/api/notifications/read-all');
  });

  test('[AC-040] with no notifications the page says so', async ({ page }) => {
    await setupNotifications(page, { items: [] });
    await signIn(page);
    await page.goto('/notifications');
    await expect(main(page).getByText('אין התראות חדשות')).toBeVisible();
  });
});

test.describe('[AC-041 FR-NOTIF-002] the notification settings', () => {
  test('[AC-041] a category is switched off and saved at once; a Friend is followed; a failed save puts the switch back', async ({ page }) => {
    const net = await setupNotifications(page);
    await signIn(page);
    await page.goto('/settings#notifications');
    const comments = page.getByRole('checkbox', { name: 'תגובות על פוסטים ותשובות לתגובות' });
    await expect(comments).toBeChecked();
    await comments.uncheck();
    await expect(main(page).getByText('השינוי נשמר')).toBeVisible();
    expect(net.writes).toContainEqual({ method: 'PUT', path: '/api/notification-preferences/categories/comments', body: JSON.stringify({ isEnabled: false }) });
    const follow = page.getByRole('checkbox', { name: 'התראה על פוסט חדש של מירי אברהם' });
    await expect(follow).not.toBeChecked();
    await follow.check();
    await expect(follow).toBeChecked();
    expect(net.writes.map((w) => w.path)).toContain('/api/notification-preferences/friends/d0000000-0000-4000-8000-000000000013');
    net.write = 500;
    // a click, not check(): the switch turns on and goes back once the save fails, so check() could not see it stay on
    await comments.click();
    await expect(section(page).getByRole('alert')).toContainText('לא הצלחנו לשמור');
    await expect(comments).not.toBeChecked();
  });

  test('[AC-041] there is no switch for security notifications and none for Push on the Web (AC-074)', async ({ page }) => {
    await setupNotifications(page);
    await signIn(page);
    await page.goto('/settings#notifications');
    await expect(section(page).getByRole('checkbox')).toHaveCount(5);
    await expect(section(page).getByText(/push|פוש|אבטחה/i)).toHaveCount(0);
  });
});
