// I3 ux-polish-a c8 (unit): comment likes inside a feed card behave as F3.3 c13 — the count moves by one at once, a quick double press sends one request, a failure
// reverts and says F3.3's like text. Derived from .work/ux-polish-a/spec.md c8 and the as-built endpoints PUT|DELETE /api/comments/:id/like (204) only; the card is
// drawn through its public hook (useFeedComments) with the network stubbed. The end-to-end journeys of the card are e2e/ux-polish-a.spec.ts.
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FeedUnit } from '@nestly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFeedComments } from '@/features/posts/use-feed-comments';

const POST = 'e0000000-0000-4000-8000-000000000001';
const COMMENT = 'e0000000-0000-4000-8000-000000000101';
const LIKE_FAILED = 'הלייק לא נשמר. אפשר לנסות שוב';

const unit = {
  id: POST,
  kind: 'post',
  source: 'organic',
  body: 'גוף',
  audience: 'everyone',
  stageTag: null,
  createdAt: '2026-06-14T09:10:00.000Z',
  isMine: false,
  isAnonymous: false,
  author: { name: 'כותבת' },
  likeCount: 0,
  commentCount: 1,
  likedByMe: false,
} satisfies FeedUnit;

interface Net {
  likes: string[];
  /** The status the like answers, and a gate that holds the answer. */
  status: number;
  hold: Promise<void> | null;
}
function stubNet(liked: boolean): Net {
  const net: Net = { likes: [], status: 204, hold: null };
  const thread = {
    items: [{ id: COMMENT, parentId: null, body: 'תגובה', createdAt: '2026-06-15T09:00:00.000Z', isMine: false, byAuthor: false, author: { name: null }, likeCount: 2, likedByMe: liked, replies: [], replyCount: 0 }],
    nextCursor: null,
  };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url.endsWith('/like')) {
      net.likes.push(`${method} ${url}`);
      if (net.hold !== null) await net.hold;
      return new Response(net.status === 204 ? null : JSON.stringify({ error: 'server_error' }), { status: net.status });
    }
    return new Response(JSON.stringify(thread), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return net;
}
async function mount(liked = false) {
  const net = stubNet(liked);
  const report = { onCount: vi.fn(), onStatus: vi.fn() };
  const api = { token: async () => 'tok', refused: () => null };
  const hook = renderHook(() => useFeedComments(api, report));
  await act(async () => {
    hook.result.current.near(unit);
  });
  await waitFor(() => expect(hook.result.current.threadOf(unit).items).toHaveLength(1));
  const mineOf = () => {
    const item = hook.result.current.threadOf(unit).items[0];
    return { count: item?.likeCount, liked: item?.likedByMe };
  };
  return { net, report, hook, mineOf };
}
afterEach(() => vi.unstubAllGlobals());

describe('ux-polish-a c8 [FR-FEED-001] comment likes in the card', () => {
  it('[ua c8] a like moves the count +1 and the pressed state at once (before the answer), one PUT on that comment', async () => {
    const { net, hook, mineOf } = await mount(false);
    let release: () => void = () => undefined;
    net.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await act(async () => {
      hook.result.current.toggleLike(unit, COMMENT);
    });
    expect(mineOf()).toEqual({ count: 3, liked: true });
    await act(async () => {
      release();
    });
    expect(net.likes).toEqual([`PUT /api/comments/${COMMENT}/like`]);
    expect(mineOf()).toEqual({ count: 3, liked: true });
  });

  it('[ua c8] an unlike moves the count -1 at once, one DELETE', async () => {
    const { net, hook, mineOf } = await mount(true);
    await act(async () => {
      hook.result.current.toggleLike(unit, COMMENT);
    });
    expect(mineOf()).toEqual({ count: 1, liked: false });
    await waitFor(() => expect(net.likes).toEqual([`DELETE /api/comments/${COMMENT}/like`]));
  });

  it('[ua c8] a quick double press sends one request and ends liked once', async () => {
    const { net, hook, mineOf } = await mount(false);
    let release: () => void = () => undefined;
    net.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await act(async () => {
      hook.result.current.toggleLike(unit, COMMENT);
      hook.result.current.toggleLike(unit, COMMENT);
    });
    await act(async () => {
      release();
    });
    expect(net.likes).toHaveLength(1);
    expect(mineOf()).toEqual({ count: 3, liked: true });
  });

  it.each([500, 503])('[ua c8] a like that fails (%s) reverts the count and the state and says F3.3\'s like text', async (status) => {
    const { net, report, hook, mineOf } = await mount(false);
    net.status = status;
    await act(async () => {
      hook.result.current.toggleLike(unit, COMMENT);
    });
    await waitFor(() => expect(mineOf()).toEqual({ count: 2, liked: false }));
    expect(report.onStatus).toHaveBeenCalledWith(LIKE_FAILED);
  });

  it('[ua c8] an unlike that fails keeps the like and its count', async () => {
    const { net, report, hook, mineOf } = await mount(true);
    net.status = 500;
    await act(async () => {
      hook.result.current.toggleLike(unit, COMMENT);
    });
    await waitFor(() => expect(mineOf()).toEqual({ count: 2, liked: true }));
    expect(report.onStatus).toHaveBeenCalledWith(LIKE_FAILED);
  });
});
