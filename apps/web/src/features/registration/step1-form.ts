import { createRegistrationStep1Schema, type RegistrationStep1, type RegistrationStep1Input } from '@nestly/shared';
import { errorTextFor } from './error-texts';

/** Step 1 as the user left it: the shared schema's input. Values of an unticked choice stay here (Q3) and never reach the output. */
export type Step1Form = RegistrationStep1Input;

export const EMPTY_STEP1_FORM: Step1Form = {
  stages: [],
  fullName: '',
  parentGender: '',
  dueDate: { day: '', month: '', year: '' },
  children: [],
};

/** The top-level fields an error can belong to. */
export type Step1Field = 'stages' | 'fullName' | 'parentGender' | 'dueDate' | 'children';
export type Step1Errors = Partial<Record<Step1Field, string>>;

const FIELDS: readonly Step1Field[] = ['stages', 'fullName', 'parentGender', 'dueDate', 'children'];

function fieldOf(path: readonly PropertyKey[]): Step1Field | null {
  const head = path[0];
  return FIELDS.find((field) => field === head) ?? null;
}

export type Step1Result = { ok: true; value: RegistrationStep1 } | { ok: false; errors: Step1Errors };

/** Validates against the shared schema. `today` is the device's local date (Q6). One text per field, the first issue's. */
export function validateStep1(form: Step1Form, today: string): Step1Result {
  const result = createRegistrationStep1Schema(today).safeParse(form);
  if (result.success) return { ok: true, value: result.data };
  const errors: Step1Errors = {};
  for (const issue of result.error.issues) {
    const field = fieldOf(issue.path);
    if (field !== null && errors[field] === undefined) errors[field] = errorTextFor(issue.message);
  }
  return { ok: false, errors };
}
