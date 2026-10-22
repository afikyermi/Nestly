// I10 completion C (Afik 21.10.2026, §11.13-11.17): the main flow of each new or changed screen, desktop, network stubbed
// (e2e/support/groups-stub.ts). Permissions are the database's: supabase/tests/106_group_rules.sql, apps/server/tests/db/group-rules.db.test.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { json } from './support/journeys-stub';
import { DESKTOP_1280, EMAIL, main } from './support/journeys-stub';
import { NID } from './support/notifications-stub';
import { GID, setupGroups, WALKS, type StubGroup } from './support/groups-stub';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}

const OWNED: StubGroup = { ...WALKS, myRole: 'owner', state: 'member', privacy: 'private', memberCount: 12 };

test('[FR-GRP-001 FR-FEED-001 §11.13 §11.14] the main feed: a Group\'s Highlight says "מתוך: <name>" and links to it; active Groups are suggested', async ({ page }) => {
  await setupGroups(page);
  await page.route('**/api/feed**', (route) =>
    json(route, 200, {
      items: [
        {
          id: NID(31), source: 'organic', audience: 'everyone', stageTag: null, createdAt: '2026-06-15T11:00:00.000Z', likeCount: 4, commentCount: 1,
          likedByMe: false, kind: 'post', body: 'מה עוזר לכם בלילות?', isMine: false, isAnonymous: false, author: { name: 'יוסי כהן' },
          group: { id: GID(1), name: WALKS.name, privacy: 'public' },
        },
      ],
      nextCursor: null,
      configVersion: 1,
      suggestedGroups: [{ id: GID(2), name: 'אבות בבוקר', description: 'קפה וטיולון', memberCount: 9 }],
    }),
  );
  await signIn(page);
  await page.goto('/feed');
  const card = main(page).getByRole('article', { name: /יוסי כהן/ });
  await expect(card.getByText('מה עוזר לכם בלילות?')).toBeVisible();
  await expect(main(page).getByRole('region', { name: 'קבוצות פעילות שאולי יעניינו אותך' }).getByRole('link', { name: 'אבות בבוקר' })).toBeVisible();
  await card.getByRole('link', { name: `מתוך: ${WALKS.name}` }).click();
  await expect.poll(() => pathOf(page)).toBe(`/groups/${GID(1)}`);
});

test('[FR-GRP-003 AC-038 §11.16] a Group manager warns and mutes a member (a reason and a duration), or removes and blocks; there is no plain removal', async ({ page }) => {
  const net = await setupGroups(page, [OWNED]);
  await signIn(page);
  await page.goto(`/groups/${GID(1)}`);
  await main(page).getByRole('tab', { name: 'חברים' }).click();
  await main(page).getByRole('button', { name: 'פעולות על יוסי כהן' }).click();
  await expect(page.getByRole('menuitem', { name: 'הסרה מהקבוצה' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'אזהרה והשתקה' }).click();
  const sheet = page.getByRole('dialog', { name: /אזהרה והשתקה: יוסי כהן/ });
  await sheet.getByRole('button', { name: 'שליחת אזהרה והשתקה' }).click();
  await expect(sheet.getByText('צריך לבחור סיבה')).toBeVisible();
  await sheet.getByText('אחר', { exact: true }).click();
  await sheet.getByRole('button', { name: 'שליחת אזהרה והשתקה' }).click();
  await expect(sheet.getByText('צריך לכתוב את הסיבה')).toBeVisible();
  await sheet.getByLabel('פירוט הסיבה').fill('נא לשמור על טון מכבד');
  await sheet.getByText('7 ימים', { exact: true }).click();
  await sheet.getByRole('button', { name: 'שליחת אזהרה והשתקה' }).click();
  await expect(sheet).toBeHidden();
  expect(net.writes.find((w) => w.path === `/api/groups/${GID(1)}/enforcements`)?.body).toEqual({
    userId: NID(12), kind: 'warn_mute', reason: 'other', reasonText: 'נא לשמור על טון מכבד', muteHours: 168,
  });
  await main(page).getByRole('button', { name: 'פעולות על יוסי כהן' }).click();
  await page.getByRole('menuitem', { name: 'הסרה וחסימה' }).click();
  const block = page.getByRole('dialog', { name: /הסרה וחסימה מהקבוצה: יוסי כהן/ });
  await block.getByText('ספאם או פרסום', { exact: true }).click();
  await block.getByRole('button', { name: 'הסרה וחסימה' }).click();
  await expect(block).toBeHidden();
  expect(net.writes.filter((w) => w.path === `/api/groups/${GID(1)}/enforcements`).at(-1)?.body).toEqual({ userId: NID(12), kind: 'remove_block', reason: 'spam' });
  await expect(main(page).getByText('יוסי כהן')).toHaveCount(0);
});

test('[FR-GRP-002 §11.15 PG-035] the Owner sees an invitation waiting for approval beside the Join Requests and approves it', async ({ page }) => {
  const net = await setupGroups(page, [OWNED]);
  await signIn(page);
  await page.goto(`/groups/${GID(1)}`);
  await main(page).getByRole('tab', { name: 'ניהול' }).click();
  const queue = main(page).getByRole('region', { name: 'הזמנות שמחכות לאישור' });
  await expect(queue.getByText('נועה לוי, בהזמנה של יוסי כהן')).toBeVisible();
  await queue.getByRole('button', { name: 'אישור' }).click();
  await expect(queue.getByText('אין הזמנות שמחכות')).toBeVisible();
  expect(net.writes.find((w) => w.path === `/api/groups/${GID(1)}/invitations/${NID(21)}`)?.body).toEqual({ decision: 'approve' });
});

test('[FR-GRP-002 §11.15 §11.16] a member invites a Friend to a Private Group (waits for approval); a muted member reads only', async ({ page }) => {
  const member: StubGroup = { ...WALKS, myRole: 'member', state: 'member', privacy: 'private' };
  const net = await setupGroups(page, [member]);
  await signIn(page);
  await page.goto(`/groups/${GID(1)}`);
  await main(page).getByRole('button', { name: 'עוד פעולות בקבוצה' }).click();
  await page.getByRole('menuitem', { name: 'הזמנת חברים' }).click();
  const sheet = page.getByRole('dialog', { name: 'הזמנת חברים לקבוצה' });
  await expect(sheet.getByText(/ההזמנה תישלח אחרי שבעלי הקבוצה או מנהל יאשרו אותה/)).toBeVisible();
  await sheet.getByRole('button', { name: /הזמנה של נועה לוי/ }).click();
  await expect(sheet.getByText('ממתין לאישור המנהל')).toBeVisible();
  expect(net.writes.find((w) => w.path === `/api/groups/${GID(1)}/invitations`)?.body).toEqual({ userId: NID(14) });

  const muted: StubGroup = { ...WALKS, myRole: 'member', state: 'member', myMute: { until: '2026-06-22T12:00:00.000Z', reason: 'spam', reasonText: null } };
  await setupGroups(page, [muted]);
  await page.goto(`/groups/${GID(1)}`);
  await expect(main(page).getByRole('note')).toContainText('קיבלת אזהרה בקבוצה הזו (ספאם או פרסום)');
  await expect(main(page).getByRole('button', { name: 'פרסום', exact: true })).toHaveCount(0);
  await main(page).getByRole('button', { name: 'עוד פעולות בקבוצה' }).click();
  await expect(page.getByRole('menuitem', { name: 'הזמנת חברים' })).toHaveCount(0);
});
