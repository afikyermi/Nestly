import type { ReactNode } from 'react';
import { ArrowDownIcon, ArrowUpIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { METRIC_CHANGE, METRIC_SIGNED, metricPercent } from './staff-work-texts';

export interface Change {
  current: number;
  previous: number;
  /** Whether a rise is good news (registrations) or a signal to look at (reports). It picks the chip's colour only. */
  upIsGood: boolean;
}

// The Admin dashboards (Afik 28.10.2026): a number against the week before as a chip — an arrow, the sign and the percent, in the
// semantic colours (success when the change is good news, warning when it asks for a look). Never colour alone: the arrow and the
// sign carry it, and a screen reader hears the sentence ("עלייה של 12%").
export function DeltaChip({ current, previous, upIsGood }: Change) {
  const percent = metricPercent(current, previous);
  const said = METRIC_CHANGE(current, previous);
  if (percent === null || percent === 0) {
    return <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground">{said}</span>;
  }
  const up = percent > 0;
  const Arrow = up ? ArrowUpIcon : ArrowDownIcon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-caption tabular-nums',
        up === upIsGood ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
      )}
    >
      <Arrow className="size-3.5" />
      <span aria-hidden="true" dir="ltr">
        {METRIC_SIGNED(percent)}
      </span>
      <span className="sr-only">{said}</span>
    </span>
  );
}

/**
 * One number of a dashboard, inside a <dl>: the label in caption, the number large in tabular figures, and an optional line under it
 * (the change chip and its context). `size` `lg` is the summary row; the sections' tiles are `md`.
 */
export function KpiCard({ label, value, footer, size = 'md' }: { label: string; value: string; footer?: ReactNode; size?: 'md' | 'lg' }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-card p-4 shadow-card">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums', size === 'lg' ? 'text-h1' : 'text-h2')}>{value}</dd>
      {footer === undefined ? null : <dd className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">{footer}</dd>}
    </div>
  );
}
