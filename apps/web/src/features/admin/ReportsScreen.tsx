import { useCallback, useEffect, useRef, useState } from 'react';
import type { PermissionKey, QueueItem, ReportDetail } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminCall } from '@/hooks/use-admin-call';
import { enforceUser, fetchQueue, fetchReportDetail, handleReports, moderateContent, revealAuthor, type AdminOutcome } from '@/services/api/admin';
import { formatAdminTime } from './admin-format';
import { EnforcementPanel } from './EnforcementPanel';
import { ReportDetailPanel, type ReportAction } from './ReportDetailPanel';
import {
  ACTION_FAILED_TEXT,
  BACK_TO_QUEUE_LABEL,
  ENFORCED_TEXT,
  FORBIDDEN_TEXT,
  HANDLED_TEXT,
  KIND_LABELS,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  MOVED_TEXT,
  NOT_APPLICABLE_TEXT,
  NOT_FOUND_TEXT,
  OPEN_ITEM_LABEL,
  PRIORITY_LABELS,
  QUEUE_EMPTY_TEXT,
  QUEUE_LIST_LABEL,
  reportCountText,
  REASON_REQUIRED_TEXT,
  RETRY_LABEL,
  RISING_TEXT,
} from './admin-texts';

type Queue = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; items: QueueItem[] };
type Selected = { item: QueueItem; detail: ReportDetail | null; detailFailed: boolean; revealed: { fullName: string | null } | null };

const refusalText = (kind: AdminOutcome<unknown>['kind']): string =>
  kind === 'forbidden' ? FORBIDDEN_TEXT : kind === 'not-found' ? NOT_FOUND_TEXT : kind === 'reason-required' ? REASON_REQUIRED_TEXT : kind === 'not-applicable' ? NOT_APPLICABLE_TEXT : ACTION_FAILED_TEXT;

