// The analytics screen's usage and promotions numbers (FR-ADMIN-010, AC-071, OP-039; BR-058). Runs in the analytics transaction after
// nameAnalytics(): the usage events open to ANALYTICS_VIEW there (usage_events_select_analytics: kind, day and count, never the account); the
// promotions, their paid events and the simulated payments to BILLING_FINANCE_MANAGE (the Admin) only, through the finance policies. Numbers by
// day only: no account, no promotion id, no target and no text leaves this file.

import { PROMOTION_TARGET_KINDS, type AnalyticsPeriod, type AnalyticsView } from '@nestly/shared';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

const count = z.coerce.number().int();
const dayCounts = z.array(z.object({ day: z.string(), count }));

/** The period's Israel days, each with the count `inner` gives it (`inner` selects `d` date and `n`). */
function series(days: AnalyticsPeriod, inner: SQL): SQL {
  return sql`
    select to_char(g.day, 'YYYY-MM-DD') as day, coalesce(c.n, 0) as count
    from generate_series(((now() at time zone 'Asia/Jerusalem')::date - ${days - 1}::int)::timestamp, (now() at time zone 'Asia/Jerusalem')::date::timestamp,
                         interval '1 day') as g(day)
    left join (${inner}) c on c.d = g.day::date
    order by g.day`;
}

/** BILLING_FINANCE_MANAGE (Admin Only, §3.2): whether the caller is the one the finance policies show the promotions to. */
export async function holdsFinance(tx: IdentityTx): Promise<boolean> {
  const rows = z.array(z.object({ ok: z.boolean().nullable() })).parse(await tx.execute(sql`select nestly.has_permission('BILLING_FINANCE_MANAGE') as ok`));
  return rows[0]?.ok === true;
}

/** OP-039 usage: accounts that came in each day (one daily login per account and day), and profile and post views by day. */
export async function readUsageAnalytics(tx: IdentityTx, days: AnalyticsPeriod): Promise<AnalyticsView['usage']> {
  const usage = (kind: string, measure: SQL) =>
    series(days, sql`select occurred_on as d, ${measure} as n from nestly.usage_events where kind = ${kind} group by occurred_on`);
  return {
    dailyLogins: dayCounts.parse(await tx.execute(usage('daily_login', sql`count(*)`))),
    profileViews: dayCounts.parse(await tx.execute(usage('profile_view', sql`sum(times)`))),
    postViews: dayCounts.parse(await tx.execute(usage('post_view', sql`sum(times)`))),
  };
}

/** AC-071 Promotions (the Admin's): running promotions by kind, and the period's simulated purchases, impressions and clicks by day. */
export async function readPromotionAnalytics(tx: IdentityTx, days: AnalyticsPeriod): Promise<NonNullable<AnalyticsView['promotions']>> {
  const running = z
    .array(z.object({ kind: z.enum(PROMOTION_TARGET_KINDS), n: count }))
    .parse(
      await tx.execute(sql`
        select target_kind as kind, count(*) as n from nestly.promotions
        where status = 'active' and starts_at <= now() and ends_at > now() group by target_kind`),
    );
  const runningOf = (kind: (typeof PROMOTION_TARGET_KINDS)[number]) => running.find((row) => row.kind === kind)?.n ?? 0;
  const events = (kind: string) =>
    series(days, sql`select occurred_on as d, sum(times) as n from nestly.promotion_events where kind = ${kind} group by occurred_on`);
  const since = sql`(date_trunc('day', now() at time zone 'Asia/Jerusalem') - make_interval(days => ${days - 1}::int)) at time zone 'Asia/Jerusalem'`;
  const [revenue] = z
    .array(z.object({ n: count }))
    .parse(await tx.execute(sql`select coalesce(sum(amount_ils), 0) as n from nestly.promotion_payments where created_at >= ${since}`));
  return {
    running: { profile: runningOf('profile'), post: runningOf('post'), listing: runningOf('listing') },
    purchases: dayCounts.parse(
      await tx.execute(series(days, sql`select (created_at at time zone 'Asia/Jerusalem')::date as d, count(*) as n from nestly.promotion_payments group by 1`)),
    ),
    impressions: dayCounts.parse(await tx.execute(events('impression'))),
    clicks: dayCounts.parse(await tx.execute(events('click'))),
    sampleRevenueIls: revenue?.n ?? 0,
  };
}
