// Shared by e2e/user-profile.spec.ts (I2 F2.4c2: another Regular's profile screen, copy link, actions). Derived from
// .work/friends/spec.md only: criteria 25-30, the Gate 1 clarifications (F2.4a: routes and bodies; F2.4c1: viewer response keys,
// 429 {error:"rate_limited"}) and packages/shared's strict response type (names only). ASSUMED, to be aligned with BUILDER:
//   - the viewer API is GET /api/profiles/:userId ("name may change", spec c16) and the screen route is /u/:userId (c25 "may change");
//   - the caller's own id is the session's user id (the Auth token response), also returned by GET /auth/v1/user here.
// The stub plays the server. It composes friends-stub.ts (auth, /api/me, /api/profile, GET /api/friends) and adds the viewer route
// and the F2.4a actions as they move the relationship of ONE profile: send none->sent, cancel sent->none, accept received->friends,
// decline received->none, remove friends->none. A profile can carry `whenFriend`: what the viewer API returns once it is a Friend.
import type { Page, Route } from '@playwright/test';
import { CORS, json, session } from './journeys-stub';
import { setupFriends } from './friends-stub';
import type { FriendsNet, Person } from './friends-stub';

export type Rel = 'none' | 'sent' | 'received' | 'friends';
export type Gender = 'woman' | 'man' | 'other' | 'prefer_not_to_say';
export interface View {
  fullName: string;
  gender: Gender | null;
  childrenCount: number;
  childAges: Array<{ years: number; months: number }> | null;
  isPregnant: boolean;
  showsEmptyJourneySentence: boolean;
  relationship: Rel | null;
  friends: Array<{ userId: string; fullName: string }>;
  mutualFriends: Array<{ userId: string; fullName: string }>;
}
export interface Stored {
  view: View;
  /** Merged over `view` while the relationship is 'friends' (F2.3 Open view for a Friend, DR-2). */
  whenFriend?: Partial<View>;
}
export interface Act {
  method: string;
  path: string;
  raw: string | null;
}
export interface ProfilesNet {
  friendsNet: FriendsNet;
  profiles: Record<string, Stored>;
  /** Status the viewer route answers for an id, by id; absent = 200 when stored, else 404. */
  mode: Record<string, number | 'abort'>;
  holdView: Promise<void> | null;
  /** Ids the viewer route was asked for, in order, and whether each carried a bearer token. */
  views: string[];
  viewHadToken: boolean[];
  /** The next action's status: 200, 404/409/500, or 'abort'; a 409 answers {error: conflictCode} and moves the relationship to `afterConflict`. */
  write: number | 'abort';
  conflictCode: string;
  afterConflict: Rel;
  holdWrite: Promise<void> | null;
  acts: Act[];
  me: 'active' | 401;
}

export const OWN_ID = session(0).user.id;
export const ID = (n: number): string => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const entry = (p: Person): { userId: string; fullName: string } => ({ userId: p.userId, fullName: p.fullName });

export const TEXT = {
  send: 'שליחת בקשת חברות',
  undo: 'ביטול הבקשה',
  accept: 'אישור',
  decline: 'דחייה',
  remove: 'הסרה מהחברים',
  dialogRemove: 'הסרה',
  dialogCancel: 'ביטול',
  unavailable: 'הפרופיל לא זמין',
  retry: 'נסו שוב',
  gone: 'הבקשה כבר לא זמינה',
  removeGone: 'האדם הזה כבר לא ברשימת החברים',
  copy: 'העתקת הקישור לפרופיל שלי',
  copied: 'הקישור הועתק',
  mutual: 'חברים משותפים',
  pregnant: 'בהריון',
  emptySentence: 'עוד אין כאן ילדים, אז הקפה עדיין מגיע חם ☕',
  expired: 'ההתחברות פגה. אפשר להתחבר שוב',
} as const;
export const friendsOf = (name: string): string => `החברים של ${name}`;
export const GENDER_LABEL = { woman: 'אישה', man: 'גבר', other: 'אחר', prefer_not_to_say: 'מעדיפים לא לציין' } as const;

const ACT = /^\/api\/(friend-requests|friends)(\/[^/]+)?(\/(accept|decline))?$/;

export function bodyOf(net: ProfilesNet, id: string): View | null {
  const p = net.profiles[id];
  if (p === undefined) return null;
  const merged: View = p.view.relationship === 'friends' && p.whenFriend !== undefined ? { ...p.view, ...p.whenFriend } : { ...p.view };
  return merged;
}

