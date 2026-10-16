// The return from Google (F1.8, FR-AUTH-005): what the address of /auth/google says, and the cancelled-consent text. A provider's own
// words (its error, its description) never reach the DOM: every failure is the one text in lib/auth-texts.ts, and only a cancelled
// consent has its own (ERR-001: nothing that tells a cause).
export const GOOGLE_CANCELLED_TEXT = 'הכניסה עם Google בוטלה. אפשר לנסות שוב, או להתחבר עם אימייל וסיסמה.';

export type GoogleReturnFound = { kind: 'code'; code: string } | { kind: 'cancelled' } | { kind: 'failed' };

/**
 * Reads the address once. Any `error*` parameter ends it without an exchange: `access_denied` is the user's own refusal, anything
 * else a failure. Without an error, a non-empty `code` is the thing to exchange; no code is a failure.
 */
export function readGoogleReturn(params: URLSearchParams): GoogleReturnFound {
  if ([...params.keys()].some((key) => key.startsWith('error'))) {
    return params.get('error') === 'access_denied' ? { kind: 'cancelled' } : { kind: 'failed' };
  }
  const code = params.get('code');
  return code === null || code === '' ? { kind: 'failed' } : { kind: 'code', code };
}
