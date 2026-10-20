import { useCallback, useEffect, useRef, useState } from 'react';
import { addDaysIso, buildCycleSeries, checkDateParts, israelDay, type CycleEntryDto, type CycleResponse, type Period } from '@nestly/shared';
import { BarChart } from '@/components/shared/bar-chart';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DateInput, type DateParts } from '@/components/shared/date-input';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextInput } from '@/components/ui/text-input';
import { useAuthedCall } from '@/hooks/use-authed-call';
import { CYCLE_TEXT, ERROR_TEXT, FORM_TEXT, HISTORY_TEXT, PAGE_LABEL } from '@/lib/tracker-texts';
import { addCycle, editCycle, fetchCycle, removeCycle } from '@/services/api/trackers';
import { DEFAULT_PERIOD_DAYS, lastDays, PeriodPicker } from './PeriodPicker';

const EMPTY: DateParts = { day: '', month: '', year: '' };
const dayFormat = new Intl.DateTimeFormat('he-IL', { timeZone: 'UTC', dateStyle: 'medium' });
const showDay = (iso: string): string => dayFormat.format(new Date(`${iso}T00:00:00Z`));

function dayLabel(day: string): string {
  const [, month = '', date = ''] = day.split('-');
  return `${Number(date)}.${Number(month)}`;
}

const partsOf = (iso: string): DateParts => {
  const [year = '', month = '', day = ''] = iso.split('-');
  return { day: String(Number(day)), month: String(Number(month)), year };
};

