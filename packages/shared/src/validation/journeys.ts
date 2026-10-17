// The own journeys and children (I2 F2.2a; FR-PROFILE-002, PG-012). The add and edit body of a child is the registration child
// (validation/child.ts), checked with the same rule on the web before anything is sent and on the server again against the
// server's date (criterion 5). The body is strict: any key besides the three, such as a user id, a slot or an id, is refused
// (data-model rules 12, 14). A child is named in a path by its row id only, never by a user id.
import { z } from 'zod';
import { CHILD_SEXES, JOURNEY_STAGES } from '../constants/index.js';
import { CHILD_ERROR_CODES, checkChild, childInput, rawDateParts, type ChildErrorCode, type RegistrationChild } from './child.js';
import { DUE_DATE_ERROR_CODES, checkDueDate, type DueDateErrorCode } from './due-date.js';

/** Why a child body is refused: a child field's registration code, or `invalid_body` for everything else (shape, keys). */
export const CHILD_WRITE_REASONS = [...CHILD_ERROR_CODES, 'invalid_body'] as const;
export type ChildWriteReason = (typeof CHILD_WRITE_REASONS)[number];

export type ChildWriteCheck = { ok: true; value: RegistrationChild } | { ok: false; reason: ChildWriteReason };

const isChildCode = (message: string): message is ChildErrorCode => CHILD_ERROR_CODES.some((code) => code === message);

/**
 * POST /api/children and PUT /api/children/:id: `{ name, sex, birthDate: { day, month, year } }`, judged against `today`
 * (YYYY-MM-DD). The reason is the first issue's code, in the order name, sex, birth date; a wrong shape is `invalid_body`.
 */
export function checkChildWrite(body: unknown, today: string): ChildWriteCheck {
  const parsed = childInput.safeParse(body);
  if (!parsed.success) {
    // A raw bound failure carries its field's code; anything else (an unknown key, a missing field, a non-object) refuses the body.
    const [first] = parsed.error.issues;
    if (first === undefined || parsed.error.issues.some((issue) => !isChildCode(issue.message))) return { ok: false, reason: 'invalid_body' };
    return { ok: false, reason: isChildCode(first.message) ? first.message : 'invalid_body' };
  }
  const checked = checkChild(parsed.data, today);
  if (checked.ok) return checked;
  const [issue] = checked.issues;
  return { ok: false, reason: issue === undefined ? 'invalid_body' : issue.code };
}

/** The path of PUT and DELETE /api/children/:id. An id that is not a uuid's text form is refused before any query (else 22P02 -> 500). */
export const childPathParams = z.object({ id: z.guid() });

/** Why a due-date body is refused: a due-date registration code, or `invalid_body` for everything else (shape, keys). */
export const DUE_DATE_WRITE_REASONS = [...DUE_DATE_ERROR_CODES, 'invalid_body'] as const;
export type DueDateWriteReason = (typeof DUE_DATE_WRITE_REASONS)[number];

export type DueDateWriteCheck = { ok: true; value: string | null } | { ok: false; reason: DueDateWriteReason };

/** The pregnancy's due date as typed: three bounded texts, all empty for none. Strict: no other key. */
export const dueDateInput = z.strictObject({ dueDate: rawDateParts('due_date_invalid') });
export type DueDateInput = z.input<typeof dueDateInput>;

const isDueDateCode = (message: string): message is DueDateErrorCode => DUE_DATE_ERROR_CODES.some((code) => code === message);

/** A raw bound failure carries the due-date code; anything else (an unknown key, a missing field, a non-object) refuses the body. */
function dueDateBodyReason(issues: readonly z.core.$ZodIssue[]): DueDateWriteReason {
  const [first] = issues;
  if (first === undefined || issues.some((issue) => !isDueDateCode(issue.message))) return 'invalid_body';
  return isDueDateCode(first.message) ? first.message : 'invalid_body';
}

/**
 * POST /api/journeys and PUT /api/journeys/:id: `{ dueDate: { day, month, year } }`, judged against `today` and `earliestToday`
 * (YYYY-MM-DD, as checkDueDate). The value is YYYY-MM-DD, or null for no due date; a wrong shape is `invalid_body`.
 */
export function checkDueDateWrite(body: unknown, today: string, earliestToday: string = today): DueDateWriteCheck {
  const parsed = dueDateInput.safeParse(body);
  if (!parsed.success) return { ok: false, reason: dueDateBodyReason(parsed.error.issues) };
  const checked = checkDueDate(parsed.data.dueDate, today, earliestToday);
  return checked.ok ? checked : { ok: false, reason: checked.code };
}

/**
 * POST /api/journeys (F2.2b c15, c23): the due date, and `endPlanning: true` once the parent confirmed that "מתכננים" ends (DR-3 A).
 * Without it a stored planning journey makes the add a stage_conflict. Strict: no other key; `endPlanning` is `true` or absent.
 */
export const pregnancyAddInput = z.strictObject({ dueDate: rawDateParts('due_date_invalid'), endPlanning: z.literal(true).optional() });
export type PregnancyAddInput = z.input<typeof pregnancyAddInput>;

export type PregnancyAddCheck =
  | { ok: true; value: { dueDate: string | null; endPlanning: boolean } }
  | { ok: false; reason: DueDateWriteReason };

/** POST /api/journeys: the body as checkDueDateWrite judges it, plus the planning confirmation. */
export function checkPregnancyAddWrite(body: unknown, today: string, earliestToday: string = today): PregnancyAddCheck {
  const parsed = pregnancyAddInput.safeParse(body);
  if (!parsed.success) return { ok: false, reason: dueDateBodyReason(parsed.error.issues) };
  const checked = checkDueDate(parsed.data.dueDate, today, earliestToday);
  if (!checked.ok) return { ok: false, reason: checked.code };
  return { ok: true, value: { dueDate: checked.value, endPlanning: parsed.data.endPlanning === true } };
}

/** The path of PUT and DELETE /api/journeys/:id and POST /api/journeys/:id/birth: a uuid's text form, else 404 before any query. */
export const journeyPathParams = childPathParams;

export const ownJourney = z.object({
  id: z.string(),
  stage: z.enum(JOURNEY_STAGES),
  dueDate: z.string().nullable(),
});
export type OwnJourney = z.infer<typeof ownJourney>;

export const ownChild = z.object({
  id: z.string(),
  name: z.string(),
  sex: z.enum(CHILD_SEXES),
  birthDate: z.string(),
});
export type OwnChild = z.infer<typeof ownChild>;

/**
 * GET /api/journeys, and the answer of every write: the caller's journeys (in the order of JOURNEY_STAGES) and children (in the
 * order they were added). The web checks every answer with it before using it.
 */
export const ownJourneysResponse = z.object({
  journeys: z.array(ownJourney),
  children: z.array(ownChild),
});
export type OwnJourneys = z.infer<typeof ownJourneysResponse>;
