import {
  addDaysIso,
  CHILD_BIRTH_DATE_FLOOR,
  CHILD_NAME_MAX_LENGTH,
  DUE_DATE_DAYS_AFTER_TODAY,
  DUE_DATE_DAYS_BEFORE_TODAY,
  FULL_NAME_MAX_LENGTH,
  FULL_NAME_MIN_LENGTH,
  type RegistrationErrorCode,
} from '@nestly/shared';

// ERR-003 (SRS §10), widened to "missing or invalid" at F1.3 Gate 1 (DR-4); the three range texts were decided in the F1.3
// review (decisions/2026-10.md). The shared schemas return codes; this is the only place a code becomes text, so no Zod
// message ever reaches the DOM. The generic text is for codes the UI cannot produce.
export const GENERIC_ERROR_TEXT = 'משהו השתבש. אפשר לנסות שוב';

const DATE_NOT_REAL = 'התאריך אינו תקין. יש לבדוק יום, חודש ושנה';

/** YYYY-MM-DD as D.M.YYYY. */
function dayMonthYear(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${Number(day)}.${Number(month)}.${year}`;
}

/** Every code with its text. `today` (YYYY-MM-DD) is the date the schema judged against, for the due-date range. */
export function registrationErrorTexts(today: string): Record<RegistrationErrorCode, string> {
  return {
    stage_required: 'יש לבחור לפחות אפשרות אחת', // VAL-039 · ERR-003
    stage_invalid: GENERIC_ERROR_TEXT, // VAL-039, the UI cannot produce it
    stage_conflict: GENERIC_ERROR_TEXT, // VAL-039, the UI cannot produce it
    full_name_required: 'יש למלא שם מלא', // VAL-001 · ERR-003
    full_name_length: `שם מלא צריך להכיל ${FULL_NAME_MIN_LENGTH} עד ${FULL_NAME_MAX_LENGTH} תווים`, // VAL-001 · ERR-003
    parent_gender_invalid: GENERIC_ERROR_TEXT, // VAL-006, a select cannot produce it
    due_date_partial: 'יש להשלים את התאריך או להשאיר אותו ריק', // FR-REG-002 · ERR-003
    due_date_invalid: DATE_NOT_REAL, // FR-REG-002 · ERR-003 (DR-4 "date does not exist")
    due_date_out_of_range: `התאריך צריך להיות בין ${dayMonthYear(addDaysIso(today, -DUE_DATE_DAYS_BEFORE_TODAY))} ל-${dayMonthYear(addDaysIso(today, DUE_DATE_DAYS_AFTER_TODAY))}`, // DR-1 · ERR-003
    children_required: GENERIC_ERROR_TEXT, // VAL-040, a card is always present while the choice is ticked
    children_too_many: GENERIC_ERROR_TEXT, // VAL-040, the UI cannot produce it
    child_name_required: 'יש למלא שם', // DR-2 · ERR-003
    child_name_length: `שם צריך להכיל עד ${CHILD_NAME_MAX_LENGTH} תווים`, // DR-2 · ERR-003
    child_sex_required: 'יש לבחור מין', // VAL-006 · ERR-003
    child_sex_invalid: GENERIC_ERROR_TEXT, // VAL-006, a select cannot produce it
    birth_date_required: 'יש למלא תאריך לידה', // VAL-005 · ERR-003
    birth_date_invalid: DATE_NOT_REAL, // VAL-005 · ERR-003
    birth_date_future: 'תאריך הלידה לא יכול להיות בעתיד', // VAL-005 · ERR-003
    birth_date_out_of_range: `התאריך צריך להיות מ-${CHILD_BIRTH_DATE_FLOOR.slice(0, 4)} ואילך`, // DR-3 · ERR-003
  };
}

/** The user-facing text of a schema issue message; anything that is not one of our codes is the generic text. */
export function errorTextFor(message: string, today: string): string {
  for (const [code, text] of Object.entries(registrationErrorTexts(today))) {
    if (code === message) return text;
  }
  return GENERIC_ERROR_TEXT;
}
