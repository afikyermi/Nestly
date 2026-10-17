// The server's "today" for rules that compare a date with today (F1.4 Q4): the UTC date plus one day of tolerance, so a parent
// whose local date is already tomorrow is never refused. Registration and the own-child add and edit (F2.2a c5) read it.
import { addDaysIso } from '@nestly/shared';

export function serverToday(now: Date): string {
  return addDaysIso(now.toISOString().slice(0, 10), 1);
}
