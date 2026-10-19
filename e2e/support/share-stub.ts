// Shared by e2e/share-in-feed.spec.ts and e2e/share-link.spec.ts (I3 F3.5 + F3.6). Derived from .work/share-in-feed/spec.md and screen.md and
// .work/share-link/spec.md and screen.md only: the route is POST /api/posts/:id/shares (201 with the share view of c7; 403 not_shareable | not_allowed;
// 5xx), the post page reads GET /api/posts/:id (a post, or a share view with kind "share"). The stub plays the server on top of feed-stub.ts.
import type { Page } from '@playwright/test';
import { CORS, NOW, json } from './journeys-stub';
import { id, originalOf, setupFeed } from './feed-stub';
import type { FeedNet, Unit } from './feed-stub';
import type { StoredPost } from './posts-stub';

export { id, originalOf };

export interface ShareNet extends FeedNet {
  /** The id in the path and the parsed body of every POST /api/posts/:id/shares, in order. */
  shares: Array<{ target: string; body: Record<string, unknown> }>;
  /** What the next share answers: 201, 403 (see `shareError`), another status, or a dropped connection. */
  shareAnswer: number | 'abort';
  /** The `error` of a 403: not_shareable (ERR-034) or not_allowed. */
  shareError: 'not_shareable' | 'not_allowed';
  /** While set, every share answer waits for it. */
  holdShare: Promise<void> | null;
  /** The original (as the feed unit's `original`) the 201 shows for a target id; absent = originalOf(0). */
  originals: Record<string, Unit>;
  /** GET /api/posts/:id answers for these ids (a share view or a post view); other ids fall through to the posts stub. */
  views: Record<string, Unit>;
  /** Every GET /api/posts/:id path. */
  postReads: string[];
}

/** The share view of GET /api/posts/:id and of the 201 (F3.5 c7): the sharer's header and text, the original, the share's own counts. */
export const shareView = (n: number, original: Unit, over: Unit = {}): Unit => ({
  kind: 'share',
  id: id(n),
  body: null,
  sharerText: `מה שהוספתי ${n}`,
  audience: 'everyone',
  stageTag: null,
  createdAt: '2026-06-14T09:30:00.000Z',
  isAnonymous: false,
  isMine: false,
  author: { name: `משתפת מספר ${n}` },
  original,
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  ...over,
});
export const postView = (n: number, over: Unit = {}): Unit => ({
  kind: 'post',
  id: id(n),
  body: `גוף הפוסט ${n}`,
  audience: 'everyone',
  stageTag: null,
  createdAt: '2026-06-14T09:10:00.000Z',
  isAnonymous: false,
  isMine: false,
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  ...over,
});

export async function setupShare(page: Page, answer: FeedNet['answer'], start: { professional?: boolean; posts?: StoredPost[] } = {}): Promise<ShareNet> {
  const base = await setupFeed(page, answer, start);
  const extra: Pick<ShareNet, 'shares' | 'shareAnswer' | 'shareError' | 'holdShare' | 'originals' | 'views' | 'postReads'> = {
    shares: [], shareAnswer: 201, shareError: 'not_shareable', holdShare: null, originals: {}, views: {}, postReads: [],
  };
  const net: ShareNet = Object.assign(base, extra);
  await page.route(/\/api\/posts\/[^/?]+(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    const path = new URL(req.url()).pathname;
    if (net.armed) net.postReads.push(path);
    const view = net.views[path.split('/').pop() ?? ''];
    return view === undefined ? route.fallback() : json(route, 200, view);
  });
  await page.route(/\/api\/posts\/[^/?]+\/shares$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const target = new URL(req.url()).pathname.split('/').at(-2) ?? '';
    const sent: unknown = JSON.parse(req.postData() ?? 'null');
    const body: Record<string, unknown> = typeof sent === 'object' && sent !== null ? Object.fromEntries(Object.entries(sent)) : {};
    net.shares.push({ target, body });
    if (net.holdShare !== null) await net.holdShare;
    if (net.shareAnswer === 'abort') return route.abort('connectionreset');
    if (net.shareAnswer === 403) return json(route, 403, { error: net.shareError });
    if (net.shareAnswer !== 201) return json(route, net.shareAnswer, { error: 'server_error' });
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const made = shareView(900 + net.shares.length, net.originals[target] ?? originalOf(0, { id: target }), {
      sharerText: text === '' ? null : text,
      audience: body.audience === 'friends' ? 'friends' : 'everyone',
      createdAt: NOW.toISOString(),
      isMine: true,
      author: { name: 'דנה כהן' },
    });
    return json(route, 201, made);
  });
  return net;
}
