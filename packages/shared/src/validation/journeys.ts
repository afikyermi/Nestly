// The own journeys and children (I2 F2.2a; FR-PROFILE-002, PG-012). The add and edit body of a child is the registration child
// (validation/child.ts), checked with the same rule on the web before anything is sent and on the server again against the
// server's date (criterion 5). The body is strict: any key besides the three, such as a user id, a slot or an id, is refused
// (data-model rules 12, 14). A child is named in a path by its row id only, never by a user id.
import { z } from 'zod';
import { CHILD_SEXES, JOURNEY_STAGES } from '../constants/index.js';
import { CHILD_ERROR_CODES, checkChild, childInput, type ChildErrorCode, type RegistrationChild } from './child.js';

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

/** The path of PUT /api/children/:id. An id that is not a uuid's text form is refused before any query (else 22P02 -> 500). */
export const childPathParams = z.object({ id: z.guid() });

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
 * GET /api/journeys, and the answer of a child add or edit: the caller's journeys (in the order of JOURNEY_STAGES) and children
 * (by slot). The web checks every answer with it before using it.
 */
export const ownJourneysResponse = z.object({
  journeys: z.array(ownJourney),
  children: z.array(ownChild),
});
export type OwnJourneys = z.infer<typeof ownJourneysResponse>;
