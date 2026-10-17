// A pregnancy's estimated due date (FR-REG-002 DR-1, VAL-044): optional, and when given a real date from 30 days before `today`
// to 300 days after it. One rule, read by registration step 1 and by the own pregnancy's add and due-date edit of I2 F2.2b
// (FR-PROFILE-002), on the web before anything is sent and on the server again. The codes are the registration codes.
import { DUE_DATE_DAYS_AFTER_TODAY, DUE_DATE_DAYS_BEFORE_TODAY } from '../constants/index.js';
import { addDaysIso, checkDateParts, type DateParts } from './dates.js';

/** The due-date codes of REGISTRATION_ERROR_CODES, in its order. */
export const DUE_DATE_ERROR_CODES = ['due_date_partial', 'due_date_invalid', 'due_date_out_of_range'] as const;
export type DueDateErrorCode = (typeof DUE_DATE_ERROR_CODES)[number];

/** A valid due date is YYYY-MM-DD, or null when all three parts are empty. */
export type DueDateCheck = { ok: true; value: string | null } | { ok: false; code: DueDateErrorCode };

/**
 * The due date as typed, from 30 days before `earliestToday` to 300 days after `today` (YYYY-MM-DD). On the web both are the device's
 * local date. On the server they are the two dates a device can hold (F1.4 Q4): `earliestToday` the UTC date, `today` the UTC date
 * plus one day, so a date the device accepted is never refused (ORCHESTRATOR ruling on F2.2b c14). All three parts empty is no
 * due date.
 */
export function checkDueDate(parts: DateParts, today: string, earliestToday: string = today): DueDateCheck {
  const due = checkDateParts(parts);
  if (due.kind === 'empty') return { ok: true, value: null };
  if (due.kind === 'partial') return { ok: false, code: 'due_date_partial' };
  if (due.kind === 'invalid') return { ok: false, code: 'due_date_invalid' };
  if (due.iso < addDaysIso(earliestToday, -DUE_DATE_DAYS_BEFORE_TODAY) || due.iso > addDaysIso(today, DUE_DATE_DAYS_AFTER_TODAY)) {
    return { ok: false, code: 'due_date_out_of_range' };
  }
  return { ok: true, value: due.iso };
}
