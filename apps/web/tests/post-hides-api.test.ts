// I3 F3.9 c9, c11 (unit half): what the web reads from PUT|DELETE /api/posts/:id/hide, derived from .work/hide-post/spec.md. The statuses and the error codes are
// the server's contract (spec c1-c4, c7); the screen's reactions to each are e2e/hide-post.spec.ts. Only the status and the code are read, never response text.
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setHidden } from '../src/services/api/post-hides';

const ID = 'd0000000-0000-4000-8000-000000000002';

function respond(status: number, body?: unknown): Array<[string, RequestInit]> {
  const calls: Array<[string, RequestInit]> = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push([url, init]);
    return Promise.resolve(new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status }));
  });
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('setHidden: the request', () => {
  it('[F3.9 c9] hide is one PUT and undo one DELETE to /api/posts/<id>/hide, with the bearer token, no body', async () => {
    const calls = respond(204);
    await setHidden('tok', ID, true);
    await setHidden('tok', ID, false);
    expect(calls.map(([url, init]) => [init.method, url])).toEqual([['PUT', `/api/posts/${ID}/hide`], ['DELETE', `/api/posts/${ID}/hide`]]);
    for (const [, init] of calls) {
      expect(init.body, 'no body, no user id').toBeUndefined();
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok');
    }
  });
});

describe('setHidden: the answer', () => {
  it.each([true, false])('[F3.9 c9] 204 is done (hidden %s)', async (hidden) => {
    respond(204);
    expect(await setHidden('t', ID, hidden)).toEqual({ kind: 'done' });
  });

  it('[F3.9 c11] 404 post_unavailable → the post is unavailable', async () => {
    respond(404, { error: 'post_unavailable' });
    expect(await setHidden('t', ID, true)).toEqual({ kind: 'unavailable' });
  });

  it('[F3.9 c11] 409 own_post → the own-post refusal', async () => {
    respond(409, { error: 'own_post' });
    expect(await setHidden('t', ID, true)).toEqual({ kind: 'own-post' });
  });

  it('[F3.9 c11] 401 → unauthenticated (the session handling, not a hide failure)', async () => {
    respond(401, { error: 'unauthenticated' });
    expect((await setHidden('t', ID, true)).kind).toBe('unauthenticated');
  });

  it.each([
    ['500 server_error', 500, { error: 'server_error' }],
    ['503 unavailable', 503, { error: 'unavailable' }],
    ['400 invalid', 400, { error: 'invalid' }],
    ['403 not_allowed', 403, { error: 'not_allowed' }],
    ['404 with another code', 404, { error: 'not_found' }],
    ['409 with another code', 409, { error: 'post_unavailable' }],
    ['404 with no JSON', 404, 'not json'],
    ['200 with a body', 200, { ok: true }],
    ['a 5xx with an unreadable body', 502, '<html>'],
  ])('[F3.9 c11] %s → a failure: the card stays, "try again" says so', async (_label, status, body) => {
    respond(status, body);
    expect((await setHidden('t', ID, true)).kind).toBe('failed');
  });

  it('[F3.9 c11] a dropped connection → a failure, not an exception', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('network error')));
    expect(await setHidden('t', ID, true)).toEqual({ kind: 'failed' });
    expect(await setHidden('t', ID, false)).toEqual({ kind: 'failed' });
  });
});
