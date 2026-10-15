// GET /api/me (F1.5): the state of the signed-in user's account. Only the status and the one `state` field are read; no response
// text reaches the screen. The server never says suspended or banned: both are `unavailable`.
export type AccountStateOutcome =
  | 'active'
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
  return STATES.find((known) => known === state) ?? 'failed';
}
