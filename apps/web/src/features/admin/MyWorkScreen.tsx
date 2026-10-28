import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { MyWork, WorkItem } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminCall } from '@/hooks/use-admin-call';
import { PATHS } from '@/app/paths';
import { fetchMyWork } from '@/services/api/staff-work';
import { FORBIDDEN_TEXT, LOAD_FAILED_TEXT, LOADING_TEXT, RETRY_LABEL } from './admin-texts';
import { ChildTrendsBuilder } from './ChildTrendsBuilder';
import {
  CHILD_SAFETY_BAR,
  CHILD_SAFETY_BAR_LINK,
  MY_WORK_COUNTERS,
  MY_WORK_NO_KEYS,
  NEXT_IN_QUEUE,
  OLDEST_TITLE,
  OPEN_LABEL,
  PAST_TARGET,
  QUEUE_EMPTY,
  TARGET_KIND_LABELS,
  TIME_TARGET,
  WAITING,
} from './staff-work-texts';

type View = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; work: MyWork };
type CounterKey = keyof typeof MY_WORK_COUNTERS;
const COUNTER_KEYS: readonly CounterKey[] = ['openReports', 'childSafetyReports', 'pastTargetReports', 'escalatedReports', 'queuedImages', 'openSupport'];

/** The queue with one item opened ("next in queue", the oldest one). */
export const reportPath = (item: WorkItem): string => `${PATHS.adminReports}?target=${item.targetKind}:${item.targetId}`;

const COUNTER_PATHS: Record<CounterKey, string> = {
  openReports: PATHS.adminReports,
  childSafetyReports: PATHS.adminReports,
  pastTargetReports: PATHS.adminReports,
  escalatedReports: PATHS.adminReports,
  queuedImages: PATHS.adminMedia,
  openSupport: PATHS.adminSupport,
};

// A Moderator's home, "my work" (I14 completion, Afik 21.10.2026, §9.9): counters for the areas its keys cover, the oldest waiting report with its
// wait against the time target, and a "next in queue" button that opens the queue's first item. The children's trends builder for CHILD_DATA_VIEW.
export function MyWorkScreen() {
  const call = useAdminCall();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const load = useCallback(async () => {
    setView({ kind: 'loading' });
    const outcome = await call(fetchMyWork);
    setView(outcome.kind === 'ok' ? { kind: 'loaded', work: outcome.value } : { kind: 'failed', message: outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT });
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
  const { work } = view;
  const counters = COUNTER_KEYS.filter((key) => work.counters[key] !== undefined);
  const childSafety = work.counters.childSafetyReports ?? 0;
  const seesReports = work.counters.openReports !== undefined;
  return (
    <div className="flex flex-col gap-6">
      {childSafety > 0 ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-destructive px-4 py-3 text-primary-foreground">
          <strong>{CHILD_SAFETY_BAR(childSafety)}</strong>
          <Link to={PATHS.adminReports} className="text-label text-primary-foreground underline">
            {CHILD_SAFETY_BAR_LINK}
          </Link>
        </div>
      ) : null}
      {counters.length === 0 && !work.permissions.includes('CHILD_DATA_VIEW') ? <p>{MY_WORK_NO_KEYS}</p> : null}
      {counters.length === 0 ? null : (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {counters.map((key) => (
            <div key={key} className="flex flex-col gap-1 rounded-lg p-3 shadow-card">
              <dt className="text-small text-muted-foreground">{MY_WORK_COUNTERS[key]}</dt>
              <dd className="text-h3">{work.counters[key]}</dd>
              <dd>
                <Link to={COUNTER_PATHS[key]} className="text-small text-primary-strong underline underline-offset-4">
                  {OPEN_LABEL}
                  <span className="sr-only"> {MY_WORK_COUNTERS[key]}</span>
                </Link>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {seesReports ? (
        <section aria-labelledby="oldest-title" className="flex flex-col gap-2">
          <h3 id="oldest-title" className="text-h3">
            {OLDEST_TITLE}
          </h3>
          {work.oldest === null ? (
            <p>{QUEUE_EMPTY}</p>
          ) : (
            <p>
              {TARGET_KIND_LABELS[work.oldest.targetKind]} · {WAITING((Date.now() - Date.parse(work.oldest.waitingSince)) / 3_600_000)} · {TIME_TARGET(work.oldest.timeTargetHours)}
              {work.oldest.pastTarget ? <strong className="ms-1 text-destructive">· {PAST_TARGET}</strong> : null}{' '}
              <Link to={reportPath(work.oldest)} className="text-primary-strong underline underline-offset-4">{OPEN_LABEL}</Link>
            </p>
          )}
          {work.next === null ? null : (
            <div>
              <Button href={reportPath(work.next)}>{NEXT_IN_QUEUE}</Button>
            </div>
          )}
        </section>
      ) : null}
      {work.permissions.includes('CHILD_DATA_VIEW') ? <ChildTrendsBuilder /> : null}
    </div>
  );
}
