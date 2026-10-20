import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSeries, type GrowthMetric, type Period, type TrackerEventDto, type TrackerKind } from '@nestly/shared';
import { BarChart } from '@/components/shared/bar-chart';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/select-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthedCall } from '@/hooks/use-authed-call';
import { PATHS } from '@/app/paths';
import { fetchOwnJourneys } from '@/services/api/journeys';
import { addEvent, editEvent, fetchEvents, removeEvent, type ApiResult, type EventsView } from '@/services/api/trackers';
import { CHART_PER_DAY, CHART_UNIT, ERROR_TEXT, FORM_TEXT, GROWTH_METRICS, HISTORY_TEXT, PAGE_LABEL } from '@/lib/tracker-texts';
import { DEFAULT_PERIOD_DAYS, lastDays, PeriodPicker } from './PeriodPicker';
import { TrackerFormPanel } from './TrackerFormPanel';
import { TrackerHistory } from './TrackerHistory';
import { formFromEvent, formToBody, newForm, reasonText, type EventForm } from './tracker-form';

type Child = { id: string; name: string };

const growthOptions = Object.entries(GROWTH_METRICS).map(([value, label]) => ({ value, label }));

function dayLabel(day: string): string {
  const [, month = '', date = ''] = day.split('-');
  return `${Number(date)}.${Number(month)}`;
}

