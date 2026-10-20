// The chart of a tracker over a period the user picked (FR-TRACK-001): one value per Israeli day. Sums for amounts and durations,
// counts for events, the day's last measurement for growth. Pure.
import type { TrackerKind } from '../constants/trackers.js';
import { daysOf, israelDay, type Period } from './time.js';

export type ChartUnit = 'ml' | 'minutes' | 'count' | 'kg' | 'cm' | 'days';
export type GrowthMetric = 'weight' | 'height' | 'head';

export interface ChartPoint {
  /** The Israeli day, YYYY-MM-DD. */
  day: string;
  value: number;
}

export interface ChartSeries {
  unit: ChartUnit;
  points: ChartPoint[];
}

export interface SeriesEvent {
  occurredAt: string;
  endedAt: string | null;
  amountMl: number | null;
  weightKg: number | null;
  heightCm: number | null;
  headCm: number | null;
}

const minutesBetween = (start: string, end: string | null): number =>
  end === null ? 0 : Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60_000));

function growthValue(event: SeriesEvent, metric: GrowthMetric): number | null {
  if (metric === 'weight') return event.weightKg;
  return metric === 'height' ? event.heightCm : event.headCm;
}

/** The series of one tracker. `metric` only matters for growth. */
export function buildSeries(kind: TrackerKind, events: readonly SeriesEvent[], period: Period, metric: GrowthMetric = 'weight'): ChartSeries {
  const days = daysOf(period);
  const inPeriod = [...events]
    .filter((event) => {
      const day = israelDay(new Date(event.occurredAt));
      return day >= period.from && day <= period.to;
    })
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));

  if (kind === 'growth') {
    const last = new Map<string, number>();
    for (const event of inPeriod) {
      const value = growthValue(event, metric);
      if (value !== null) last.set(israelDay(new Date(event.occurredAt)), value);
    }
    return { unit: metric === 'weight' ? 'kg' : 'cm', points: days.filter((d) => last.has(d)).map((day) => ({ day, value: last.get(day) ?? 0 })) };
  }

  const totals = new Map<string, number>(days.map((d) => [d, 0]));
  for (const event of inPeriod) {
    const day = israelDay(new Date(event.occurredAt));
    let add = 1;
    if (kind === 'bottle') add = event.amountMl ?? 0;
    if (kind === 'sleep' || kind === 'breastfeeding') add = minutesBetween(event.occurredAt, event.endedAt);
    totals.set(day, (totals.get(day) ?? 0) + add);
  }
  let unit: ChartUnit = 'count';
  if (kind === 'bottle') unit = 'ml';
  if (kind === 'sleep' || kind === 'breastfeeding') unit = 'minutes';
  return { unit, points: days.map((day) => ({ day, value: totals.get(day) ?? 0 })) };
}

/** The cycle chart: the average length of each cycle that started in the period. */
export function buildCycleSeries(entries: readonly { startDate: string; cycleLengthDays: number }[], period: Period): ChartSeries {
  return {
    unit: 'days',
    points: entries
      .filter((e) => e.startDate >= period.from && e.startDate <= period.to)
      .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
      .map((e) => ({ day: e.startDate, value: e.cycleLengthDays })),
  };
}
