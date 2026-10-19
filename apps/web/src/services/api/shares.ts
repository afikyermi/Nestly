import { shareReadView, type PostAudience, type ShareReadView } from '@nestly/shared';

// POST /api/posts/:id/shares (F3.5; FR-FEED-006, BR-064-066, ERR-034). The post is named by its id in the path only; the body is the optional
// text and the audience, never an author or an original id (the server names the original, BR-066). Only the status, the one `error` code and
// a body that passes the shared share schema are read; no response text reaches the screen.
export type ShareOutcome =
  | { kind: 'shared'; share: ShareReadView } // 201
  | { kind: 'not-shareable' } // 403 not_shareable: one answer for every reason (ERR-034)
  | { kind: 'not-allowed' } // 403 not_allowed: not an active Regular account
  | { kind: 'too-long' } // 422 body_too_long (the web's own check said yes)
  | { kind: 'unauthenticated' } // 401
  | { kind: 'account-unavailable' } // 403 account_unavailable: the session guard (ERR-037)
  | { kind: 'failed' }; // anything else: 5xx, 400, an unreadable answer, or the call did not reach the server

const FAILED = { kind: 'failed' } as const;

/** Shares `postId` (or its original) into the caller's feed; `text` null sends none. One request, the answer read once. */
export async function createShare(accessToken: string, postId: string, write: { text: string | null; audience: PostAudience }): Promise<ShareOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/posts/${encodeURIComponent(postId)}/shares`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(write.text === null ? { audience: write.audience } : { text: write.text, audience: write.audience }),
      cache: 'no-store',
    });
  } catch {
    return FAILED;
  }
  if (response.status === 401) return { kind: 'unauthenticated' };
  const body: unknown = await response.json().catch(() => undefined);
  const code: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
  if (response.status === 403) {
    if (code === 'account_unavailable') return { kind: 'account-unavailable' };
    if (code === 'not_shareable') return { kind: 'not-shareable' };
    return code === 'not_allowed' ? { kind: 'not-allowed' } : FAILED;
  }
  if (response.status === 422) return code === 'body_too_long' ? { kind: 'too-long' } : FAILED;
  if (response.status !== 201) return FAILED;
  const parsed = shareReadView.safeParse(body);
  return parsed.success ? { kind: 'shared', share: parsed.data } : FAILED;
}
