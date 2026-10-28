import type { ReactNode } from 'react';
import { BarChart } from '@/components/shared/bar-chart';
import { ANALYTICS_CHART_TOTAL, ANALYTICS_COUNT, ANALYTICS_DAY, ANALYTICS_EMPTY, ANALYTICS_TABLE } from './team-texts';

/** A daily series, as the Admin's data comes back: one point a day up to today. */
export type Series = ReadonlyArray<{ day: string; count: number }>;

export const adminNumber = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 });
/** "2026-10-21" as "21.10". */
export const shortDay = (day: string): string => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
export const seriesTotal = (points: Series): number => points.reduce((sum, point) => sum + point.count, 0);

/** An outlined card of the Admin's data screens. */
export function Card({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-card p-4 shadow-card">{children}</div>;
}

/**
 * A chart in its card (the Admin's data screen and the Admin's home): the title, the period's total and daily average in one line, and the plum
 * bars. The bars are one image named by the title, and the same numbers follow as a table for a screen reader (BarChart).
 */
export function ChartCard({ title, points }: { title: string; points: Series }) {
  const sum = seriesTotal(points);
  return (
    <Card>
      <div className="flex flex-col">
        <h4 className="text-label">{title}</h4>
        <p className="text-caption text-muted-foreground tabular-nums">
          {ANALYTICS_CHART_TOTAL(adminNumber.format(sum), adminNumber.format(points.length === 0 ? 0 : sum / points.length))}
        </p>
      </div>
      <BarChart
        variant="dashboard"
        title={title}
        points={points.map((point) => ({ label: shortDay(point.day), value: point.count }))}
        unit=""
        emptyText={`${title}: ${ANALYTICS_EMPTY}`}
        tableLabel={`${title} · ${ANALYTICS_TABLE}`}
        valueHeader={ANALYTICS_COUNT}
        dayHeader={ANALYTICS_DAY}
      />
    </Card>
  );
}
