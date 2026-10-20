// Notifications (FR-NOTIF-001/002): the checks the web and the server share.
import { z } from 'zod';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_TARGET_KINDS, NOTIFICATION_TYPES } from '../constants/notifications.js';

/**
 * Who did it, as the list may say it: `named` (actorName is the name the database shows), `hidden` (a person whose name the database does
 * not show, so the list says "מישהו"; no id is sent), `author` (the anonymous post's own author, "המחבר"). No actor id ever leaves the server.
 */
export const NOTIFICATION_ACTORS = ['named', 'hidden', 'author'] as const;
export type NotificationActor = (typeof NOTIFICATION_ACTORS)[number];

/** One notification as the list shows it. `actorName` is set exactly when `actor` is `named`. */
export const notificationItem = z.strictObject({
  id: z.guid(),
  type: z.enum(NOTIFICATION_TYPES),
  actor: z.enum(NOTIFICATION_ACTORS),
  actorName: z.string().nullable(),
  targetKind: z.enum(NOTIFICATION_TARGET_KINDS),
  targetId: z.guid(),
  createdAt: z.iso.datetime(),
  isRead: z.boolean(),
});
export type NotificationItem = z.infer<typeof notificationItem>;

/**
 * GET /api/notifications[?before=<cursor>]: a page of the caller's notifications, newest first, and the unread count (the bell). `nextCursor`
 * asks for the next older page; null when there is none.
 */
export const notificationsResponse = z.strictObject({
  items: z.array(notificationItem),
  unreadCount: z.number().int().min(0),
  nextCursor: z.string().max(200).nullable(),
});

/** The notifications cursor: the last item's time (microseconds, UTC) and id. Opaque to the web app. */
const cursorShape = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export type NotificationsCursor = { at: string; id: string };
export function serializeNotificationsCursor(cursor: NotificationsCursor): string {
  return `${cursor.at}_${cursor.id}`;
}
export function parseNotificationsCursor(raw: unknown): NotificationsCursor | null | 'invalid' {
  if (raw === undefined) return null;
  if (typeof raw !== 'string') return 'invalid';
  const m = cursorShape.exec(raw);
  return m === null || m[1] === undefined || m[2] === undefined ? 'invalid' : { at: m[1], id: m[2] };
}
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