// The moderation queue (FR-MOD-003, PG-028, BR-074): one line per open target, "content endangering a child" first, a post with three reports risen but
// still visible. A line opens the target with its reports, the actions the keys allow and, when the account is known, the enforcement panel.
export function ReportsScreen({ permissions }: { permissions: readonly PermissionKey[] }) {
  const call = useAdminCall();
  const [queue, setQueue] = useState<Queue>({ kind: 'loading' });
  const [selected, setSelected] = useState<Selected | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const busy = useRef(false);

  const loadQueue = useCallback(async () => {
    const outcome = await call(fetchQueue);
    setQueue(outcome.kind === 'ok' ? { kind: 'loaded', items: outcome.value.items } : { kind: 'failed' });
  }, [call]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  async function loadDetail(item: QueueItem, revealed: Selected['revealed'] = null) {
    setSelected({ item, detail: null, detailFailed: false, revealed });
    const outcome = await call((token) => fetchReportDetail(token, item.targetKind, item.targetId));
    setSelected({ item, detail: outcome.kind === 'ok' ? outcome.value : null, detailFailed: outcome.kind !== 'ok', revealed });
  }

  async function act(action: ReportAction) {
    if (selected === null || selected.detail === null || busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure(null);
    setStatus('');
    const { item, detail } = selected;
    try {
      let outcome: AdminOutcome<unknown>;
      let said = HANDLED_TEXT;
      if (action.type === 'reveal') {
        const revealedOutcome = await call((token) => revealAuthor(token, item.targetId));
        if (revealedOutcome.kind === 'ok') {
          setSelected({ ...selected, revealed: { fullName: revealedOutcome.value.fullName } });
          return;
        }
        outcome = revealedOutcome;
      } else if (action.type === 'restore') {
        if (item.targetKind === 'user') return;
        const kind = item.targetKind;
        outcome = await call((token) => moderateContent(token, { targetKind: kind, targetId: item.targetId, status: 'active', reason: action.reason }));
        said = MOVED_TEXT;
      } else {
        const moderation = action.type === 'hide' || action.type === 'remove' ? { status: action.type === 'hide' ? ('hidden' as const) : ('removed' as const), reason: action.reason } : undefined;
        const note = action.type === 'dismiss' || action.type === 'close' ? action.note : undefined;
        outcome = await call((token) =>
          handleReports(token, {
            targetKind: item.targetKind,
            targetId: item.targetId,
            resolution: action.type === 'dismiss' ? 'dismissed' : 'action_taken',
            ...(note === undefined ? {} : { note }),
            ...(moderation === undefined ? {} : { moderation }),
          }),
        );
      }
      if (outcome.kind !== 'ok') {
        setFailure(refusalText(outcome.kind));
        return;
      }
      setStatus(said);
      await loadQueue();
      if (action.type === 'restore') await loadDetail(item, selected.revealed);
      else setSelected(null);
      void detail;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function enforce(request: Parameters<typeof enforceUser>[1]) {
    if (busy.current || selected === null) return;
    busy.current = true;
    setPending(true);
    setFailure(null);
    try {
      const outcome = await call((token) => enforceUser(token, request));
      if (outcome.kind !== 'ok') {
        setFailure(refusalText(outcome.kind));
        return;
      }
      setStatus(ENFORCED_TEXT);
      await loadDetail(selected.item, selected.revealed);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  if (selected !== null) {
    const { detail } = selected;
    const reason = detail?.reports[0]?.reason;
    return (
      <div className="flex flex-col gap-5">
        <div>
          <Button
            variant="text"
            onClick={() => {
              setSelected(null);
              setFailure(null);
            }}
          >
            {BACK_TO_QUEUE_LABEL}
          </Button>
        </div>
        {status === '' ? null : <p role="status">{status}</p>}
        {detail === null ? (
          selected.detailFailed ? (
            <InlineAlert>{LOAD_FAILED_TEXT}</InlineAlert>
          ) : (
            <p role="status">{LOADING_TEXT}</p>
          )
        ) : (
          <>
            <ReportDetailPanel
              detail={detail}
              permissions={permissions}
              revealed={selected.revealed}
              pending={pending}
              failure={failure}
              isOpen={queue.kind === 'loaded' && queue.items.some((item) => item.targetId === selected.item.targetId)}
              onAction={(action) => void act(action)}
            />
            {detail.user === null ? null : (
              <EnforcementPanel
                user={detail.user}
                permissions={permissions}
                {...(detail.reports.length === 0 ? {} : { report: { id: detail.reports[0]?.id ?? '', isChildSafety: reason === 'child_safety' || detail.reports.some((r) => r.reason === 'child_safety') } })}
                pending={pending}
                failure={failure}
                onSubmit={(request) => void enforce({ ...request, userId: detail.user?.userId ?? '' })}
              />
            )}
          </>
        )}
      </div>
    );
  }

  if (queue.kind === 'loading') {
    return (
      <div role="status" aria-label={LOADING_TEXT} className="flex flex-col gap-3">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  if (queue.kind === 'failed') {
    return (
      <div className="flex flex-col items-start gap-3">
        <InlineAlert>{LOAD_FAILED_TEXT}</InlineAlert>
        <Button variant="soft" onClick={() => void loadQueue()}>
          {RETRY_LABEL}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {status === '' ? null : <p role="status">{status}</p>}
      {queue.items.length === 0 ? (
        <p>{QUEUE_EMPTY_TEXT}</p>
      ) : (
        <ul aria-label={QUEUE_LIST_LABEL} className="flex flex-col gap-3">
          {queue.items.map((item) => (
            <li key={`${item.targetKind}-${item.targetId}`} data-priority={item.priority} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
              <div className="flex flex-col gap-1">
                <p className="text-label">
                  {KIND_LABELS[item.targetKind]} · {item.topReasonLabel}
                </p>
                <p className="text-small text-muted-foreground">
                  {PRIORITY_LABELS[item.priority] ?? ''} · {reportCountText(item.reportCount)} · {formatAdminTime(item.firstReportedAt)}
                </p>
                {item.isRising ? <p className="text-small">{RISING_TEXT}</p> : null}
              </div>
              <Button variant="soft" onClick={() => void loadDetail(item)}>
                {OPEN_ITEM_LABEL}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
