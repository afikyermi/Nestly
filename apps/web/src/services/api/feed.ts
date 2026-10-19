import { feedPageResponse, type FeedPageResponse } from '@nestly/shared';

// GET /api/feed?cursor= (F3.2b; FR-FEED-001). The cursor is opaque: it is passed back exactly as the server gave it, in the query
// only, and never stored, logged or shown. Only the status, the one `error` code and a body that passes the shared response schema
// are read; no response text reaches the screen.
export type FeedOutcome =
  | { kind: 'page'; page: FeedPageResponse }
  | { kind: 'not-allowed' } // 403 not_allowed: a Professional
  | { kind: 'unauthenticated' } // 401
  | { kind: 'account-unavailable' } // 403 account_unavailable: the session guard (ERR-037)
  | { kind: 'failed' }; // anything else: 5xx, 400, an unreadable answer, or the call did not reach the server

const FAILED = { kind: 'failed' } as const;

export async function fetchFeedPage(accessToken: string, cursor: string | null): Promise<FeedOutcome> {
  let response: Response;
  try {
    response = await fetch(cursor === null ? '/api/feed' : `/api/feed?cursor=${encodeURIComponent(cursor)}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
  } catch {
    return FAILED;
  }
  if (response.status === 401) return { kind: 'unauthenticated' };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return FAILED;
  }
  if (response.status === 403) {
    const code: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
    if (code === 'account_unavailable') return { kind: 'account-unavailable' };
    return code === 'not_allowed' ? { kind: 'not-allowed' } : FAILED;
  }
  if (response.status !== 200) return FAILED;
  const parsed = feedPageResponse.safeParse(body);
  return parsed.success ? { kind: 'page', page: parsed.data } : FAILED;
}
