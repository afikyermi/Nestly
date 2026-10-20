import { blockedListResponse, type BlockedAccount } from '@nestly/shared';

// PUT|DELETE /api/users/:id/block and GET /api/blocks (FR-REL-002): block from another person's profile, see and lift one's blocks in Settings.
// The caller's id is never sent: the server acts on the token's user, and the other person is named in the path only. Only the status, the
// one `error` code and, for the list, a body that passes the shared response schema are read; no response text reaches the screen.
export type BlocksOutcome =
  | { kind: 'list'; blocked: BlockedAccount[] }
  | { kind: 'done' } // 204: the block or unblock took effect (a repeat too)
  | { kind: 'unauthenticated' } // 401
  | { kind: 'account-unavailable' } // 403 account_unavailable: the account is stopped (ERR-037)
  | { kind: 'gone' } // 404 user_unavailable: no such account any more
  | { kind: 'failed' }; // anything else: 5xx, 400, 403 not_allowed, an unreadable answer, or the call did not reach the server

const FAILED: BlocksOutcome = { kind: 'failed' };

const errorCode = (body: unknown): unknown => (typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined);

async function call(accessToken: string, method: 'GET' | 'PUT' | 'DELETE', path: string): Promise<BlocksOutcome> {
  let response: Response;
  try {
    response = await fetch(path, { method, headers: { authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
  } catch {
    return FAILED;
  }
  if (response.status === 401) return { kind: 'unauthenticated' };
  if (response.status === 204) return method === 'GET' ? FAILED : { kind: 'done' };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return FAILED;
  }
  if (response.status === 403) return errorCode(body) === 'account_unavailable' ? { kind: 'account-unavailable' } : FAILED;
  if (response.status === 404) return errorCode(body) === 'user_unavailable' ? { kind: 'gone' } : FAILED;
  if (response.status !== 200 || method !== 'GET') return FAILED;
  const parsed = blockedListResponse.safeParse(body);
  return parsed.success ? { kind: 'list', blocked: parsed.data.blocked } : FAILED;
}

/** GET /api/blocks: the accounts the caller blocked, newest first. */
export const fetchBlocked = (accessToken: string): Promise<BlocksOutcome> => call(accessToken, 'GET', '/api/blocks');

/** PUT /api/users/:id/block. */
export const blockUser = (accessToken: string, userId: string): Promise<BlocksOutcome> =>
  call(accessToken, 'PUT', `/api/users/${encodeURIComponent(userId)}/block`);

/** DELETE /api/users/:id/block. */
export const unblockUser = (accessToken: string, userId: string): Promise<BlocksOutcome> =>
  call(accessToken, 'DELETE', `/api/users/${encodeURIComponent(userId)}/block`);
