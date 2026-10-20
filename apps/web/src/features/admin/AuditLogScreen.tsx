import { useCallback, useEffect, useState } from 'react';
import type { AuditEntry } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminCall } from '@/hooks/use-admin-call';
import { fetchAudit } from '@/services/api/admin';
import { formatAdminTime } from './admin-format';
import {
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

type View = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; entries: AuditEntry[]; next: string | null; more: boolean };

// The Audit Log screen (FR-ADMIN-005, PG-028): the actions of the Admin and the Moderators, newest first, 50 at a time. View only: nothing here
// changes or deletes an entry, and the database shows the log to the Admin and to AUDIT_LOG_VIEW alone.
export function AuditLogScreen() {
  const call = useAdminCall();
  const [view, setView] = useState<View>({ kind: 'loading' });

  const load = useCallback(
    async (before: string | null, previous: AuditEntry[]) => {
      setView(previous.length === 0 ? { kind: 'loading' } : { kind: 'loaded', entries: previous, next: before, more: true });
      const outcome = await call((token) => fetchAudit(token, before));
      if (outcome.kind === 'ok') {
        setView({ kind: 'loaded', entries: [...previous, ...outcome.value.entries], next: outcome.value.next, more: false });
      } else {
        setView({ kind: 'failed', message: outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT });
      }
    },
    [call],
  );

  useEffect(() => {
    void load(null, []);
  }, [load]);

  if (view.kind === 'loading') {
    return (
      <div role="status" aria-label={LOADING_TEXT} className="flex flex-col gap-3">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  if (view.kind === 'failed') {
    return (
      <div className="flex flex-col items-start gap-3">
        <InlineAlert>{view.message}</InlineAlert>
        <Button variant="soft" onClick={() => void load(null, [])}>
          {RETRY_LABEL}
        </Button>
      </div>
    );
  }
  if (view.entries.length === 0) return <p>{AUDIT_EMPTY_TEXT}</p>;
  return (
    <div className="flex flex-col gap-4">
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
                  {entry.targetId === null ? null : <span className="ms-1 text-muted-foreground" dir="ltr">{entry.targetId.slice(0, 8)}</span>}
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
    </div>
  );
}
