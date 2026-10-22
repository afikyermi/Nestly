// Notifications and their preferences (FR-NOTIF-001/002/003; migration 20261020400000). Runs inside the caller's identity transaction and
// nowhere else. Which notifications the caller reads and marks is the database's (notifications_select_recipient, notifications_update_recipient):
// nothing here narrows rows for permission - there is no recipient predicate, the policy returns the caller's own rows. Notifications are
// written by the database's own triggers and definers, never by a statement here: deliverChildBirthdays only asks the definer to write the
// caller's own birthday notifications. The ids in a `where` below name a row to act on, never a permission filter.

import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationTargetKind,
} from '@nestly/shared';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { friendContentNotificationPreferences, notificationPreferences, notifications, notificationsUpdate } from '../db/schema.js';

export interface NotificationRow {
  readonly id: string;
  /** As stored: a type this build does not know is skipped by the service, never an error. */
  readonly type: string;
  readonly actorId: string | null;
  readonly targetKind: NotificationTargetKind;
  readonly targetId: string;
  readonly createdAt: Date;
  /** The exact time as cursor text (microseconds, UTC). */
  readonly cursorAt: string;
  readonly isRead: boolean;
}

/**
 * I11 follow-ups: the weekly follower digest is shown only while the caller's `followers` category is on and the week it closes still has a new
 * follower (the rows naming the caller that it reads as a count; never who). The row was written at the week's first follow, so a switch
 * turned off later in the week, or a week whose followers all left, shows nothing. Read under the caller's own policies.
 */
const digestShown = sql`not (${notifications.type} = 'followers_weekly' and (
  exists (select 1 from nestly.notification_preferences p where p.category = 'followers' and not p.is_in_app_enabled)
  or not exists (select 1 from nestly.professional_follows f where f.professional_id = (select auth.uid())
                  and f.created_at >= ((${notifications.createdAt} at time zone 'Asia/Jerusalem') - interval '7 days') at time zone 'Asia/Jerusalem'
                  and f.created_at < ${notifications.createdAt})))`;

/**
 * BR-037, AC-046 (migration 20261023100000): the caller's own notifications of a Friend's child's birthday in the last seven days, written by
 * nestly.deliver_child_birthdays() - only where the parent allows it, the caller's `birthdays` category is on and no block stands between
 * them; once per birthday. Returns how many were written.
 */
export async function deliverChildBirthdays(tx: IdentityTx): Promise<number> {
  const rows = z.array(z.object({ n: z.number().int().nonnegative() })).parse(await tx.execute(sql`select nestly.deliver_child_birthdays() as n`));
  return rows[0]?.n ?? 0;
}

/** The caller's notifications, newest first, older than `before` when given (keyset on time and id). */
export async function readLatest(tx: IdentityTx, limit: number, before: { at: string; id: string } | null = null): Promise<NotificationRow[]> {
  const rows = await tx
    .select({
      id: notifications.id,
      type: sql<string>`${notifications.type}`,
      actorId: notifications.actorId,
      targetKind: notifications.targetKind,
      targetId: notifications.targetId,
      createdAt: notifications.createdAt,
      cursorAt: sql<string>`to_char(${notifications.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .where(and(digestShown, before === null ? undefined : sql`(${notifications.createdAt}, ${notifications.id}) < (${before.at}::timestamptz, ${before.id}::uuid)`))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
  return rows.map(({ readAt, ...row }) => ({ ...row, isRead: readAt !== null }));
}

const countRow = z.array(z.object({ n: z.number().int().nonnegative() })).length(1);

/** How many of the caller's notifications are unread (the bell). */
export async function countUnread(tx: IdentityTx): Promise<number> {
  const rows = countRow.parse(await tx.execute(sql`select count(*)::int as n from nestly.notifications where read_at is null and ${digestShown}`));
  return rows[0]?.n ?? 0;
}

/** The new followers of each digest's week (the week before its time), by notification id: a count of the rows naming the caller, never who. */
export async function readDigestCounts(tx: IdentityTx, rows: ReadonlyArray<{ id: string; createdAt: Date }>): Promise<Map<string, number>> {
  if (rows.length === 0) return new Map();
  const counts = z.array(z.object({ id: z.guid(), n: z.number().int() })).parse(
    await tx.execute(sql`
      select d.id, (select count(*)::int from nestly.professional_follows f where f.professional_id = (select auth.uid())
                     and f.created_at >= ((d.at at time zone 'Asia/Jerusalem') - interval '7 days') at time zone 'Asia/Jerusalem' and f.created_at < d.at) as n
      from unnest(${sql.param(rows.map((row) => row.id))}::uuid[], ${sql.param(rows.map((row) => row.createdAt.toISOString()))}::timestamptz[]) as d(id, at)`),
  );
  return new Map(counts.map((row) => [row.id, row.n]));
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

