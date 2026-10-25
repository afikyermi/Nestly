import { useCallback, useEffect, useState } from 'react';
import { ANALYTICS_PERIODS as PERIODS, LISTING_CATEGORY_LABELS, PROFESSIONAL_FIELD_LABELS, type AnalyticsPeriod, type AnalyticsView } from '@nestly/shared';
import { BarChart } from '@/components/shared/bar-chart';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/select-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminCall } from '@/hooks/use-admin-call';
import { TOPIC_LABELS } from '@/lib/chat-texts';
import { fetchAnalytics } from '@/services/api/team';
import { FORBIDDEN_TEXT, LOAD_FAILED_TEXT, LOADING_TEXT, RETRY_LABEL } from './admin-texts';
import {
  ANALYTICS_ACCOUNTS,
  ANALYTICS_ACTION_TAKEN,
  ANALYTICS_BY_REASON,
  ANALYTICS_COMMENTS,
  ANALYTICS_COUNT,
  ANALYTICS_DAY,
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
  ANALYTICS_TABLE,
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
} from './team-texts';

type View = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; data: AnalyticsView };

const number = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 });
/** "2026-10-21" as "21.10". */
const shortDay = (day: string): string => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
const isPeriod = (value: number): value is AnalyticsPeriod => PERIODS.some((period) => period === value);

