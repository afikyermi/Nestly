// The server password calls (F2.0, D2): the browser never sets a password with Auth; the server does. Only the status is read; no
// response text reaches the screen. The password goes in the body of the request and nowhere else: not a URL, not storage, not a log.
// 'failed' is every other answer: a refused token (401), an account that already exists (403), unavailable (503), unreachable.
export type FirstPasswordOutcome = 'set' | 'failed';

/** POST /api/password/first (F1.8 completion, F2.0 c11): the first password of an Auth user that has no account yet. 200 is done. */
export async function setFirstPassword(accessToken: string, password: string): Promise<FirstPasswordOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/password/first', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
      cache: 'no-store',
    });
  } catch {
    return 'failed';
  }
  return response.status === 200 ? 'set' : 'failed';
}
