import { ownProfileResponse, type OwnProfile, type ProfileUpdate } from '@nestly/shared';

// GET and PUT /api/profile (F2.1): the signed-in parent's own profile. No id is ever sent: the server acts on the token's user. Only
// the status, the one `error` code and a body that passes the shared response schema are read; no response text reaches the screen.
// The name and the gender go in the request body only: not a URL, not storage, not a log line.
export type ProfileOutcome =
  | { kind: 'profile'; profile: OwnProfile }
  | { kind: 'unauthenticated' } // 401: the server does not accept the token
  | { kind: 'account-unavailable' } // 403 account_unavailable: the account is stopped (ERR-037)
  | { kind: 'no-profile' } // 404 no_profile: no parent profile behind the account (a Professional); F3.1b reads it as "cannot write a post"
  | { kind: 'failed' }; // anything else: 5xx, 400, another 404, an unreadable answer, or the call did not reach the server

const FAILED: ProfileOutcome = { kind: 'failed' };

async function call(accessToken: string, init: { method: 'GET' } | { method: 'PUT'; body: ProfileUpdate }): Promise<ProfileOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/profile', {
      method: init.method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(init.method === 'PUT' ? { 'content-type': 'application/json' } : {}),
      },
      ...(init.method === 'PUT' ? { body: JSON.stringify(init.body) } : {}),
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
    return code === 'account_unavailable' ? { kind: 'account-unavailable' } : FAILED;
  }
  if (response.status === 404) {
    const code: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
    return code === 'no_profile' ? { kind: 'no-profile' } : FAILED;
  }
  if (response.status !== 200) return FAILED;
  const parsed = ownProfileResponse.safeParse(body);
  return parsed.success ? { kind: 'profile', profile: parsed.data } : FAILED;
}

/** GET /api/profile. */
export const fetchOwnProfile = (accessToken: string): Promise<ProfileOutcome> => call(accessToken, { method: 'GET' });

/** PUT /api/profile with the checked values. The answer is the stored profile. */
export const saveOwnProfile = (accessToken: string, update: ProfileUpdate): Promise<ProfileOutcome> =>
  call(accessToken, { method: 'PUT', body: update });
