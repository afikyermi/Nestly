import { useState } from 'react';
import {
  CHILD_TREND_DIMENSIONS,
  CHILD_TREND_FIELDS_BY_METRIC,
  CHILD_TREND_METRICS,
  CHILD_TREND_PERIODS,
  type ChildTrendDimension,
  type ChildTrendField,
  type ChildTrendMetric,
  type ChildTrendPeriod,
  type ChildTrends,
} from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/select-input';
import { useAdminCall } from '@/hooks/use-admin-call';
import { fetchChildTrends } from '@/services/api/staff-work';
import { FORBIDDEN_TEXT, LOAD_FAILED_TEXT, LOADING_TEXT } from './admin-texts';
import {
  CHILD_TREND_BUCKET_LABELS,
  CHILD_TREND_DIMENSION_LABELS,
  CHILD_TREND_FIELD_LABELS,
  CHILD_TREND_METRIC_LABELS,
  CHILD_TREND_PERIOD_LABELS,
  CHILD_TRENDS_BUCKET,
  CHILD_TRENDS_COUNT,
  CHILD_TRENDS_DIMENSION,
  CHILD_TRENDS_FIELD,
  CHILD_TRENDS_LEAD,
  CHILD_TRENDS_METRIC,
  CHILD_TRENDS_PERIOD,
  CHILD_TRENDS_SHOW,
  CHILD_TRENDS_SUPPRESSED,
  CHILD_TRENDS_TABLE,
  CHILD_TRENDS_TITLE,
  CHILD_TRENDS_VALUE,
} from './staff-work-texts';

type View = { kind: 'idle' } | { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; trends: ChildTrends };
const isMetric = (value: string): value is ChildTrendMetric => CHILD_TREND_METRICS.some((metric) => metric === value);
const isDimension = (value: string): value is ChildTrendDimension => CHILD_TREND_DIMENSIONS.some((dimension) => dimension === value);

const bucketLabel = (bucket: string): string => CHILD_TREND_BUCKET_LABELS[bucket] ?? bucket;

