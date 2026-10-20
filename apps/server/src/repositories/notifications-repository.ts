// Notifications and their preferences (FR-NOTIF-001/002/003; migration 20261020400000). Runs inside the caller's identity transaction and
// nowhere else. Which notifications the caller reads and marks is the database's (notifications_select_recipient, notifications_update_recipient):
// nothing here narrows rows for permission - there is no recipient predicate, the policy returns the caller's own rows. Notifications are
// written by the database's own triggers, never from here. The ids in a `where` below name a row to act on, never a permission filter.

import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationTargetKind,
  type NotificationType,
} from '@nestly/shared';
import { desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { friendContentNotificationPreferences, notificationPreferences, notifications, notificationsUpdate } from '../db/schema.js';

export interface NotificationRow {
  readonly id: string;
  readonly type: NotificationType;
  readonly actorId: string | null;
  readonly targetKind: NotificationTargetKind;
  readonly targetId: string;
  readonly createdAt: Date;
  readonly isRead: boolean;
}

/** The latest notifications of the caller, newest first. */
export async function readLatest(tx: IdentityTx, limit: number): Promise<NotificationRow[]> {
  const rows = await tx
    .select({
      id: notifications.id,
      type: notifications.type,
      actorId: notifications.actorId,
      targetKind: notifications.targetKind,
      targetId: notifications.targetId,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
  return rows.map(({ readAt, ...row }) => ({ ...row, isRead: readAt !== null }));
}

const countRow = z.array(z.object({ n: z.number().int().nonnegative() })).length(1);

/** How many of the caller's notifications are unread (the bell). */
export async function countUnread(tx: IdentityTx): Promise<number> {
  const rows = countRow.parse(await tx.execute(sql`select count(*)::int as n from nestly.notifications where read_at is null`));
  return rows[0]?.n ?? 0;
}

/** Marks one notification read. Empty when it is not the caller's (the policy shows no such row). */
export async function markOneRead(tx: IdentityTx, id: string) {
  return tx.update(notificationsUpdate).set({ readAt: sql`now()` }).where(eq(notificationsUpdate.id, id)).returning({ id: notificationsUpdate.id });
}

/** Mark all as read: every unread notification of the caller. */
export async function markAllRead(tx: IdentityTx) {
  return tx.update(notificationsUpdate).set({ readAt: sql`now()` }).where(isNull(notificationsUpdate.readAt)).returning({ id: notificationsUpdate.id });
}

/** The caller's stored category switches (a category with no row is on). */
export async function readCategoryRows(tx: IdentityTx): Promise<{ category: NotificationCategory; isEnabled: boolean }[]> {
  const rows = await tx
    .select({ category: notificationPreferences.category, isEnabled: notificationPreferences.isInAppEnabled })
    .from(notificationPreferences);
  return rows.filter((row) => NOTIFICATION_CATEGORIES.includes(row.category));
}

/** Switches a category on or off for the caller (the user is the caller's, set by the database). */
export async function writeCategory(tx: IdentityTx, category: NotificationCategory, isEnabled: boolean) {
  return tx.execute(sql`
    insert into nestly.notification_preferences (category, is_in_app_enabled) values (${category}, ${isEnabled})
    on conflict (user_id, category) do update set is_in_app_enabled = excluded.is_in_app_enabled`);
}

/** The Friends the caller chose to follow (a row per Friend). */
export async function readFollowRows(tx: IdentityTx): Promise<{ friendId: string; isEnabled: boolean }[]> {
  return tx
    .select({ friendId: friendContentNotificationPreferences.friendId, isEnabled: friendContentNotificationPreferences.isEnabled })
    .from(friendContentNotificationPreferences);
}

/** Follows or stops following a Friend's new posts. The insert policy requires an accepted Friendship (42501 otherwise). */
export async function writeFollow(tx: IdentityTx, friendId: string, isEnabled: boolean) {
  return tx.execute(sql`
    insert into nestly.friend_content_notification_preferences (friend_id, is_enabled) values (${friendId}, ${isEnabled})
    on conflict (user_id, friend_id) do update set is_enabled = excluded.is_enabled`);
}

