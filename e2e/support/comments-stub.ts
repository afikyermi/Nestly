// Shared by e2e/comments.spec.ts (I3 F3.3 w1). Shapes from packages/shared/src/validation/comments.ts (merged F3.3 b1): GET /api/posts/:id/comments
// answers {items, nextCursor} (each item with its first 3 replies and replyCount), POST answers 201 {comment}, GET /api/comments/:id/replies answers
// {items, nextCursor} from the oldest, DELETE /api/comments/:id 204, PUT|DELETE /api/posts|comments/:id/like 204. Session, /api/me, /api/profile and
// GET /api/posts/:id come from posts-stub (the post read is overridden here for its like state). Any other /api call is recorded in `stray`.
import type { Page, Route } from '@playwright/test';
import { CORS, NOW, json } from './journeys-stub';
import { OTHERS_ID, setupPosts } from './posts-stub';

export interface StubComment {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  isMine: boolean;
  byAuthor: boolean;
  author?: { name: string | null } | undefined;
  likeCount: number;
  likedByMe: boolean;
}
export interface StubTop extends StubComment {
  /** Every reply the viewer may read, oldest first; the first 3 travel inline. */
  all: StubComment[];
}
export type Fail = number | 'abort' | null;
export interface CommentsNet {
  tops: StubTop[];
  post: { likeCount: number; likedByMe: boolean };
  pageSize: number;
  fail: { thread: Fail; more: Fail; send: Fail; replies: Fail; remove: Fail; likePost: Fail; likeComment: Fail };
  /** 404 for GET /api/comments/:id/replies (the parent is gone). */
  repliesGone: boolean;
  /** GET /api/posts/:id status for the post itself. */
  read: number;
  holdThread: Promise<void> | null;
  holdSend: Promise<void> | null;
  holdReplies: Promise<void> | null;
  /** "METHOD /path?query" of every comments, replies, delete and like call. */
  calls: string[];
  sends: Array<Record<string, unknown>>;
  stray: string[];
}

const ID_BASE = 'e0000000-0000-4000-8000-';
export const cid = (n: number): string => `${ID_BASE}${String(n).padStart(12, '0')}`;
export const comment = (n: number, body: string, extra: Partial<StubComment> = {}): StubComment => ({
  id: cid(n),
  parentId: null,
  body,
  createdAt: new Date(NOW.getTime() - (1000 - n) * 60000).toISOString(),
  isMine: false,
  byAuthor: false,
  author: { name: null },
  likeCount: 0,
  likedByMe: false,
  ...extra,
});
export const top = (n: number, body: string, replies: StubComment[] = [], extra: Partial<StubComment> = {}): StubTop => ({
  ...comment(n, body, extra),
  all: replies.map((r) => ({ ...r, parentId: cid(n) })),
});
const view = (c: StubComment): StubComment => {
  const { id, parentId, body, createdAt, isMine, byAuthor, author, likeCount, likedByMe } = c;
  return { id, parentId, body, createdAt, isMine, byAuthor, ...(author === undefined ? {} : { author }), likeCount, likedByMe };
};
const asRecord = (text: string | null): Record<string, unknown> => {
  const sent: unknown = JSON.parse(text ?? 'null');
  return typeof sent === 'object' && sent !== null ? Object.fromEntries(Object.entries(sent)) : {};
};
const failWith = (route: Route, f: Exclude<Fail, null>) => (f === 'abort' ? route.abort('connectionreset') : json(route, f, { error: 'server_error' }));

