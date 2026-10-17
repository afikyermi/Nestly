import type { RegistrationErrorCode } from '@nestly/shared';
import { GENERIC_ERROR_TEXT } from '@/lib/auth-texts';
import { CHILD_ERROR_TEXTS, dueDateErrorTexts } from '@/lib/child-fields';
import { FULL_NAME_LENGTH_TEXT, FULL_NAME_REQUIRED_TEXT } from '@/lib/profile-fields';

// ERR-003 (SRS §10), widened to "missing or invalid" at F1.3 Gate 1 (DR-4); the three range texts were decided in the F1.3
// review (decisions/2026-10.md). The shared schemas return codes; this is the only place a code becomes text, so no Zod
// message ever reaches the DOM. The generic text is for codes the UI cannot produce.
export { GENERIC_ERROR_TEXT };

/** Every code with its text. `today` (YYYY-MM-DD) is the date the schema judged against, for the due-date range. */
export function registrationErrorTexts(today: string): Record<RegistrationErrorCode, string> {
  return {
    stage_required: 'יש לבחור לפחות אפשרות אחת', // VAL-039 · ERR-003
    stage_invalid: GENERIC_ERROR_TEXT, // VAL-039, the UI cannot produce it
    stage_conflict: GENERIC_ERROR_TEXT, // VAL-039, the UI cannot produce it
    full_name_required: FULL_NAME_REQUIRED_TEXT, // VAL-001 · ERR-003
    full_name_length: FULL_NAME_LENGTH_TEXT, // VAL-001 · ERR-003
    parent_gender_invalid: GENERIC_ERROR_TEXT, // VAL-006, a select cannot produce it
    ...dueDateErrorTexts(today), // FR-REG-002, DR-1 · ERR-003 (lib/child-fields.ts)
    children_required: GENERIC_ERROR_TEXT, // VAL-040, a card is always present while the choice is ticked
    children_too_many: GENERIC_ERROR_TEXT, // VAL-040, the UI cannot produce it
    ...CHILD_ERROR_TEXTS, // DR-2, DR-3, VAL-005, VAL-006 · ERR-003 (lib/child-fields.ts)
  };
}

/** The user-facing text of a schema issue message; anything that is not one of our codes is the generic text. */
export function errorTextFor(message: string, today: string): string {
  for (const [code, text] of Object.entries(registrationErrorTexts(today))) {
    if (code === message) return text;
  }
  return GENERIC_ERROR_TEXT;
}
