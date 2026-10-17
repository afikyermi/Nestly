import { privacySettingsResponse, type PrivacySettings } from '@nestly/shared';

// GET and PUT /api/privacy (F2.3a): the signed-in parent's own privacy settings. No id is ever sent: the server acts on the token's
// user. Only the status, the one `error` code and a body that passes the shared response schema are read; no response text reaches
// the screen.
export type PrivacyOutcome =
  | { kind: 'settings'; settings: PrivacySettings }
  | { kind: 'unauthenticated' } // 401: the server does not accept the token
  | { kind: 'account-unavailable' } // 403 account_unavailable: the account is stopped (ERR-037)
  | { kind: 'failed' }; // anything else: 5xx, 400, 404, an unreadable answer, or the call did not reach the server

const FAILED: PrivacyOutcome = { kind: 'failed' };

async function call(accessToken: string, init: { method: 'GET' } | { method: 'PUT'; body: PrivacySettings }): Promise<PrivacyOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/privacy', {
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
  if (response.status !== 200) return FAILED;
  const parsed = privacySettingsResponse.safeParse(body);
  return parsed.success ? { kind: 'settings', settings: parsed.data } : FAILED;
}

/** GET /api/privacy. */
export const fetchPrivacySettings = (accessToken: string): Promise<PrivacyOutcome> => call(accessToken, { method: 'GET' });

/** PUT /api/privacy with the three settings. The answer is what was stored. */
export const savePrivacySettings = (accessToken: string, settings: PrivacySettings): Promise<PrivacyOutcome> =>
  call(accessToken, { method: 'PUT', body: settings });
