import { checkProfileUpdate, type OwnProfile, type ParentGender, type ProfileUpdate } from '@nestly/shared';
import { GENERIC_ERROR_TEXT } from '@/lib/auth-texts';
import { FULL_NAME_LENGTH_TEXT, FULL_NAME_REQUIRED_TEXT, GENDER_LABELS } from '@/lib/profile-fields';

// The profile screen's texts (F2.1; Q1, Q2) and its check before anything is sent: the same shared rule the server applies
// (checkProfileUpdate, VAL-001, VAL-006). This is the only place a code or a status becomes text on this screen.

export const TITLE = 'פרופיל';
export const FULL_NAME_LABEL = 'שם מלא';
export const GENDER_LABEL = 'מין ההורה';
export const GENDER_NOT_ANSWERED_TEXT = 'לא צוין'; // Q1: NULL, not answered
export const LOADING_TEXT = 'טוענים את הפרופיל';
export const LOAD_FAILED_TEXT = 'לא הצלחנו לטעון את הפרופיל. אפשר לנסות שוב'; // Q2 · ERR-004
export const SAVE_FAILED_TEXT = 'השמירה לא הצליחה. אפשר לנסות שוב'; // Q2 · ERR-004, the ERR-044 wording
export const SAVED_TEXT = 'הפרטים נשמרו'; // Q2
export const SAVING_TEXT = 'שומרים';

/** The form as the user left it: the select's `""` is "not answered". */
export interface ProfileFormValues {
  fullName: string;
  parentGender: string;
}

export interface ProfileFormErrors {
  fullName?: string;
  parentGender?: string;
}

export type ProfileFormCheck = { ok: true; value: ProfileUpdate } | { ok: false; errors: ProfileFormErrors };

export const genderText = (gender: ParentGender | null): string => (gender === null ? GENDER_NOT_ANSWERED_TEXT : GENDER_LABELS[gender]);

export const formValuesOf = (profile: OwnProfile): ProfileFormValues => ({
  fullName: profile.fullName,
  parentGender: profile.parentGender ?? '',
});

export function checkProfileForm(values: ProfileFormValues): ProfileFormCheck {
  const result = checkProfileUpdate({
    fullName: values.fullName,
    parentGender: values.parentGender === '' ? null : values.parentGender,
  });
  if (result.ok) return result;
  switch (result.reason) {
    case 'full_name_required':
      return { ok: false, errors: { fullName: FULL_NAME_REQUIRED_TEXT } };
    case 'full_name_length':
      return { ok: false, errors: { fullName: FULL_NAME_LENGTH_TEXT } };
    // A select of the four values cannot produce either.
    case 'parent_gender_invalid':
    case 'invalid_body':
      return { ok: false, errors: { parentGender: GENERIC_ERROR_TEXT } };
  }
}
