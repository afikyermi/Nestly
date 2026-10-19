// Shared by e2e/feed.spec.ts (I3 F3.2b, criteria 13-20). Derived from .work/feed-view/spec.md and screen.md only; the response shape is
// packages/shared/src/feed/response.ts (the strict feedPageResponse), the route is GET /api/feed?cursor=. Auth, /api/me, /api/profile and
// the single-post routes are posts-stub's. The stub plays the server: `answer` decides each GET /api/feed; every request is recorded.
import type { Page } from '@playwright/test';
import { CORS, json, session } from './journeys-stub';
import { setupPosts } from './posts-stub';
import type { PostsNet, StoredPost } from './posts-stub';

export const id = (n: number): string => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export type Unit = Record<string, unknown>;
export interface FeedPage { items: Unit[]; nextCursor: string | null; configVersion: number; restarted?: boolean }
/** What one GET /api/feed gets: a page, a failure status, or a dropped connection. */
export type Answer = FeedPage | number | 'abort';

export const named = (n: number, over: Unit = {}): Unit => ({
  id: id(n),
  kind: 'post',
  source: 'organic',
  body: `גוף הפוסט ${n}`,
  audience: 'everyone',
  stageTag: null,
  createdAt: `2026-06-14T09:${String(10 + (n % 50))}:00.000Z`,
  isMine: false,
  isAnonymous: false,
  author: { name: `כותבת מספר ${n}` },
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  ...over,
});
export const anonymous = (n: number, over: Unit = {}): Unit => {
  const base = named(n);
  delete base.author;
  return { ...base, isAnonymous: true, ...over };
};
export const originalOf = (n: number, over: Unit = {}): Unit => ({
  available: true,
  id: id(n),
  body: `גוף המקור ${n}`,
  audience: 'everyone',
  createdAt: '2026-06-13T08:00:00.000Z',
  isAnonymous: false,
  author: { name: `מחברת המקור ${n}` },
  ...over,
});
export const share = (n: number, original: Unit, over: Unit = {}): Unit => {
  return { ...named(n), kind: 'share', body: null, sharerText: `מה שהוספתי ${n}`, original, ...over };
};
export const range = (from: number, to: number): Unit[] => Array.from({ length: to - from + 1 }, (_v, i) => named(from + i));
export const pageOf = (items: Unit[], nextCursor: string | null, extra: Partial<FeedPage> = {}): FeedPage => ({ items, nextCursor, configVersion: 1, ...extra });
export const EMPTY: FeedPage = pageOf([], null);

export interface FeedNet extends PostsNet {
  /** The `cursor` of every GET /api/feed, in order (null: none sent). */
  cursors: Array<string | null>;
  /** Methods of every /api/feed request (all must be GET). */
  methods: string[];
  /** Every request path under /api/ the page made. */
  apiPaths: string[];
  /** Decides the answer to a request (n is 0-based). */
  answer: (cursor: string | null, n: number) => Answer;
  /** While set, every feed answer waits for it. */
  hold: Promise<void> | null;
  /** False while signing in (the landing page already asks for the feed): such requests get an empty page and are not recorded. */
  armed: boolean;
  /** The user id the next sign-in or refresh puts in the access token's `sub` (the web names the remembered feed's owner by it). */
  sub: string;
  /** "METHOD /api/(posts|comments)/:id/like" of every like call, in order. */
  likeCalls: string[];
  /** What a like call answers: 204, a failure status or a dropped connection. */
  likeAnswer: number | 'abort';
  /** While set, every like call waits for it. */
  holdLike: Promise<void> | null;
}

export const USER_A = 'f0000000-0000-4000-8000-0000000000a1';
export const USER_B = 'f0000000-0000-4000-8000-0000000000b2';
/** An unsigned JWT-shaped token naming `sub` (the stub Auth does not verify; the web only reads the claim). */
export function tokenFor(sub: string): string {
  const part = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub, role: 'authenticated' })}.sig`;
}

export async function setupFeed(page: Page, answer: FeedNet['answer'], start: { professional?: boolean; posts?: StoredPost[] } = {}): Promise<FeedNet> {
  const posts = await setupPosts(page, { professional: start.professional === true, ...(start.posts === undefined ? {} : { posts: start.posts }) });
  const extra: Pick<FeedNet, 'cursors' | 'methods' | 'apiPaths' | 'answer' | 'hold' | 'armed' | 'sub' | 'likeCalls' | 'likeAnswer' | 'holdLike'> = {
    cursors: [], methods: [], apiPaths: [], answer, hold: null, armed: false, sub: USER_A, likeCalls: [], likeAnswer: 204, holdLike: null,
  };
  const net: FeedNet = Object.assign(posts, extra);
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (net.armed && url.pathname.startsWith('/api/')) net.apiPaths.push(url.pathname);
  });
  // Registered after posts-stub's Auth route, so it answers first: a token that names `net.sub`.
  await page.route('https://e2e-stub.invalid/auth/v1/token**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const base = session(Math.floor(new Date(2100, 0, 1).getTime() / 1000));
    return json(route, 200, { ...base, access_token: tokenFor(net.sub), user: { ...base.user, id: net.sub } });
  });
  await page.route(/\/api\/feed(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (!net.armed) return json(route, 200, EMPTY);
    const n = net.cursors.length;
    const cursor = new URL(req.url()).searchParams.get('cursor');
    net.cursors.push(cursor);
    net.methods.push(req.method());
    if (net.hold !== null) await net.hold;
    const out = net.answer(cursor, n);
    if (out === 'abort') return route.abort('connectionreset');
    if (typeof out === 'number') return json(route, out, { error: out === 403 ? 'not_allowed' : 'internal' });
    return json(route, 200, out);
  });
  // F3.3 w2: PUT|DELETE /api/(posts|comments)/:id/like (204 by default) and the post page's thread (empty), so a card's link can be followed.
  await page.route(/\/api\/(posts|comments)\/[^/?]+\/like$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    net.likeCalls.push(`${req.method()} ${new URL(req.url()).pathname}`);
    if (net.holdLike !== null) await net.holdLike;
    if (net.likeAnswer === 'abort') return route.abort('connectionreset');
    if (net.likeAnswer !== 204) return json(route, net.likeAnswer, { error: 'internal' });
    return route.fulfill({ status: 204, headers: CORS });
  });
  await page.route(/\/api\/posts\/[^/?]+\/comments(\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, { items: [], nextCursor: null });
  });
  return net;
}
