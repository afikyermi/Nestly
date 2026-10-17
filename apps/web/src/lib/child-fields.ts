import {
  CHILD_BIRTH_DATE_FLOOR,
  CHILD_NAME_MAX_LENGTH,
  CHILD_SEXES,
  MAX_CHILDREN,
  type ChildErrorCode,
  type ChildSex,
  type JourneyStage,
} from '@nestly/shared';
import { GENERIC_ERROR_TEXT } from './auth-texts';

// The journey and child texts that registration step 1 (FR-REG-002, FR-REG-003) and the "המסע שלי" section of the profile
// (FR-PROFILE-002, F2.2a) both show. They live here, not in either feature, because a Feature never imports another Feature.

/** VAL-039: the three stages, as registration step 1 offers them. */
export const STAGE_LABELS: Record<JourneyStage, string> = {
  planning: 'מתכננים',
  pregnant: 'בהריון',
  has_child: 'יש לנו ילד או ילדה',
};

/** VAL-006 (OP-004 closed): a child's sex. */
export const SEX_LABELS: Record<ChildSex, string> = { boy: 'בן', girl: 'בת', unknown: 'עוד לא ידוע' };
export const SEX_OPTIONS = CHILD_SEXES.map((value) => ({ value, label: SEX_LABELS[value] }));
export const SEX_PLACEHOLDER = 'בחירה';

export const CHILD_NAME_LABEL = 'שם';
export const CHILD_SEX_LABEL = 'מין';
export const BIRTH_DATE_LABEL = 'תאריך לידה';

/** VAL-040: the note beside a disabled add action. */
export const CHILDREN_LIMIT_TEXT = `אפשר להוסיף עד ${MAX_CHILDREN} ילדים`;

/** ERR-003 "date does not exist" (F1.3 DR-4), for a birth date and a due date alike. */
export const DATE_NOT_REAL_TEXT = 'התאריך אינו תקין. יש לבדוק יום, חודש ושנה';

/** The child codes of the shared rule (validation/child.ts) with their ERR-003 texts. */
export const CHILD_ERROR_TEXTS: Record<ChildErrorCode, string> = {
  child_name_required: 'יש למלא שם', // DR-2 · ERR-003
  child_name_length: `שם צריך להכיל עד ${CHILD_NAME_MAX_LENGTH} תווים`, // DR-2 · ERR-003
  child_sex_required: 'יש לבחור מין', // VAL-006 · ERR-003
  child_sex_invalid: GENERIC_ERROR_TEXT, // VAL-006, a select cannot produce it
  birth_date_required: 'יש למלא תאריך לידה', // VAL-005 · ERR-003
  birth_date_invalid: DATE_NOT_REAL_TEXT, // VAL-005 · ERR-003
  birth_date_future: 'תאריך הלידה לא יכול להיות בעתיד', // VAL-005 · ERR-003
  birth_date_out_of_range: `התאריך צריך להיות מ-${CHILD_BIRTH_DATE_FLOOR.slice(0, 4)} ואילך`, // DR-3 · ERR-003
};
