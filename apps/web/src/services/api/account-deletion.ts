import { accountDeletionStatus, type AccountDeletionError, type AccountDeletionStatus } from '@nestly/shared';

// The account's own deletion (I9; FR-SET-002, PG-050, ERR-026, VAL-052). No id is ever sent: the server acts on the token's user. Only
// the status, the one `error` code and a body that passes the shared schema are read; no response text reaches the screen.
export type DeletionOutcome =
  | { kind: 'ok'; status: AccountDeletionStatus }
  | { kind: 'refused'; error: Exclude<AccountDeletionError, 'invalid'> }
  | { kind: 'unauthenticated' } // 401 with no known code: the server does not accept the token
  | { kind: 'failed' }; // anything else: 5xx, 400, an unreadable answer, or the call did not reach the server

const FAILED: DeletionOutcome = { kind: 'failed' };
const REFUSALS: ReadonlyArray<Exclude<AccountDeletionError, 'invalid'>> = ['reauth_required', 'group_owner', 'not_allowed', 'not_scheduled'];

async function call(url: string, accessToken: string, body?: object): Promise<DeletionOutcome> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });
  } catch {
    return FAILED;
  }
  let parsedBody: unknown;
  try {
    parsedBody = await response.json();
  } catch {
    return response.status === 401 ? { kind: 'unauthenticated' } : FAILED;
  }
  if (response.status === 401 || response.status === 409) {
    const code: unknown = typeof parsedBody === 'object' && parsedBody !== null ? Reflect.get(parsedBody, 'error') : undefined;
    const refusal = REFUSALS.find((candidate) => candidate === code);
    if (refusal !== undefined) return { kind: 'refused', error: refusal };
    return response.status === 401 ? { kind: 'unauthenticated' } : FAILED;
  }
  if (response.status !== 200) return FAILED;
  const parsed = accountDeletionStatus.safeParse(parsedBody);
  return parsed.success ? { kind: 'ok', status: parsed.data } : FAILED;
}

/** GET /api/account/deletion: none, or scheduled with the date. */
export const fetchDeletionStatus = (accessToken: string): Promise<DeletionOutcome> => call('/api/account/deletion', accessToken);

/** POST /api/account/deletion with the ticked box. `accessToken` must come from a fresh password check (VAL-052). */
export const requestAccountDeletion = (accessToken: string): Promise<DeletionOutcome> =>
  call('/api/account/deletion', accessToken, { confirmed: true });

/** POST /api/account/deletion/cancel (PG-050). */
export const cancelAccountDeletion = (accessToken: string): Promise<DeletionOutcome> => call('/api/account/deletion/cancel', accessToken, {});
