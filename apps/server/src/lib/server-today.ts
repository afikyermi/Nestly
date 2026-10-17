// The server's "today" for rules that compare a date with today (F1.4 Q4): the UTC date plus one day of tolerance, so a parent
// whose local date is already tomorrow is never refused. Registration and the own-child add and edit (F2.2a c5) read it.
// A window that also reaches back (the due date, VAL-044) anchors its lower bound on the earliest date a device can hold, the UTC
// date (serverEarliestToday), so a date the device accepted is never refused at either end (ORCHESTRATOR ruling, F2.2b c14).
import { addDaysIso } from '@nestly/shared';

/** The server's UTC date, YYYY-MM-DD. */
export function serverEarliestToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function serverToday(now: Date): string {
  return addDaysIso(serverEarliestToday(now), 1);
}
