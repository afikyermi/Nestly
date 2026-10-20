// Days in the product's time zone (Asia/Jerusalem). The database stores instants; a day, a period and a chart bucket are Israeli
// days, whatever the device's zone. Pure, no DOM and no Node API: Intl only.
import { TRACKER_LIMITS, TRACKER_TIME_ZONE } from '../constants/trackers.js';
import { addDaysIso, daysBetweenIso } from '../validation/dates.js';

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TRACKER_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TRACKER_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** The Israeli calendar day (YYYY-MM-DD) of an instant. */
export function israelDay(at: Date): string {
  return dayFormat.format(at);
}

/** The zone's offset from UTC at an instant, in minutes. */
function offsetMinutes(at: Date): number {
  const get = (type: string): number => Number(partsFormat.formatToParts(at).find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The instant an Israeli day starts. */
export function israelDayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
  const first = guess - offsetMinutes(new Date(guess)) * 60_000;
  const second = guess - offsetMinutes(new Date(first)) * 60_000;
  return new Date(second);
}

/** A period of whole days, both ends included. */
export interface Period {
  from: string;
  to: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Whether a text is a real calendar day, YYYY-MM-DD. */
export function isIsoDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  return addDaysIso(value, 0) === value;
}

export type PeriodCheck = { ok: true; value: Period } | { ok: false };

/** A period the user picked: two real days, from not after to, at most 366 days. */
export function checkPeriod(from: string, to: string): PeriodCheck {
  if (!isIsoDay(from) || !isIsoDay(to)) return { ok: false };
  const span = daysBetweenIso(from, to);
  if (span < 0 || span + 1 > TRACKER_LIMITS.maxPeriodDays) return { ok: false };
  return { ok: true, value: { from, to } };
}

/** The instants [start, end) a period covers. */
export function periodBounds(period: Period): { start: Date; end: Date } {
  return { start: israelDayStart(period.from), end: israelDayStart(addDaysIso(period.to, 1)) };
}

/** Every day of a period, in order. */
export function daysOf(period: Period): string[] {
  const out: string[] = [];
  for (let day = period.from; day <= period.to; day = addDaysIso(day, 1)) out.push(day);
  return out;
}
