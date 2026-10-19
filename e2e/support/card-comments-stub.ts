// Shared by e2e/ux-polish-a.spec.ts (I3 ux-polish-a, comments inside the feed card). Derived from .work/ux-polish-a/spec.md and screen.md only. The stub plays the
// server for the F3.3/F3.7 endpoints as built: GET|POST /api/posts/:id/comments, GET /api/comments/:id/replies, DELETE /api/comments/:id, GET /api/posts/:id (the
// anonymous card's `isMine` read, from posts-stub), POST /api/reports. The feed (GET /api/feed) and the like routes are feed-stub's; these routes are registered
// after it, so they win. One thread per post id. Every comments-side call is recorded as "METHOD /path?query".
import type { Page } from '@playwright/test';
import { CORS, json } from './journeys-stub';
import { comment, top } from './comments-stub';
import type { StubComment, StubTop } from './comments-stub';
import { id, pageOf, setupFeed } from './feed-stub';
import type { FeedNet, Unit } from './feed-stub';
import type { StoredPost } from './posts-stub';
import { stubReports } from './report-stub';
import type { ReportsNet } from './report-stub';

export { comment, top, id };
export type { StubComment, StubTop };
type Fail = number | 'abort' | null;

export interface CardNet {
  feed: FeedNet;
  reports: ReportsNet;
  /** The thread each post id answers with (top-level comments, oldest first). A post id with no entry has an empty thread. */
  threads: Record<string, StubTop[]>;
  pageSize: number;
  fail: { thread: Fail; more: Fail; send: Fail; replies: Fail; remove: Fail };
  /** Post ids whose comments and post reads answer 404. */
  gone: Set<string>;
  /** Post ids whose real author is the signed-in caller on an anonymous post: the server answers her comment as "המחבר" (byAuthor, no author). */
  anonymousAuthorOf: Set<string>;
  holdThread: Promise<void> | null;
  holdSend: Promise<void> | null;
  holdRead: Promise<void> | null;
  /** "METHOD /path?query" of every comments, replies and delete call, in order. */
  calls: string[];
  /** Post ids read by GET /api/posts/:id, in order. */
  reads: string[];
  sends: Array<Record<string, unknown>>;
}

const view = (c: StubComment): StubComment => {
  const { id: cid, parentId, body, createdAt, isMine, byAuthor, author, likeCount, likedByMe } = c;
  return { id: cid, parentId, body, createdAt, isMine, byAuthor, ...(author === undefined ? {} : { author }), likeCount, likedByMe };
};
const asRecord = (text: string | null): Record<string, unknown> => {
  const sent: unknown = JSON.parse(text ?? 'null');
  return typeof sent === 'object' && sent !== null ? Object.fromEntries(Object.entries(sent)) : {};
};
const postIdOf = (pathname: string): string => pathname.split('/')[3] ?? '';
const gateOf = (): { promise: Promise<void>; release: () => void } => {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
export const gate = gateOf;

export async function setupCardComments(page: Page, items: Unit[], threads: Record<string, StubTop[]> = {}, opts: { posts?: StoredPost[] } = {}): Promise<CardNet> {
  const feed = await setupFeed(page, () => pageOf(items, null), { ...(opts.posts === undefined ? {} : { posts: opts.posts }) });
  const net: CardNet = {
    feed,
    reports: await stubReports(page),
    threads,
    pageSize: 20,
    fail: { thread: null, more: null, send: null, replies: null, remove: null },
    gone: new Set(),
    anonymousAuthorOf: new Set(),
    holdThread: null,
    holdSend: null,
    holdRead: null,
    calls: [],
    reads: [],
    sends: [],
  };
  const failWith = (route: Parameters<Parameters<Page['route']>[1]>[0], f: Exclude<Fail, null>) => (f === 'abort' ? route.abort('connectionreset') : json(route, f, { error: 'server_error' }));
  // The post read: recorded, optionally held, 404 for a gone post; otherwise posts-stub answers (isMine / isAnonymous from the stored post).
  await page.route(/\/api\/posts\/[^/?]+(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    const pid = postIdOf(new URL(req.url()).pathname);
    net.reads.push(pid);
    if (net.holdRead !== null) await net.holdRead;
    if (net.gone.has(pid)) return json(route, 404, { error: 'not_found' });
    return route.fallback();
  });
  await page.route(/\/api\/posts\/[^/?]+\/comments(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    const pid = postIdOf(url.pathname);
    net.calls.push(`${req.method()} ${url.pathname}${url.search}`);
    const tops = (net.threads[pid] ??= []);
    if (req.method() === 'GET') {
      const cursor = url.searchParams.get('cursor');
      if (cursor === null && net.holdThread !== null) await net.holdThread;
      if (net.gone.has(pid)) return json(route, 404, { error: 'not_found' });
      const f = cursor === null ? net.fail.thread : net.fail.more;
      if (f !== null) return failWith(route, f);
      const from = cursor === null ? 0 : Number(cursor);
      const next = from + net.pageSize < tops.length ? String(from + net.pageSize) : null;
      return json(route, 200, { items: tops.slice(from, from + net.pageSize).map((t) => ({ ...view(t), replies: t.all.slice(0, 3).map(view), replyCount: t.all.length })), nextCursor: next });
    }
    const sent = asRecord(req.postData());
    net.sends.push(sent);
    if (net.holdSend !== null) await net.holdSend;
    if (net.fail.send !== null) return failWith(route, net.fail.send);
    const parent = tops.find((t) => t.id === sent.parentId);
    const made = comment(500 + net.sends.length, String(sent.body).trim(), {
      parentId: parent?.id ?? null,
      isMine: true,
      createdAt: new Date(2026, 5, 15, 12, 0, 0).toISOString(),
      ...(net.anonymousAuthorOf.has(pid) ? { byAuthor: true, author: undefined } : { author: { name: 'דנה כהן' } }),
    });
    if (parent === undefined) tops.push({ ...made, all: [] });
    else parent.all.push(made);
    return json(route, 201, { comment: view(made) });
  });
  await page.route(/\/api\/comments\/[^/?]+\/replies(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    net.calls.push(`${req.method()} ${url.pathname}${url.search}`);
    if (net.fail.replies !== null) return failWith(route, net.fail.replies);
    const parent = Object.values(net.threads).flat().find((t) => url.pathname.includes(t.id));
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
    const cid = path.split('/').pop() ?? '';
    for (const key of Object.keys(net.threads)) {
      net.threads[key] = (net.threads[key] ?? []).filter((t) => t.id !== cid);
      for (const t of net.threads[key] ?? []) t.all = t.all.filter((r) => r.id !== cid);
    }
    return route.fulfill({ status: 204, headers: CORS });
  });
  return net;
}
