// Shared by e2e/friends.spec.ts (I2 F2.4b, PG-036). Derived from .work/friends/spec.md only (F2.4b c13-c15 and "Gate 1
// clarifications (F2.4a)": routes and response shapes). The stub plays the server: GET /api/friends answers {incoming, sent,
// friends}; POST /api/friend-requests/:id/accept|decline, DELETE /api/friend-requests/:id (cancel) and DELETE /api/friends/:id
// (remove) answer {} (200) and move the entry. The auth, /api/me and /api/profile stubs repeat journeys-stub.ts.
import type { Page, Route } from '@playwright/test';
import { CORS, EMAIL, NOW, json, session } from './journeys-stub';

export interface Person {
  userId: string;
  fullName: string;
}
export interface Incoming extends Person {
  requestedAt: string;
}
export interface Sent {
  method: string;
  path: string;
  raw: string | null;
}
export interface FriendsNet {
  incoming: Incoming[];
  sent: Incoming[];
  friends: Person[];
  /** Status the next GET /api/friends answers: 200, a failure status, or 'abort'. */
  get: number | 'abort';
  /** Status the next action answers: 200, 404/409/500, or 'abort'. 409 answers {error:'request_gone'}. */
  write: number | 'abort';
  /** When a 409 is answered, also drop the entry from the stored lists (the other side already acted). */
  dropOn409: boolean;
  holdGet: Promise<void> | null;
  holdWrite: Promise<void> | null;
  gets: number;
  actions: Sent[];
}

export const ID = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const DANA: Incoming = { userId: ID(1), fullName: 'דנה לוי', requestedAt: '2026-06-14T09:00:00Z' };
export const YOSSI: Incoming = { userId: ID(2), fullName: 'יוסי כהן', requestedAt: '2026-06-13T09:00:00Z' };
export const MIRI: Person = { userId: ID(3), fullName: 'מירי אברהם' };
export const AVI: Person = { userId: ID(4), fullName: 'אבי שמש' };
export const NOAM: Incoming = { userId: ID(5), fullName: 'נעם פרידמן', requestedAt: '2026-06-12T09:00:00Z' };

export const TEXT = {
  incoming: 'בקשות שקיבלת',
  sent: 'בקשות ששלחת',
  friends: 'החברים שלי',
  accept: 'אישור',
  decline: 'דחייה',
  cancel: 'ביטול',
  remove: 'הסרה',
  retry: 'נסו שוב',
  gone: 'הבקשה כבר לא זמינה',
  menu: 'חברים',
} as const;

const ACTION = /^\/api\/(friend-requests\/([^/]+)\/(accept|decline)|friend-requests\/([^/]+)|friends\/([^/]+))$/;

export async function setupFriends(page: Page, start: { incoming?: Incoming[]; sent?: Incoming[]; friends?: Person[] } = {}): Promise<FriendsNet> {
  const net: FriendsNet = {
    incoming: [...(start.incoming ?? [DANA, YOSSI])],
    sent: [...(start.sent ?? [NOAM])],
    friends: [...(start.friends ?? [MIRI, AVI])],
    get: 200, write: 200, dropOn409: true, holdGet: null, holdWrite: null, gets: 0, actions: [],
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
  await page.route('**/api/me', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, { state: 'active', recoveryQuestions: 'set', mustSetPassword: false });
  });
  await page.route('**/api/profile', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, { fullName: 'דנה כהן', parentGender: 'woman' });
  });
  await page.route('**/api/friends', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    net.gets += 1;
    if (net.holdGet !== null) await net.holdGet;
    if (net.get === 'abort') return route.abort('connectionreset');
    if (net.get !== 200) return json(route, net.get, { error: 'internal' });
    return json(route, 200, { incoming: net.incoming, sent: net.sent, friends: net.friends });
  });
  await page.route(/\/api\/(friend-requests|friends)\/[^?]+(\?.*)?$/, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    net.actions.push({ method: req.method(), path, raw: req.postData() });
    if (net.holdWrite !== null) await net.holdWrite;
    if (net.write === 'abort') return route.abort('connectionreset');
    const m = ACTION.exec(path);
    const target = m?.[2] ?? m?.[4] ?? m?.[5] ?? '';
    const kind = m?.[3] ?? (m?.[4] !== undefined ? 'cancel' : 'remove');
    if (net.write === 409) {
      if (net.dropOn409) {
        net.incoming = net.incoming.filter((e) => e.userId !== target);
        net.sent = net.sent.filter((e) => e.userId !== target);
      }
      return json(route, 409, { error: 'request_gone' });
    }
    if (net.write !== 200) return json(route, net.write, { error: net.write === 404 ? 'unavailable' : 'internal' });
    const fromIncoming = net.incoming.find((e) => e.userId === target);
    if (kind === 'accept' && fromIncoming !== undefined) net.friends.push({ userId: fromIncoming.userId, fullName: fromIncoming.fullName });
    if (kind === 'accept' || kind === 'decline') net.incoming = net.incoming.filter((e) => e.userId !== target);
    if (kind === 'cancel') net.sent = net.sent.filter((e) => e.userId !== target);
    if (kind === 'remove') net.friends = net.friends.filter((e) => e.userId !== target);
    return json(route, 200, {});
  });
  return net;
}
