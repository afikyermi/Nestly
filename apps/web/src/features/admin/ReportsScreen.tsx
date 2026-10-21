import { useCallback, useEffect, useRef, useState } from 'react';
import { enforcementReport, type PermissionKey, type QueueItem, type ReportDetail, type TargetUser } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminCall } from '@/hooks/use-admin-call';
import { enforceUser, fetchQueue, fetchReportDetail, fetchUser, handleReports, moderateContent, openReportedMessage, revealAuthor, type AdminOutcome } from '@/services/api/admin';
import { setListingVisibility } from '@/services/api/marketplace';
import { formatAdminTime } from './admin-format';
import { EnforcementPanel } from './EnforcementPanel';
import { ReportDetailPanel, type ReportAction } from './ReportDetailPanel';
import { StaffWorkPanel } from './StaffWorkPanel';
import { ESCALATED_MARK, ESCALATED_TEXT, OPENED_BY_MARK, PAST_TARGET, TIME_TARGET, WAITING } from './staff-work-texts';
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
  openItemRest,
  PRIORITY_LABELS,
  QUEUE_EMPTY_TEXT,
  QUEUE_LIST_LABEL,
  reportCountText,
  REASON_REQUIRED_TEXT,
  RETRY_LABEL,
  RISING_TEXT,
  autoHiddenText,
} from './admin-texts';

type Queue = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; items: QueueItem[] };
type Revealed = { userId: string; fullName: string | null; user: TargetUser | null };
type Selected = { item: QueueItem; detail: ReportDetail | null; detailFailed: boolean; revealed: Revealed | null; message?: { text: string; sentAt: string } };

const refusalText = (kind: AdminOutcome<unknown>['kind']): string =>
  kind === 'forbidden' ? FORBIDDEN_TEXT : kind === 'not-found' ? NOT_FOUND_TEXT : kind === 'reason-required' ? REASON_REQUIRED_TEXT : kind === 'not-applicable' ? NOT_APPLICABLE_TEXT : ACTION_FAILED_TEXT;

