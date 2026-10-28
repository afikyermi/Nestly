import { cn } from '@/lib/cn';

export interface BarChartPoint {
  /** The text under the bar, already formatted (a short date). */
  label: string;
  value: number;
}

export interface BarChartProps {
  /** What the chart shows, e.g. "בקבוק, מ״ל ליום". It is the chart's accessible name. */
  title: string;
  points: BarChartPoint[];
  /** The unit shown with a value in the table, e.g. "מ״ל". */
  unit: string;
  /** Said instead of the chart when no point has a value. */
  emptyText: string;
  /** Label of the table, which gives the same numbers as text (WCAG 1.1.1, 1.4.1). */
  tableLabel: string;
  valueHeader: string;
  dayHeader: string;
  /**
   * `compact` (default): the trackers' chart, the title under it. `dashboard`: the Admin's data screens — a value axis with a faint grid,
   * bars with rounded tops and labels in the type scale; the title is left to the card that holds it (it stays the chart's accessible name).
   */
  variant?: 'compact' | 'dashboard';
}

const WIDTH = 320;
const HEIGHT = 140;
const GAP = 2;

const format = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 });
const axisFormat = new Intl.NumberFormat('he-IL', { notation: 'compact', maximumFractionDigits: 1 });

/** The smallest of 1, 2, 2.5, 5 × 10ⁿ at or above `max`: the value axis ends on a round number. */
function niceMax(max: number): number {
  const power = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= max) ?? 10;
  return step * power;
}

// A bar chart drawn from tokens (no library). The bars are decorative: the chart is one image with the title as its name, and
// the same numbers follow as a table for a screen reader. Bar height is the value over the largest value; zero draws a thin line.
export function BarChart({ title, points, unit, emptyText, tableLabel, valueHeader, dayHeader, variant = 'compact' }: BarChartProps) {
  const max = points.reduce((m, p) => Math.max(m, p.value), 0);
  const dashboard = variant === 'dashboard';
  if (points.length === 0 || max === 0) {
    return dashboard ? (
      <p className="flex h-44 items-center justify-center rounded-md bg-muted p-4 text-center text-small text-muted-foreground">{emptyText}</p>
    ) : (
      <p className="rounded-lg bg-muted p-4 text-body text-muted-foreground">{emptyText}</p>
    );
  }
  // At most about six labels, so they never overlap.
  const every = Math.ceil(points.length / 6);
  const table = (
    <table className="sr-only" aria-label={tableLabel}>
      <thead>
        <tr>
          <th scope="col">{dayHeader}</th>
          <th scope="col">{valueHeader}</th>
        </tr>
      </thead>
      <tbody>
        {points.map((point, index) => (
          <tr key={point.label + index}>
            <th scope="row">{point.label}</th>
            <td>{`${format.format(point.value)} ${unit}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (dashboard) {
    // Drawn in HTML so the labels keep the type scale at every width. Time runs left to right, as in any chart, also in Hebrew.
    const top = niceMax(max);
    return (
      <figure className="m-0 flex flex-col gap-2">
        <div dir="ltr" className="flex gap-2">
          <div aria-hidden="true" className="flex h-36 flex-col justify-between text-end text-caption text-muted-foreground tabular-nums">
            <span className="-translate-y-1/2">{axisFormat.format(top)}</span>
            <span>{axisFormat.format(top / 2)}</span>
            <span className="translate-y-1/2">0</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="relative h-36">
              <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
                <span className="border-t border-dashed border-divider" />
                <span className="border-t border-dashed border-divider" />
                <span className="border-t border-border" />
              </div>
              <div role="img" aria-label={title} className={cn('absolute inset-0 flex items-end', points.length > 40 ? 'gap-px' : 'gap-1')}>
                {points.map((point, index) => (
                  <span
                    key={point.label + index}
                    className="min-w-px flex-1 rounded-t-sm bg-primary"
                    style={{ height: point.value === 0 ? 0 : `${Math.max(1.5, (point.value / top) * 100)}%` }}
                  />
                ))}
              </div>
            </div>
            <div aria-hidden="true" className="flex text-caption text-muted-foreground tabular-nums">
              {points.map((point, index) => (
                <span key={`l${point.label}${index}`} className={cn('flex min-w-0 flex-1 overflow-visible whitespace-nowrap', index === 0 ? 'justify-start' : 'justify-center')}>
                  {index % every === 0 ? point.label : null}
                </span>
              ))}
            </div>
          </div>
        </div>
        {table}
      </figure>
    );
  }

  const slot = WIDTH / points.length;
  const barWidth = Math.max(1, slot - GAP);
  return (
    <figure className="m-0 flex flex-col gap-2">
      <svg role="img" aria-label={title} viewBox={`0 0 ${WIDTH} ${HEIGHT + 20}`} className="h-auto w-full text-primary">
        <line x1="0" x2={WIDTH} y1={HEIGHT} y2={HEIGHT} className="stroke-border" strokeWidth="1" />
        {points.map((point, index) => {
          const height = point.value === 0 ? 1 : Math.max(2, (point.value / max) * (HEIGHT - 8));
          return (
            <rect key={point.label + index} x={index * slot + GAP / 2} y={HEIGHT - height} width={barWidth} height={height} rx="1.5" className="fill-current" />
          );
        })}
        {points.map((point, index) =>
          index % every === 0 ? (
            <text key={`l${point.label}${index}`} x={index * slot + slot / 2} y={HEIGHT + 14} textAnchor="middle" className={cn('fill-muted-foreground')} fontSize="9">
              {point.label}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="text-small text-muted-foreground">{title}</figcaption>
      {table}
    </figure>
  );
}
