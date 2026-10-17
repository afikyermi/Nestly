// Registration step 1 (FR-REG-002): the web form's validation now, and F1.4's server input contract later.
// The schema takes the form as typed (all texts), judges it against `today`, and outputs the clean value.
// Every issue message is a stable code from REGISTRATION_ERROR_CODES; the web app maps codes to ERR-003 texts.
import { z } from 'zod';
import {
  FULL_NAME_MAX_LENGTH,
  FULL_NAME_MIN_LENGTH,
  JOURNEY_STAGES,
  MAX_CHILDREN,
  PARENT_GENDERS,
  RAW_NAME_MAX_UNITS,
  type JourneyStage,
  type ParentGender,
} from '../constants/index.js';
import { CHILD_ERROR_CODES, checkChild, childInput, rawDateParts, rawToken, type RegistrationChild } from './child.js';
import { DUE_DATE_ERROR_CODES, checkDueDate } from './due-date.js';
import { checkName } from './text.js';

export const REGISTRATION_ERROR_CODES = [
  'stage_required',
  'stage_invalid',
  'stage_conflict',
  'full_name_required',
  'full_name_length',
  'parent_gender_invalid',
  ...DUE_DATE_ERROR_CODES,
  'children_required',
  'children_too_many',
  ...CHILD_ERROR_CODES,
] as const;
export type RegistrationErrorCode = (typeof REGISTRATION_ERROR_CODES)[number];

// Strict at every level and bounded on the raw string, before the transform splits anything into code points
// (F1.4 criterion 2, the F1.3 debt). The bound failures carry the code of the rule they stand for. The child is the shared
// child rule (validation/child.ts), also read by the own-child add and edit (F2.2a).
const token = (code: RegistrationErrorCode) => rawToken(code);
const dateParts = (code: RegistrationErrorCode) => rawDateParts(code);

/** The form as the user left it. Values of an unticked choice may still be here; the output drops them (Q3). */
export const registrationStep1Input = z.strictObject({
  stages: z.array(token('stage_invalid')).max(JOURNEY_STAGES.length, 'stage_invalid'),
  fullName: z.string().max(RAW_NAME_MAX_UNITS, 'full_name_length'),
  parentGender: token('parent_gender_invalid').optional(),
  dueDate: dateParts('due_date_invalid'),
  children: z.array(childInput).max(MAX_CHILDREN, 'children_too_many'),
});
export type RegistrationStep1Input = z.input<typeof registrationStep1Input>;

export type RegistrationStep1 = {
  stages: JourneyStage[];
  fullName: string;
  parentGender: ParentGender | null;
  dueDate: string | null;
  children: RegistrationChild[];
};

function isStage(value: string): value is JourneyStage {
  return JOURNEY_STAGES.some((stage) => stage === value);
}
function isParentGender(value: string): value is ParentGender {
  return PARENT_GENDERS.some((gender) => gender === value);
}

/**
 * Registration step 1 against a fixed "today" (YYYY-MM-DD: the device's local date on the web, the server's UTC date plus the Q4 day
 * of tolerance on the server). `earliestToday` is the due date's lower anchor only (checkDueDate): the server's UTC date.
 */
export function createRegistrationStep1Schema(today: string, earliestToday: string = today) {
  return registrationStep1Input.transform((input, ctx): RegistrationStep1 => {
    const fail = (code: RegistrationErrorCode, path: (string | number)[]) => {
      ctx.issues.push({ code: 'custom', message: code, input, path });
    };

    // Stage (VAL-039): one or more of the three, none repeated, planning never with pregnant.
    const stages: JourneyStage[] = [];
    if (input.stages.length === 0) fail('stage_required', ['stages']);
    else if (!input.stages.every(isStage) || new Set(input.stages).size !== input.stages.length) {
      fail('stage_invalid', ['stages']);
    } else {
      stages.push(...input.stages.filter(isStage));
      if (stages.includes('planning') && stages.includes('pregnant')) fail('stage_conflict', ['stages']);
    }
    const pregnant = stages.includes('pregnant');
    const hasChild = stages.includes('has_child');

    // Full name (VAL-001).
    const name = checkName(input.fullName, FULL_NAME_MIN_LENGTH, FULL_NAME_MAX_LENGTH);
    if (!name.ok) fail(name.reason === 'empty' ? 'full_name_required' : 'full_name_length', ['fullName']);

    // Parent gender (VAL-006): optional.
    let parentGender: ParentGender | null = null;
    if (input.parentGender !== undefined && input.parentGender !== '') {
      if (isParentGender(input.parentGender)) parentGender = input.parentGender;
      else fail('parent_gender_invalid', ['parentGender']);
    }

    // Due date (DR-1, VAL-044): only with the pregnant stage; optional.
    let dueDate: string | null = null;
    if (pregnant) {
      // The shared due-date rule (validation/due-date.ts), also read by the own pregnancy's add and edit (F2.2b).
      const due = checkDueDate(input.dueDate, today, earliestToday);
      if (due.ok) dueDate = due.value;
      else fail(due.code, ['dueDate']);
    }

    // Children (VAL-040, VAL-005, VAL-006): only with the has-child stage.
    const children: RegistrationChild[] = [];
    if (hasChild) {
      if (input.children.length === 0) fail('children_required', ['children']);
      else {
        input.children.forEach((child, index) => {
          const checked = checkChild(child, today);
          if (checked.ok) children.push(checked.value);
          else for (const issue of checked.issues) fail(issue.code, ['children', index, issue.field]);
        });
      }
    }

    if (ctx.issues.length > 0 || !name.ok) return z.NEVER;
    return { stages, fullName: name.value, parentGender, dueDate, children };
  });
}
