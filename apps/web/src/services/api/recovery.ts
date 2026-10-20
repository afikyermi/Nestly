import type { AnswerEntry } from '@/lib/recovery-answers';

// The calls of password recovery (F1.6) and the password change with the answers (F2.0 c10). Only the status and the one `error` code are read; no response text reaches the
// screen. The answers and the password go in the body of the request and nowhere else: not a URL, not storage, not a log line.
export type RecoveryOutcome =
  | 'done'
  | 'mismatch' // 401 invalid_recovery: the details do not match
  | 'locked' // 429 rate_limited: locked for a while (ERR-043)
  | 'locked-permanently' // 429 recovery_locked: the 9th failure locked recovery for good (NFR-SEC-010); only the Admin releases it
  | 'unavailable' // 503, or the call did not reach the server: worth trying again
  | 'failed'; // anything else, including a refused token or a body the server will not take

async function send(
  url: string,
  method: 'POST' | 'PUT',
  body: unknown,
  accessToken: string | null,
  success: readonly number[],
): Promise<RecoveryOutcome> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(accessToken !== null ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return 'unavailable';
  }
  if (success.includes(response.status)) return 'done';
  if (response.status === 503) return 'unavailable';
  if (response.status !== 401 && response.status !== 429) return 'failed';
  // A 401 with a token is either "the token is not accepted" or "the current answers do not match"; a 429 a lock for a while or for
  // good. Only the code tells.
  let code: unknown;
  try {
    const parsed: unknown = await response.json();
    code = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'error') : undefined;
  } catch {
    return response.status === 429 ? 'locked' : 'failed';
  }
  if (response.status === 429) return code === 'recovery_locked' ? 'locked-permanently' : 'locked';
  return code === 'invalid_recovery' ? 'mismatch' : 'failed';
}

/** POST /api/recovery/reset (no token): the email, the two answers and the new password. 200 is done. */
export const resetPassword = (body: { email: string; answers: AnswerEntry[]; password: string }): Promise<RecoveryOutcome> =>
  send('/api/recovery/reset', 'POST', body, null, [200]);

/** POST /api/recovery-questions: the first save. 201 is done; 409 means they were already saved, which is what the caller wanted. */
export const saveRecoveryQuestions = (accessToken: string, answers: AnswerEntry[]): Promise<RecoveryOutcome> =>
  send('/api/recovery-questions', 'POST', { answers }, accessToken, [201, 409]);

/** PUT /api/recovery-questions: the current two answers, then the new pair. 200 is done. */
export const changeRecoveryQuestions = (accessToken: string, current: AnswerEntry[], answers: AnswerEntry[]): Promise<RecoveryOutcome> =>
  send('/api/recovery-questions', 'PUT', { current, answers }, accessToken, [200]);

/** POST /api/password/change (F2.0 c10, c15): the current two answers and the new password. 200 is done; 409 (no saved answers) is failed. */
export const changePassword = (accessToken: string, current: AnswerEntry[], password: string): Promise<RecoveryOutcome> =>
  send('/api/password/change', 'POST', { current, password }, accessToken, [200]);
