// Shared by e2e/posts.spec.ts (I3 F3.1b, criteria 14, 17, 18). Derived from .work/post-create/spec.md and screen.md only; routes and
// shapes from packages/shared/src/validation/posts.ts (merged F3.1a). The stub plays the server: POST /api/posts answers 201 with the
// stored post; GET|PATCH|DELETE /api/posts/:id answer 200 (GET adds isMine), 204 for a delete, 404 {error:'not_found'} for an id not
// stored. GET /api/profile answers the Regular's profile, or 404 no_profile for a Professional. Auth and /api/me repeat friends-stub.
import type { Page } from '@playwright/test';
import { CORS, EMAIL, NOW, json, session } from './journeys-stub';

export interface StoredPost {
  id: string;
  body: string;
  audience: 'everyone' | 'friends';
  stageTag: 'planning' | 'pregnant' | 'has_child' | null;
  createdAt: string;
  isMine: boolean;
  /** F3.4: absent = a named post. */
  isAnonymous?: boolean;
}
export interface PostsNet {
  posts: StoredPost[];
  /** Status the next POST /api/posts answers: 201, a failure status, or 'abort'. */
  create: number | 'abort';
  /** Status of the next PATCH / DELETE. */
  edit: number | 'abort';
  remove: number | 'abort';
  /** GET /api/posts/:id: 200 or a failure status. */
  read: number;
  holdCreate: Promise<void> | null;
  creates: Array<Record<string, unknown>>;
  edits: Array<Record<string, unknown>>;
  deletes: string[];
}

export const POST_ID = 'd0000000-0000-4000-8000-000000000001';
export const OTHERS_ID = 'd0000000-0000-4000-8000-000000000002';
export const MINE: StoredPost = { id: POST_ID, body: 'שאלה על שינה\nבשעות הלילה', audience: 'everyone', stageTag: 'pregnant', createdAt: '2026-06-14T09:00:00.000Z', isMine: true };
export const OTHERS: StoredPost = { ...MINE, id: OTHERS_ID, body: 'פוסט של מישהי אחרת', stageTag: null, isMine: false };
// F3.4 (.work/anonymous-post/spec.md c12-c14): an anonymous post as its real author reads it (isMine true), and as anyone else does. The server never sends an author.
export const ANON_MINE_ID = 'd0000000-0000-4000-8000-000000000003';
export const ANON_OTHERS_ID = 'd0000000-0000-4000-8000-000000000004';
export const ANON_MINE: StoredPost = { ...MINE, id: ANON_MINE_ID, body: 'שאלה אנונימית שלי', stageTag: null, isMine: true, isAnonymous: true };
export const ANON_OTHERS: StoredPost = { ...OTHERS, id: ANON_OTHERS_ID, body: 'שאלה אנונימית של מישהי', isMine: false, isAnonymous: true };

export async function setupPosts(page: Page, start: { posts?: StoredPost[]; professional?: boolean } = {}): Promise<PostsNet> {
  const net: PostsNet = { posts: [...(start.posts ?? [MINE, OTHERS])], create: 201, edit: 200, remove: 204, read: 200, holdCreate: null, creates: [], edits: [], deletes: [] };
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
    if (start.professional === true) return json(route, 404, { error: 'no_profile' });
    return json(route, 200, { fullName: 'דנה כהן', parentGender: 'woman' });
  });
  await page.route('**/api/posts', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const sent: unknown = JSON.parse(req.postData() ?? 'null');
    const body: Record<string, unknown> = typeof sent === 'object' && sent !== null ? Object.fromEntries(Object.entries(sent)) : {};
    net.creates.push(body);
    if (net.holdCreate !== null) await net.holdCreate;
    if (net.create === 'abort') return route.abort('connectionreset');
    if (body.isAnonymous === true && body.audience === 'friends') return json(route, 422, { error: 'audience_not_allowed' });
    if (net.create !== 201) return json(route, net.create, { error: net.create === 403 ? 'not_allowed' : net.create === 422 ? 'audience_not_allowed' : 'server_error' });
    const stored: StoredPost = {
      id: `d0000000-0000-4000-8000-${String(100 + net.creates.length).padStart(12, '0')}`,
      body: String(body.body).trim(),
      audience: body.audience === 'friends' ? 'friends' : 'everyone',
      stageTag: body.stageTag === 'planning' || body.stageTag === 'pregnant' || body.stageTag === 'has_child' ? body.stageTag : null,
      createdAt: NOW.toISOString(),
      isMine: true,
      isAnonymous: body.isAnonymous === true,
    };
    net.posts.push(stored);
    return json(route, 201, { id: stored.id, body: stored.body, audience: stored.audience, stageTag: stored.stageTag, createdAt: stored.createdAt, isAnonymous: stored.isAnonymous === true });
  });
  await page.route(/\/api\/posts\/[^/?]+(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const id = new URL(req.url()).pathname.split('/').pop() ?? '';
    const found = net.posts.find((p) => p.id === id);
    if (req.method() === 'GET') {
      if (net.read !== 200) return json(route, net.read, { error: 'server_error' });
      return found === undefined ? json(route, 404, { error: 'not_found' }) : json(route, 200, { ...found, isAnonymous: found.isAnonymous === true, likeCount: 0, commentCount: 0, likedByMe: false });
    }
    if (found === undefined || !found.isMine) return json(route, 404, { error: 'not_found' });
    if (req.method() === 'PATCH') {
      const sent: unknown = JSON.parse(req.postData() ?? 'null');
      const body: Record<string, unknown> = typeof sent === 'object' && sent !== null ? Object.fromEntries(Object.entries(sent)) : {};
      net.edits.push(body);
      if (net.edit === 'abort') return route.abort('connectionreset');
      if (found.isAnonymous === true && body.audience === 'friends') return json(route, 422, { error: 'audience_not_allowed' });
      if (net.edit !== 200) return json(route, net.edit, { error: net.edit === 422 ? 'audience_not_allowed' : 'server_error' });
      if (typeof body.body === 'string') found.body = body.body.trim();
      if (body.audience === 'friends' || body.audience === 'everyone') found.audience = body.audience;
      if ('stageTag' in body) found.stageTag = body.stageTag === 'planning' || body.stageTag === 'pregnant' || body.stageTag === 'has_child' ? body.stageTag : null;
      return json(route, 200, { id: found.id, body: found.body, audience: found.audience, stageTag: found.stageTag, createdAt: found.createdAt, isAnonymous: found.isAnonymous === true });
    }
    net.deletes.push(id);
    if (net.remove === 'abort') return route.abort('connectionreset');
    if (net.remove !== 204) return json(route, net.remove, { error: 'server_error' });
    net.posts = net.posts.filter((p) => p.id !== id);
    return route.fulfill({ status: 204, headers: CORS });
  });
  return net;
}
