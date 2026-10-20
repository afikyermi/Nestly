import { registrationCredentialsInput } from '@nestly/shared';
import { EMAIL_INVALID_TEXT, EMAIL_REQUIRED_TEXT, GENERIC_ERROR_TEXT } from '@/lib/auth-texts';
import { checkAnswers, type AnswerEntry, type AnswerErrors, type AnswerValues } from '@/lib/recovery-answers';
import {
  RECOVERY_LOCKED_DAY_TEXT,
  RECOVERY_LOCKED_TEXT,
  RECOVERY_MISMATCH_TEXT,
  RECOVERY_PASSWORD_LENGTH_TEXT,
  RECOVERY_UNAVAILABLE_TEXT,
} from '@/lib/recovery-texts';
import type { RecoveryOutcome } from '@/services/api/recovery';

// The recovery screen texts and its check before anything is sent (F1.6 criterion 16). The email and the password are judged by
// the shared schemas (VAL-002, VAL-003); the answers by the shared answer rule through checkAnswers.

export const RESET_DONE_TEXT = 'הסיסמה עודכנה. אפשר להתחבר עם הסיסמה החדשה';

const FAILURE_TEXTS: Record<Exclude<RecoveryOutcome, 'done'>, string> = {
  mismatch: RECOVERY_MISMATCH_TEXT,
  locked: RECOVERY_LOCKED_TEXT,
  'locked-day': RECOVERY_LOCKED_DAY_TEXT, // ERR-043, the ladder's 24-hour lock (NFR-SEC-010)
  unavailable: RECOVERY_UNAVAILABLE_TEXT,
  failed: GENERIC_ERROR_TEXT,
};

export const failureText = (outcome: Exclude<RecoveryOutcome, 'done'>): string => FAILURE_TEXTS[outcome];

export interface ResetErrors {
  email?: string;
  answers?: AnswerErrors;
  password?: string;
}

export type ResetCheck =
  | { ok: true; value: { email: string; answers: AnswerEntry[]; password: string } }
  | { ok: false; errors: ResetErrors };

export function validateReset(email: string, answers: AnswerValues, password: string): ResetCheck {
  const checkedEmail = registrationCredentialsInput.shape.email.safeParse(email);
  const checkedPassword = registrationCredentialsInput.shape.password.safeParse(password);
  const checkedAnswers = checkAnswers(answers);
  if (checkedEmail.success && checkedPassword.success && checkedAnswers.ok) {
    return { ok: true, value: { email: checkedEmail.data, answers: checkedAnswers.entries, password } };
  }
  const errors: ResetErrors = {};
  if (!checkedEmail.success) {
    errors.email = checkedEmail.error.issues[0]?.message === 'email_required' ? EMAIL_REQUIRED_TEXT : EMAIL_INVALID_TEXT;
  }
  if (!checkedAnswers.ok) errors.answers = checkedAnswers.errors;
  if (!checkedPassword.success) errors.password = RECOVERY_PASSWORD_LENGTH_TEXT;
  return { ok: false, errors };
}
