import { hideErrorBody } from '@nestly/shared';

// PUT|DELETE /api/posts/:id/hide (F3.9; FR-ALG-009 — the Hide action only). No body and no user id: the server acts on the token's user, and
// the answer is 204 or one error code. Only the status and that code are read; no response text reaches the screen.
export type HideOutcome =
  | { kind: 'done' } // 204, also a repeat (PUT) or nothing to undo (DELETE)
  | { kind: 'unavailable' } // 404 post_unavailable: unknown or no longer readable (PUT only)
  | { kind: 'own-post' } // 409 own_post: the viewer's own post, e.g. their own anonymous card (PUT only)
  | { kind: 'unauthenticated' } // 401
  | { kind: 'account-unavailable' } // 403 account_unavailable: the session guard (ERR-037)
  | { kind: 'failed' }; // 403 not_allowed, 400, 5xx, an unreadable answer, or the call did not reach the server

const FAILED = { kind: 'failed' } as const;

/** Hides a post for the caller (`hidden` true: PUT) or undoes it (false: DELETE). Both are idempotent. */
export async function setHidden(accessToken: string, postId: string, hidden: boolean): Promise<HideOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/posts/${encodeURIComponent(postId)}/hide`, {
      method: hidden ? 'PUT' : 'DELETE',
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
  } catch {
    return FAILED;
  }
  if (response.status === 204) return { kind: 'done' };
  if (response.status === 401) return { kind: 'unauthenticated' };
  const body: unknown = await response.json().catch(() => undefined);
  if (response.status === 403) {
    const code: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
    return code === 'account_unavailable' ? { kind: 'account-unavailable' } : FAILED;
  }
  const parsed = hideErrorBody.safeParse(body);
  if (!parsed.success) return FAILED;
  if (response.status === 404 && parsed.data.error === 'post_unavailable') return { kind: 'unavailable' };
  if (response.status === 409 && parsed.data.error === 'own_post') return { kind: 'own-post' };
  return FAILED;
}
