import { describe, expect, it } from 'vitest';
import { createDailyLoginMemo, israelDay } from '../src/services/daily-login-memo.js';

// I13 (OP-039): the day's login is written once a day per account and server instance; the memory follows the Israel day and is bounded.

const A = 'a0000000-0000-4000-8000-00000000000a';
const B = 'b0000000-0000-4000-8000-00000000000b';

describe('[OP-039] the daily-login memory', () => {
  it('remembers an account for the rest of its Israel day only', () => {
    const memo = createDailyLoginMemo();
    const morning = new Date('2026-10-24T05:00:00Z'); // 08:00 in Israel
    expect(memo.has(A, morning)).toBe(false);
    memo.remember(A, morning);
    expect(memo.has(A, new Date('2026-10-24T20:59:00Z'))).toBe(true); // 23:59 in Israel, the same day
    expect(memo.has(B, morning)).toBe(false);
    // 21:00 UTC is midnight in Israel (UTC+3 in October): a new day, nothing remembered
    expect(memo.has(A, new Date('2026-10-24T21:00:00Z'))).toBe(false);
    expect(memo.size()).toBe(0);
  });

  it('dates by Israel time, not UTC', () => {
    expect(israelDay(new Date('2026-10-24T21:30:00Z'))).toBe('2026-10-25');
    expect(israelDay(new Date('2026-12-31T21:59:00Z'))).toBe('2026-12-31'); // UTC+2 in winter: 23:59
  });

  it('is bounded: a full memory starts over', () => {
    const memo = createDailyLoginMemo(2);
    const at = new Date('2026-10-24T10:00:00Z');
    memo.remember(A, at);
    memo.remember(B, at);
    memo.remember(A, at); // already there: no reset
    expect(memo.size()).toBe(2);
    memo.remember('c0000000-0000-4000-8000-00000000000c', at);
    expect(memo.size()).toBe(1);
    expect(memo.has(A, at)).toBe(false);
  });
});
