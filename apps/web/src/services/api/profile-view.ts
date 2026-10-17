import { profileViewResponse, type ProfileView } from '@nestly/shared';

// GET /api/profiles/:userId (F2.4c1; FR-PRIV-001, BR-044, NFR-SEC-006): another Regular's profile as the database's profile_view
// returns it for the signed-in viewer. The viewer's id is never sent: the server acts on the token's user, and the person is named
// in the path only. Only the status, the one `error` code and a body that passes the shared response schema are read; no response
// text reaches the screen. Every call is one open on the server (counted there); nothing is cached here.
export type ProfileViewOutcome =
  | { kind: 'profile'; profile: ProfileView }
  | { kind: 'unavailable' } // 404: one answer for every reason (a stopped, absent or non-Regular person)
  | { kind: 'rate-limited' } // 429 rate_limited: the profile-open limit; the answer carries no number and no time
  | { kind: 'unauthenticated' } // 401: the server does not accept the token
  | { kind: 'account-unavailable' } // 403 account_unavailable: the viewer's account is stopped (ERR-037)
  | { kind: 'failed' }; // anything else: 5xx, 400, 403 forbidden, an unreadable answer, or the call did not reach the server

const FAILED: ProfileViewOutcome = { kind: 'failed' };

function errorCode(body: unknown): unknown {
  return typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
}

export async function fetchUserProfile(accessToken: string, userId: string): Promise<ProfileViewOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/profiles/${encodeURIComponent(userId)}`, {
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
  const code = errorCode(body);
  if (response.status === 403) return code === 'account_unavailable' ? { kind: 'account-unavailable' } : FAILED;
  if (response.status === 404) return code === 'unavailable' ? { kind: 'unavailable' } : FAILED;
  if (response.status === 429) return code === 'rate_limited' ? { kind: 'rate-limited' } : FAILED;
  if (response.status !== 200) return FAILED;
  const parsed = profileViewResponse.safeParse(body);
  return parsed.success ? { kind: 'profile', profile: parsed.data } : FAILED;
}
