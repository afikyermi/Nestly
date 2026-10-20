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
}

const WIDTH = 320;
const HEIGHT = 140;
const GAP = 2;

const format = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 });

// A bar chart drawn in SVG from tokens (no library). The bars are decorative: the chart is one image with the title as its name, and
// the same numbers follow as a table for a screen reader. Bar height is the value over the largest value; zero draws a thin line.
export function BarChart({ title, points, unit, emptyText, tableLabel, valueHeader, dayHeader }: BarChartProps) {
  const max = points.reduce((m, p) => Math.max(m, p.value), 0);
  if (points.length === 0 || max === 0) {
    return <p className="rounded-lg bg-muted p-4 text-body text-muted-foreground">{emptyText}</p>;
  }
  const slot = WIDTH / points.length;
  const barWidth = Math.max(1, slot - GAP);
  // At most about six labels, so they never overlap.
  const every = Math.ceil(points.length / 6);
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
    </figure>
  );
}
