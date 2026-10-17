// The server password calls (F2.0, D2): the browser never sets a password with Auth; the server does. Only the status is read; no
// response text reaches the screen. The password goes in the body of the request and nowhere else: not a URL, not storage, not a log.

async function postPassword(url: string, accessToken: string, password: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
      cache: 'no-store',
    });
    return response.status;
  } catch {
    return null;
  }
}

// 'failed' is every other answer: a refused token (401), an account that already exists (403), unavailable (503), unreachable.
export type FirstPasswordOutcome = 'set' | 'failed';

/** POST /api/password/first (F1.8 completion, F2.0 c11): the first password of an Auth user that has no account yet. 200 is done. */
export async function setFirstPassword(accessToken: string, password: string): Promise<FirstPasswordOutcome> {
  return (await postPassword('/api/password/first', accessToken, password)) === 200 ? 'set' : 'failed';
}

export type ForcedPasswordOutcome =
  | 'set'
  | 'not-held' // 401 (a token from before the clear) or 409 (this session is not, or no longer, the one that must set it): ask the state again
  | 'failed'; // 503, unreachable, or anything else: nothing was set, worth trying again

/** POST /api/password/forced (F2.0 c7, c14): the new password after a takeover clear, from the clearing session only. 200 is done. */
export async function setForcedPassword(accessToken: string, password: string): Promise<ForcedPasswordOutcome> {
  const status = await postPassword('/api/password/forced', accessToken, password);
  if (status === 200) return 'set';
  return status === 401 || status === 409 ? 'not-held' : 'failed';
}
