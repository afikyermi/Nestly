import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ANALYTICS_PERIODS as PERIODS, LISTING_CATEGORY_LABELS, PROFESSIONAL_FIELD_LABELS, type AnalyticsPeriod, type AnalyticsView } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/select-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminCall } from '@/hooks/use-admin-call';
import { TOPIC_LABELS } from '@/lib/chat-texts';
import { fetchAnalytics } from '@/services/api/team';
import { Card, ChartCard as Chart, adminNumber as number, seriesTotal as total, type Series } from './ChartCard';
import { DeltaChip, KpiCard } from './KpiCard';
import { FORBIDDEN_TEXT, LOAD_FAILED_TEXT, LOADING_TEXT, RETRY_LABEL } from './admin-texts';
import {
  ANALYTICS_ACCOUNTS,
  ANALYTICS_ACTION_TAKEN,
  ANALYTICS_BY_REASON,
  ANALYTICS_COMMENTS,
  ANALYTICS_DISMISSED,
  ANALYTICS_EMPTY,
  ANALYTICS_ENFORCEMENTS,
  ANALYTICS_FEED,
  ANALYTICS_FRIEND_REQUESTS,
  ANALYTICS_FRIENDS,
  ANALYTICS_FRIENDS_ACCEPTED,
  ANALYTICS_GROUPS,
  ANALYTICS_GROUPS_COMMENTS,
  ANALYTICS_GROUPS_CREATED,
  ANALYTICS_GROUPS_JOINS,
  ANALYTICS_GROUPS_MEMBERS,
  ANALYTICS_GROUPS_NOTE,
  ANALYTICS_GROUPS_POSTS,
  ANALYTICS_GROUPS_PRIVATE,
  ANALYTICS_GROUPS_PUBLIC,
  ANALYTICS_MARKET,
  ANALYTICS_MARKET_ACTIVE,
  ANALYTICS_MARKET_BY_CATEGORY,
  ANALYTICS_MARKET_CHATS,
  ANALYTICS_MARKET_CREATED,
  ANALYTICS_MARKET_SOLD,
  ANALYTICS_MARKET_SOLD_CHART,
  ANALYTICS_PROS,
  ANALYTICS_PROS_ACTIVE,
  ANALYTICS_PROS_BY_FIELD,
  ANALYTICS_PROS_CHATS,
  ANALYTICS_PROS_FOLLOWS,
  ANALYTICS_PROS_REVIEWS,
  ANALYTICS_LIKES,
  ANALYTICS_MEDIAN,
  ANALYTICS_MODERATION,
  ANALYTICS_NONE,
  ANALYTICS_NOTE,
  ANALYTICS_OPEN,
  ANALYTICS_PER_AUTHOR,
  ANALYTICS_PERIOD,
  ANALYTICS_PERIODS,
  ANALYTICS_POSTS,
  ANALYTICS_REGISTRATIONS,
  ANALYTICS_REPORTS,
  ANALYTICS_STATUSES,
  ANALYTICS_SUPPORT,
  ANALYTICS_SUPPORT_ANSWERED,
  ANALYTICS_SUPPORT_BY_TOPIC,
  ANALYTICS_SUPPORT_MEDIAN,
  ANALYTICS_SUPPORT_REQUESTS,
  ANALYTICS_SUPPORT_STATUSES,
  ANALYTICS_TYPES,
  ANALYTICS_WAITING,
  ANALYTICS_WAITING_HEADING,
  ANALYTICS_USAGE,
  ANALYTICS_USAGE_LOGINS,
  ANALYTICS_USAGE_PROFILE_VIEWS,
  ANALYTICS_USAGE_POST_VIEWS,
  ANALYTICS_USAGE_NOTE,
  ANALYTICS_PROMOTIONS,
  ANALYTICS_PROMOTIONS_PROFILE,
  ANALYTICS_PROMOTIONS_POST,
  ANALYTICS_PROMOTIONS_LISTING,
  ANALYTICS_PROMOTIONS_REVENUE,
  ANALYTICS_PROMOTIONS_PURCHASES,
  ANALYTICS_PROMOTIONS_IMPRESSIONS,
  ANALYTICS_PROMOTIONS_CLICKS,
  ANALYTICS_BY_TYPE,
  ANALYTICS_GROUP_LABELS,
  ANALYTICS_OF_ACCOUNTS,
  ANALYTICS_SUMMARY,
  ANALYTICS_SUMMARY_ITEMS,
  ANALYTICS_WEEK_HINT,
} from './team-texts';

