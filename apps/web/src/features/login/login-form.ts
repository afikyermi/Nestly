import { registrationCredentialsInput } from '@nestly/shared';
import { EMAIL_INVALID_TEXT, EMAIL_REQUIRED_TEXT, GENERIC_ERROR_TEXT, RATE_LIMITED_TEXT } from '@/lib/auth-texts';
import type { SessionNotice } from '@/services/session/session-source';
import type { SignInProblem } from '@/services/auth/sign-in-problem';

// The login screen's texts and its field check (F1.5 criteria 5, 6, 8, 11, 18). This is the only place a sign-in problem, a session
// notice or a validation code becomes text, so no Auth, server or Zod string reaches the DOM.

export const PASSWORD_REQUIRED_TEXT = 'יש למלא סיסמה'; // FR-AUTH-002 · ERR-003
export const INVALID_CREDENTIALS_TEXT = 'האימייל או הסיסמה שגויים. אפשר לנסות שוב'; // ERR-001: names neither field
export const SIGN_IN_FAILED_TEXT = 'ההתחברות לא הצליחה. אפשר לנסות שוב';
export const STOPPED_TEXT = 'הכניסה לחשבון הזה אינה זמינה כרגע'; // DR-1: no reason, no length
export const EXPIRED_TEXT = 'ההתחברות פגה. אפשר להתחבר שוב';

const PROBLEM_TEXTS: Record<SignInProblem, string> = {
  invalid_credentials: INVALID_CREDENTIALS_TEXT,
  rate_limited: RATE_LIMITED_TEXT,
  unavailable: SIGN_IN_FAILED_TEXT,
  unknown: GENERIC_ERROR_TEXT,
};

const NOTICE_TEXTS: Record<SessionNotice, string> = {
  expired: EXPIRED_TEXT,
  stopped: STOPPED_TEXT,
};

export const problemText = (problem: SignInProblem): string => PROBLEM_TEXTS[problem];
export const noticeText = (notice: SessionNotice): string => NOTICE_TEXTS[notice];

export interface LoginErrors {
  email?: string;
  password?: string;
}

// VAL-002 judges the email, trimmed (the shared email schema alone); the password is only required to be non-empty (Q4: an old
// password must reach Auth's answer, and a length hint would reveal the rule).
export type LoginCheck = { ok: true; value: { email: string; password: string } } | { ok: false; errors: LoginErrors };

export function validateLogin(email: string, password: string): LoginCheck {
  const checked = registrationCredentialsInput.shape.email.safeParse(email);
  const errors: LoginErrors = {};
  if (!checked.success) {
    // One text, from the first issue; any code other than 'required' reads as 'invalid'.
    errors.email = checked.error.issues[0]?.message === 'email_required' ? EMAIL_REQUIRED_TEXT : EMAIL_INVALID_TEXT;
  }
  if (password === '') errors.password = PASSWORD_REQUIRED_TEXT;
  if (!checked.success || errors.password !== undefined) return { ok: false, errors };
  return { ok: true, value: { email: checked.data, password } };
}
