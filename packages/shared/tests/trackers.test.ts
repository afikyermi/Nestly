import { describe, expect, it } from 'vitest';
import {
  buildCycleSeries,
  buildSeries,
  checkCycleWrite,
  checkPeriod,
  checkTrackerEventWrite,
  currentWindow,
  israelDay,
  israelDayStart,
  matchGuides,
  stageContexts,
  windowOfCycle,
  type GuideRow,
} from '../src/index.js';

const NOW = new Date('2026-10-20T10:00:00Z');
const CHILD = '3f0c2c7e-8a56-4c1c-9f0e-1c7f6c1d2a11';

describe('[F6.0-a c2 AC-007 AC-023] a tracker event is judged by its kind', () => {
  const create = (body: Record<string, unknown>) => checkTrackerEventWrite({ childId: CHILD, occurredAt: '2026-10-20T08:00:00Z', ...body }, NOW, true);

  it('AC-007 saves a valid bottle and rounds nothing away', () => {
    const r = create({ kind: 'bottle', amountMl: 120, note: ' טוב ' });
    expect(r.ok && r.value.amountMl).toBe(120);
    expect(r.ok && r.value.note).toBe('טוב');
    expect(r.ok && r.childId).toBe(CHILD);
  });
  it('AC-023 refuses an end before the start and accepts an equal one', () => {
    expect(create({ kind: 'breastfeeding', choice: 'left', endedAt: '2026-10-20T07:59:00Z' })).toEqual({ ok: false, reason: 'end_before_start' });
    expect(create({ kind: 'breastfeeding', choice: 'left', endedAt: '2026-10-20T08:00:00Z' }).ok).toBe(true);
  });
  it('refuses wrong values with a code', () => {
    expect(create({ kind: 'bottle', amountMl: 0 })).toEqual({ ok: false, reason: 'value_invalid' });
    expect(create({ kind: 'bottle', amountMl: 1001 })).toEqual({ ok: false, reason: 'value_invalid' });
    expect(create({ kind: 'diaper', choice: 'both' })).toEqual({ ok: false, reason: 'value_invalid' });
    expect(create({ kind: 'growth' })).toEqual({ ok: false, reason: 'value_invalid' });
    expect(create({ kind: 'medicine', name: 'x', dosage: '  ' })).toEqual({ ok: false, reason: 'text_invalid' });
    expect(create({ kind: 'bath', note: 'x'.repeat(501) })).toEqual({ ok: false, reason: 'text_invalid' });
  });
  it('refuses a time far in the future or before 2000', () => {
    expect(create({ kind: 'bath', occurredAt: '2026-10-21T10:00:00Z' })).toEqual({ ok: false, reason: 'time_invalid' });
    expect(create({ kind: 'bath', occurredAt: '1999-12-31T00:00:00Z' })).toEqual({ ok: false, reason: 'time_invalid' });
    expect(create({ kind: 'bath', occurredAt: 'yesterday' })).toEqual({ ok: false, reason: 'time_invalid' });
  });
  it('refuses another key, a field of another kind and an unknown kind', () => {
    expect(create({ kind: 'bath', userId: CHILD })).toEqual({ ok: false, reason: 'invalid_body' });
    expect(create({ kind: 'bath', amountMl: 4 })).toEqual({ ok: false, reason: 'invalid_body' });
    expect(create({ kind: 'nap' })).toEqual({ ok: false, reason: 'invalid_body' });
    expect(checkTrackerEventWrite({ kind: 'bath', occurredAt: '2026-10-20T08:00:00Z', childId: CHILD }, NOW, false)).toEqual({ ok: false, reason: 'invalid_body' });
    expect(checkTrackerEventWrite({ kind: 'bath', occurredAt: '2026-10-20T08:00:00Z' }, NOW, false).ok).toBe(true);
  });
  it('rounds growth measures to their scale', () => {
    const r = create({ kind: 'growth', weightKg: 4.3567, heightCm: 51.24 });
    expect(r.ok && [r.value.weightKg, r.value.heightCm, r.value.headCm]).toEqual([4.36, 51.2, null]);
  });
});

describe('[F6.0-a c3 FR-TRACK-001] the cycle and the ovulation window', () => {
  it('validates a start date and a length', () => {
    expect(checkCycleWrite({ startDate: '2026-10-01', cycleLengthDays: 28 }, '2026-10-21').ok).toBe(true);
    expect(checkCycleWrite({ startDate: '2026-10-25', cycleLengthDays: 28 }, '2026-10-21')).toEqual({ ok: false, reason: 'date_invalid' });
    expect(checkCycleWrite({ startDate: '2026-10-01', cycleLengthDays: 14 }, '2026-10-21')).toEqual({ ok: false, reason: 'length_invalid' });
    expect(checkCycleWrite({ startDate: '2026-02-30', cycleLengthDays: 28 }, '2026-10-21')).toEqual({ ok: false, reason: 'date_invalid' });
    expect(checkCycleWrite({ startDate: '2026-10-01', cycleLengthDays: 28, x: 1 }, '2026-10-21')).toEqual({ ok: false, reason: 'invalid_body' });
  });
  it('computes the window from the start and the length', () => {
    expect(windowOfCycle('2026-10-01', 28)).toEqual({
      cycleStart: '2026-10-01',
      ovulationDay: '2026-10-15',
      windowStart: '2026-10-10',
      windowEnd: '2026-10-16',
      nextCycleStart: '2026-10-29',
    });
  });
  it('moves an old entry forward to the window not yet over, and gives none without an entry', () => {
    expect(currentWindow('2026-10-01', 28, '2026-10-20')?.windowStart).toBe('2026-11-07');
    expect(currentWindow('2026-10-01', 28, '2026-10-12')?.windowStart).toBe('2026-10-10');
    expect(currentWindow(null, null, '2026-10-12')).toBeNull();
  });
});

