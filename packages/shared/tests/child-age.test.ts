import { describe, expect, it } from 'vitest';
import { formatChildAge } from '../src/index.js';

// I2 F2.3b c17 — the child-age phrase (DR-3, Afik 17.10.2026; NFR-USAB-003; ux-copy-he). Expected values are the phrases of
// .work/profile-privacy/spec.md c17 and its Q3–Q6 defaults (approved at "Gate 1 (F2.3b re-spec)"), never the code.
// The database returns (years, months) only (c14); this pure function is the one place the Hebrew phrase is made.

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.3b c17 DR-3] formatChildAge gives exactly the phrase of the spec, one whole phrase per case', () => {
  const SPEC: ReadonlyArray<readonly [number, number, string]> = [
    [0, 0, 'פחות מחודש'],
    [0, 1, 'חודש'],
    [0, 2, 'חודשיים'],
    [0, 4, '4 חודשים'],
    [0, 11, '11 חודשים'],
    [1, 0, 'שנה'],
    [1, 1, 'שנה וחודש'],
    [1, 2, 'שנה וחודשיים'],
    [1, 3, 'שנה ו-3 חודשים'],
    [2, 0, 'שנתיים'],
    [2, 1, 'שנתיים וחודש'],
    [2, 2, 'שנתיים וחודשיים'],
    [2, 5, 'שנתיים ו-5 חודשים'],
    [3, 0, '3 שנים'],
    [3, 5, '3 שנים ו-5 חודשים'],
    [11, 0, '11 שנים'],
    [25, 7, '25 שנים ו-7 חודשים'],
  ];
  it.each(SPEC)('[F2.3b c17] (%i, %i) → "%s"', (years, months, phrase) => {
    expect(formatChildAge(years, months)).toBe(phrase);
  });
});

describe('[F2.3b c17 Q3–Q6] the cases the spec settles by its approved defaults', () => {
  const DEFAULTS: ReadonlyArray<readonly [number, number, string, string]> = [
    [0, 3, '3 חודשים', 'Q6 digits from 3'],
    [3, 1, '3 שנים וחודש', 'Q5 the conjunction joins the word form "וחודש"'],
    [3, 2, '3 שנים וחודשיים', 'Q5 "וחודשיים"'],
    [1, 11, 'שנה ו-11 חודשים', 'Q6 "ו-" with an ASCII hyphen before a digit'],
    [10, 0, '10 שנים', 'Q4 whole years omit the months'],
    [12, 0, '12 שנים', 'Q6 plural "שנים" also from 11'],
    [11, 1, '11 שנים וחודש', 'Q5 Q6'],
  ];
  it.each(DEFAULTS)('[F2.3b c17] (%i, %i) → "%s" (%s)', (years, months, phrase) => {
    expect(formatChildAge(years, months)).toBe(phrase);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.3b c17 c7 Q3–Q6] no phrase in the whole valid range carries a sex marker, a label or a broken fragment', () => {
  const all: Array<readonly [number, number, string]> = [];
  for (let years = 0; years <= 25; years += 1) {
    for (let months = 0; months <= 11; months += 1) all.push([years, months, formatChildAge(years, months)]);
  }

  it('[F2.3b c17 c7] no "בן" / "בת" (sex is not in the read) and no "גיל" prefix in any phrase, 0–25 years', () => {
    const marked = all.filter(([, , p]) => p.includes('בן') || p.includes('בת') || p.includes('גיל'));
    expect(marked).toEqual([]);
  });

  it('[F2.3b c17 Q3 Q4 Q5] never "0 חודשים", "ו-0", "1 חודש", "2 חודשים", "1 שנה", "2 שנים", "11 שנה" or a slash form', () => {
    const broken = all.filter(([, , p]) =>
      /(^|\s|-)0 /.test(p) || /(^|\s|-)1 (חודש|שנה)/.test(p) || /(^|\s|-)2 (חודשים|שנים)/.test(p) ||
      /(^|\s)\d+ שנה(\s|$)/.test(p) || p.includes('/'));
    expect(broken).toEqual([]);
  });

  it('[F2.3b c17 Q6] the hyphen is the ASCII "-", never a Hebrew maqaf, and nothing reads "undefined" or "NaN"', () => {
    const bad = all.filter(([, , p]) => p.includes('־') || /undefined|NaN|null/.test(p) || p.trim() !== p || p.includes('  '));
    expect(bad).toEqual([]);
  });

  it('[F2.3b c17 Q4] the months are shown whenever non-zero, at every age: the phrase of (y, m≥1) differs from (y, 0)', () => {
    const same = all.filter(([y, m, p]) => m > 0 && p === formatChildAge(y, 0));
    expect(same).toEqual([]);
    expect(new Set(all.map(([, , p]) => p)).size).toBe(all.length);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.3b c17] out-of-range input throws, with no partial phrase', () => {
  const BAD: ReadonlyArray<readonly [number, number, string]> = [
    [-1, 0, 'negative years'],
    [1.5, 0, 'non-integer years'],
    [Number.NaN, 0, 'NaN years'],
    [Number.POSITIVE_INFINITY, 0, 'infinite years'],
    [0, -1, 'months below 0'],
    [0, 12, 'months 12 (one past the maximum)'],
    [2, 1.5, 'non-integer months'],
    [2, Number.NaN, 'NaN months'],
    [-1, 12, 'both out of range'],
  ];
  it.each(BAD)('[F2.3b c17] (%s, %s) throws: %s', (years, months) => {
    expect(() => formatChildAge(years, months)).toThrow();
  });
});
