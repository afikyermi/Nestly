import { FULL_NAME_MAX_LENGTH, FULL_NAME_MIN_LENGTH, type RegistrationErrorCode } from '@nestly/shared';

// ERR-003 (SRS §10), widened to "missing or invalid" at F1.3 Gate 1 (DR-4). The shared schemas return codes; this is the
// only place a code becomes text, so no Zod message ever reaches the DOM. A code with no entry in DR-4 or the SRS shows
// the generic message.
export const GENERIC_ERROR_TEXT = 'משהו השתבש. אפשר לנסות שוב';

const DATE_NOT_REAL = 'התאריך אינו תקין. יש לבדוק יום, חודש ושנה';

export const REGISTRATION_ERROR_TEXTS: Record<RegistrationErrorCode, string> = {
  stage_required: 'יש לבחור לפחות אפשרות אחת', // VAL-039 · ERR-003
  stage_invalid: GENERIC_ERROR_TEXT, // VAL-039, no DR-4 text
  stage_conflict: GENERIC_ERROR_TEXT, // VAL-039, the UI cannot produce it
  full_name_required: 'יש למלא שם מלא', // VAL-001 · ERR-003
  full_name_length: `שם מלא צריך להכיל ${FULL_NAME_MIN_LENGTH} עד ${FULL_NAME_MAX_LENGTH} תווים`, // VAL-001 · ERR-003
  parent_gender_invalid: GENERIC_ERROR_TEXT, // VAL-006, a select cannot produce it
  due_date_partial: 'יש להשלים את התאריך או להשאיר אותו ריק', // FR-REG-002 · ERR-003
  due_date_invalid: DATE_NOT_REAL, // FR-REG-002 · ERR-003 (DR-4 "date does not exist")
  due_date_out_of_range: GENERIC_ERROR_TEXT, // DR-1, DR-4 gives no text
  children_required: GENERIC_ERROR_TEXT, // VAL-040, no DR-4 text
  children_too_many: GENERIC_ERROR_TEXT, // VAL-040, the UI cannot produce it
  child_name_required: 'יש למלא שם', // DR-2 · ERR-003
  child_name_length: GENERIC_ERROR_TEXT, // DR-2, no DR-4 text
  child_sex_required: 'יש לבחור מין', // VAL-006 · ERR-003
  child_sex_invalid: GENERIC_ERROR_TEXT, // VAL-006, a select cannot produce it
  birth_date_required: 'יש למלא תאריך לידה', // VAL-005 · ERR-003
  birth_date_invalid: DATE_NOT_REAL, // VAL-005 · ERR-003
  birth_date_future: 'תאריך הלידה לא יכול להיות בעתיד', // VAL-005 · ERR-003
  birth_date_out_of_range: GENERIC_ERROR_TEXT, // DR-3, no DR-4 text
};

/** The user-facing text of a schema issue message; anything that is not one of our codes is the generic text. */
export function errorTextFor(message: string): string {
  for (const [code, text] of Object.entries(REGISTRATION_ERROR_TEXTS)) {
    if (code === message) return text;
  }
  return GENERIC_ERROR_TEXT;
}
