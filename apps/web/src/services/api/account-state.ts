// GET /api/me (F1.5): the state of the signed-in user's account. Only the status and the one `state` field are read; no response
// text reaches the screen. The server never says suspended or banned: both are `unavailable`.
export type AccountStateOutcome =
  | 'active'
  | 'active-missing' // active, and the recovery questions are not saved yet (F1.6)
  | 'active-must-set-password' // active, and this session must set a new password after a takeover clear (F2.0 c7)
  | 'unavailable' // a stopped account (suspended or banned)
  | 'unregistered' // an Auth user with no account yet
  | 'unauthenticated' // 401: the server does not accept the token
  | 'unreachable' // 503, or the call did not reach the server
  | 'failed'; // anything else, including an answer that cannot be read

const STATES: ReadonlyArray<'active' | 'unavailable' | 'unregistered'> = ['active', 'unavailable', 'unregistered'];

export async function fetchAccountState(accessToken: string): Promise<AccountStateOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/me', { headers: { authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
  } catch {
    return 'unreachable';
  }
  if (response.status === 401) return 'unauthenticated';
  if (response.status === 503) return 'unreachable';
  if (response.status !== 200) return 'failed';
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return 'failed';
  }
  const state: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'state') : undefined;
  const known = STATES.find((candidate) => candidate === state) ?? 'failed';
  if (known !== 'active') return known;
  // F2.0 c7: only an exact `true` holds the session on the new-password screen; it comes before the questions hold (c14).
  if (typeof body === 'object' && body !== null && Reflect.get(body, 'mustSetPassword') === true) return 'active-must-set-password';
  // F1.6: only an exact "missing" holds the user on the questions screen; "set", an absent field or anything unreadable does not (criterion 19).
  return typeof body === 'object' && body !== null && Reflect.get(body, 'recoveryQuestions') === 'missing' ? 'active-missing' : 'active';
}
