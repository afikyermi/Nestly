import { describe, expect, it } from 'vitest';
import { formatRelativeTime, JUST_NOW_TEXT } from '../src/lib/format-relative-time';

// Every publication shows a relative time: minutes, hours, days, months, years (Afik 21.10.2026, decision 11.8).
describe('[NFR-USAB-005 §11.8] the relative time of a publication', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');
  const ago = (ms: number): string => new Date(now.getTime() - ms).toISOString();
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it('says "now" under a minute, and for a time a little ahead of the clock', () => {
    expect(formatRelativeTime(ago(30_000), now)).toBe(JUST_NOW_TEXT);
    expect(formatRelativeTime(ago(-5_000), now)).toBe(JUST_NOW_TEXT);
  });

  it('counts minutes, hours, days, months and years', () => {
    expect(formatRelativeTime(ago(5 * MIN), now)).toBe('לפני 5 דקות');
    expect(formatRelativeTime(ago(3 * HOUR), now)).toBe('לפני 3 שעות');
    expect(formatRelativeTime(ago(30 * HOUR), now)).toBe('לפני יום');
    expect(formatRelativeTime(ago(5 * DAY), now)).toBe('לפני 5 ימים');
    expect(formatRelativeTime(ago(65 * DAY), now)).toBe('לפני חודשיים');
    expect(formatRelativeTime(ago(3 * 365 * DAY), now)).toBe('לפני 3 שנים');
    expect(formatRelativeTime(ago(2 * HOUR), now)).toBe('לפני שעתיים');
    expect(formatRelativeTime(ago(50 * HOUR), now)).toBe('לפני יומיים');
    expect(formatRelativeTime(ago(400 * DAY), now)).toBe('לפני שנה');
  });

  it('gives back text that is no date as it was', () => {
    expect(formatRelativeTime('not a date', now)).toBe('not a date');
  });
});
