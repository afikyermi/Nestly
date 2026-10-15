import type { AuthFailure } from './auth-client';

// What a failed Auth sign-in means for the screen (F1.5 criteria 5, 6). Keys only: the texts live in the login feature, so no
// Auth or server string reaches the DOM.
export type SignInProblem = 'invalid_credentials' | 'rate_limited' | 'unavailable' | 'unknown';

// ERR-001: a wrong password, an unknown email, an unconfirmed email and a banned Auth user all read the same to the user.
const CREDENTIAL_CODES = ['invalid_credentials', 'user_not_found', 'email_not_confirmed', 'user_banned'];

/** Reads the status, code and name of an Auth failure; the library's message is never looked at. */
export function classifySignInFailure(failure: AuthFailure): SignInProblem {
  if (failure.code !== undefined && CREDENTIAL_CODES.includes(failure.code)) return 'invalid_credentials';
  if (failure.status === 429 || failure.code === 'over_request_rate_limit') return 'rate_limited';
  // A call that did not reach Auth (status 0), any 5xx, or a client that is not configured: worth trying again.
  if (failure.name === 'AuthRetryableFetchError' || failure.name === 'AuthNotConfigured' || failure.status === 0) return 'unavailable';
  if (failure.status !== undefined && failure.status >= 500) return 'unavailable';
  return 'unknown';
}
