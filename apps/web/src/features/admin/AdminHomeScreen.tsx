import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { AdminOverview } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminCall } from '@/hooks/use-admin-call';
import { PATHS } from '@/app/paths';
import { fetchAdminOverview } from '@/services/api/staff-work';
import { formatAdminTime } from './admin-format';
import { FORBIDDEN_TEXT, LOAD_FAILED_TEXT, LOADING_TEXT, RETRY_LABEL } from './admin-texts';
import { ChildTrendsBuilder } from './ChildTrendsBuilder';
import {
  ATTENTION_LABELS,
  ATTENTION_TITLE,
  CHILD_SAFETY_BAR,
  CHILD_SAFETY_BAR_LINK,
  METRIC_CHANGE,
  METRIC_LABELS,
  METRIC_PREVIOUS,
  METRICS_TITLE,
  NOTHING_NEEDS_ATTENTION,
  OPEN_LABEL,
  OVERDUE_DELETIONS_BAR,
  PENDING_DELETIONS_LABEL,
  REPORT_SPIKE_TEXT,
  SENSITIVE_LINK,
  TEAM_KEYS_COUNT,
  TEAM_LAST_ACTION,
  TEAM_SNAPSHOT_EMPTY,
  TEAM_SNAPSHOT_TITLE,
  TEAM_SNAPSHOT_UNNAMED,
  TEAM_WEEK_ACTIONS,
} from './staff-work-texts';

type View = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; overview: AdminOverview };
type AttentionKey = keyof typeof ATTENTION_LABELS;
const ATTENTION_KEYS: readonly AttentionKey[] = ['openReports', 'pastTargetReports', 'escalatedReports', 'queuedImages', 'openSupport', 'openInvitations', 'draftGuides'];

/** Where each "needs attention" line leads. */
const ATTENTION_PATHS: Record<AttentionKey, string> = {
  openReports: PATHS.adminReports,
  pastTargetReports: PATHS.adminReports,
  escalatedReports: PATHS.adminReports,
  queuedImages: PATHS.adminMedia,
  openSupport: PATHS.adminSupport,
  openInvitations: PATHS.adminTeam,
  draftGuides: PATHS.adminGuides,
};

// The Admin's home (I14 completion, Afik 21.10.2026, §9.10): a red bar while a child-safety report is open; what needs attention (reports,
// images, items past their time target, escalations, Support, invitations, guides to recheck, a spike in reports); this week against the week
// before; the team's snapshot; the children's trends builder (CHILD_DATA_VIEW, the Admin always); a link to the Audit Log's sensitive events.
// I9 (§16.4): the account deletions waiting for their date, and a red bar while one is past it. Numbers only: the server reads them through
// the Admin's policies.
export function AdminHomeScreen() {
  const call = useAdminCall();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const load = useCallback(async () => {
    setView({ kind: 'loading' });
    const outcome = await call(fetchAdminOverview);
    setView(outcome.kind === 'ok' ? { kind: 'loaded', overview: outcome.value } : { kind: 'failed', message: outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT });
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
  const { overview } = view;
  const attention = ATTENTION_KEYS.filter((key) => overview.attention[key] > 0);
  const spike = overview.attention.reportSpike;
  return (
    <div className="flex flex-col gap-6">
      {overview.childSafetyOpen > 0 ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-destructive px-4 py-3 text-primary-foreground">
          <strong>{CHILD_SAFETY_BAR(overview.childSafetyOpen)}</strong>
          <Link to={PATHS.adminReports} className="text-label text-primary-foreground underline">
            {CHILD_SAFETY_BAR_LINK}
          </Link>
        </div>
      ) : null}
      {overview.accountDeletions.overdue > 0 ? (
        <div role="alert" className="rounded-md bg-destructive px-4 py-3 text-primary-foreground">
          <strong>{OVERDUE_DELETIONS_BAR(overview.accountDeletions.overdue)}</strong>
        </div>
      ) : null}
      <section aria-labelledby="attention-title" className="flex flex-col gap-2">
        <h3 id="attention-title" className="text-h3">
          {ATTENTION_TITLE}
        </h3>
        {attention.length === 0 && !spike.isSpike && overview.accountDeletions.pending === 0 ? <p>{NOTHING_NEEDS_ATTENTION}</p> : null}
        <ul className="flex flex-col divide-y divide-divider rounded-lg shadow-card">
          {spike.isSpike ? (
            <li className="p-3">
              <Link to={PATHS.adminReports} className="text-primary-strong underline underline-offset-4">{REPORT_SPIKE_TEXT(spike.lastDay, spike.dailyAverage)}</Link>
            </li>
          ) : null}
          {overview.accountDeletions.pending > 0 ? (
            <li className="flex items-center justify-between gap-3 p-3">
              <span>
                {PENDING_DELETIONS_LABEL}: <strong>{overview.accountDeletions.pending}</strong>
              </span>
            </li>
          ) : null}
          {attention.map((key) => (
            <li key={key} className="flex items-center justify-between gap-3 p-3">
              <span>
                {ATTENTION_LABELS[key]}: <strong>{overview.attention[key]}</strong>
              </span>
              <Link to={ATTENTION_PATHS[key]} className="text-label text-primary-strong underline underline-offset-4">
                {OPEN_LABEL}
                <span className="sr-only"> {ATTENTION_LABELS[key]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="metrics-title" className="flex flex-col gap-2">
        <h3 id="metrics-title" className="text-h3">
          {METRICS_TITLE}
        </h3>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {overview.metrics.map((metric) => (
            <div key={metric.key} className="rounded-lg p-3 shadow-card">
              <dt className="text-small text-muted-foreground">{METRIC_LABELS[metric.key]}</dt>
              <dd className="text-h3">{metric.current}</dd>
              <dd className="text-small">
                {METRIC_CHANGE(metric.current, metric.previous)} · {METRIC_PREVIOUS(metric.previous)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="team-title" className="flex flex-col gap-2">
        <h3 id="team-title" className="text-h3">
          {TEAM_SNAPSHOT_TITLE}
        </h3>
        {overview.team.length === 0 ? (
          <p>{TEAM_SNAPSHOT_EMPTY}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {overview.team.map((member) => (
              <li key={member.userId} className="rounded-lg p-3 text-small shadow-card">
                <p className="text-label">{member.label ?? TEAM_SNAPSHOT_UNNAMED}</p>
                <p>
                  {TEAM_KEYS_COUNT(member.keyCount)} · {TEAM_LAST_ACTION(member.lastActionAt === null ? null : formatAdminTime(member.lastActionAt))} ·{' '}
                  {TEAM_WEEK_ACTIONS(member.actionsThisWeek)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ChildTrendsBuilder />
      <div>
        <Link to={`${PATHS.adminAudit}?sensitive=true`} className="text-primary-strong underline underline-offset-4">{SENSITIVE_LINK}</Link>
      </div>
    </div>
  );
}
