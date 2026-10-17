import {
  checkChild,
  checkDueDate,
  type ChildField,
  type ChildInput,
  type DateParts,
  type OwnChild,
  type OwnJourney,
  type OwnJourneys,
} from '@nestly/shared';
import { CHILD_ERROR_TEXTS, dueDateErrorTexts, SEX_LABELS, STAGE_LABELS } from '@/lib/child-fields';

// The "המסע שלי" section's texts (F2.2a, F2.2b; Q1: copy as the spec wrote it, reused texts in their registration wording) and its
// child and due-date checks before anything is sent: the same shared rules the server applies (checkChild, VAL-043, VAL-006,
// VAL-005; checkDueDate, VAL-044). This is the only place a code or a status becomes text in the section.

export const SECTION_TITLE = 'המסע שלי';
export const ADD_CHILD_TEXT = 'הוספת ילד';
export const ADD_PREGNANCY_TEXT = 'הוספת הריון';
export const EDIT_TEXT = 'עריכה';
export const DUE_DATE_LABEL = 'תאריך לידה משוער';
export const DUE_DATE_NOT_GIVEN_TEXT = 'לא צוין';
export const LOADING_TEXT = 'טוענים את פרטי המסע';
export const LOAD_FAILED_TEXT = 'לא הצלחנו לטעון את פרטי המסע. אפשר לנסות שוב'; // c2 · ERR-004
export const RETRY_TEXT = 'נסו שוב';
export const SAVE_FAILED_TEXT = 'השמירה לא הצליחה. אפשר לנסות שוב'; // c12 · ERR-004
export const SAVED_TEXT = 'הפרטים נשמרו'; // c12
export const SAVING_TEXT = 'שומרים';
// F2.2b2 (Q1: as the spec wrote them; DR-2r's label).
export const REMOVE_TEXT = 'הסרה';
export const END_PREGNANCY_TEXT = 'סיום מסלול ההריון';
export const BIRTH_TEXT = 'הלידה התרחשה';
export const CANCEL_TEXT = 'ביטול';
export const NO_JOURNEY_TEXT = 'עוד לא נבחר שלב במסע'; // c21
export const DELETE_WARNING_TEXT = 'הפרטים יימחקו ולא ניתן לשחזר אותם'; // c16
export const END_PREGNANCY_QUESTION = 'לסיים את מסלול ההריון?'; // c16
export const PLANNING_ENDS_TEXT = "מסלול 'מתכננים' יסתיים ויימחק"; // c16, DR-3 A
export const ACTION_FAILED_TEXT = 'הפעולה לא הצליחה. אפשר לנסות שוב'; // c25 · ERR-004

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

/** A stored YYYY-MM-DD split back into the three parts of a date field. */
function partsOf(iso: string): DateParts {
  const [year = '', month = '', day = ''] = iso.split('-');
  return { day, month, year };
}

/** A stored child as the form's values, the date split back into its three parts. */
export function formValuesOf(child: OwnChild): ChildFormValues {
  return { name: child.name, sex: child.sex, birthDate: partsOf(child.birthDate) };
}

export const EMPTY_DUE_DATE: DateParts = { day: '', month: '', year: '' };

/** A stored pregnancy's due date as the form's three parts; empty when none was given. */
export const dueDateValuesOf = (journey: OwnJourney): DateParts =>
  journey.dueDate === null ? EMPTY_DUE_DATE : partsOf(journey.dueDate);

/** VAL-039: a pregnancy can be added only without one; with "מתכננים" stored it first asks to end it (DR-3 A, c16, c23). */
export const canAddPregnancy = (data: OwnJourneys): boolean => data.journeys.every((journey) => journey.stage !== 'pregnant');

/** Whether "מתכננים" is stored: adding a pregnancy then ends it, after a confirmation. */
export const hasPlanning = (data: OwnJourneys): boolean => data.journeys.some((journey) => journey.stage === 'planning');

export type DueDateFormCheck = { ok: true; value: DateParts } | { ok: false; error: string };

/** The shared due-date rule against `today` (the device's local date, YYYY-MM-DD). The values go as typed; all empty is none. */
export function checkDueDateForm(values: DateParts, today: string): DueDateFormCheck {
  const checked = checkDueDate(values, today);
  return checked.ok ? { ok: true, value: values } : { ok: false, error: dueDateErrorTexts(today)[checked.code] };
}

/** The shared child rule against `today` (the device's local date, YYYY-MM-DD). One text per field; the values go as typed. */
export function checkChildForm(values: ChildFormValues, today: string): ChildFormCheck {
  const checked = checkChild(values, today);
  if (checked.ok) return { ok: true, value: values };
  const errors: ChildFormErrors = {};
  for (const issue of checked.issues) errors[issue.field] ??= CHILD_ERROR_TEXTS[issue.code];
  return { ok: false, errors };
}
