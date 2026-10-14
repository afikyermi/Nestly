// Calendar-date helpers for the registration forms. A date is typed as three text parts and leaves as YYYY-MM-DD.
// "Today" is always passed in (Q6: the device's local calendar date), so tests fix it.

/** What a date field holds before validation: three texts, as typed. */
export type DateParts = { day: string; month: string; year: string };

export type DatePartsCheck =
  | { kind: 'empty' }
  | { kind: 'partial' }
  | { kind: 'invalid' }
  | { kind: 'date'; iso: string };

const MS_PER_DAY = 86_400_000;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** Q7: ASCII digits only; day and month one or two digits; year four digits; surrounding spaces ignored. */
export function checkDateParts(parts: DateParts): DatePartsCheck {
  const day = parts.day.trim();
  const month = parts.month.trim();
  const year = parts.year.trim();
  if (day === '' && month === '' && year === '') return { kind: 'empty' };
  if (day === '' || month === '' || year === '') return { kind: 'partial' };
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) return { kind: 'invalid' };
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  const probe = new Date(Date.UTC(y, m - 1, d));
  // Date.UTC maps years 0..99 to 1900..1999; a four-digit year below 100 is rejected by the calendar round trip.
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return { kind: 'invalid' };
  return { kind: 'date', iso: `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}` };
}

/** The calendar date of a moment in the runtime's local time zone, as YYYY-MM-DD (Q6). */
export function localDateIso(now: Date): string {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
}

/** `iso` moved by whole days. Both sides are YYYY-MM-DD, so plain string comparison orders them. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const moved = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) + days * MS_PER_DAY);
  return `${pad(moved.getUTCFullYear(), 4)}-${pad(moved.getUTCMonth() + 1, 2)}-${pad(moved.getUTCDate(), 2)}`;
}
