// Registration step 1 (FR-REG-002): the web form's validation now, and F1.4's server input contract later.
// The schema takes the form as typed (all texts), judges it against `today`, and outputs the clean value.
// Every issue message is a stable code from REGISTRATION_ERROR_CODES; the web app maps codes to ERR-003 texts.
import { z } from 'zod';
import {
  CHILD_BIRTH_DATE_FLOOR,
  CHILD_NAME_MAX_LENGTH,
  CHILD_NAME_MIN_LENGTH,
  CHILD_SEXES,
  DUE_DATE_DAYS_AFTER_TODAY,
  DUE_DATE_DAYS_BEFORE_TODAY,
  FULL_NAME_MAX_LENGTH,
  FULL_NAME_MIN_LENGTH,
  JOURNEY_STAGES,
  MAX_CHILDREN,
  PARENT_GENDERS,
  RAW_NAME_MAX_UNITS,
  RAW_TOKEN_MAX_UNITS,
  type ChildSex,
  type JourneyStage,
  type ParentGender,
} from '../constants/index.js';
import { addDaysIso, checkDateParts } from './dates.js';
import { checkName } from './text.js';

export const REGISTRATION_ERROR_CODES = [
  'stage_required',
  'stage_invalid',
  'stage_conflict',
  'full_name_required',
  'full_name_length',
  'parent_gender_invalid',
  'due_date_partial',
  'due_date_invalid',
  'due_date_out_of_range',
  'children_required',
  'children_too_many',
  'child_name_required',
  'child_name_length',
  'child_sex_required',
  'child_sex_invalid',
  'birth_date_required',
  'birth_date_invalid',
  'birth_date_future',
  'birth_date_out_of_range',
] as const;
export type RegistrationErrorCode = (typeof REGISTRATION_ERROR_CODES)[number];

// Strict at every level and bounded on the raw string, before the transform splits anything into code points
// (F1.4 criterion 2, the F1.3 debt). The bound failures carry the code of the rule they stand for.
const token = (code: RegistrationErrorCode) => z.string().max(RAW_TOKEN_MAX_UNITS, code);

const dateParts = (code: RegistrationErrorCode) =>
  z.strictObject({ day: token(code), month: token(code), year: token(code) });

const childInput = z.strictObject({
  name: z.string().max(RAW_NAME_MAX_UNITS, 'child_name_length'),
  sex: token('child_sex_invalid'),
  birthDate: dateParts('birth_date_invalid'),
});

/** The form as the user left it. Values of an unticked choice may still be here; the output drops them (Q3). */
export const registrationStep1Input = z.strictObject({
  stages: z.array(token('stage_invalid')).max(JOURNEY_STAGES.length, 'stage_invalid'),
  fullName: z.string().max(RAW_NAME_MAX_UNITS, 'full_name_length'),
  parentGender: token('parent_gender_invalid').optional(),
  dueDate: dateParts('due_date_invalid'),
  children: z.array(childInput).max(MAX_CHILDREN, 'children_too_many'),
});
export type RegistrationStep1Input = z.input<typeof registrationStep1Input>;

export type RegistrationChild = { name: string; sex: ChildSex; birthDate: string };

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
function isChildSex(value: string): value is ChildSex {
  return CHILD_SEXES.some((sex) => sex === value);
}
function isParentGender(value: string): value is ParentGender {
  return PARENT_GENDERS.some((gender) => gender === value);
}

/** Registration step 1 against a fixed "today" (YYYY-MM-DD: the device's local date on the web, the server's UTC date plus the Q4 day of tolerance on the server). */
export function createRegistrationStep1Schema(today: string) {
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

    // Due date (DR-1): only with the pregnant stage; optional.
    let dueDate: string | null = null;
    if (pregnant) {
      const due = checkDateParts(input.dueDate);
      if (due.kind === 'partial') fail('due_date_partial', ['dueDate']);
      else if (due.kind === 'invalid') fail('due_date_invalid', ['dueDate']);
      else if (due.kind === 'date') {
        if (due.iso < addDaysIso(today, -DUE_DATE_DAYS_BEFORE_TODAY) || due.iso > addDaysIso(today, DUE_DATE_DAYS_AFTER_TODAY)) {
          fail('due_date_out_of_range', ['dueDate']);
        } else dueDate = due.iso;
      }
    }

    // Children (VAL-040, VAL-005, VAL-006): only with the has-child stage.
    const children: RegistrationChild[] = [];
    if (hasChild) {
      if (input.children.length === 0) fail('children_required', ['children']);
      else {
        input.children.forEach((child, index) => {
          const childName = checkName(child.name, CHILD_NAME_MIN_LENGTH, CHILD_NAME_MAX_LENGTH);
          if (!childName.ok) fail(childName.reason === 'empty' ? 'child_name_required' : 'child_name_length', ['children', index, 'name']);

          if (child.sex === '') fail('child_sex_required', ['children', index, 'sex']);
          else if (!isChildSex(child.sex)) fail('child_sex_invalid', ['children', index, 'sex']);

          const born = checkDateParts(child.birthDate);
          let birthDate: string | null = null;
          if (born.kind === 'empty' || born.kind === 'partial') fail('birth_date_required', ['children', index, 'birthDate']);
          else if (born.kind === 'invalid') fail('birth_date_invalid', ['children', index, 'birthDate']);
          else if (born.iso > today) fail('birth_date_future', ['children', index, 'birthDate']);
          else if (born.iso < CHILD_BIRTH_DATE_FLOOR) fail('birth_date_out_of_range', ['children', index, 'birthDate']);
          else birthDate = born.iso;

          if (childName.ok && isChildSex(child.sex) && birthDate !== null) {
            children.push({ name: childName.value, sex: child.sex, birthDate });
          }
        });
      }
    }

    if (ctx.issues.length > 0 || !name.ok) return z.NEVER;
    return { stages, fullName: name.value, parentGender, dueDate, children };
  });
}