// The moderation queue (FR-MOD-003, PG-028, BR-074): one line per open target, "content endangering a child" first, a post with three reports risen but
// still visible. A line opens the target with its reports, the actions the keys allow and, when the account is known, the enforcement panel.
// I14 completion (§9.9, §9.10): each line shows how long it waits against its time target (child safety 1 hour, other reports 24 hours), marks one
// past it, escalated or opened; `initialTarget` opens one line directly ("next in queue" from the homes).
export function ReportsScreen({ permissions, initialTarget = null }: { permissions: readonly PermissionKey[]; initialTarget?: { kind: string; id: string } | null }) {
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

  const openedInitial = useRef(false);
  const openItem = useRef<(item: QueueItem) => void>(() => undefined);
  useEffect(() => {
    if (openedInitial.current || initialTarget === null || queue.kind !== 'loaded') return;
    openedInitial.current = true;
    const item = queue.items.find((candidate) => candidate.targetKind === initialTarget.kind && candidate.targetId === initialTarget.id);
    if (item !== undefined) openItem.current(item);
  }, [queue, initialTarget]);

  // The revealed author of an anonymous post, as an account the enforcement panel can act on (needs USER_VIEW, as any account on this screen).
  async function revealedAccount(userId: string): Promise<TargetUser | null> {
    if (!permissions.includes('USER_VIEW')) return null;
    const outcome = await call((token) => fetchUser(token, userId));
    return outcome.kind === 'ok' ? outcome.value : null;
  }

  async function loadDetail(item: QueueItem, revealed: Revealed | null = null, message?: Selected['message'], openPrivate = false) {
    setSelected({ item, detail: null, detailFailed: false, revealed, ...(message === undefined ? {} : { message }) });
    const outcome = await call((token) => fetchReportDetail(token, item.targetKind, item.targetId, openPrivate));
    const fresh = revealed === null ? null : { ...revealed, user: await revealedAccount(revealed.userId) };
    setSelected({ item, detail: outcome.kind === 'ok' ? outcome.value : null, detailFailed: outcome.kind !== 'ok', revealed: fresh, ...(message === undefined ? {} : { message }) });
  }

  openItem.current = (item) => void loadDetail(item);

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
      if (action.type === 'open-message') {
        // §9.6: the one reported message, opened by its own audited call; its sender becomes the account the enforcement panel acts on.
        const opened = await call((token) => openReportedMessage(token, item.targetId));
        if (opened.kind === 'ok') {
          const { text, sentAt, senderId, user } = opened.value;
          setSelected({ ...selected, message: { text, sentAt }, revealed: { userId: senderId, fullName: user?.fullName ?? null, user } });
          return;
        }
        outcome = opened;
      } else if (action.type === 'reveal') {
        const revealedOutcome = await call((token) => revealAuthor(token, item.targetId));
        if (revealedOutcome.kind === 'ok') {
          const { userId, fullName } = revealedOutcome.value;
          setSelected({ ...selected, revealed: { userId, fullName, user: await revealedAccount(userId) } });
          return;
        }
        outcome = revealedOutcome;
      } else if (action.type === 'restore') {
        if (item.targetKind === 'user' || item.targetKind === 'message') return;
        const kind = item.targetKind;
        // I12: a listing comes back through its own visibility call (MARKETPLACE_MODERATE, audited)
        outcome =
          kind === 'listing'
            ? await call((token) => setListingVisibility(token, item.targetId, false, action.reason))
            : await call((token) => moderateContent(token, { targetKind: kind, targetId: item.targetId, status: 'active', reason: action.reason }));
        said = MOVED_TEXT;
      } else {
        // I14 completion B: a justified report deletes the content (moderation "removed" with action taken)
        const moderation = action.type === 'delete' ? { status: 'removed' as const, reason: action.reason } : undefined;
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
      await loadDetail(selected.item, selected.revealed, selected.message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  if (selected !== null) {
    const { detail } = selected;
    const account = detail?.user ?? selected.revealed?.user ?? null;
    const report = detail === null ? undefined : enforcementReport(detail.reports);
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
              message={selected.message ?? null}
              pending={pending}
              failure={failure}
              isOpen={queue.kind === 'loaded' && queue.items.some((item) => item.targetId === selected.item.targetId)}
              onAction={(action) => void act(action)}
              onOpenPrivate={() => void loadDetail(selected.item, selected.revealed, selected.message, true)}
            />
            <StaffWorkPanel
              detail={detail}
              user={account}
              isOpen={queue.kind === 'loaded' && queue.items.some((item) => item.targetId === selected.item.targetId)}
              onEscalated={() => {
                setStatus(ESCALATED_TEXT);
                void loadDetail(selected.item, selected.revealed, selected.message);
              }}
            />
            {account === null ? null : (
              <EnforcementPanel
                user={account}
                permissions={permissions}
                {...(report === undefined ? {} : { report })}
                pending={pending}
                failure={failure}
                onSubmit={(request) => void enforce({ ...request, userId: account.userId })}
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
                {item.autoHidden === true ? (
                  <p className="text-small font-semibold" data-auto-hidden="true">
                    {autoHiddenText(item.autoHiddenReasonLabel, item.autoHiddenReporters)}
                  </p>
                ) : null}
                <p className="text-small" data-past-target={item.pastTarget === true ? 'true' : undefined}>
                  {WAITING((Date.now() - Date.parse(item.firstReportedAt)) / 3_600_000)}
                  {item.timeTargetHours === undefined ? null : <> · {TIME_TARGET(item.timeTargetHours)}</>}
                  {item.pastTarget === true ? <strong className="ms-1 text-destructive">· {PAST_TARGET}</strong> : null}
                  {item.escalated === true ? <> · {ESCALATED_MARK}</> : null}
                  {item.openedBy !== undefined && item.openedBy > 0 ? <> · {OPENED_BY_MARK(item.openedBy)}</> : null}
                </p>
              </div>
              <Button variant="soft" onClick={() => void loadDetail(item)}>
                {OPEN_ITEM_LABEL}
                <span className="sr-only"> {openItemRest(KIND_LABELS[item.targetKind], item.topReasonLabel)}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
