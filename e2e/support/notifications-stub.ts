// Shared by e2e/notifications.spec.ts and e2e/search.spec.ts (FR-NOTIF-001/002, FR-SEARCH-001). The stub plays the server: notifications, their
// preferences and search answer in the shapes of packages/shared (the strict response schemas); every write is recorded. Auth, /api/me and
// /api/profile repeat friends-stub.ts.
import type { Page } from '@playwright/test';
import { CORS, EMAIL, NOW, json, session } from './journeys-stub';

export interface StubNotification {
  id: string;
  type: string;
  actorId: string | null;
  actorName: string | null;
  targetKind: 'post' | 'user';
  targetId: string;
  createdAt: string;
  isRead: boolean;
}

export const NID = (n: number): string => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const COMMENT: StubNotification = {
  id: NID(1), type: 'post_comment', actorId: NID(11), actorName: 'דנה לוי', targetKind: 'post', targetId: NID(21),
  createdAt: '2026-06-15T09:00:00.000Z', isRead: false,
};
export const REQUEST: StubNotification = {
  id: NID(2), type: 'friend_request', actorId: NID(12), actorName: 'יוסי כהן', targetKind: 'user', targetId: NID(12),
  createdAt: '2026-06-14T09:00:00.000Z', isRead: false,
};
export const OLD: StubNotification = {
  id: NID(3), type: 'post_shared', actorId: NID(13), actorName: 'מירי אברהם', targetKind: 'post', targetId: NID(22),
  createdAt: '2026-06-10T09:00:00.000Z', isRead: true,
};

export interface NotificationsNet {
  items: StubNotification[];
  categories: { category: string; isEnabled: boolean }[];
  friends: { userId: string; fullName: string; isEnabled: boolean }[];
  /** Status the next write answers: 200 or a failure. */
  write: number;
  writes: { method: string; path: string; body: string | null }[];
  searches: string[];
  /** The next searches answer with the People limit reached. */
  limited: boolean;
}

export async function setupNotifications(page: Page, start: Partial<Pick<NotificationsNet, 'items'>> = {}): Promise<NotificationsNet> {
  const net: NotificationsNet = {
    items: [...(start.items ?? [COMMENT, REQUEST, OLD])],
    categories: [
      { category: 'friends', isEnabled: true },
      { category: 'comments', isEnabled: true },
      { category: 'shares', isEnabled: true },
      { category: 'friend_posts', isEnabled: true },
    ],
    friends: [{ userId: NID(13), fullName: 'מירי אברהם', isEnabled: false }],
    write: 200,
    writes: [],
    searches: [],
    limited: false,
  };
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => {
    Reflect.set(window, 'nestlyRealSession', true);
  });
  const far = Math.floor(new Date(2100, 0, 1).getTime() / 1000);
  await page.route('https://e2e-stub.invalid/auth/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.url().includes('/token')) return json(route, 200, session(far));
    if (req.url().includes('/logout')) return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET' && req.url().includes('/auth/v1/user')) return json(route, 200, { id: 'u-1', email: EMAIL, app_metadata: { provider: 'email' } });
    return json(route, 404, { error: 'unstubbed' });
  });
  await page.route('**/api/me', (route) => json(route, 200, { state: 'active', recoveryQuestions: 'set', mustSetPassword: false }));
  await page.route('**/api/profile', (route) => json(route, 200, { fullName: 'דנה כהן', parentGender: 'woman' }));
  await page.route('**/api/feed**', (route) => json(route, 200, { items: [], nextCursor: null, asOf: '2026-06-15T12:00:00.000000Z' }));
  await page.route('**/api/notifications', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, { items: net.items, unreadCount: net.items.filter((i) => !i.isRead).length });
  });
  await page.route('**/api/notifications/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    net.writes.push({ method: req.method(), path, body: req.postData() });
    if (net.write !== 200) return json(route, net.write, { error: 'internal' });
    if (path.endsWith('/read-all')) net.items = net.items.map((i) => ({ ...i, isRead: true }));
    else net.items = net.items.map((i) => (path.includes(i.id) ? { ...i, isRead: true } : i));
    return json(route, 200, {});
  });
  await page.route('**/api/notification-preferences**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    if (req.method() === 'GET') return json(route, 200, { categories: net.categories, friends: net.friends });
    net.writes.push({ method: req.method(), path, body: req.postData() });
    if (net.write !== 200) return json(route, net.write, { error: 'internal' });
    return json(route, 200, {});
  });
  await page.route('**/api/search**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    net.searches.push(`${url.searchParams.get('q') ?? ''}|${url.searchParams.get('type') ?? ''}`);
    return json(route, 200, {
      people: net.limited ? [] : [{ userId: NID(12), fullName: 'יוסי כהן' }],
      groups: [],
      posts: [{ id: NID(21), authorId: NID(11), authorName: 'דנה לוי', snippet: 'מי מכירה יועצת שינה טובה?', createdAt: '2026-06-15T09:00:00.000Z' }],
      peopleLimited: net.limited,
    });
  });
  return net;
}