export async function setupComments(page: Page, tops: StubTop[] = [], opts: { professional?: boolean } = {}): Promise<CommentsNet> {
  const net: CommentsNet = {
    tops,
    post: { likeCount: 0, likedByMe: false },
    pageSize: 20,
    fail: { thread: null, more: null, send: null, replies: null, remove: null, likePost: null, likeComment: null },
    repliesGone: false,
    read: 200,
    holdThread: null,
    holdSend: null,
    holdReplies: null,
    calls: [],
    sends: [],
    stray: [],
  };
  await page.route('**/api/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    net.stray.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return json(route, 404, { error: 'unstubbed' });
  });
  await setupPosts(page, opts.professional === true ? { professional: true } : {});
  await page.route(/\/api\/posts\/[^/?]+(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() !== 'GET' || !req.url().includes(OTHERS_ID)) return route.fallback();
    if (net.read !== 200) return json(route, net.read, { error: 'not_found' });
    return json(route, 200, { id: OTHERS_ID, body: 'פוסט של מישהי אחרת', audience: 'everyone', stageTag: null, createdAt: '2026-06-14T09:00:00.000Z', isMine: false, ...net.post, commentCount: net.tops.length });
  });
  await page.route(/\/api\/posts\/[^/?]+\/comments(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    net.calls.push(`${req.method()} ${url.pathname}${url.search}`);
    if (req.method() === 'GET') {
      const cursor = url.searchParams.get('cursor');
      if (cursor === null && net.holdThread !== null) await net.holdThread;
      const f = cursor === null ? net.fail.thread : net.fail.more;
      if (f !== null) return failWith(route, f);
      const from = cursor === null ? 0 : Number(cursor);
      const slice = net.tops.slice(from, from + net.pageSize);
      const next = from + net.pageSize < net.tops.length ? String(from + net.pageSize) : null;
      return json(route, 200, { items: slice.map((t) => ({ ...view(t), replies: t.all.slice(0, 3).map(view), replyCount: t.all.length })), nextCursor: next });
    }
    const sent = asRecord(req.postData());
    net.sends.push(sent);
    if (net.holdSend !== null) await net.holdSend;
    if (net.fail.send !== null) return failWith(route, net.fail.send);
    const parent = net.tops.find((t) => t.id === sent.parentId);
    const made = comment(500 + net.sends.length, String(sent.body).trim(), { parentId: parent?.id ?? null, isMine: true, author: { name: 'דנה כהן' }, createdAt: NOW.toISOString() });
    if (parent === undefined) net.tops.push({ ...made, all: [] });
    else parent.all.push(made);
    return json(route, 201, { comment: view(made) });
  });
  await page.route(/\/api\/comments\/[^/?]+\/replies(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    net.calls.push(`${req.method()} ${url.pathname}${url.search}`);
    if (net.holdReplies !== null) await net.holdReplies;
    if (net.repliesGone) return json(route, 404, { error: 'comment_unavailable' });
    if (net.fail.replies !== null) return failWith(route, net.fail.replies);
    const parent = net.tops.find((t) => url.pathname.includes(t.id));
    if (parent === undefined) return json(route, 404, { error: 'comment_unavailable' });
    const from = Number(url.searchParams.get('cursor') ?? 0);
    const next = from + 20 < parent.all.length ? String(from + 20) : null;
    return json(route, 200, { items: parent.all.slice(from, from + 20).map(view), nextCursor: next });
  });
  await page.route(/\/api\/comments\/[^/?]+(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    net.calls.push(`${req.method()} ${path}`);
    if (net.fail.remove !== null) return failWith(route, net.fail.remove);
    const id = path.split('/').pop() ?? '';
    net.tops = net.tops.filter((t) => t.id !== id);
    for (const t of net.tops) t.all = t.all.filter((r) => r.id !== id);
    return route.fulfill({ status: 204, headers: CORS });
  });
  await page.route(/\/api\/(posts|comments)\/[^/?]+\/like$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    net.calls.push(`${req.method()} ${path}`);
    const onPost = path.startsWith('/api/posts/');
    const f = onPost ? net.fail.likePost : net.fail.likeComment;
    if (f !== null) return failWith(route, f);
    const liked = req.method() === 'PUT';
    const target = onPost ? net.post : [...net.tops, ...net.tops.flatMap((t) => t.all)].find((c) => path.includes(c.id));
    if (target !== undefined && target.likedByMe !== liked) {
      target.likedByMe = liked;
      target.likeCount += liked ? 1 : -1;
    }
    return route.fulfill({ status: 204, headers: CORS });
  });
  return net;
}
