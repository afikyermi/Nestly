import { GENERIC_ERROR_TEXT } from '@/lib/auth-texts';
import { checkAnswers, type AnswerEntry, type AnswerErrors, type AnswerValues } from '@/lib/recovery-answers';
import { RECOVERY_LOCKED_TEXT, RECOVERY_MISMATCH_TEXT } from '@/lib/recovery-texts';
import type { RecoveryOutcome } from '@/services/api/recovery';

// The questions screen texts (F1.6 criteria 17, 18) and its check before anything is sent. This is the only place a status becomes
// text on this screen, so no server string reaches the DOM.

export const INTRO_TEXT =
  'אם תשכחו את הסיסמה, התשובות לשתי שאלות יאפשרו לכם לקבוע סיסמה חדשה. בלי תשובות שמורות, לא נוכל לשחזר סיסמה שנשכחה.';
export const CHANGE_INTRO_TEXT = 'כדי להחליף את השאלות, צריך קודם לענות על השתיים ששמרתם עכשיו.';
export const SAVE_FAILED_TEXT = 'השמירה לא הצליחה. אפשר לנסות שוב';
export const CHANGED_TEXT = 'השאלות נשמרו';

export const saveFailureText = (outcome: Exclude<RecoveryOutcome, 'done'>): string => {
  if (outcome === 'locked') return RECOVERY_LOCKED_TEXT;
  if (outcome === 'mismatch') return RECOVERY_MISMATCH_TEXT;
  return outcome === 'unavailable' ? SAVE_FAILED_TEXT : GENERIC_ERROR_TEXT;
};

export interface QuestionsErrors {
  current?: AnswerErrors;
  answers?: AnswerErrors;
}

export type QuestionsCheck =
  | { ok: true; current: AnswerEntry[]; answers: AnswerEntry[] }
  | { ok: false; errors: QuestionsErrors };

/** `current` is checked only in change mode (`withCurrent`); in setup it is empty and ignored. */
export function validateQuestions(withCurrent: boolean, current: AnswerValues, answers: AnswerValues): QuestionsCheck {
  const checkedCurrent = withCurrent ? checkAnswers(current) : { ok: true as const, entries: [] };
  const checkedAnswers = checkAnswers(answers);
  if (checkedCurrent.ok && checkedAnswers.ok) return { ok: true, current: checkedCurrent.entries, answers: checkedAnswers.entries };
  const errors: QuestionsErrors = {};
  if (!checkedCurrent.ok) errors.current = checkedCurrent.errors;
  if (!checkedAnswers.ok) errors.answers = checkedAnswers.errors;
  return { ok: false, errors };
}
