// A child's fields (FR-REG-003, VAL-043, VAL-006, VAL-005; DR-2, DR-3 of F1.3): one rule, read by registration step 1 and by the
// own-child add and edit of I2 F2.2a (FR-PROFILE-002), on the web before anything is sent and on the server again. Issue
// messages are stable codes, the same registration codes in both places; the web maps them to ERR-003 texts.
import { z } from 'zod';
import {
  CHILD_BIRTH_DATE_FLOOR,
  CHILD_NAME_MAX_LENGTH,
  CHILD_NAME_MIN_LENGTH,
  CHILD_SEXES,
  RAW_NAME_MAX_UNITS,
  RAW_TOKEN_MAX_UNITS,
  type ChildSex,
} from '../constants/index.js';
import { checkDateParts } from './dates.js';
import { checkName } from './text.js';

/** The child codes of REGISTRATION_ERROR_CODES, in its order. */
export const CHILD_ERROR_CODES = [
  'child_name_required',
  'child_name_length',
  'child_sex_required',
  'child_sex_invalid',
  'birth_date_required',
  'birth_date_invalid',
  'birth_date_future',
  'birth_date_out_of_range',
] as const;
export type ChildErrorCode = (typeof CHILD_ERROR_CODES)[number];

/** A short text of a request, bounded on the raw string (F1.4 criterion 2). The bound failure carries the code of its rule. */
export const rawToken = (code: string) => z.string().max(RAW_TOKEN_MAX_UNITS, code);

/** A date as typed: three bounded texts, and no other key. */
export const rawDateParts = (code: string) => z.strictObject({ day: rawToken(code), month: rawToken(code), year: rawToken(code) });

/** One child as typed: the name, the sex ('' when not chosen) and the birth date in three parts. Strict: no other key. */
export const childInput = z.strictObject({
  name: z.string().max(RAW_NAME_MAX_UNITS, 'child_name_length'),
  sex: rawToken('child_sex_invalid'),
  birthDate: rawDateParts('birth_date_invalid'),
});
export type ChildInput = z.input<typeof childInput>;

/** A valid child: the name space-trimmed, the birth date YYYY-MM-DD. */
export type RegistrationChild = { name: string; sex: ChildSex; birthDate: string };

export type ChildField = 'name' | 'sex' | 'birthDate';
export interface ChildIssue {
  readonly field: ChildField;
  readonly code: ChildErrorCode;
}
export type ChildCheck = { ok: true; value: RegistrationChild } | { ok: false; issues: ChildIssue[] };

function isChildSex(value: string): value is ChildSex {
  return CHILD_SEXES.some((sex) => sex === value);
}

/**
 * The fields of one child against `today` (YYYY-MM-DD: the device's local date on the web, the server's UTC date plus the Q4 day
 * of tolerance on the server). Every failing field, in the order name, sex, birth date; one issue per field.
 */
export function checkChild(input: ChildInput, today: string): ChildCheck {
  const issues: ChildIssue[] = [];

  const name = checkName(input.name, CHILD_NAME_MIN_LENGTH, CHILD_NAME_MAX_LENGTH);
  if (!name.ok) issues.push({ field: 'name', code: name.reason === 'empty' ? 'child_name_required' : 'child_name_length' });

  const sex = input.sex;
  if (sex === '') issues.push({ field: 'sex', code: 'child_sex_required' });
  else if (!isChildSex(sex)) issues.push({ field: 'sex', code: 'child_sex_invalid' });

  const born = checkDateParts(input.birthDate);
  let birthDate: string | null = null;
  if (born.kind === 'empty' || born.kind === 'partial') issues.push({ field: 'birthDate', code: 'birth_date_required' });
  else if (born.kind === 'invalid') issues.push({ field: 'birthDate', code: 'birth_date_invalid' });
  else if (born.iso > today) issues.push({ field: 'birthDate', code: 'birth_date_future' });
  else if (born.iso < CHILD_BIRTH_DATE_FLOOR) issues.push({ field: 'birthDate', code: 'birth_date_out_of_range' });
  else birthDate = born.iso;

  if (name.ok && isChildSex(sex) && birthDate !== null) return { ok: true, value: { name: name.value, sex, birthDate } };
  return { ok: false, issues };
}