// Children's tracker data as trends only (I14 completion, Afik 21.10.2026, §9.2): CHILD_DATA_VIEW (the Admin always) chooses a tracker, a measure,
// a split and a period from closed lists; the server answers cells only, and a cell of fewer than 10 children or 10 families comes back hidden,
// with no number; a shown number of children is rounded to the nearest 10 and the period is a calendar week or month (completion B, OP-056).
// Each query is recorded in the Audit Log by the database. A bar per cell, and the same numbers as a table.
export function ChildTrendsBuilder({ headingLevel = 3 }: { headingLevel?: 2 | 3 }) {
  const call = useAdminCall();
  const [metric, setMetric] = useState<ChildTrendMetric>('bottle');
  const [field, setField] = useState<ChildTrendField>('events_per_day');
  const [dimension, setDimension] = useState<ChildTrendDimension>('child_age');
  const [period, setPeriod] = useState<ChildTrendPeriod>('last_month');
  const [view, setView] = useState<View>({ kind: 'idle' });
  const fields = CHILD_TREND_FIELDS_BY_METRIC[metric];
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  const show = async () => {
    setView({ kind: 'loading' });
    const outcome = await call((token) => fetchChildTrends(token, { metric, field, dimension, period }));
    setView(outcome.kind === 'ok' ? { kind: 'loaded', trends: outcome.value } : { kind: 'failed', message: outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT });
  };

  const shown = view.kind === 'loaded' ? view.trends.cells.filter((cell) => !cell.suppressed && cell.value !== null) : [];
  const max = Math.max(1, ...shown.map((cell) => cell.value ?? 0));
  return (
    <section aria-labelledby="child-trends-title" className="flex flex-col gap-4">
      <Heading id="child-trends-title" className={headingLevel === 2 ? 'text-h3' : 'text-label'}>
        {CHILD_TRENDS_TITLE}
      </Heading>
      <p className="text-small text-muted-foreground">{CHILD_TRENDS_LEAD}</p>
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={CHILD_TRENDS_METRIC} htmlFor="trend-metric" className="min-w-36">
          {(control) => (
            <SelectInput
              {...control}
              options={CHILD_TREND_METRICS.map((value) => ({ value, label: CHILD_TREND_METRIC_LABELS[value] }))}
              value={metric}
              placeholder="—"
              onChange={(value) => {
                if (!isMetric(value)) return;
                setMetric(value);
                if (!CHILD_TREND_FIELDS_BY_METRIC[value].includes(field)) setField('events_per_day');
              }}
            />
          )}
        </FormField>
        <FormField label={CHILD_TRENDS_FIELD} htmlFor="trend-field" className="min-w-44">
          {(control) => (
            <SelectInput
              {...control}
              options={fields.map((value) => ({ value, label: CHILD_TREND_FIELD_LABELS[value] }))}
              value={field}
              placeholder="—"
              onChange={(value) => {
                const next = fields.find((candidate) => candidate === value);
                if (next !== undefined) setField(next);
              }}
            />
          )}
        </FormField>
        <FormField label={CHILD_TRENDS_DIMENSION} htmlFor="trend-dimension" className="min-w-36">
          {(control) => (
            <SelectInput
              {...control}
              options={CHILD_TREND_DIMENSIONS.map((value) => ({ value, label: CHILD_TREND_DIMENSION_LABELS[value] }))}
              value={dimension}
              placeholder="—"
              onChange={(value) => {
                if (isDimension(value)) setDimension(value);
              }}
            />
          )}
        </FormField>
        <FormField label={CHILD_TRENDS_PERIOD} htmlFor="trend-period" className="min-w-32">
          {(control) => (
            <SelectInput
              {...control}
              options={CHILD_TREND_PERIODS.map((value) => ({ value, label: CHILD_TREND_PERIOD_LABELS[value] }))}
              value={period}
              placeholder="—"
              onChange={(value) => {
                const next = CHILD_TREND_PERIODS.find((candidate) => candidate === value);
                if (next !== undefined) setPeriod(next);
              }}
            />
          )}
        </FormField>
        <Button pending={view.kind === 'loading'} onClick={() => void show()}>
          {CHILD_TRENDS_SHOW}
        </Button>
      </div>
      {view.kind === 'loading' ? <p role="status">{LOADING_TEXT}</p> : null}
      {view.kind === 'failed' ? <InlineAlert>{view.message}</InlineAlert> : null}
      {view.kind === 'loaded' ? (
        <>
          <ul aria-hidden="true" className="flex flex-col gap-1">
            {view.trends.cells.map((cell) => (
              <li key={cell.bucket} className="grid grid-cols-3 items-center gap-2 text-small">
                <span>{bucketLabel(cell.bucket)}</span>
                {cell.suppressed || cell.value === null ? (
                  <span className="text-muted-foreground">{CHILD_TRENDS_SUPPRESSED}</span>
                ) : (
                  <span className="h-3 rounded-sm bg-primary" style={{ width: `${Math.max(4, (cell.value / max) * 100)}%` }} />
                )}
                <span dir="ltr" className="text-end">
                  {cell.value === null ? '' : cell.value}
                </span>
              </li>
            ))}
          </ul>
          <table className="w-full border-collapse text-small">
            <caption className="text-start text-label">{CHILD_TRENDS_TABLE}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-2 py-1 text-start">{CHILD_TRENDS_BUCKET}</th>
                <th scope="col" className="px-2 py-1 text-start">{CHILD_TRENDS_VALUE}</th>
                <th scope="col" className="px-2 py-1 text-start">{CHILD_TRENDS_COUNT}</th>
              </tr>
            </thead>
            <tbody>
              {view.trends.cells.map((cell) => (
                <tr key={cell.bucket} className="border-b border-border">
                  <th scope="row" className="px-2 py-1 text-start font-normal">{bucketLabel(cell.bucket)}</th>
                  <td className="px-2 py-1">{cell.suppressed ? CHILD_TRENDS_SUPPRESSED : (cell.value ?? '')}</td>
                  <td className="px-2 py-1">{cell.children ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
}