type View = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; data: AnalyticsView };

const isPeriod = (value: number): value is AnalyticsPeriod => PERIODS.some((period) => period === value);
/** The last 7 days against the 7 before them. The series run day by day up to today, so this needs a period of 14 days or more. */
function lastWeek(points: Series): { current: number; previous: number } | null {
  if (points.length < 14) return null;
  return { current: total(points.slice(-7)), previous: total(points.slice(-14, -7)) };
}

/** A section's numbers as tiles: 2 a row on a phone, 4 from md. */
function Stats({ items }: { items: ReadonlyArray<{ label: string; value: number | null }> }) {
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map(({ label, value }) => (
        <KpiCard key={label} label={label} value={value === null ? ANALYTICS_NONE : number.format(value)} />
      ))}
    </dl>
  );
}

/** The cards of a section: one column on a phone, two from lg; the cards of a row share its height. */
function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 lg:grid-cols-2">{children}</div>;
}

/** A split (by reason, by topic, by field…) as ranked rows: the label, the number, and a plum bar against the largest row. */
function Breakdown({ title, rows }: { title: string; rows: ReadonlyArray<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  return (
    <Card>
      <h4 className="text-label">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-small text-muted-foreground">{ANALYTICS_EMPTY}</p>
      ) : (
        <dl className="flex flex-col gap-3">
          {sorted.map((row) => (
            <div key={row.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
              <dt className="min-w-0 flex-1 text-small">{row.label}</dt>
              <dd className="text-label tabular-nums">{number.format(row.value)}</dd>
              <dd aria-hidden="true" className="h-1.5 basis-full overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${row.value === 0 ? 0 : Math.max(2, (row.value / max) * 100)}%` }} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 id={id} className="text-h3">
          {title}
        </h3>
        {note === undefined ? null : <p className="text-small text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** Related sections under one quiet label (the sections keep their own headings). */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-8 border-t border-divider pt-6">
      <p className="text-label text-primary-strong">{label}</p>
      {children}
    </div>
  );
}

// The Admin Analytics (FR-ADMIN-010, FR-ADMIN-003, PG-026, AC-071): ANALYTICS_VIEW (the Admin always). Numbers only, computed from the product's own
// tables (open item 7, default (a)); no name, id or text ever comes back (BR-058). Usage comes from the usage events (OP-039); Promotions (AC-071) is the Admin's only.
// Groups, Professionals and Marketplace are counted from their tables too (SRS audit 21.10.2026).
// A dashboard (Afik 28.10.2026): a summary row first (the period's totals, the last week against the one before), then the sections in three
// groups — community and content, safety and support, Professionals and the shop — each chart in an outlined card, bars in plum.
export function AnalyticsScreen() {
  const call = useAdminCall();
  const [days, setDays] = useState<AnalyticsPeriod>(30);
  const [view, setView] = useState<View>({ kind: 'loading' });

  const load = useCallback(
    async (period: AnalyticsPeriod) => {
      setView({ kind: 'loading' });
      const outcome = await call((token) => fetchAnalytics(token, period));
      setView(outcome.kind === 'ok' ? { kind: 'loaded', data: outcome.value } : { kind: 'failed', message: outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT });
    },
    [call],
  );

  useEffect(() => {
    void load(days);
  }, [load, days]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <p className="max-w-prose text-small text-muted-foreground">{ANALYTICS_NOTE}</p>
        <div className="w-full max-w-60 shrink-0">
          <FormField label={ANALYTICS_PERIOD} htmlFor="analytics-period">
            {(control) => (
              <SelectInput
                {...control}
                options={PERIODS.map((period) => ({ value: String(period), label: ANALYTICS_PERIODS[period] }))}
                value={String(days)}
                placeholder="—"
                onChange={(value) => {
                  const next = Number(value);
                  if (isPeriod(next)) setDays(next);
                }}
              />
            )}
          </FormField>
        </div>
      </div>
      {view.kind === 'loading' ? (
        <div role="status" aria-label={LOADING_TEXT} className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : view.kind === 'failed' ? (
        <div className="flex flex-col items-start gap-3">
          <InlineAlert>{view.message}</InlineAlert>
          <Button variant="soft" onClick={() => void load(days)}>
            {RETRY_LABEL}
          </Button>
        </div>
      ) : (
        <Loaded data={view.data} />
      )}
    </div>
  );
}

function Summary({ data }: { data: AnalyticsView }) {
  const { accounts, content, moderation, support } = data;
  const registrations = accounts.registrations.map((row) => ({ day: row.day, count: row.regular + row.professional }));
  const allAccounts = accounts.byType.regular + accounts.byType.professional + accounts.byType.moderator + accounts.byType.admin;
  const items: ReadonlyArray<{ label: string; series: Series; upIsGood: boolean }> = [
    { label: ANALYTICS_SUMMARY_ITEMS.registrations, series: registrations, upIsGood: true },
    { label: ANALYTICS_SUMMARY_ITEMS.posts, series: content.posts, upIsGood: true },
    { label: ANALYTICS_SUMMARY_ITEMS.comments, series: content.comments, upIsGood: true },
    { label: ANALYTICS_SUMMARY_ITEMS.reports, series: moderation.reports, upIsGood: false },
    { label: ANALYTICS_SUMMARY_ITEMS.support, series: support.requests, upIsGood: false },
  ];
  return (
    <section aria-labelledby="analytics-summary" className="flex flex-col gap-4">
      <h3 id="analytics-summary" className="text-h3">
        {ANALYTICS_SUMMARY}
      </h3>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard
          size="lg"
          label={ANALYTICS_SUMMARY_ITEMS.active}
          value={number.format(accounts.byStatus.active)}
          footer={<span className="text-caption text-muted-foreground tabular-nums">{ANALYTICS_OF_ACCOUNTS(number.format(allAccounts))}</span>}
        />
        {items.map(({ label, series, upIsGood }) => {
          const week = lastWeek(series);
          return (
            <KpiCard
              key={label}
              size="lg"
              label={label}
              value={number.format(total(series))}
              {...(week === null
                ? {}
                : {
                    footer: (
                      <>
                        <DeltaChip current={week.current} previous={week.previous} upIsGood={upIsGood} />
                        <span className="text-caption text-muted-foreground">{ANALYTICS_WEEK_HINT}</span>
                      </>
                    ),
                  })}
            />
          );
        })}
      </dl>
    </section>
  );
}

function Loaded({ data }: { data: AnalyticsView }) {
  const { accounts, content, friendships, moderation, usage } = data;
  return (
    <div className="flex flex-col gap-8">
      <Summary data={data} />
      <Group label={ANALYTICS_GROUP_LABELS.community}>
        <Section id="analytics-accounts" title={ANALYTICS_ACCOUNTS}>
          <Stats
            items={[
              { label: ANALYTICS_STATUSES.active, value: accounts.byStatus.active },
              { label: ANALYTICS_STATUSES.suspended, value: accounts.byStatus.suspended },
              { label: ANALYTICS_STATUSES.banned, value: accounts.byStatus.banned },
              { label: ANALYTICS_STATUSES.deletionScheduled, value: accounts.byStatus.deletionScheduled },
            ]}
          />
          <CardGrid>
            <Chart title={ANALYTICS_REGISTRATIONS} points={accounts.registrations.map((row) => ({ day: row.day, count: row.regular + row.professional }))} />
            <Breakdown
              title={ANALYTICS_BY_TYPE}
              rows={[
                { label: ANALYTICS_TYPES.regular, value: accounts.byType.regular },
                { label: ANALYTICS_TYPES.professional, value: accounts.byType.professional },
                { label: ANALYTICS_TYPES.moderator, value: accounts.byType.moderator },
                { label: ANALYTICS_TYPES.admin, value: accounts.byType.admin },
              ]}
            />
          </CardGrid>
        </Section>
        {/* OP-039: usage by day, never an account or what was viewed */}
        <Section id="analytics-usage" title={ANALYTICS_USAGE} note={ANALYTICS_USAGE_NOTE}>
          <CardGrid>
            <Chart title={ANALYTICS_USAGE_LOGINS} points={usage.dailyLogins} />
            <Chart title={ANALYTICS_USAGE_PROFILE_VIEWS} points={usage.profileViews} />
            <Chart title={ANALYTICS_USAGE_POST_VIEWS} points={usage.postViews} />
          </CardGrid>
        </Section>
        <Section id="analytics-feed" title={ANALYTICS_FEED}>
          <CardGrid>
            <Chart title={ANALYTICS_POSTS} points={content.posts} />
            <Chart title={ANALYTICS_COMMENTS} points={content.comments} />
            <Chart title={ANALYTICS_LIKES} points={content.likes} />
            <Breakdown title={ANALYTICS_PER_AUTHOR} rows={content.postsPerAuthor.map((row) => ({ label: row.bucket, value: row.accounts }))} />
          </CardGrid>
        </Section>
        <Section id="analytics-friends" title={ANALYTICS_FRIENDS}>
          <Stats
            items={[
              { label: ANALYTICS_FRIEND_REQUESTS, value: friendships.requested },
              { label: ANALYTICS_FRIENDS_ACCEPTED, value: friendships.accepted },
            ]}
          />
        </Section>
        <GroupsSection data={data} />
      </Group>
      <Group label={ANALYTICS_GROUP_LABELS.safety}>
        <Section id="analytics-moderation" title={ANALYTICS_MODERATION}>
          <Stats
            items={[
              { label: ANALYTICS_OPEN, value: moderation.open },
              { label: ANALYTICS_ACTION_TAKEN, value: moderation.actionTaken },
              { label: ANALYTICS_DISMISSED, value: moderation.dismissed },
              { label: ANALYTICS_MEDIAN, value: moderation.medianHoursToClose },
              { label: ANALYTICS_ENFORCEMENTS.warning, value: moderation.enforcements.warning },
              { label: ANALYTICS_ENFORCEMENTS.suspension, value: moderation.enforcements.suspension },
              { label: ANALYTICS_ENFORCEMENTS.ban, value: moderation.enforcements.ban },
            ]}
          />
          <CardGrid>
            <Chart title={ANALYTICS_REPORTS} points={moderation.reports} />
            <Breakdown title={ANALYTICS_BY_REASON} rows={moderation.byReason.map((row) => ({ label: row.label, value: row.count }))} />
          </CardGrid>
        </Section>
        <Section id="analytics-support" title={ANALYTICS_SUPPORT}>
          <Stats
            items={[
              { label: ANALYTICS_SUPPORT_STATUSES.open, value: data.support.byStatus.open },
              { label: ANALYTICS_SUPPORT_STATUSES.inProgress, value: data.support.byStatus.inProgress },
              { label: ANALYTICS_SUPPORT_STATUSES.closed, value: data.support.byStatus.closed },
              { label: ANALYTICS_SUPPORT_ANSWERED, value: data.support.answered },
              { label: ANALYTICS_SUPPORT_MEDIAN, value: data.support.medianHoursToFirstReply },
            ]}
          />
          <CardGrid>
            <Chart title={ANALYTICS_SUPPORT_REQUESTS} points={data.support.requests} />
            <Breakdown title={ANALYTICS_SUPPORT_BY_TOPIC} rows={data.support.byTopic.map((row) => ({ label: TOPIC_LABELS[row.topic], value: row.count }))} />
          </CardGrid>
        </Section>
      </Group>
      <Group label={ANALYTICS_GROUP_LABELS.business}>
        <Areas data={data} />
        <PromotionsSection data={data} />
      </Group>
      <section aria-labelledby="analytics-waiting" className="flex flex-col gap-2 border-t border-divider pt-6">
        <h3 id="analytics-waiting" className="text-h3">
          {ANALYTICS_WAITING_HEADING}
        </h3>
        <p className="text-small text-muted-foreground">{ANALYTICS_WAITING}</p>
      </section>
    </div>
  );
}

function GroupsSection({ data }: { data: AnalyticsView }) {
  const { groups } = data;
  return (
    <Section id="analytics-groups" title={ANALYTICS_GROUPS} note={ANALYTICS_GROUPS_NOTE}>
      <Stats
        items={[
          { label: ANALYTICS_GROUPS_PUBLIC, value: groups.active.public },
          { label: ANALYTICS_GROUPS_PRIVATE, value: groups.active.private },
          { label: ANALYTICS_GROUPS_CREATED, value: groups.created },
          { label: ANALYTICS_GROUPS_MEMBERS, value: groups.publicMembers },
          { label: ANALYTICS_GROUPS_JOINS, value: groups.publicJoins },
          { label: ANALYTICS_GROUPS_POSTS, value: groups.publicPosts },
          { label: ANALYTICS_GROUPS_COMMENTS, value: groups.publicComments },
        ]}
      />
    </Section>
  );
}

function Areas({ data }: { data: AnalyticsView }) {
  const { professionals, marketplace } = data;
  return (
    <>
      <Section id="analytics-pros" title={ANALYTICS_PROS}>
        <Stats
          items={[
            { label: ANALYTICS_PROS_ACTIVE, value: professionals.active },
            { label: ANALYTICS_PROS_FOLLOWS, value: professionals.follows },
            { label: ANALYTICS_PROS_CHATS, value: professionals.chatStarts },
            { label: ANALYTICS_PROS_REVIEWS, value: professionals.reviews },
          ]}
        />
        <CardGrid>
          <Breakdown title={ANALYTICS_PROS_BY_FIELD} rows={professionals.byField.map((row) => ({ label: PROFESSIONAL_FIELD_LABELS[row.field], value: row.count }))} />
        </CardGrid>
      </Section>
      <Section id="analytics-market" title={ANALYTICS_MARKET}>
        <Stats
          items={[
            { label: ANALYTICS_MARKET_ACTIVE, value: marketplace.active },
            { label: ANALYTICS_MARKET_CREATED, value: marketplace.created },
            { label: ANALYTICS_MARKET_SOLD, value: marketplace.sold },
            { label: ANALYTICS_MARKET_CHATS, value: marketplace.chats },
          ]}
        />
        <CardGrid>
          {/* I12-B (Afik §10.6, AC-206): the listings marked sold/given, day by day (a sold listing is kept, BR-091) */}
          <Chart title={ANALYTICS_MARKET_SOLD_CHART} points={marketplace.soldByDay} />
          <Breakdown title={ANALYTICS_MARKET_BY_CATEGORY} rows={marketplace.byCategory.map((row) => ({ label: LISTING_CATEGORY_LABELS[row.category], value: row.count }))} />
        </CardGrid>
      </Section>
    </>
  );
}

/** AC-071 Promotions (I13), for the Admin only: numbers by day, never an account, a promotion or a target. */
function PromotionsSection({ data }: { data: AnalyticsView }) {
  const { promotions } = data;
  if (promotions === undefined) return null;
  return (
    <Section id="analytics-promotions" title={ANALYTICS_PROMOTIONS}>
      <Stats
        items={[
          { label: ANALYTICS_PROMOTIONS_PROFILE, value: promotions.running.profile },
          { label: ANALYTICS_PROMOTIONS_POST, value: promotions.running.post },
          { label: ANALYTICS_PROMOTIONS_LISTING, value: promotions.running.listing },
          { label: ANALYTICS_PROMOTIONS_REVENUE, value: promotions.sampleRevenueIls },
        ]}
      />
      <CardGrid>
        <Chart title={ANALYTICS_PROMOTIONS_PURCHASES} points={promotions.purchases} />
        <Chart title={ANALYTICS_PROMOTIONS_IMPRESSIONS} points={promotions.impressions} />
        <Chart title={ANALYTICS_PROMOTIONS_CLICKS} points={promotions.clicks} />
      </CardGrid>
    </Section>
  );
}