// One tracker's page (FR-TRACK-001/002, AC-007, AC-023): the form, the history and the chart over a period the user picks. The data
// is the user's own and is never shown to anyone else (BR-053): the server and RLS decide, this page sends no user id.
export function TrackerScreen({ kind }: { kind: TrackerKind }) {
  const call = useAuthedCall();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [childFilter, setChildFilter] = useState('');
  const [period, setPeriod] = useState<Period>(() => lastDays(DEFAULT_PERIOD_DAYS));
  const [view, setView] = useState<EventsView | null>(null);
  const events = view?.events ?? null;
  const [loadFailed, setLoadFailed] = useState(false);
  const [form, setForm] = useState<EventForm | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [removing, setRemoving] = useState<{ event: TrackerEventDto; pending: boolean; failure: string | null } | null>(null);
  const [metric, setMetric] = useState<GrowthMetric>('weight');
  const busy = useRef(false);
  const loads = useRef(0);

  const loadChildren = useCallback(async () => {
    const result = await call(
      async (token): Promise<ApiResult<Child[]>> => {
        const outcome = await fetchOwnJourneys(token);
        if (outcome.kind === 'journeys') return { kind: 'ok', value: outcome.journeys.children.map((c) => ({ id: c.id, name: c.name })) };
        return outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable' ? { kind: outcome.kind } : { kind: 'failed' };
      },
    );
    if (result.kind === 'ok') {
      const list = result.value;
      setChildren(list);
      setForm((current) => current ?? newForm(list.length === 1 ? (list[0]?.id ?? '') : '', new Date()));
    } else setLoadFailed(true);
  }, [call]);

  // Growth is measured per child: charting two children's weights as one line means nothing, so it always has one child chosen.
  const shownChild = kind === 'growth' && childFilter === '' ? (children?.[0]?.id ?? '') : childFilter;

  const loadEvents = useCallback(async () => {
    if (children === null) return;
    const run = (loads.current += 1);
    const result = await call((token) => fetchEvents(token, kind, shownChild === '' ? null : shownChild, period));
    if (run !== loads.current) return;
    if (result.kind === 'ok') {
      setView(result.value);
      setLoadFailed(false);
    } else setLoadFailed(true);
  }, [call, kind, shownChild, period, children]);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);
  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  async function submit() {
    if (form === null || busy.current) return;
    const checked = formToBody(kind, form, editing === null);
    if (!checked.ok) return setFormError(checked.error);
    busy.current = true;
    setSaving(true);
    setFormError(null);
    const body = checked.body;
    const result = await call((token) => (editing === null ? addEvent(token, body) : editEvent(token, editing, body)));
    busy.current = false;
    setSaving(false);
    if (result.kind === 'ok') {
      setStatus(HISTORY_TEXT.saved);
      setEditing(null);
      setForm(newForm(children?.length === 1 ? (children[0]?.id ?? '') : form.childId, new Date()));
      await loadEvents();
    } else if (result.kind === 'invalid') setFormError(reasonText(result.reason));
    else setFormError(ERROR_TEXT.failed);
  }

  async function confirmRemove() {
    if (removing === null || removing.pending) return;
    const target = removing.event;
    setRemoving({ ...removing, pending: true, failure: null });
    const result = await call((token) => removeEvent(token, target.id));
    if (result.kind === 'ok' || result.kind === 'not-found') {
      setRemoving(null);
      setStatus(HISTORY_TEXT.removed);
      await loadEvents();
    } else setRemoving({ event: target, pending: false, failure: ERROR_TEXT.failed });
  }

  if (loadFailed && (children === null || events === null)) {
    return (
      <div className="flex flex-col gap-3">
        <InlineAlert>{ERROR_TEXT.loadFailed}</InlineAlert>
        <Button type="button" variant="soft" className="self-start" onClick={() => { setLoadFailed(false); void loadChildren(); void loadEvents(); }}>
          {ERROR_TEXT.retry}
        </Button>
      </div>
    );
  }
  if (children === null || form === null) return <Skeleton className="h-64 w-full" />;
  if (children.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-muted p-4">
        <p className="text-body">{HISTORY_TEXT.noChild}</p>
        <Button href={PATHS.profile} variant="soft" className="self-start">
          {HISTORY_TEXT.addChild}
        </Button>
      </div>
    );
  }

  const series = buildSeries(kind, events ?? [], period, metric);
  const unit = CHART_UNIT[series.unit] ?? '';
  const chartTitle = kind === 'growth' ? `${PAGE_LABEL.growth}, ${GROWTH_METRICS[metric]} (${unit})` : `${PAGE_LABEL[kind]}, ${CHART_PER_DAY[kind] ?? unit}`;
  const names = new Map(children.map((c) => [c.id, c.name]));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-small text-muted-foreground">{HISTORY_TEXT.privateNote}</p>
      <p role="status" className="min-h-6 text-small text-muted-foreground">{status}</p>
      {loadFailed ? <InlineAlert>{ERROR_TEXT.loadFailed}</InlineAlert> : null}
      <TrackerFormPanel
        kind={kind}
        form={form}
        children={children}
        editing={editing !== null}
        pending={saving}
        error={formError}
        onChange={setForm}
        onSubmit={() => void submit()}
        onCancel={() => {
          setEditing(null);
          setFormError(null);
          setForm(newForm(children.length === 1 ? (children[0]?.id ?? '') : '', new Date()));
        }}
      />
      <section aria-labelledby="tracker-chart-heading" className="flex flex-col gap-3">
        <h2 id="tracker-chart-heading" className="text-h3">{HISTORY_TEXT.chartTitle}</h2>
        <PeriodPicker onChange={setPeriod} />
        {children.length > 1 ? (
          <FormField label={FORM_TEXT.child} className="max-w-60">
            {(control) => (
              <SelectInput {...control} placeholder={HISTORY_TEXT.allChildren} value={shownChild} options={children.map((c) => ({ value: c.id, label: c.name }))} onChange={setChildFilter} />
            )}
          </FormField>
        ) : null}
        {kind === 'growth' ? (
          <FormField label="מדד" className="max-w-60">
            {(control) => <SelectInput {...control} placeholder="מדד" value={metric} options={growthOptions} onChange={(v) => setMetric(v === 'height' || v === 'head' ? v : 'weight')} />}
          </FormField>
        ) : null}
        {view?.truncated === true ? <p className="text-small text-muted-foreground">{HISTORY_TEXT.truncated}</p> : null}
        {events === null ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <BarChart
            title={chartTitle}
            unit={unit}
            points={series.points.map((p) => ({ label: dayLabel(p.day), value: p.value }))}
            emptyText={HISTORY_TEXT.empty}
            tableLabel="הנתונים בטבלה"
            valueHeader="ערך"
            dayHeader="יום"
          />
        )}
      </section>
      <section aria-labelledby="tracker-history-heading" className="flex flex-col gap-3">
        <h2 id="tracker-history-heading" className="text-h3">{HISTORY_TEXT.title}</h2>
        {events === null ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <TrackerHistory
            events={events}
            childNames={names}
            onEdit={(event) => {
              setEditing(event.id);
              setForm(formFromEvent(event));
              setFormError(null);
              setStatus('');
            }}
            onRemove={(event) => setRemoving({ event, pending: false, failure: null })}
          />
        )}
      </section>
      <ConfirmDialog
        open={removing !== null}
        title={HISTORY_TEXT.confirmRemove}
        description={HISTORY_TEXT.confirmRemoveBody}
        confirmLabel={HISTORY_TEXT.remove}
        cancelLabel={HISTORY_TEXT.keep}
        pending={removing?.pending ?? false}
        failure={removing?.failure ?? null}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving((current) => (current?.pending === true ? current : null))}
      />
    </div>
  );
}
