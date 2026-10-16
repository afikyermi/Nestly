// Recovery answers and the three recovery bodies (F1.6; FR-AUTH-003, VAL-003, spec "Answer storage"). The normaliser is
// pure and runs on the server only; the browser sends what the user typed. Bodies are strict objects: any unknown key, such
// as another user's id, is a 400.
import { z } from 'zod';
import {
  RAW_ANSWER_MAX_UNITS,
  RECOVERY_ANSWER_COUNT,
  RECOVERY_ANSWER_MAX_LENGTH,
  RECOVERY_ANSWER_MIN_LENGTH,
  RECOVERY_QUESTION_IDS,
} from '../constants/index.js';
import { registrationCredentialsInput } from './registration-credentials.js';
import { codePointLength } from './text.js';

const FINAL_LETTERS: Readonly<Record<string, string>> = {
  'ך': 'כ', // final kaf to kaf
  'ם': 'מ', // final mem to mem
  'ן': 'נ', // final nun to nun
  'ף': 'פ', // final pe to pe
  'ץ': 'צ', // final tsadi to tsadi
};
const FINAL_LETTER = /[ךםןףץ]/gu;
const NIQQUD_AND_CANTILLATION = /[֑-ׇ]/gu;
// Arabic-Indic (U+0660-0669) and Extended Arabic-Indic (U+06F0-06F9) digits.
const ARABIC_DIGIT = /[٠-٩۰-۹]/gu;
const ARABIC_INDIC_ZERO = 0x660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x6f0;
// Every space, separator, control or format character (RLM and the like) and every punctuation mark: hyphen, quotes,
// geresh and gershayim included.
const DROPPED = /[\p{Z}\p{C}\p{P}\s]/gu;

function arabicDigitToAscii(digit: string): string {
  const code = digit.charCodeAt(0);
  return String(code - (code >= EXTENDED_ARABIC_INDIC_ZERO ? EXTENDED_ARABIC_INDIC_ZERO : ARABIC_INDIC_ZERO));
}

/**
 * One value for every way of typing the same answer: Unicode NFKC, no niqqud or cantillation (U+0591-U+05C7), lower
 * case, final letters to regular ones, Arabic-Indic digits to 0-9, and no space, hyphen, quote, geresh or other
 * punctuation. "ab" and "abc" stay different.
 */
export function normalizeRecoveryAnswer(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(NIQQUD_AND_CANTILLATION, '')
    .toLowerCase()
    .replace(FINAL_LETTER, (letter) => FINAL_LETTERS[letter] ?? letter)
    .replace(ARABIC_DIGIT, arabicDigitToAscii)
    .replace(DROPPED, '');
}

/** The email as the recovery handle sees it: trimmed and lower-cased, the same for the token's claim and the form. */
export function normalizeRecoveryEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const answerText = z
  .string()
  .max(RAW_ANSWER_MAX_UNITS, 'answer_length')
  .transform(normalizeRecoveryAnswer)
  .refine(
    (value) => {
      const length = codePointLength(value);
      return length >= RECOVERY_ANSWER_MIN_LENGTH && length <= RECOVERY_ANSWER_MAX_LENGTH;
    },
    { error: 'answer_length' },
  );

const answerEntry = z.strictObject({ question: z.enum(RECOVERY_QUESTION_IDS), answer: answerText });

/** Exactly two entries, two different question ids. Output: the ids with their normalised answers, in the order given. */
export const recoveryAnswersInput = z
  .array(answerEntry)
  .length(RECOVERY_ANSWER_COUNT, 'answer_count')
  .refine((entries) => new Set(entries.map((entry) => entry.question)).size === entries.length, {
    error: 'answer_duplicate_question',
  });
export type RecoveryAnswersInput = z.output<typeof recoveryAnswersInput>;

/** POST /api/recovery-questions: the two chosen questions with their answers (AC-092). */
export const recoveryStoreRequest = z.strictObject({ answers: recoveryAnswersInput });

/** PUT /api/recovery-questions: the current two answers, then the new pair. */
export const recoveryChangeRequest = z.strictObject({ current: recoveryAnswersInput, answers: recoveryAnswersInput });

/** POST /api/recovery/reset: the email (VAL-002), two answers and the new password (VAL-003). */
export const recoveryResetRequest = z.strictObject({
  email: registrationCredentialsInput.shape.email,
  answers: recoveryAnswersInput,
  password: registrationCredentialsInput.shape.password,
});
