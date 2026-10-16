import { RECOVERY_ANSWER_COUNT, RECOVERY_QUESTION_IDS, recoveryAnswersInput, type RecoveryQuestionId } from '@nestly/shared';

// What the recovery screens (F1.6) share: the three answer fields as typed, and their check before anything is sent. The answers
// live in component memory only; the server normalises and hashes them, the browser sends what the user typed (criterion 17).

export type AnswerValues = Record<RecoveryQuestionId, string>;
export const EMPTY_ANSWERS: AnswerValues = { pet: '', nickname: '', street: '' };

export const ANSWER_COUNT_TEXT = 'יש לענות על שתיים מהשאלות, לא פחות ולא יותר';
export const ANSWER_LENGTH_TEXT = 'התשובה צריכה להכיל בין 2 ל-60 תווים, בלי רווחים וסימני פיסוק';

export interface AnswerErrors {
  /** The count is wrong: it belongs to the three fields together. */
  group?: string;
  fields: Partial<Record<RecoveryQuestionId, string>>;
}

export interface AnswerEntry {
  question: RecoveryQuestionId;
  answer: string;
}

export type AnswerCheck = { ok: true; entries: AnswerEntry[] } | { ok: false; errors: AnswerErrors };

const answerRule = recoveryAnswersInput.element.shape.answer;

/** Exactly two of the three fields filled, each one long enough once normalised (VAL: the shared answer rule). */
export function checkAnswers(values: AnswerValues): AnswerCheck {
  const filled = RECOVERY_QUESTION_IDS.filter((id) => values[id].trim() !== '');
  if (filled.length !== RECOVERY_ANSWER_COUNT) return { ok: false, errors: { group: ANSWER_COUNT_TEXT, fields: {} } };
  const fields: AnswerErrors['fields'] = {};
  for (const id of filled) {
    if (!answerRule.safeParse(values[id]).success) fields[id] = ANSWER_LENGTH_TEXT;
  }
  if (Object.keys(fields).length > 0) return { ok: false, errors: { fields } };
  return { ok: true, entries: filled.map((question) => ({ question, answer: values[question] })) };
}
