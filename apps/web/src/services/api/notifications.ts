import {
  notificationPreferencesResponse,
  notificationsResponse,
  type NotificationCategory,
  type NotificationPreferencesResponse,
  type NotificationsResponse,
} from '@nestly/shared';

// GET /api/notifications, POST /api/notifications/read-all, POST /api/notifications/:id/read, GET /api/notification-preferences,
// PUT /api/notification-preferences/categories/:category and /friends/:userId (FR-NOTIF-001/002/003). The caller is never named. Only the
// status, the one `error` code and a body that passes the shared response schema are read; no response text reaches the screen.
export type NotificationsOutcome =
  | { kind: 'list'; data: NotificationsResponse }
  | { kind: 'preferences'; data: NotificationPreferencesResponse }
  | { kind: 'done' }
  | { kind: 'unauthenticated' } // 401
  | { kind: 'account-unavailable' } // 403 account_unavailable (ERR-037)
  | { kind: 'gone' } // 404: not the caller's notification, or not a Friend
  | { kind: 'failed' };

type Reads = 'list' | 'preferences' | 'status';
interface Call {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  reads: Reads;
  body?: unknown;
}

async function call(accessToken: string, init: Call): Promise<NotificationsOutcome> {
  let response: Response;
  try {
    response = await fetch(init.path, {
      method: init.method,
      headers: { authorization: `Bearer ${accessToken}`, ...(init.body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      cache: 'no-store',
    });
  } catch {
    return { kind: 'failed' };
  }
  if (response.status === 401) return { kind: 'unauthenticated' };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: 'failed' };
  }
  const code = typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
  if (response.status === 403) return code === 'account_unavailable' ? { kind: 'account-unavailable' } : { kind: 'failed' };
  if (response.status === 404) return { kind: 'gone' };
  if (response.status !== 200) return { kind: 'failed' };
  if (init.reads === 'status') return { kind: 'done' };
  if (init.reads === 'list') {
    const parsed = notificationsResponse.safeParse(body);
    return parsed.success ? { kind: 'list', data: parsed.data } : { kind: 'failed' };
  }
  const parsed = notificationPreferencesResponse.safeParse(body);
  return parsed.success ? { kind: 'preferences', data: parsed.data } : { kind: 'failed' };
}

export const fetchNotifications = (token: string) => call(token, { method: 'GET', path: '/api/notifications', reads: 'list' });
export const markAllNotificationsRead = (token: string) => call(token, { method: 'POST', path: '/api/notifications/read-all', reads: 'status' });
export const markNotificationRead = (token: string, id: string) =>
  call(token, { method: 'POST', path: `/api/notifications/${encodeURIComponent(id)}/read`, reads: 'status' });
export const fetchNotificationPreferences = (token: string) =>
  call(token, { method: 'GET', path: '/api/notification-preferences', reads: 'preferences' });
export const putNotificationCategory = (token: string, category: NotificationCategory, isEnabled: boolean) =>
  call(token, { method: 'PUT', path: `/api/notification-preferences/categories/${category}`, reads: 'status', body: { isEnabled } });
export const putFriendFollow = (token: string, userId: string, isEnabled: boolean) =>
  call(token, { method: 'PUT', path: `/api/notification-preferences/friends/${encodeURIComponent(userId)}`, reads: 'status', body: { isEnabled } });
