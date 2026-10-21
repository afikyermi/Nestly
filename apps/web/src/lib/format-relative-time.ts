// When something was published, as a relative time (Afik 21.10.2026, decision 11.8): every publication — a post, a comment, a story, an article,
// a review, a listing, an announcement — shows "לפני 5 דקות", "לפני 3 שעות", "לפני יומיים", "לפני חודש", "לפני שנתיים". Less than a minute (or a
// time a little ahead of the reader's clock) is "עכשיו". The exact date and time stay available beside it (formatPostTime, in a title).

// Written out, not Intl.RelativeTimeFormat: browsers' ICU versions word Hebrew duals differently ("לפני חודשיים (2)" on one of them).
const UNITS = {
  minute: ['לפני דקה', 'לפני 2 דקות', 'דקות'],
  hour: ['לפני שעה', 'לפני שעתיים', 'שעות'],
  day: ['לפני יום', 'לפני יומיים', 'ימים'],
  month: ['לפני חודש', 'לפני חודשיים', 'חודשים'],
  year: ['לפני שנה', 'לפני שנתיים', 'שנים'],
} as const;
const ago = (count: number, unit: keyof typeof UNITS): string => {
  const [one, two, many] = UNITS[unit];
  return count <= 1 ? one : count === 2 ? two : `לפני ${count.toLocaleString('he-IL')} ${many}`;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export const JUST_NOW_TEXT = 'עכשיו';

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return iso;
  const elapsed = now.getTime() - at;
  if (elapsed < MINUTE) return JUST_NOW_TEXT;
  if (elapsed < HOUR) return ago(Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return ago(Math.floor(elapsed / HOUR), 'hour');
  if (elapsed < MONTH) return ago(Math.floor(elapsed / DAY), 'day');
  if (elapsed < YEAR) return ago(Math.floor(elapsed / MONTH), 'month');
  return ago(Math.floor(elapsed / YEAR), 'year');
}
