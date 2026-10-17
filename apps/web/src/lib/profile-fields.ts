import { FULL_NAME_MAX_LENGTH, FULL_NAME_MIN_LENGTH, PARENT_GENDERS, type ParentGender } from '@nestly/shared';

// The RegularProfile field texts that registration step 1 (FR-REG-002) and the profile screen (FR-PROFILE-001) both show. They live
// here, not in either feature, because a Feature never imports another Feature.

/** VAL-006 (OP-004 closed): the four parent genders, as registration step 1 offers them. */
export const GENDER_LABELS: Record<ParentGender, string> = {
  woman: 'אישה',
  man: 'גבר',
  other: 'אחר',
  prefer_not_to_say: 'מעדיפים לא לציין',
};
export const GENDER_OPTIONS = PARENT_GENDERS.map((value) => ({ value, label: GENDER_LABELS[value] }));

export const FULL_NAME_REQUIRED_TEXT = 'יש למלא שם מלא'; // VAL-001 · ERR-003
export const FULL_NAME_LENGTH_TEXT = `שם מלא צריך להכיל ${FULL_NAME_MIN_LENGTH} עד ${FULL_NAME_MAX_LENGTH} תווים`; // VAL-001 · ERR-003
