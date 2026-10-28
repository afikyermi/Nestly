import { useCallback, useEffect, useId, useState } from 'react';
import { REPORT_REASON_LABEL_MAX, REPORT_REASON_LABEL_MIN, codePointLength, type ReportReasonRow } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectInput } from '@/components/ui/select-input';
import { Skeleton } from '@/components/ui/skeleton';
import { TextInput } from '@/components/ui/text-input';
import { useAdminCall } from '@/hooks/use-admin-call';
import type { AdminOutcome } from '@/services/api/admin';
import { addReportReason, fetchReportReasons, updateReportReason } from '@/services/api/team';
import { ACTION_FAILED_TEXT, FORBIDDEN_TEXT, LOAD_FAILED_TEXT, LOADING_TEXT, NOT_FOUND_TEXT, RETRY_LABEL } from './admin-texts';
import {
  REASON_ACTIVE,
  REASON_ADD,
  REASON_ADD_HEADING,
  REASON_ADDED,
  REASON_INVALID,
  REASON_LABEL,
  REASON_LABEL_ERROR,
  REASON_ORDER,
  REASON_PRIORITY,
  REASON_SAVE,
  REASON_SAVED,
  REASONS_HEADING,
  REASONS_HINT,
} from './team-texts';

type View = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; items: ReportReasonRow[] };

const PRIORITIES = ['1', '2', '3', '4'].map((value) => ({ value, label: value }));
const failureText = (outcome: AdminOutcome<unknown>): string =>
  outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : outcome.kind === 'not-found' ? NOT_FOUND_TEXT : outcome.kind === 'invalid' ? REASON_INVALID : ACTION_FAILED_TEXT;
const labelOk = (label: string) => {
  const length = codePointLength(label.trim());
  return length >= REPORT_REASON_LABEL_MIN && length <= REPORT_REASON_LABEL_MAX;
};
const orderOf = (text: string): number | null => (/^\d{1,4}$/.test(text.trim()) && Number(text) <= 1000 ? Number(text) : null);

// The community settings (FR-ADMIN-007, PG-031, AC-048): COMMUNITY_CONFIG (the Admin always). The report reasons a reporter chooses from, their order
// and their place in the staff queue. The database keeps child safety first and the core reasons on, and audits every change with Before/After.
export function CommunityScreen() {
  const call = useAdminCall();
  const [view, setView] = useState<View>({ kind: 'loading' });

  const load = useCallback(async () => {
    const outcome = await call((token) => fetchReportReasons(token));
    setView(outcome.kind === 'ok' ? { kind: 'loaded', items: outcome.value.items } : { kind: 'failed', message: outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  if (view.kind === 'loading') {
    return (
      <div role="status" aria-label={LOADING_TEXT} className="flex flex-col gap-3">
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  if (view.kind === 'failed') {
    return (
      <div className="flex flex-col items-start gap-3">
        <InlineAlert>{view.message}</InlineAlert>
        <Button variant="soft" onClick={() => void load()}>
          {RETRY_LABEL}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="community-reasons" className="flex flex-col gap-3">
        <h3 id="community-reasons" className="text-h3">
          {REASONS_HEADING}
        </h3>
        <p className="text-small text-muted-foreground">{REASONS_HINT}</p>
        <ul className="flex flex-col gap-3">
          {view.items.map((reason) => (
            <li key={reason.key}>
              <ReasonRow reason={reason} />
            </li>
          ))}
        </ul>
      </section>
      <AddReason nextOrder={Math.min(1000, view.items.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 10)} onAdded={() => void load()} />
    </div>
  );
}

function ReasonRow({ reason }: { reason: ReportReasonRow }) {
  const call = useAdminCall();
  const id = useId();
  const [label, setLabel] = useState(reason.label);
  const [priority, setPriority] = useState(String(reason.priority));
  const [order, setOrder] = useState(String(reason.sortOrder));
  const [active, setActive] = useState(reason.isActive);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const badLabel = !labelOk(label);
  const sortOrder = orderOf(order);

  const save = async () => {
    if (badLabel || sortOrder === null) {
      setError(badLabel ? REASON_LABEL_ERROR : REASON_INVALID);
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    const outcome = await call((token) => updateReportReason(token, reason.key, { label: label.trim(), priority: Number(priority), sortOrder, isActive: active }));
    setBusy(false);
    if (outcome.kind === 'ok') setNotice(REASON_SAVED);
    else setError(failureText(outcome));
  };

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-label">{reason.label}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label={REASON_LABEL} htmlFor={`${id}-label`}>
          {(control) => <TextInput {...control} value={label} onChange={(event) => setLabel(event.target.value)} />}
        </FormField>
        <FormField label={REASON_PRIORITY} htmlFor={`${id}-priority`}>
          {(control) => <SelectInput {...control} options={PRIORITIES} value={priority} placeholder="—" onChange={setPriority} disabled={reason.key === 'child_safety'} />}
        </FormField>
        <FormField label={REASON_ORDER} htmlFor={`${id}-order`}>
          {(control) => <TextInput {...control} dir="ltr" value={order} onChange={(event) => setOrder(event.target.value)} />}
        </FormField>
      </div>
      <Checkbox checked={active} disabled={reason.isCore} onCheckedChange={setActive}>
        {REASON_ACTIVE}
      </Checkbox>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="soft" pending={busy} disabled={busy} onClick={() => void save()}>
          {REASON_SAVE}
        </Button>
        <span role="status" className="text-small">
          {notice}
        </span>
      </div>
      {error === '' ? null : <InlineAlert>{error}</InlineAlert>}
    </fieldset>
  );
}

function AddReason({ nextOrder, onAdded }: { nextOrder: number; onAdded: () => void }) {
  const call = useAdminCall();
  const [label, setLabel] = useState('');
  const [priority, setPriority] = useState('4');
  const [problem, setProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const add = async () => {
    if (!labelOk(label)) {
      setProblem(true);
      return;
    }
    setProblem(false);
    setBusy(true);
    setError('');
    setNotice('');
    const outcome = await call((token) => addReportReason(token, { label: label.trim(), priority: Number(priority), sortOrder: nextOrder }));
    setBusy(false);
    if (outcome.kind === 'ok') {
      setNotice(REASON_ADDED);
      setLabel('');
      onAdded();
    } else {
      setError(failureText(outcome));
    }
  };

  return (
    <section aria-labelledby="community-add" className="flex flex-col gap-3">
      <h3 id="community-add" className="text-h3">
        {REASON_ADD_HEADING}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={REASON_LABEL} htmlFor="community-add-label" {...(problem ? { error: REASON_LABEL_ERROR } : {})}>
          {(control) => <TextInput {...control} value={label} onChange={(event) => setLabel(event.target.value)} />}
        </FormField>
        <FormField label={REASON_PRIORITY} htmlFor="community-add-priority">
          {(control) => <SelectInput {...control} options={PRIORITIES.slice(1)} value={priority} placeholder="—" onChange={setPriority} />}
        </FormField>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" pending={busy} disabled={busy} onClick={() => void add()}>
          {REASON_ADD}
        </Button>
        <span role="status" className="text-small">
          {notice}
        </span>
      </div>
      {error === '' ? null : <InlineAlert>{error}</InlineAlert>}
    </section>
  );
}