describe('[F6.0-a c4 FR-ALG-004] the stage contexts and the guides', () => {
  const guide = (id: string, stageKind: GuideRow['stageKind'], rangeFrom: number | null, rangeTo: number | null): GuideRow => ({
    id,
    stageKind,
    rangeFrom,
    rangeTo,
    title: id,
    body: id,
    source: 's',
  });
  const guides = [guide('plan', 'planning', null, null), guide('t2', 'pregnancy', 14, 27), guide('t3', 'pregnancy', 28, 42), guide('m0', 'parenting', 0, 3), guide('m4', 'parenting', 4, 11)];

  it('puts a pregnant parent at the week of the due date and matches the trimester guide', () => {
    const contexts = stageContexts([{ stage: 'pregnant', dueDate: '2027-01-19' }], [], '2026-10-20');
    expect(contexts).toEqual([{ kind: 'pregnancy', dueDate: '2027-01-19', week: 27, trimester: 2 }]);
    expect(matchGuides(contexts, guides).map((g) => g.id)).toEqual(['t2']);
  });
  it('gives no week, and so no pregnancy guide, without a due date', () => {
    const contexts = stageContexts([{ stage: 'pregnant', dueDate: null }], [], '2026-10-20');
    expect(contexts[0]).toMatchObject({ kind: 'pregnancy', week: null });
    expect(matchGuides(contexts, guides)).toEqual([]);
  });
  it('matches each child by age in months and the planning guide once', () => {
    const contexts = stageContexts(
      [{ stage: 'has_child', dueDate: null }, { stage: 'planning', dueDate: null }],
      [{ id: 'c1', name: 'נוע', birthDate: '2026-08-31' }, { id: 'c2', name: 'אלי', birthDate: '2026-02-20' }, { id: 'c3', name: 'טל', birthDate: '2026-09-01' }],
      '2026-10-20',
    );
    expect(contexts.map((c) => (c.kind === 'parenting' ? c.ageMonths : c.kind))).toEqual([1, 8, 1, 'planning']);
    expect(matchGuides(contexts, guides).map((g) => g.id)).toEqual(['m0', 'm4', 'plan']);
  });
});

describe('[F6.0-a c5 FR-TRACK-001] days in Israel and the chart of a period', () => {
  it('cuts the day at Israeli midnight, summer and winter', () => {
    expect(israelDay(new Date('2026-07-01T21:30:00Z'))).toBe('2026-07-02');
    expect(israelDayStart('2026-07-02').toISOString()).toBe('2026-07-01T21:00:00.000Z');
    expect(israelDayStart('2026-12-02').toISOString()).toBe('2026-12-01T22:00:00.000Z');
  });
  it('accepts a period of at most 366 days, in order', () => {
    expect(checkPeriod('2026-10-01', '2026-10-07').ok).toBe(true);
    expect(checkPeriod('2026-10-07', '2026-10-01').ok).toBe(false);
    expect(checkPeriod('2025-01-01', '2026-10-01').ok).toBe(false);
    expect(checkPeriod('2026-02-30', '2026-03-01').ok).toBe(false);
  });
  const ev = (occurredAt: string, extra: Partial<Parameters<typeof buildSeries>[1][number]> = {}) => ({
    occurredAt,
    endedAt: null,
    amountMl: null,
    weightKg: null,
    heightCm: null,
    headCm: null,
    ...extra,
  });
  const period = { from: '2026-10-18', to: '2026-10-20' };
  it('sums bottle amounts and sleep minutes per day, counts the rest', () => {
    const bottle = buildSeries('bottle', [ev('2026-10-19T08:00:00Z', { amountMl: 100 }), ev('2026-10-19T12:00:00Z', { amountMl: 60 }), ev('2026-10-01T12:00:00Z', { amountMl: 999 })], period);
    expect(bottle).toEqual({ unit: 'ml', points: [{ day: '2026-10-18', value: 0 }, { day: '2026-10-19', value: 160 }, { day: '2026-10-20', value: 0 }] });
    const sleep = buildSeries('sleep', [ev('2026-10-19T20:00:00Z', { endedAt: '2026-10-19T22:30:00Z' })], period);
    expect(sleep.points[1]).toEqual({ day: '2026-10-19', value: 150 });
    expect(buildSeries('diaper', [ev('2026-10-20T01:00:00Z'), ev('2026-10-20T02:00:00Z')], period).points[2]?.value).toBe(2);
  });
  it("plots growth by the day's last measure and the cycle by its start", () => {
    const growth = buildSeries('growth', [ev('2026-10-19T08:00:00Z', { weightKg: 4.1 }), ev('2026-10-19T09:00:00Z', { weightKg: 4.2 }), ev('2026-10-20T09:00:00Z', { heightCm: 55 })], period);
    expect(growth).toEqual({ unit: 'kg', points: [{ day: '2026-10-19', value: 4.2 }] });
    expect(buildCycleSeries([{ startDate: '2026-10-19', cycleLengthDays: 28 }, { startDate: '2026-01-01', cycleLengthDays: 30 }], period).points).toEqual([{ day: '2026-10-19', value: 28 }]);
  });
});
