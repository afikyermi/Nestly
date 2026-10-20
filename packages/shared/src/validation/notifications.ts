// Notifications (FR-NOTIF-001/002): the checks the web and the server share.
import { z } from 'zod';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_TARGET_KINDS, NOTIFICATION_TYPES } from '../constants/notifications.js';

/** One notification as the list shows it. `actorName` is null when the actor is unknown or not readable (a name the database does not show). */
export const notificationItem = z.strictObject({
  id: z.guid(),
  type: z.enum(NOTIFICATION_TYPES),
  actorId: z.guid().nullable(),
  actorName: z.string().nullable(),
  targetKind: z.enum(NOTIFICATION_TARGET_KINDS),
  targetId: z.guid(),
  createdAt: z.iso.datetime(),
  isRead: z.boolean(),
});
export type NotificationItem = z.infer<typeof notificationItem>;

/** GET /api/notifications: the latest notifications and the unread count (the bell). */
export const notificationsResponse = z.strictObject({ items: z.array(notificationItem), unreadCount: z.number().int().min(0) });
export type NotificationsResponse = z.infer<typeof notificationsResponse>;

/** One category and whether it creates In-App notifications. */
export const notificationPreference = z.strictObject({ category: z.enum(NOTIFICATION_CATEGORIES), isEnabled: z.boolean() });
export type NotificationPreference = z.infer<typeof notificationPreference>;

/** One Friend and whether their new posts notify the caller (FR-NOTIF-003). */
export const friendFollow = z.strictObject({ userId: z.guid(), fullName: z.string(), isEnabled: z.boolean() });
export type FriendFollow = z.infer<typeof friendFollow>;

/** GET /api/notification-preferences. */
export const notificationPreferencesResponse = z.strictObject({
  categories: z.array(notificationPreference),
  friends: z.array(friendFollow),
});
export type NotificationPreferencesResponse = z.infer<typeof notificationPreferencesResponse>;

/** PUT /api/notification-preferences/categories/:category body. */
export const categoryUpdateBody = z.strictObject({ isEnabled: z.boolean() });
export const categoryParam = z.enum(NOTIFICATION_CATEGORIES);

/** PUT /api/notification-preferences/friends/:userId body. */
export const friendFollowBody = z.strictObject({ isEnabled: z.boolean() });

export type BodyCheck<T> = { ok: true; value: T } | { ok: false };
export function checkCategoryUpdate(category: unknown, body: unknown): BodyCheck<{ category: z.infer<typeof categoryParam>; isEnabled: boolean }> {
  const c = categoryParam.safeParse(category);
  const b = categoryUpdateBody.safeParse(body);
  return c.success && b.success ? { ok: true, value: { category: c.data, isEnabled: b.data.isEnabled } } : { ok: false };
}
export function checkFriendFollowBody(body: unknown): BodyCheck<boolean> {
  const b = friendFollowBody.safeParse(body);
  return b.success ? { ok: true, value: b.data.isEnabled } : { ok: false };
}