export async function setupProfiles(page: Page, profiles: Record<string, Stored>, friendsStart: Parameters<typeof setupFriends>[1] = {}): Promise<ProfilesNet> {
  const friendsNet = await setupFriends(page, friendsStart);
  const net: ProfilesNet = {
    friendsNet, profiles, mode: {}, holdView: null, views: [], viewHadToken: [], write: 200, conflictCode: 'request_gone', afterConflict: 'none',
    holdWrite: null, acts: [], me: 'active',
  };
  // A real Supabase access token is a JWT whose `sub` is the user id; the web may read the caller's own id from it.
  const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url');
  const far = Math.floor(new Date(2100, 0, 1).getTime() / 1000);
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: OWN_ID, aud: 'authenticated', role: 'authenticated', email: 'dana.cohen@example.com', exp: far })}.e2e-signature`;
  await page.route(
    (url) => url.host === 'e2e-stub.invalid' && url.pathname === '/auth/v1/token',
    async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fallback();
      return json(route, 200, { ...session(far), access_token: jwt });
    },
  );
  // The caller's own id: the same one the Auth token response carries (friends-stub answers /user with another id).
  await page.route(
    (url) => url.host === 'e2e-stub.invalid' && url.pathname === '/auth/v1/user',
    async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fallback();
      return json(route, 200, { id: OWN_ID, email: 'dana.cohen@example.com', app_metadata: { provider: 'email' } });
    },
  );
  await page.route('**/api/me', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (net.me === 401) return route.fulfill({ status: 401, headers: { ...CORS, 'content-type': 'application/json', 'www-authenticate': 'Bearer' }, body: '{"error":"unauthenticated"}' });
    return json(route, 200, { state: 'active', recoveryQuestions: 'set', mustSetPassword: false });
  });
  await page.route('**/api/journeys', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, { journeys: [{ id: 'j-1', stage: 'planning', dueDate: null }], children: [] });
  });
  await page.route(
    (url) => /^\/api\/profiles\/[^/]+$/.test(url.pathname),
    async (route: Route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const id = decodeURIComponent(new URL(req.url()).pathname.split('/').pop() ?? '');
      net.views.push(id);
      net.viewHadToken.push((req.headers()['authorization'] ?? '').startsWith('Bearer '));
      if (net.holdView !== null) await net.holdView;
      const body = bodyOf(net, id);
      const mode = net.mode[id] ?? (body === null ? 404 : 200);
      if (mode === 'abort') return route.abort('connectionreset');
      if (mode === 401) return route.fulfill({ status: 401, headers: { ...CORS, 'content-type': 'application/json', 'www-authenticate': 'Bearer' }, body: '{"error":"unauthenticated"}' });
      if (mode === 404) return json(route, 404, { error: 'unavailable' });
      if (mode === 429) return json(route, 429, { error: 'rate_limited' });
      if (mode !== 200 || body === null) return json(route, mode === 200 ? 404 : mode, { error: 'internal' });
      return json(route, 200, body);
    },
  );
  await page.route(
    (url) => ACT.test(url.pathname),
    async (route: Route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      if (req.method() === 'GET') return route.fallback();
      const path = new URL(req.url()).pathname;
      const m = ACT.exec(path);
      const raw = req.postData();
      net.acts.push({ method: req.method(), path, raw });
      let target = (m?.[2] ?? '').replace('/', '');
      if (m?.[1] === 'friend-requests' && req.method() === 'POST' && m[2] === undefined) {
        try {
          const parsed: unknown = JSON.parse(raw ?? 'null');
          const t: unknown = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'targetUserId') : undefined;
          target = typeof t === 'string' ? t : '';
        } catch {
          target = '';
        }
      }
      if (net.holdWrite !== null) await net.holdWrite;
      if (net.write === 'abort') return route.abort('connectionreset');
      const stored = net.profiles[target];
      if (net.write === 409) {
        if (stored !== undefined && stored.view.relationship !== null) stored.view = { ...stored.view, relationship: net.afterConflict };
        return json(route, 409, { error: net.conflictCode });
      }
      if (net.write !== 200) return json(route, net.write, { error: net.write === 404 ? 'unavailable' : 'internal' });
      const verb = m?.[4] ?? (m?.[1] === 'friends' ? 'remove' : req.method() === 'POST' ? 'send' : 'cancel');
      if (stored !== undefined && stored.view.relationship !== null) {
        const next: Record<string, Rel> = { send: 'sent', cancel: 'none', accept: 'friends', decline: 'none', remove: 'none' };
        stored.view = { ...stored.view, relationship: next[verb] ?? stored.view.relationship };
      }
      return json(route, verb === 'send' ? 201 : 200, {});
    },
  );
  return net;
}
