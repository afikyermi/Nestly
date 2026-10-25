// PUT|DELETE /api/posts/:id/like and /api/comments/:id/like (F3.3 w1; FR-FEED-001). No body and no user id: the server acts on the token's
// user, and the answer is 204 or nothing the screen reads. Only the status and the one `error` code are read.
export type LikeTarget = 'posts' | 'comments';

export type LikeOutcome =
  | { kind: 'done' } // 204, also a repeat
  | { kind: 'unauthenticated' } // 401
  | { kind: 'account-unavailable' } // 403 account_unavailable: the session guard (ERR-037)
  | { kind: 'muted' } // 403 muted: muted in the post's Group (I10-C)
  | { kind: 'failed' }; // 404, 403 not_allowed, 5xx, or the call did not reach the server

/** Sets the caller's like on a post or comment: `liked` true is PUT, false is DELETE (both idempotent). */
export async function setLike(accessToken: string, target: LikeTarget, id: string, liked: boolean): Promise<LikeOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/${target}/${encodeURIComponent(id)}/like`, {
      method: liked ? 'PUT' : 'DELETE',
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
  } catch {
    return { kind: 'failed' };
  }
  if (response.status === 204) return { kind: 'done' };
  if (response.status === 401) return { kind: 'unauthenticated' };
  if (response.status === 403) {
    const body: unknown = await response.json().catch(() => undefined);
    const code: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
    if (code === 'account_unavailable') return { kind: 'account-unavailable' };
    if (code === 'muted') return { kind: 'muted' };
  }
  return { kind: 'failed' };
}
