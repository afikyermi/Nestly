// When something was published, as a relative time (Afik 21.10.2026, decision 11.8): every publication — a post, a comment, a story, an article,
// a review, a listing, an announcement — shows "לפני 5 דקות", "לפני 3 שעות", "לפני יומיים", "לפני חודש", "לפני שנתיים". Less than a minute (or a
// time a little ahead of the reader's clock) is "עכשיו". The exact date and time stay available beside it (formatPostTime, in a title).

const relative = new Intl.RelativeTimeFormat('he', { numeric: 'always' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export const JUST_NOW_TEXT = 'עכשיו';

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return iso;
  const ago = now.getTime() - at;
  if (ago < MINUTE) return JUST_NOW_TEXT;
  if (ago < HOUR) return relative.format(-Math.floor(ago / MINUTE), 'minute');
  if (ago < DAY) return relative.format(-Math.floor(ago / HOUR), 'hour');
  // "לפני יום" reads better than the formatter's "לפני יום 1"
  if (ago < 2 * DAY) return 'לפני יום';
  if (ago < MONTH) return relative.format(-Math.floor(ago / DAY), 'day');
  if (ago < YEAR) return relative.format(-Math.floor(ago / MONTH), 'month');
  return relative.format(-Math.floor(ago / YEAR), 'year');
}