function Stats({ items }: { items: ReadonlyArray<{ label: string; value: number | null }> }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(({ label, value }) => (
        <div key={label} className="rounded-lg bg-muted p-3">
          <dt className="text-small text-muted-foreground">{label}</dt>
          <dd className="text-h3">{value === null ? ANALYTICS_NONE : number.format(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Chart({ title, points }: { title: string; points: ReadonlyArray<{ day: string; count: number }> }) {
  return (
    <BarChart
      title={title}
      points={points.map((point) => ({ label: shortDay(point.day), value: point.count }))}
      unit=""
      emptyText={`${title}: ${ANALYTICS_EMPTY}`}
      tableLabel={`${title} · ${ANALYTICS_TABLE}`}
      valueHeader={ANALYTICS_COUNT}
      dayHeader={ANALYTICS_DAY}
    />
  );
}

// The Admin Analytics (FR-ADMIN-010, FR-ADMIN-003, PG-026, AC-071): ANALYTICS_VIEW (the Admin always). Numbers only, computed from the product's own
// tables (open item 7, default (a)); no name, id or text ever comes back (BR-058). Usage comes from the usage events (OP-039); Promotions (AC-071) is the Admin's only.
// Groups, Professionals and Marketplace are counted from their tables too (SRS audit 21.10.2026).
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
      <p className="text-small text-muted-foreground">{ANALYTICS_NOTE}</p>
      <div className="max-w-60">
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
      {view.kind === 'loading' ? (
        <div role="status" aria-label={LOADING_TEXT} className="flex flex-col gap-3">
          <Skeleton />
          <Skeleton />
          <Skeleton />
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

function Loaded({ data }: { data: AnalyticsView }) {
  const { accounts, content, friendships, moderation } = data;
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="analytics-accounts" className="flex flex-col gap-4">
        <h3 id="analytics-accounts" className="text-h4">
          {ANALYTICS_ACCOUNTS}
        </h3>
        <Stats
          items={[
            { label: ANALYTICS_TYPES.regular, value: accounts.byType.regular },
            { label: ANALYTICS_TYPES.professional, value: accounts.byType.professional },
            { label: ANALYTICS_TYPES.moderator, value: accounts.byType.moderator },
            { label: ANALYTICS_TYPES.admin, value: accounts.byType.admin },
            { label: ANALYTICS_STATUSES.active, value: accounts.byStatus.active },
            { label: ANALYTICS_STATUSES.suspended, value: accounts.byStatus.suspended },
            { label: ANALYTICS_STATUSES.banned, value: accounts.byStatus.banned },
            { label: ANALYTICS_STATUSES.deletionScheduled, value: accounts.byStatus.deletionScheduled },
          ]}
        />
        <Chart title={ANALYTICS_REGISTRATIONS} points={accounts.registrations.map((row) => ({ day: row.day, count: row.regular + row.professional }))} />
      </section>
      <section aria-labelledby="analytics-feed" className="flex flex-col gap-4">
        <h3 id="analytics-feed" className="text-h4">
          {ANALYTICS_FEED}
        </h3>
        <Chart title={ANALYTICS_POSTS} points={content.posts} />
        <Chart title={ANALYTICS_COMMENTS} points={content.comments} />
        <Chart title={ANALYTICS_LIKES} points={content.likes} />
        <h4 className="text-label">{ANALYTICS_PER_AUTHOR}</h4>
        <Stats items={content.postsPerAuthor.map((row) => ({ label: row.bucket, value: row.accounts }))} />
      </section>
      <section aria-labelledby="analytics-friends" className="flex flex-col gap-4">
        <h3 id="analytics-friends" className="text-h4">
          {ANALYTICS_FRIENDS}
        </h3>
        <Stats
          items={[
            { label: ANALYTICS_FRIEND_REQUESTS, value: friendships.requested },
            { label: ANALYTICS_FRIENDS_ACCEPTED, value: friendships.accepted },
          ]}
        />
      </section>
      <section aria-labelledby="analytics-moderation" className="flex flex-col gap-4">
        <h3 id="analytics-moderation" className="text-h4">
          {ANALYTICS_MODERATION}
        </h3>
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
        <Chart title={ANALYTICS_REPORTS} points={moderation.reports} />
        <h4 className="text-label">{ANALYTICS_BY_REASON}</h4>
        {moderation.byReason.length === 0 ? (
          <p className="text-muted-foreground">{ANALYTICS_EMPTY}</p>
        ) : (
          <Stats items={moderation.byReason.map((row) => ({ label: row.label, value: row.count }))} />
        )}
      </section>
      <section aria-labelledby="analytics-support" className="flex flex-col gap-4">
        <h3 id="analytics-support" className="text-h4">
          {ANALYTICS_SUPPORT}
        </h3>
        <Stats
          items={[
            { label: ANALYTICS_SUPPORT_STATUSES.open, value: data.support.byStatus.open },
            { label: ANALYTICS_SUPPORT_STATUSES.inProgress, value: data.support.byStatus.inProgress },
            { label: ANALYTICS_SUPPORT_STATUSES.closed, value: data.support.byStatus.closed },
            { label: ANALYTICS_SUPPORT_ANSWERED, value: data.support.answered },
            { label: ANALYTICS_SUPPORT_MEDIAN, value: data.support.medianHoursToFirstReply },
          ]}
        />
        <Chart title={ANALYTICS_SUPPORT_REQUESTS} points={data.support.requests} />
        <h4 className="text-label">{ANALYTICS_SUPPORT_BY_TOPIC}</h4>
        {data.support.byTopic.length === 0 ? (
          <p className="text-muted-foreground">{ANALYTICS_EMPTY}</p>
        ) : (
          <Stats items={data.support.byTopic.map((row) => ({ label: TOPIC_LABELS[row.topic], value: row.count }))} />
        )}
      </section>
      <Areas data={data} />
      <UsageAndPromotions data={data} />
      <section aria-labelledby="analytics-waiting" className="flex flex-col gap-2">
        <h3 id="analytics-waiting" className="text-h4">
          {ANALYTICS_WAITING_HEADING}
        </h3>
        <p className="text-muted-foreground">{ANALYTICS_WAITING}</p>
      </section>
    </div>
  );
}

function Areas({ data }: { data: AnalyticsView }) {
  const { groups, professionals, marketplace } = data;
  return (
    <>
      <section aria-labelledby="analytics-groups" className="flex flex-col gap-4">
        <h3 id="analytics-groups" className="text-h4">
          {ANALYTICS_GROUPS}
        </h3>
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
        <p className="text-small text-muted-foreground">{ANALYTICS_GROUPS_NOTE}</p>
      </section>
      <section aria-labelledby="analytics-pros" className="flex flex-col gap-4">
        <h3 id="analytics-pros" className="text-h4">
          {ANALYTICS_PROS}
        </h3>
        <Stats
          items={[
            { label: ANALYTICS_PROS_ACTIVE, value: professionals.active },
            { label: ANALYTICS_PROS_FOLLOWS, value: professionals.follows },
            { label: ANALYTICS_PROS_CHATS, value: professionals.chatStarts },
            { label: ANALYTICS_PROS_REVIEWS, value: professionals.reviews },
          ]}
        />
        <h4 className="text-label">{ANALYTICS_PROS_BY_FIELD}</h4>
        {professionals.byField.length === 0 ? (
          <p className="text-muted-foreground">{ANALYTICS_EMPTY}</p>
        ) : (
          <Stats items={professionals.byField.map((row) => ({ label: PROFESSIONAL_FIELD_LABELS[row.field], value: row.count }))} />
        )}
      </section>
      <section aria-labelledby="analytics-market" className="flex flex-col gap-4">
        <h3 id="analytics-market" className="text-h4">
          {ANALYTICS_MARKET}
        </h3>
        <Stats
          items={[
            { label: ANALYTICS_MARKET_ACTIVE, value: marketplace.active },
            { label: ANALYTICS_MARKET_CREATED, value: marketplace.created },
            { label: ANALYTICS_MARKET_SOLD, value: marketplace.sold },
            { label: ANALYTICS_MARKET_CHATS, value: marketplace.chats },
          ]}
        />
        <h4 className="text-label">{ANALYTICS_MARKET_BY_CATEGORY}</h4>
        {marketplace.byCategory.length === 0 ? (
          <p className="text-muted-foreground">{ANALYTICS_EMPTY}</p>
        ) : (
          <Stats items={marketplace.byCategory.map((row) => ({ label: LISTING_CATEGORY_LABELS[row.category], value: row.count }))} />
        )}
      </section>
    </>
  );
}

/** OP-039 usage and, for the Admin only, AC-071 Promotions (I13): numbers by day, never an account, a promotion or a target. */
function UsageAndPromotions({ data }: { data: AnalyticsView }) {
  const { usage, promotions } = data;
  return (
    <>
      <section aria-labelledby="analytics-usage" className="flex flex-col gap-4">
        <h3 id="analytics-usage" className="text-h4">
          {ANALYTICS_USAGE}
        </h3>
        <Chart title={ANALYTICS_USAGE_LOGINS} points={usage.dailyLogins} />
        <Chart title={ANALYTICS_USAGE_PROFILE_VIEWS} points={usage.profileViews} />
        <Chart title={ANALYTICS_USAGE_POST_VIEWS} points={usage.postViews} />
        <p className="text-small text-muted-foreground">{ANALYTICS_USAGE_NOTE}</p>
      </section>
      {promotions === undefined ? null : (
        <section aria-labelledby="analytics-promotions" className="flex flex-col gap-4">
          <h3 id="analytics-promotions" className="text-h4">
            {ANALYTICS_PROMOTIONS}
          </h3>
          <Stats
            items={[
              { label: ANALYTICS_PROMOTIONS_PROFILE, value: promotions.running.profile },
              { label: ANALYTICS_PROMOTIONS_POST, value: promotions.running.post },
              { label: ANALYTICS_PROMOTIONS_LISTING, value: promotions.running.listing },
              { label: ANALYTICS_PROMOTIONS_REVENUE, value: promotions.sampleRevenueIls },
            ]}
          />
          <Chart title={ANALYTICS_PROMOTIONS_PURCHASES} points={promotions.purchases} />
          <Chart title={ANALYTICS_PROMOTIONS_IMPRESSIONS} points={promotions.impressions} />
          <Chart title={ANALYTICS_PROMOTIONS_CLICKS} points={promotions.clicks} />
        </section>
      )}
    </>
  );
}