// The cycle tracker (FR-TRACK-001, OP-008): a cycle's start date and the average length; the ovulation window is computed from the
// latest entry and shown as an estimate only (BR-012). The user's own data, seen by no one else (BR-053).
export function CycleScreen() {
  const call = useAuthedCall();
  const [view, setView] = useState<CycleResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [start, setStart] = useState<DateParts>(EMPTY);
  const [length, setLength] = useState('28');
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState<Period>(() => lastDays(DEFAULT_PERIOD_DAYS * 6));
  const [removing, setRemoving] = useState<{ entry: CycleEntryDto; pending: boolean; failure: string | null } | null>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const result = await call(fetchCycle);
    if (result.kind === 'ok') {
      setView(result.value);
      setFailed(false);
    } else setFailed(true);
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (busy.current) return;
    const day = checkDateParts(start);
    const days = /^\d{1,2}$/.test(length.trim()) ? Number(length.trim()) : Number.NaN;
    if (day.kind !== 'date' || day.iso > addDaysIso(israelDay(new Date()), 0)) return setError(ERROR_TEXT.cycleDate);
    if (!(days >= 15 && days <= 60)) return setError(ERROR_TEXT.cycleLength);
    busy.current = true;
    setSaving(true);
    setError(null);
    const body = { startDate: day.iso, cycleLengthDays: days };
    const result = await call((token) => (editing === null ? addCycle(token, body) : editCycle(token, editing, body)));
    busy.current = false;
    setSaving(false);
    if (result.kind === 'ok') {
      setStatus(HISTORY_TEXT.saved);
      setEditing(null);
      setStart(EMPTY);
      await load();
    } else if (result.kind === 'duplicate-date') setError(ERROR_TEXT.duplicateDate);
    else if (result.kind === 'invalid') setError(result.reason === 'length_invalid' ? ERROR_TEXT.cycleLength : ERROR_TEXT.cycleDate);
    else setError(ERROR_TEXT.failed);
  }

  async function confirmRemove() {
    if (removing === null || removing.pending) return;
    const target = removing.entry;
    setRemoving({ ...removing, pending: true, failure: null });
    const result = await call((token) => removeCycle(token, target.id));
    if (result.kind === 'ok' || result.kind === 'not-found') {
      setRemoving(null);
      setStatus(HISTORY_TEXT.removed);
      await load();
    } else setRemoving({ entry: target, pending: false, failure: ERROR_TEXT.failed });
  }

  if (failed && view === null) {
    return (
      <div className="flex flex-col gap-3">
        <InlineAlert>{ERROR_TEXT.loadFailed}</InlineAlert>
        <Button type="button" variant="soft" className="self-start" onClick={() => void load()}>
          {ERROR_TEXT.retry}
        </Button>
      </div>
    );
  }
  if (view === null) return <Skeleton className="h-64 w-full" />;

  const series = buildCycleSeries(view.entries, period);
  const window = view.window;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-small text-muted-foreground">{HISTORY_TEXT.privateNote}</p>
      <section aria-labelledby="cycle-window-heading" className="flex flex-col gap-1 rounded-lg bg-card p-4 text-card-foreground shadow-card">
        <h2 id="cycle-window-heading" className="text-h3">{CYCLE_TEXT.windowTitle}</h2>
        {window === null ? (
          <p className="text-body text-muted-foreground">{CYCLE_TEXT.windowNone}</p>
        ) : (
          <>
            <p data-testid="ovulation-window" className="text-body">
              {showDay(window.windowStart)} – {showDay(window.windowEnd)}
            </p>
            <p className="text-small text-muted-foreground">
              {CYCLE_TEXT.nextStart}
              {showDay(window.nextCycleStart)}
            </p>
            <p className="text-small text-muted-foreground">{CYCLE_TEXT.windowNote}</p>
          </>
        )}
      </section>
      <p role="status" className="min-h-6 text-small text-muted-foreground">{status}</p>
      <form
        noValidate
        className="flex flex-col gap-4 rounded-lg bg-card p-4 text-card-foreground shadow-card"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error !== null ? <InlineAlert>{error}</InlineAlert> : null}
        <DateInput legend={CYCLE_TEXT.startDate} value={start} onChange={setStart} />
        <FormField label={CYCLE_TEXT.length} hint={CYCLE_TEXT.lengthHint} className="max-w-40">
          {(control) => <TextInput {...control} dir="ltr" value={length} onChange={(event) => setLength(event.target.value)} />}
        </FormField>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" pending={saving}>
            {editing === null ? CYCLE_TEXT.save : FORM_TEXT.saveChanges}
          </Button>
          {editing !== null ? (
            <Button type="button" variant="text" onClick={() => { setEditing(null); setStart(EMPTY); setError(null); }}>
              {FORM_TEXT.cancelEdit}
            </Button>
          ) : null}
        </div>
      </form>
      <section aria-labelledby="cycle-chart-heading" className="flex flex-col gap-3">
        <h2 id="cycle-chart-heading" className="text-h3">{HISTORY_TEXT.chartTitle}</h2>
        <PeriodPicker onChange={setPeriod} />
        <BarChart
          title={`${PAGE_LABEL.cycle}, ${CYCLE_TEXT.chartTitle}`}
          unit={CYCLE_TEXT.daysSuffix}
          points={series.points.map((p) => ({ label: dayLabel(p.day), value: p.value }))}
          emptyText={HISTORY_TEXT.empty}
          tableLabel="הנתונים בטבלה"
          valueHeader="ערך"
          dayHeader="יום"
        />
      </section>
      <section aria-labelledby="cycle-history-heading" className="flex flex-col gap-3">
        <h2 id="cycle-history-heading" className="text-h3">{CYCLE_TEXT.history}</h2>
        {view.entries.length === 0 ? (
          <p className="rounded-lg bg-muted p-4 text-body text-muted-foreground">{HISTORY_TEXT.empty}</p>
        ) : (
          <ul aria-label={CYCLE_TEXT.history} className="flex flex-col gap-2">
            {view.entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-card p-3 text-card-foreground shadow-card">
                <p className="min-w-0 flex-1 text-label">
                  {showDay(entry.startDate)}
                  <span className="ms-2 font-normal text-muted-foreground">{`${entry.cycleLengthDays} ${CYCLE_TEXT.daysSuffix}`}</span>
                </p>
                <Button type="button" variant="text" onClick={() => { setEditing(entry.id); setStart(partsOf(entry.startDate)); setLength(String(entry.cycleLengthDays)); setError(null); setStatus(''); }}>
                  {HISTORY_TEXT.edit}
                </Button>
                <Button type="button" variant="text" onClick={() => setRemoving({ entry, pending: false, failure: null })}>
                  {HISTORY_TEXT.remove}
                </Button>
              </li>
            ))}
          </ul>
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
