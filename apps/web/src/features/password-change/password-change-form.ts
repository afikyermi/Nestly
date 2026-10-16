import { registrationCredentialsInput } from '@nestly/shared';
import { GENERIC_ERROR_TEXT } from '@/lib/auth-texts';
import { checkAnswers, type AnswerEntry, type AnswerErrors, type AnswerValues } from '@/lib/recovery-answers';
import {
  RECOVERY_LOCKED_TEXT,
  RECOVERY_MISMATCH_TEXT,
  RECOVERY_PASSWORD_LENGTH_TEXT,
  RECOVERY_UNAVAILABLE_TEXT,
} from '@/lib/recovery-texts';
import type { RecoveryOutcome } from '@/services/api/recovery';

// The password-change screen texts (F2.0 c15, copy Q-3) and its check before anything is sent: the two current answers by the
// shared answer rule, the new password by VAL-003. This is the only place a status becomes text on this screen.

export const TITLE = 'החלפת סיסמה';
export const INTRO_TEXT = 'כדי להחליף את הסיסמה, צריך קודם לענות על שתי שאלות השחזור ששמרתם.';
export const CHANGED_TEXT = 'הסיסמה הוחלפה. שאר המכשירים נותקו מהחשבון';

const FAILURE_TEXTS: Record<Exclude<RecoveryOutcome, 'done'>, string> = {
  mismatch: RECOVERY_MISMATCH_TEXT, // ERR-042
  locked: RECOVERY_LOCKED_TEXT, // ERR-043
  unavailable: RECOVERY_UNAVAILABLE_TEXT, // ERR-044
  failed: GENERIC_ERROR_TEXT,
};

export const failureText = (outcome: Exclude<RecoveryOutcome, 'done'>): string => FAILURE_TEXTS[outcome];

export interface ChangeErrors {
  current?: AnswerErrors;
  password?: string;
}

export type ChangeCheck = { ok: true; current: AnswerEntry[]; password: string } | { ok: false; errors: ChangeErrors };

export function validateChange(current: AnswerValues, password: string): ChangeCheck {
  const checkedCurrent = checkAnswers(current);
  const passwordOk = registrationCredentialsInput.shape.password.safeParse(password).success;
  if (checkedCurrent.ok && passwordOk) return { ok: true, current: checkedCurrent.entries, password };
  const errors: ChangeErrors = {};
  if (!checkedCurrent.ok) errors.current = checkedCurrent.errors;
  if (!passwordOk) errors.password = RECOVERY_PASSWORD_LENGTH_TEXT;
  return { ok: false, errors };
}
