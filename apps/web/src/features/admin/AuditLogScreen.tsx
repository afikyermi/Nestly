import { useCallback, useEffect, useRef, useState } from 'react';
import { SENSITIVE_AUDIT_ACTIONS, type AuditEntry, type AuditFilters } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectInput } from '@/components/ui/select-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminCall } from '@/hooks/use-admin-call';
import { fetchAuditFiltered } from '@/services/api/staff-work';
import { formatAdminTime } from './admin-format';
import {
  ACTION_LABELS,
  actionLabel,
  AUDIT_COLUMNS,
  AUDIT_EMPTY_TEXT,
  AUDIT_MORE_LABEL,
  AUDIT_TITLE,
  FORBIDDEN_TEXT,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  RETRY_LABEL,
  ROLE_LABELS,
  targetLabel,
} from './admin-texts';
import {
  AUDIT_FILTER_ACTION,
  AUDIT_FILTER_ALL,
  AUDIT_FILTER_CLEAR,
  AUDIT_FILTER_PERIOD,
  AUDIT_FILTER_PERIODS,
  AUDIT_FILTER_ROLE,
  AUDIT_FILTER_SENSITIVE,
  AUDIT_FILTERS_LABEL,
} from './staff-work-texts';

type View = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; entries: AuditEntry[]; next: string | null; more: boolean };
type Period = '' | '1' | '7' | '30' | '90';
const PERIODS = ['1', '7', '30', '90'] as const;
const isPeriod = (value: string): value is Period => value === '' || PERIODS.some((period) => period === value);

/** The first day of a period ending today, in Israel's calendar (the server reads the day in Asia/Jerusalem). */
function fromDay(period: Period, now: Date): string | undefined {
  if (period === '') return undefined;
  const day = new Date(now.getTime() - (Number(period) - 1) * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(day);
}

// The Audit Log screen (FR-ADMIN-005, PG-028): the actions of the Admin and the Moderators, newest first, 50 at a time. View only: nothing here
// changes or deletes an entry, and the database shows the log to the Admin and to AUDIT_LOG_VIEW alone. I14 completion (§9.10): filters by action,
// role and period, and the sensitive-events view (reveals, openings of private content, children's data, permissions, bans, suspicions,
// escalations); `initialSensitive` opens on that view.
export function AuditLogScreen({ initialSensitive = false }: { initialSensitive?: boolean }) {
  const call = useAdminCall();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [action, setAction] = useState('');
  const [role, setRole] = useState('');
  const [period, setPeriod] = useState<Period>('');
  const [sensitive, setSensitive] = useState(initialSensitive);
  const filtered = action !== '' || role !== '' || period !== '' || sensitive;
  // the newest request wins: an answer for older filters arriving late is dropped
  const runs = useRef(0);

  const load = useCallback(
    async (before: string | null, previous: AuditEntry[]) => {
      setView(previous.length === 0 ? { kind: 'loading' } : { kind: 'loaded', entries: previous, next: before, more: true });
      const from = fromDay(period, new Date());
      const filters: AuditFilters = {
        ...(action === '' ? {} : { action }),
        ...(role === 'admin' || role === 'moderator' ? { role } : {}),
        ...(from === undefined ? {} : { from }),
        ...(sensitive ? { sensitive: 'true' as const } : {}),
      };
      const run = ++runs.current;
      const outcome = await call((token) => fetchAuditFiltered(token, filters, before));
      if (run !== runs.current) return;
      if (outcome.kind === 'ok') {
        setView({ kind: 'loaded', entries: [...previous, ...outcome.value.entries], next: outcome.value.next, more: false });
      } else {
        setView({ kind: 'failed', message: outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT });
      }
    },
    [call, action, role, period, sensitive],
  );

  useEffect(() => {
    void load(null, []);
  }, [load]);

  const actions: readonly string[] = sensitive ? SENSITIVE_AUDIT_ACTIONS : Object.keys(ACTION_LABELS);
  const filterBar = (
    <form aria-label={AUDIT_FILTERS_LABEL} className="flex flex-wrap items-end gap-3" onSubmit={(event) => event.preventDefault()}>
      <FormField label={AUDIT_FILTER_ACTION} htmlFor="audit-action" className="min-w-48">
        {(control) => (
          <SelectInput {...control} options={actions.map((value) => ({ value, label: actionLabel(value) }))} value={action} placeholder={AUDIT_FILTER_ALL} onChange={setAction} />
        )}
      </FormField>
      <FormField label={AUDIT_FILTER_ROLE} htmlFor="audit-role" className="min-w-36">
        {(control) => (
          <SelectInput
            {...control}
            options={[
              { value: 'admin', label: ROLE_LABELS.admin },
              { value: 'moderator', label: ROLE_LABELS.moderator },
            ]}
            value={role}
            placeholder={AUDIT_FILTER_ALL}
            onChange={setRole}
          />
        )}
      </FormField>
      <FormField label={AUDIT_FILTER_PERIOD} htmlFor="audit-period" className="min-w-36">
        {(control) => (
          <SelectInput
            {...control}
            options={PERIODS.map((value) => ({ value, label: AUDIT_FILTER_PERIODS[value] }))}
            value={period}
            placeholder={AUDIT_FILTER_ALL}
            onChange={(value) => setPeriod(isPeriod(value) ? value : '')}
          />
        )}
      </FormField>
      <Checkbox
        checked={sensitive}
        onCheckedChange={(checked) => {
          setSensitive(checked);
          setAction('');
        }}
      >
        {AUDIT_FILTER_SENSITIVE}
      </Checkbox>
      {!filtered ? null : (
        <Button
          variant="text"
          onClick={() => {
            setAction('');
            setRole('');
            setPeriod('');
            setSensitive(false);
          }}
        >
          {AUDIT_FILTER_CLEAR}
        </Button>
      )}
    </form>
  );

  let body;
  if (view.kind === 'loading') {
    body = (
      <div role="status" aria-label={LOADING_TEXT} className="flex flex-col gap-3">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  } else if (view.kind === 'failed') {
    body = (
      <div className="flex flex-col items-start gap-3">
        <InlineAlert>{view.message}</InlineAlert>
        <Button variant="soft" onClick={() => void load(null, [])}>
          {RETRY_LABEL}
        </Button>
      </div>
    );
  } else if (view.entries.length === 0) {
    body = <p>{AUDIT_EMPTY_TEXT}</p>;
  } else {
    body = (
      <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-160 border-collapse text-small">
            <caption className="sr-only">{AUDIT_TITLE}</caption>
            <thead>
              <tr className="border-b border-border text-start">
                {Object.values(AUDIT_COLUMNS).map((label) => (
                  <th key={label} scope="col" className="px-2 py-2 text-start text-label">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border align-top">
                  <td className="px-2 py-2 whitespace-nowrap">{formatAdminTime(entry.occurredAt)}</td>
                  <td className="px-2 py-2">{ROLE_LABELS[entry.actorRole]}</td>
                  <td className="px-2 py-2">{actionLabel(entry.action)}</td>
                  <td className="px-2 py-2">
                    {targetLabel(entry.targetKind)}
                    {entry.targetId === null ? null : (
                      <span className="ms-1 text-muted-foreground" dir="ltr">
                        {entry.targetId.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">{entry.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {view.next === null ? null : (
          <div>
            <Button variant="soft" pending={view.more} onClick={() => void load(view.next, view.entries)}>
              {AUDIT_MORE_LABEL}
            </Button>
          </div>
        )}
      </>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {filterBar}
      {body}
    </div>
  );
}
