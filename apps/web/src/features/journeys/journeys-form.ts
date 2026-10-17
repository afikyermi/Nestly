import { checkChild, type ChildField, type ChildInput, type OwnChild, type OwnJourney } from '@nestly/shared';
import { CHILD_ERROR_TEXTS, SEX_LABELS, STAGE_LABELS } from '@/lib/child-fields';

// The "המסע שלי" section's texts (F2.2a; Q1: copy as the spec wrote it, reused texts in their registration wording) and its child
// check before anything is sent: the same shared rule the server applies (checkChild, VAL-043, VAL-006, VAL-005). This is the only
// place a code or a status becomes text in the section.

export const SECTION_TITLE = 'המסע שלי';
export const ADD_CHILD_TEXT = 'הוספת ילד';
export const EDIT_TEXT = 'עריכה';
export const DUE_DATE_LABEL = 'תאריך לידה משוער';
export const DUE_DATE_NOT_GIVEN_TEXT = 'לא צוין';
export const LOADING_TEXT = 'טוענים את פרטי המסע';
export const LOAD_FAILED_TEXT = 'לא הצלחנו לטעון את פרטי המסע. אפשר לנסות שוב'; // c2 · ERR-004
export const RETRY_TEXT = 'נסו שוב';
export const SAVE_FAILED_TEXT = 'השמירה לא הצליחה. אפשר לנסות שוב'; // c12 · ERR-004
export const SAVED_TEXT = 'הפרטים נשמרו'; // c12
export const SAVING_TEXT = 'שומרים';

/** The form as the user left it: the shared rule's input (the select's `""` is "not chosen"). */
export type ChildFormValues = ChildInput;
export type ChildFormErrors = Partial<Record<ChildField, string>>;
export type ChildFormCheck = { ok: true; value: ChildFormValues } | { ok: false; errors: ChildFormErrors };

export const EMPTY_CHILD_FORM: ChildFormValues = { name: '', sex: '', birthDate: { day: '', month: '', year: '' } };

/** YYYY-MM-DD as DD.MM.YYYY (Q1: dates as dd.mm.yyyy). A calendar date: no time zone is involved. */
export function dayMonthYear(iso: string): string {
  const [year = '', month = '', day = ''] = iso.split('-');
  return `${day}.${month}.${year}`;
}

/** One journey's line: the stage, and for a pregnancy its due date or "לא צוין". */
export function journeyText(journey: OwnJourney): string {
  if (journey.stage !== 'pregnant') return STAGE_LABELS[journey.stage];
  const due = journey.dueDate === null ? DUE_DATE_NOT_GIVEN_TEXT : dayMonthYear(journey.dueDate);
  return `${STAGE_LABELS.pregnant} · ${DUE_DATE_LABEL}: ${due}`;
}

/** The sex and birth date after a child's name: "בת · 04.05.2023". */
export const childDetailsText = (child: OwnChild): string => `${SEX_LABELS[child.sex]} · ${dayMonthYear(child.birthDate)}`;

/** A stored child as the form's values, the date split back into its three parts. */
export function formValuesOf(child: OwnChild): ChildFormValues {
  const [year = '', month = '', day = ''] = child.birthDate.split('-');
  return { name: child.name, sex: child.sex, birthDate: { day, month, year } };
}

/** The shared child rule against `today` (the device's local date, YYYY-MM-DD). One text per field; the values go as typed. */
export function checkChildForm(values: ChildFormValues, today: string): ChildFormCheck {
  const checked = checkChild(values, today);
  if (checked.ok) return { ok: true, value: values };
  const errors: ChildFormErrors = {};
  for (const issue of checked.issues) errors[issue.field] ??= CHILD_ERROR_TEXTS[issue.code];
  return { ok: false, errors };
}
