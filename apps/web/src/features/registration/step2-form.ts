import { registrationCredentialsInput, type CredentialsErrorCode } from '@nestly/shared';
import type { AuthFailure } from '@/services/auth/auth-client';
import { EMAIL_INVALID_TEXT, EMAIL_REQUIRED_TEXT, GENERIC_ERROR_TEXT, RATE_LIMITED_TEXT } from '@/lib/auth-texts';

// Registration step 2: the texts, the credentials check and the reading of an Auth failure. The shared schema returns codes;
// this is the only place a code or an Auth failure becomes text, so no Zod, Auth or server text reaches the DOM (criteria 5, 20).

export const PASSWORD_LENGTH_TEXT = 'הסיסמה צריכה להכיל לפחות 8 תווים'; // VAL-003 · ERR-003
export const CONSENT_REQUIRED_TEXT = 'יש לאשר את התנאים ואת הצהרת הגיל כדי להמשיך'; // BR-068
// ERR-002 · NFR-SEC-006: one text for Regular and Professional, naming neither (criteria 6, 7).
export const TAKEN_TEXT = 'לא ניתן להשלים את ההרשמה עם הפרטים האלה. אפשר להתחבר או לשחזר סיסמה';
export const RETRY_TEXT = 'השמירה לא הצליחה. אפשר לנסות שוב'; // ERR-004
// Shown while Auth holds the email and password and the account is not yet created: the fields are locked.
export const HELD_TEXT = 'האימייל והסיסמה נשמרו ואי אפשר לשנות אותם כעת';
export { EMAIL_INVALID_TEXT, EMAIL_REQUIRED_TEXT, GENERIC_ERROR_TEXT, RATE_LIMITED_TEXT };

const CREDENTIAL_TEXTS: Record<CredentialsErrorCode, string> = {
  email_required: EMAIL_REQUIRED_TEXT,
  email_invalid: EMAIL_INVALID_TEXT,
  password_length: PASSWORD_LENGTH_TEXT,
};

export interface CredentialErrors {
  email?: string;
  password?: string;
}

function textOf(message: string): string {
  for (const [code, text] of Object.entries(CREDENTIAL_TEXTS)) {
    if (code === message) return text;
  }
  return GENERIC_ERROR_TEXT;
}

export type CredentialsResult =
  | { ok: true; value: { email: string; password: string } }
  | { ok: false; errors: CredentialErrors };

/** VAL-002 and VAL-003 against the shared schema; one text per field, the first issue's. */
export function validateCredentials(email: string, password: string): CredentialsResult {
  const result = registrationCredentialsInput.safeParse({ email, password });
  if (result.success) return { ok: true, value: result.data };
  const errors: CredentialErrors = {};
  for (const issue of result.error.issues) {
    const [field] = issue.path;
    if (field === 'email') errors.email ??= textOf(issue.message);
    else if (field === 'password') errors.password ??= textOf(issue.message);
  }
  return { ok: false, errors };
}

/** VAL-003 alone, for the Google user's completion (the email is Google's): the same rule and text as in `validateCredentials`. */
export function validatePassword(password: string): string | null {
  const result = registrationCredentialsInput.shape.password.safeParse(password);
  return result.success ? null : PASSWORD_LENGTH_TEXT;
}

/** What a failed Auth sign-up means for the screen. */
export type SignUpProblem = 'taken' | 'weak_password' | 'rate_limited' | 'unavailable' | 'unknown';

/** Reads the status, code and name of an Auth failure; the library's message is never looked at. */
export function classifySignUpFailure(failure: AuthFailure): SignUpProblem {
  if (failure.code === 'user_already_exists' || failure.code === 'email_exists') return 'taken';
  if (failure.code === 'weak_password' || failure.name === 'AuthWeakPasswordError') return 'weak_password';
  if (failure.status === 429 || failure.code === 'over_request_rate_limit' || failure.code === 'over_email_send_rate_limit') {
    return 'rate_limited';
  }
  // Any 5xx or a call that did not reach Auth is a retryable outage (auth-js leaves some 5xx as plain API errors).
  if (failure.name === 'AuthRetryableFetchError' || failure.status === 0) return 'unavailable';
  if (failure.status !== undefined && failure.status >= 500) return 'unavailable';
  return 'unknown';
}
