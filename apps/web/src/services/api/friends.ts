import { friendListsResponse, type FriendLists } from '@nestly/shared';

// GET /api/friends, POST /api/friend-requests/:userId/accept|decline, DELETE /api/friend-requests/:userId, DELETE /api/friends/:userId
// (F2.4a; FR-REL-001, PG-036): the signed-in parent's own requests and Friends. The caller's id is never sent: the server acts on
// the token's user, and the other person is named by user id in the path only. Only the status, the one `error` code and, for the
// lists, a body that passes the shared response schema are read; no response text reaches the screen.
export type FriendAction = 'accept' | 'decline' | 'cancel' | 'remove';

export type FriendsOutcome =
  | { kind: 'lists'; lists: FriendLists }
  | { kind: 'done' } // 200: the action took effect
  | { kind: 'unauthenticated' } // 401: the server does not accept the token
  | { kind: 'account-unavailable' } // 403 account_unavailable: the account is stopped (ERR-037)
  | { kind: 'gone' } // 409 request_gone or 404 unavailable: the request or Friendship is not there any more (another tab, the other side)
  | { kind: 'failed' }; // anything else: 5xx, 400, 403 forbidden, an unreadable answer, or the call did not reach the server

const FAILED: FriendsOutcome = { kind: 'failed' };

type Call = { method: 'GET' | 'POST' | 'DELETE'; path: string; reads: 'lists' | 'status' };

function errorCode(body: unknown): unknown {
  return typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
}

async function call(accessToken: string, init: Call): Promise<FriendsOutcome> {
  let response: Response;
  try {
    // No call carries a body: the target is in the path.
    response = await fetch(init.path, {
      method: init.method,
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
  if (response.status === 403) return errorCode(body) === 'account_unavailable' ? { kind: 'account-unavailable' } : FAILED;
  if (response.status === 409) return errorCode(body) === 'request_gone' ? { kind: 'gone' } : FAILED;
  if (response.status === 404) return errorCode(body) === 'unavailable' ? { kind: 'gone' } : FAILED;
  if (response.status !== 200) return FAILED;
  if (init.reads === 'status') return { kind: 'done' };
  const parsed = friendListsResponse.safeParse(body);
  return parsed.success ? { kind: 'lists', lists: parsed.data } : FAILED;
}

/** GET /api/friends. */
export const fetchFriendLists = (accessToken: string): Promise<FriendsOutcome> =>
  call(accessToken, { method: 'GET', path: '/api/friends', reads: 'lists' });

/** Accept or decline the request `userId` sent, cancel the caller's own request to `userId`, or remove the Friend `userId`. */
export function actOnFriend(accessToken: string, action: FriendAction, userId: string): Promise<FriendsOutcome> {
  const id = encodeURIComponent(userId);
  switch (action) {
    case 'accept':
      return call(accessToken, { method: 'POST', path: `/api/friend-requests/${id}/accept`, reads: 'status' });
    case 'decline':
      return call(accessToken, { method: 'POST', path: `/api/friend-requests/${id}/decline`, reads: 'status' });
    case 'cancel':
      return call(accessToken, { method: 'DELETE', path: `/api/friend-requests/${id}`, reads: 'status' });
    case 'remove':
      return call(accessToken, { method: 'DELETE', path: `/api/friends/${id}`, reads: 'status' });
  }
}
