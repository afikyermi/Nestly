import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { AnalyticsView } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PATHS } from '@/app/paths';
import { useAdminCall } from '@/hooks/use-admin-call';
import { fetchAnalytics } from '@/services/api/team';
import { RETRY_LABEL } from './admin-texts';
import { ChartCard } from './ChartCard';
import { HOME_CHARTS_ALL_DATA, HOME_CHARTS_DAYS, HOME_CHARTS_FAILED, HOME_CHARTS_LOADING, HOME_CHARTS_TITLE } from './staff-work-texts';
import { ANALYTICS_POSTS, ANALYTICS_REGISTRATIONS, ANALYTICS_REPORTS, ANALYTICS_USAGE_LOGINS } from './team-texts';

type View = { kind: 'loading' } | { kind: 'failed' } | { kind: 'hidden' } | { kind: 'loaded'; data: AnalyticsView };

// The Admin's home, its charts (FR-ADMIN-014, AC-216, Afik 28.10.2026): the community's last 30 days at a glance — registrations, accounts
// that came in, posts and reports, day by day — with a link to the full data screen (PG-026). The numbers are the data screen's own
// (ANALYTICS_VIEW, the Admin always), loaded on their own: a failure here says so in place and never hides the rest of the home; an
// account the server refuses sees no charts at all.
export function AdminHomeCharts() {
  const call = useAdminCall();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const load = useCallback(async () => {
    setView({ kind: 'loading' });
    const outcome = await call((token) => fetchAnalytics(token, HOME_CHARTS_DAYS));
    setView(outcome.kind === 'ok' ? { kind: 'loaded', data: outcome.value } : outcome.kind === 'forbidden' ? { kind: 'hidden' } : { kind: 'failed' });
  }, [call]);
  useEffect(() => {
    void load();
  }, [load]);

  if (view.kind === 'hidden') return null;
  return (
    <section aria-labelledby="home-charts-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="home-charts-title" className="text-h3">
          {HOME_CHARTS_TITLE}
        </h3>
        <Link to={PATHS.adminAnalytics} className="text-label text-primary-strong underline underline-offset-4">
          {HOME_CHARTS_ALL_DATA}
        </Link>
      </div>
      {view.kind === 'loading' ? (
        <div role="status" aria-label={HOME_CHARTS_LOADING} className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-60 rounded-lg" />
          ))}
        </div>
      ) : view.kind === 'failed' ? (
        <div className="flex flex-col items-start gap-3">
          <InlineAlert>{HOME_CHARTS_FAILED}</InlineAlert>
          <Button variant="soft" onClick={() => void load()}>
            {RETRY_LABEL}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <ChartCard title={ANALYTICS_REGISTRATIONS} points={view.data.accounts.registrations.map((row) => ({ day: row.day, count: row.regular + row.professional }))} />
          <ChartCard title={ANALYTICS_USAGE_LOGINS} points={view.data.usage.dailyLogins} />
          <ChartCard title={ANALYTICS_POSTS} points={view.data.content.posts} />
          <ChartCard title={ANALYTICS_REPORTS} points={view.data.moderation.reports} />
        </div>
      )}
    </section>
  );
}
