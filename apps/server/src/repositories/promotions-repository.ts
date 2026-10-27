// Monetization (I13): the Drizzle queries of promotions, simulated payments, paid events, usage events and the Professional's view counts. Every
// query runs inside the caller's identity transaction; the policies decide which rows it reaches (the owner's own, a running promotion of
// another while its target is eligible, BILLING_FINANCE_MANAGE for the Admin). No query names a viewer: viewer_id and the events' row ids are not
// readable (BR-057, AC-072), so every count here is of rows, never of people by name.

import {
  PROMOTION_PLAN_KEYS,
  PROMOTION_TARGET_KINDS,
  type AdminPromotions,
  type BillingItem,
  type PromotablePost,
  type PromotionItem,
  type PromotionPlan,
  type PromotionPlanKey,
  type PromotionTargetKind,
  type UsageEventKind,
} from '@nestly/shared';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);
const iso = (column: string) => sql.raw(`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
const count = z.coerce.number().int().nonnegative();
const planKey = z.enum(PROMOTION_PLAN_KEYS);
const targetKind = z.enum(PROMOTION_TARGET_KINDS);
/** The day in Israel time, as the database writes every event's day. */
const today = sql`(now() at time zone 'Asia/Jerusalem')::date`;
const EXCERPT = 80;
const OWN_LIMIT = 50;

// ---- plans, payment, purchase ----------------------------------------------------------------------------------------------------------------

const planRow = z.object({ key: planKey, targetKind, days: z.number().int(), samplePriceIls: z.number().int() });

/** The active sample plans of the given kinds, in their order (OP-030). */
export async function readPlans(tx: IdentityTx, kinds: readonly PromotionTargetKind[]): Promise<PromotionPlan[]> {
  if (kinds.length === 0) return [];
  return z.array(planRow).parse(
    await tx.execute(sql`
      select key, target_kind as "targetKind", days, sample_price_ils as "samplePriceIls"
      from nestly.promotion_plans where is_active and target_kind = any (${sql.param([...kinds])}::text[])
      order by array_position(${sql.param([...PROMOTION_TARGET_KINDS])}::text[], target_kind), sort_order`),
  );
}

const paymentRow = z.object({ id: z.guid(), reference: z.guid(), amountIls: z.number().int() });

/** The simulated payment of a plan: the client names the plan only; the database copies its kind and sample price (NFR-SEC-007). */
export async function insertSimulatedPayment(tx: IdentityTx, plan: PromotionPlanKey): Promise<z.infer<typeof paymentRow>> {
  const [row] = z
    .array(paymentRow)
    .length(1)
    .parse(await tx.execute(sql`insert into nestly.promotion_payments (plan_key) values (${plan}) returning id, provider_ref as reference, amount_ils as "amountIls"`));
  if (row === undefined) throw new Error('the payment returned no row');
  return row;
}

export interface PromotionWrite {
  readonly targetKind: PromotionTargetKind;
  readonly planKey: PromotionPlanKey;
  readonly paymentId: string;
  readonly postId: string | null;
  readonly listingId: string | null;
}

/** The promotion bought with that payment (the period is the database's; 23505 when the target already runs one). */
export async function insertPromotion(tx: IdentityTx, write: PromotionWrite): Promise<string> {
  const [row] = z
    .array(z.object({ id: z.guid() }))
    .length(1)
    .parse(
      await tx.execute(sql`
        insert into nestly.promotions (target_kind, plan_key, payment_id, post_id, listing_id)
        values (${write.targetKind}, ${write.planKey}, ${write.paymentId}::uuid, ${write.postId}::uuid, ${write.listingId}::uuid) returning id`),
    );
  if (row === undefined) throw new Error('the promotion returned no row');
  return row.id;
}

/** The owner stops its running promotion; the number of rows (0: not the caller's, or not running). */
export async function stopPromotion(tx: IdentityTx, id: string): Promise<number> {
  const rows = await tx.execute(sql`
    update nestly.promotions set status = 'stopped'
    where id = ${id}::uuid and owner_id = (select auth.uid()) and status = 'active' and ends_at > now() returning id`);
  return rows.length;
}

// ---- the owner's own promotions, posts and payments -----------------------------------------------------------------------------------

const stateOf = sql`case when p.status = 'stopped' then 'stopped' when p.ends_at <= now() then 'ended' else 'running' end`;
const eventSum = (kind: string) => sql`(select coalesce(sum(e.times), 0) from nestly.promotion_events e where e.promotion_id = p.id and e.kind = ${kind})`;

const ownRow = z.object({
  id: z.guid(),
  targetKind,
  planKey,
  state: z.enum(['running', 'stopped', 'ended']),
  startsAt: z.string(),
  endsAt: z.string(),
  stoppedAt: z.string().nullable(),
  stoppedBy: z.enum(['owner', 'staff']).nullable(),
  postId: z.guid().nullable(),
  listingId: z.guid().nullable(),
  targetLabel: z.string().nullable(),
  impressions: count,
  clicks: count,
  follows: count,
  chatStarts: count,
});

/** The caller's promotions, newest first, with their paid counts (FR-SERV-010 Promotion Analytics; never who). */
export async function readOwnPromotions(tx: IdentityTx): Promise<PromotionItem[]> {
  const rows = z.array(ownRow).parse(
    // The page first, then one pass over each promotion's events for its four counts (25.10: four sub-selects per row took 1.4 s on
    // Production, each its own read of promotion_events under its policies).
    await tx.execute(sql`
      with page as (
        select p.id, p.target_kind, p.plan_key, p.status, p.starts_at, p.ends_at, p.stopped_at, p.stopped_by, p.post_id, p.listing_id, p.created_at
        from nestly.promotions p
        where p.owner_id = (select auth.uid())
        order by p.created_at desc, p.id
        limit ${OWN_LIMIT}
      )
      select p.id, p.target_kind as "targetKind", p.plan_key as "planKey", ${stateOf} as state, ${iso('p.starts_at')} as "startsAt",
             ${iso('p.ends_at')} as "endsAt", case when p.stopped_at is null then null else ${iso('p.stopped_at')} end as "stoppedAt",
             p.stopped_by as "stoppedBy", p.post_id as "postId", p.listing_id as "listingId",
             coalesce(left(po.body, ${EXCERPT}), l.title) as "targetLabel",
             ev.impressions, ev.clicks, ev.follows, ev."chatStarts"
      from page p
      left join nestly.posts po on po.id = p.post_id
      left join nestly.marketplace_listings l on l.id = p.listing_id
      cross join lateral (
        select coalesce(sum(e.times) filter (where e.kind = 'impression'), 0) as impressions,
               coalesce(sum(e.times) filter (where e.kind = 'click'), 0) as clicks,
               coalesce(sum(e.times) filter (where e.kind = 'follow'), 0) as follows,
               coalesce(sum(e.times) filter (where e.kind = 'chat_start'), 0) as "chatStarts"
        from nestly.promotion_events e where e.promotion_id = p.id) ev
      order by p.created_at desc, p.id`),
  );
  return rows.map(({ impressions, clicks, follows, chatStarts, ...rest }) => ({ ...rest, counts: { impressions, clicks, follows, chatStarts } }));
}

/** The caller's own posts that may be promoted: active, to everyone, not in a Group, not a share (the database checks it again). */
export async function readPromotablePosts(tx: IdentityTx): Promise<PromotablePost[]> {
  return z.array(z.object({ id: z.guid(), excerpt: z.string() })).parse(
    await tx.execute(sql`
      select p.id, left(p.body, ${EXCERPT}) as excerpt from nestly.posts p
      where p.author_id = (select auth.uid()) and p.status = 'active' and p.audience = 'everyone' and p.group_id is null and not p.is_share
        and p.body is not null
      order by p.created_at desc, p.id limit 20`),
  );
}

const billingRow = z.object({ id: z.guid(), planKey, targetKind, amountIls: z.number().int(), reference: z.guid(), at: z.string() });

/** PG-042: the caller's simulated payments, newest first. */
export async function readOwnPayments(tx: IdentityTx): Promise<BillingItem[]> {
  const rows = z.array(billingRow).parse(
    await tx.execute(sql`
      select id, plan_key as "planKey", target_kind as "targetKind", amount_ils as "amountIls", provider_ref as reference,
             to_char(created_at at time zone 'UTC', ${isoMs}) as at
      from nestly.promotion_payments where payer_id = (select auth.uid()) and is_simulated
      order by created_at desc, id limit ${OWN_LIMIT}`),
  );
  return rows.map((row) => ({ ...row, isSimulated: true as const }));
}

// ---- the Professional's own analytics (FR-PRO-002, BR-057, VAL-032) ---------------------------------------------------------------------

const analyticsRow = z.object({
  profileViews: count,
  profileViewers: count,
  postViews: count,
  postReach: count,
  impressions: count,
  clicks: count,
  profileVisits: count,
  follows: count,
  chatStarts: count,
  spent: count,
});

/** The caller's own counts over the last `days` Israel days: views of its profile and posts (organic) and its promotions' paid events, apart. */
export async function readOwnAnalyticsCounts(tx: IdentityTx, days: number): Promise<z.infer<typeof analyticsRow>> {
  const since = sql`${today} - ${days - 1}::int`;
  const view = (kind: string, what: 'sum' | 'rows') =>
    sql`(select ${what === 'sum' ? sql`coalesce(sum(v.times), 0)` : sql`count(*)`} from nestly.professional_views v
          where v.professional_id = (select auth.uid()) and v.kind = ${kind} and v.occurred_on >= ${since})`;
  const paid = (kind: string, onlyProfile = false) =>
    sql`(select coalesce(sum(e.times), 0) from nestly.promotion_events e join nestly.promotions p on p.id = e.promotion_id
          where p.owner_id = (select auth.uid()) and e.kind = ${kind} and e.occurred_on >= ${since} ${onlyProfile ? sql`and p.target_kind = 'profile'` : sql``})`;
  // One statement per number, in this order, so Server-Timing names the slow one (25.10: 0.9 s for the single statement on Production).
  const one = async (statement: SQL): Promise<number> =>
    z.array(z.object({ n: count })).length(1).parse(await tx.execute(sql`select ${statement} as n`))[0]?.n ?? 0;
  return analyticsRow.parse({
    profileViews: await one(view('profile_view', 'sum')),
    profileViewers: await one(view('profile_view', 'rows')),
    postViews: await one(view('post_view', 'sum')),
    postReach: await one(view('post_view', 'rows')),
    impressions: await one(paid('impression')),
    clicks: await one(paid('click')),
    profileVisits: await one(paid('click', true)),
    follows: await one(paid('follow')),
    chatStarts: await one(paid('chat_start')),
    spent: await one(sql`(select coalesce(sum(pp.amount_ils), 0) from nestly.promotion_payments pp
      where pp.payer_id = (select auth.uid()) and (pp.created_at at time zone 'Asia/Jerusalem')::date >= ${since})`),
  });
}

// ---- serving promoted units (FR-ALG-007) ----------------------------------------------------------------------------------------------------

const configRow = z.object({
  version: z.number().int(),
  dailyCap: z.number().int(),
  directoryUnitsPerPage: z.number().int(),
  feedGapMin: z.number().int(),
  feedGapMax: z.number().int(),
  feedLowPosts: z.number().int(),
  feedHighPosts: z.number().int(),
});
export type PromotionConfig = z.infer<typeof configRow>;
/** v1's values (the migration's), used only when no version is readable. */
export const DEFAULT_PROMOTION_CONFIG: PromotionConfig = { version: 1, dailyCap: 3, directoryUnitsPerPage: 1, feedGapMin: 4, feedGapMax: 7, feedLowPosts: 20, feedHighPosts: 200 };
const configColumns = sql`version, daily_cap as "dailyCap", directory_units_per_page as "directoryUnitsPerPage", feed_gap_min as "feedGapMin",
  feed_gap_max as "feedGapMax", feed_low_posts as "feedLowPosts", feed_high_posts as "feedHighPosts"`;

/** The newest promotion settings version (§11.2, FR-ALG-007, BR-059); v1's values when none is readable. */
export async function readPromotionConfig(tx: IdentityTx): Promise<PromotionConfig> {
  // the statement as the plan-cached invoker function nestly.read_promotion_config (migration 20261027400000)
  const [row] = z.array(configRow).parse(await tx.execute(sql`select * from nestly.read_promotion_config()`));
  return row ?? DEFAULT_PROMOTION_CONFIG;
}

const settingsRow = configRow.extend({ reason: z.string().nullable(), at: z.string().nullable() });
export type PromotionSettingsRow = z.infer<typeof settingsRow>;

/**
 * Every settings version, newest first (the Admin's settings screen). The numbers are every active account's; the reason and the time are
 * read from the version's Audit Log entry (the Admin or AUDIT_LOG_VIEW: audit_log_select_viewer), never from the settings row (20261023900000).
 * v1, written by the migration, has no entry: no reason and no time.
 */
export async function readPromotionSettingsHistory(tx: IdentityTx): Promise<PromotionSettingsRow[]> {
  return z.array(settingsRow).parse(
    await tx.execute(sql`
      select s.${configColumns}, a.reason, case when a.occurred_at is null then null else ${iso('a.occurred_at')} end as at
      from nestly.promotion_settings s
      left join lateral (select l.reason, l.occurred_at from nestly.audit_log l
                         where l.action = 'promotion_settings_changed' and l.after_state ->> 'version' = s.version::text
                         order by l.occurred_at desc limit 1) a on true
      order by s.version desc limit 20`),
  );
}

/** A new settings version (BILLING_FINANCE_MANAGE; the database numbers it and audits it with the previous values). */
export async function insertPromotionSettings(tx: IdentityTx, write: Omit<PromotionConfig, 'version'> & { reason: string }): Promise<number> {
  const [row] = z
    .array(z.object({ version: z.number().int() }))
    .length(1)
    .parse(
      await tx.execute(sql`
        insert into nestly.promotion_settings (daily_cap, directory_units_per_page, feed_gap_min, feed_gap_max, feed_low_posts, feed_high_posts, reason)
        values (${write.dailyCap}, ${write.directoryUnitsPerPage}, ${write.feedGapMin}, ${write.feedGapMax}, ${write.feedLowPosts}, ${write.feedHighPosts}, ${write.reason})
        returning version`),
    );
  if (row === undefined) throw new Error('the settings returned no row');
  return row.version;
}

/** §11.2: the feed's posts of the last 48 hours the caller can read (the volume the interleave gap follows). */
export async function readRecentPostCount(tx: IdentityTx): Promise<number> {
  const [row] = z
    .array(z.object({ n: count }))
    // the statement as the plan-cached invoker function nestly.read_recent_post_count (migration 20261027400000)
    .parse(await tx.execute(sql`select * from nestly.read_recent_post_count()`));
  return row?.n ?? 0;
}

/**
 * §11.1: staff stop a running promotion with a reason (the Audit entry's); the database checks the target's moderation key, the state and the
 * reason. The number of rows (0: not visible to the caller under its keys, or not running).
 */
export async function staffStopPromotion(tx: IdentityTx, id: string, reason: string): Promise<number> {
  await tx.execute(sql`select set_config('nestly.audit_reason', ${reason}, true)`);
  const rows = await tx.execute(sql`update nestly.promotions set status = 'stopped' where id = ${id}::uuid and status = 'active' and ends_at > now() returning id`);
  await tx.execute(sql`select set_config('nestly.audit_reason', '', true)`);
  return rows.length;
}

const candidateRow = z.object({ promotionId: z.guid(), targetId: z.guid() });
export type PromotedCandidate = z.infer<typeof candidateRow>;

/**
 * The running promotions of a kind another account may be shown, with their target (the profile's owner, the post, the listing). Eligibility
 * (FR-ALG-007 step 1, AC-063): the viewer policy shows only a running promotion of an owner with no user block whose target is still eligible;
 * the target's state is checked here again. Never the caller's own.
 */
export async function readPromotedCandidates(tx: IdentityTx, kind: PromotionTargetKind): Promise<PromotedCandidate[]> {
  // One plan-cached invoker function per kind (migration 20261027400000), each the statement of its kind: the target column, its
  // eligibility test, and `order by random()` with `limit 500` for a profile or a post (the Directory/feed
  // sample size for rotation, FR-ALG-007), none for a listing (uncapped, §11.3).
  const statement = {
    profile: sql`select * from nestly.read_promoted_profile_candidates()`,
    post: sql`select * from nestly.read_promoted_post_candidates()`,
    listing: sql`select * from nestly.read_promoted_listing_candidates()`,
  }[kind];
  return z.array(candidateRow).parse(await tx.execute(statement));
}

/**
 * §11.2 relevance: the posts among `ids` whose text matches one of the viewer's search topics (Stage targeting deferred by Afik, 23.10.2026)
 * (never a child's data, a tracker, a chat, Support or a private Group: BR-053, VAL-030). Topic matches first.
 */
export async function readMatchingPosts(tx: IdentityTx, ids: readonly string[], patterns: readonly string[]): Promise<Map<string, number>> {
  if (ids.length === 0 || patterns.length === 0) return new Map();
  const rows = z.array(z.object({ id: z.guid(), byTopic: z.boolean() })).parse(
    // the statement as the plan-cached invoker function nestly.read_matching_posts (migration 20261027400000)
    await tx.execute(sql`select * from nestly.read_matching_posts(${sql.param([...ids])}::uuid[], ${sql.param([...patterns])}::text[])`),
  );
  return new Map(rows.map((row) => [row.id, row.byTopic ? 2 : 1]));
}

/** The caller's own impressions today of each of these promotions (its own rows: the frequency cap). */
export async function readTodayImpressions(tx: IdentityTx, ids: readonly string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = z.array(z.object({ id: z.guid(), times: count })).parse(
    // the statement (the day: Israel's, as `today`) as the plan-cached invoker function nestly.read_today_impressions (migration 20261027400000)
    await tx.execute(sql`select * from nestly.read_today_impressions(${sql.param([...ids])}::uuid[])`),
  );
  return new Map(rows.map((row) => [row.id, row.times]));
}

/** One paid event of the caller (an impression served, a click); the database adds one to the day's row within its limits. */
export async function insertPromotionEvent(tx: IdentityTx, promotionId: string, kind: 'impression' | 'click'): Promise<void> {
  await tx.execute(sql`insert into nestly.promotion_events (promotion_id, kind) values (${promotionId}::uuid, ${kind})`);
}

/**
 * `times` usage events of the caller (OP-039: one per post shown); staff and inactive accounts are dropped by the database. One statement of
 * `times` rows: the guard sees the rows before it in the same statement, so the first makes (or adds one to) the day's row and each next adds one,
 * up to the day's limit.
 */
export async function insertUsageEvent(tx: IdentityTx, kind: UsageEventKind, times = 1): Promise<void> {
  if (times < 1) return;
  await tx.execute(sql`insert into nestly.usage_events (kind) select ${kind} from pg_catalog.generate_series(1, ${times})`);
}

/**
 * `times` views of a Professional's profile or posts by the caller (FR-PRO-002: a post view per post of theirs shown); its own, staff's and a
 * blocked pair's are dropped by the database. One statement, counted row by row by the guard as above (up to 100 a day).
 */
export async function insertProfessionalView(tx: IdentityTx, professionalId: string, kind: 'profile_view' | 'post_view', times = 1): Promise<void> {
  if (times < 1) return;
  await tx.execute(sql`insert into nestly.professional_views (professional_id, kind) select ${professionalId}::uuid, ${kind} from pg_catalog.generate_series(1, ${times})`);
}

/** One page view's exposure rows, as `insertExposureBatch` writes them. */
export interface ExposureBatch {
  readonly impressions: readonly string[];
  readonly usage?: { readonly kind: UsageEventKind; readonly times: number };
  readonly views: readonly { readonly professionalId: string; readonly kind: 'profile_view' | 'post_view'; readonly times: number }[];
}

/**
 * A page view's impressions, usage events and Professional views in ONE statement (one round trip), under the caller's own role and
 * policies. Each part inserts the same rows as insertPromotionEvent / insertUsageEvent / insertProfessionalView, so the same row triggers
 * count them (one per row, the day's row and its limit, the frequency cap). The insert of each table is its own data-modifying CTE; the
 * three tables' guards read none of the others. An impression is kept only for a promotion its guard and insert policy would accept (a running
 * promotion of another that the caller reads, an active Regular or Professional caller): they would refuse the others, and a refusal here would fail the
 * whole statement. Anything else the guards refuse throws, and the caller then records row by row (recordExposure).
 */
export async function insertExposureBatch(tx: IdentityTx, batch: ExposureBatch): Promise<void> {
  const parts: SQL[] = [];
  if (batch.impressions.length > 0)
    parts.push(sql`i as (insert into nestly.promotion_events (promotion_id, kind)
      select x.id, 'impression' from unnest(${sql.param([...batch.impressions])}::uuid[]) with ordinality as x(id, n)
      where (select nestly.is_active_account()) and coalesce((select nestly.caller_account_type()), '') in ('regular', 'professional')
        and exists (select 1 from nestly.promotions p where p.id = x.id and p.owner_id <> (select auth.uid())
                      and p.status = 'active' and p.starts_at <= now() and p.ends_at > now())
      order by x.n)`);
  if (batch.usage !== undefined && batch.usage.times >= 1)
    parts.push(sql`u as (insert into nestly.usage_events (kind) select ${batch.usage.kind} from pg_catalog.generate_series(1, ${batch.usage.times}))`);
  const views = batch.views.filter((view) => view.times >= 1);
  if (views.length > 0)
    parts.push(sql`v as (insert into nestly.professional_views (professional_id, kind)
      select x.pid, x.kind from unnest(${sql.param(views.map((view) => view.professionalId))}::uuid[], ${sql.param(views.map((view) => view.kind))}::text[],
                                       ${sql.param(views.map((view) => view.times))}::integer[]) with ordinality as x(pid, kind, times, n)
      cross join lateral pg_catalog.generate_series(1, x.times) as g(k)
      order by x.n, g.k)`);
  if (parts.length === 0) return;
  await tx.execute(sql`with ${sql.join(parts, sql`, `)} select 1`);
}

/** The Professionals among the authors of these posts, with how many of these posts are theirs (each shown post is one view of theirs). */
export async function readProfessionalAuthors(tx: IdentityTx, postIds: readonly string[]): Promise<{ id: string; posts: number }[]> {
  if (postIds.length === 0) return [];
  return z.array(z.object({ id: z.guid(), posts: z.coerce.number().int().positive() })).parse(
    // the statement as the plan-cached invoker function nestly.read_professional_authors (migration 20261027400000)
    await tx.execute(sql`select * from nestly.read_professional_authors(${sql.param([...postIds])}::uuid[])`),
  );
}

/** FR-PRO-002: only a readable running profile promotion of this Professional can identify a paid arrival. */
export async function isPromotedProfileSource(tx: IdentityTx, promotionId: string, professionalId: string): Promise<boolean> {
  const [row] = z.array(z.object({ paid: z.boolean() })).parse(await tx.execute(sql`select exists (
    select 1 from nestly.promotions p where p.id = ${promotionId}::uuid and p.owner_id = ${professionalId}::uuid
      and p.target_kind = 'profile' and p.status = 'active' and p.starts_at <= now() and p.ends_at > now()
  ) as paid`));
  return row?.paid === true;
}

// ---- the Admin (BILLING_FINANCE_MANAGE, Admin Only) -----------------------------------------------------------------------------------

const adminRow = z.object({
  id: z.guid(),
  ownerName: z.string().nullable(),
  ownerKind: z.enum(['regular', 'professional']),
  targetKind,
  planKey,
  state: z.enum(['running', 'stopped', 'ended']),
  startsAt: z.string(),
  endsAt: z.string(),
  stoppedBy: z.enum(['owner', 'staff']).nullable(),
  amountIls: z.number().int().nullable(),
  impressions: count.nullable(),
  clicks: count.nullable(),
});

const totalsRow = z.object({ running: count, stopped: count, ended: count, impressions: count, clicks: count });

/** The totals over every promotion of these kinds the caller reads (not only the listed 200): by state, and the paid events it reads. */
export async function readPromotionTotals(tx: IdentityTx, kinds: readonly PromotionTargetKind[]): Promise<z.infer<typeof totalsRow>> {
  const [row] = z.array(totalsRow).parse(
    await tx.execute(sql`
      select count(*) filter (where ${stateOf} = 'running') as running, count(*) filter (where ${stateOf} = 'stopped') as stopped,
             count(*) filter (where ${stateOf} = 'ended') as ended,
             coalesce(sum(${eventSum('impression')}), 0) as impressions, coalesce(sum(${eventSum('click')}), 0) as clicks
      from nestly.promotions p where p.target_kind = any (${sql.param([...kinds])}::text[])`),
  );
  return row ?? { running: 0, stopped: 0, ended: 0, impressions: 0, clicks: 0 };
}

/**
 * The promotions of these kinds, newest first, up to 200 (read only; the policies decide who reads which rows). The kinds narrow the list
 * before the limit, so a Moderator's 200 are all of its keys' kinds. With `finance` (the Admin) each carries the amount of its own payment and
 * its paid counts; without it they are null: a Moderator reads no payment and no paid event, and a 0 would be untrue.
 * The payment is the one bought with the promotion: the same payer, plan and transaction time (both rows take now() in the purchase's one
 * transaction; the promotion's payment_id is not readable by accounts).
 */
export async function readAdminPromotions(tx: IdentityTx, kinds: readonly PromotionTargetKind[], finance: boolean): Promise<AdminPromotions['promotions']> {
  const paid = finance
    ? sql`(select pp.amount_ils from nestly.promotion_payments pp
            where pp.payer_id = p.owner_id and pp.plan_key = p.plan_key and pp.created_at = p.created_at limit 1) as "amountIls",
           ${eventSum('impression')} as impressions, ${eventSum('click')} as clicks`
    : sql`null::integer as "amountIls", null::integer as impressions, null::integer as clicks`;
  return z.array(adminRow).parse(
    await tx.execute(sql`
      select p.id, coalesce(pr.full_name, n.full_name) as "ownerName", case when p.target_kind = 'listing' then 'regular' else 'professional' end as "ownerKind",
             p.target_kind as "targetKind", p.plan_key as "planKey", ${stateOf} as state, ${iso('p.starts_at')} as "startsAt", ${iso('p.ends_at')} as "endsAt",
             p.stopped_by as "stoppedBy", ${paid}
      from nestly.promotions p
      left join nestly.professional_profiles pr on pr.user_id = p.owner_id
      left join nestly.regular_names n on n.user_id = p.owner_id
      where p.target_kind = any (${sql.param([...kinds])}::text[])
      order by p.created_at desc, p.id limit 200`),
  );
}

/** The Admin's totals: every promotion by state and its paid events, and the simulated payments (BILLING_FINANCE_MANAGE's rows). */
export async function readFinanceTotals(tx: IdentityTx): Promise<AdminPromotions['totals']> {
  const [money] = z
    .array(z.object({ payments: count, revenue: count }))
    .parse(await tx.execute(sql`select count(*) as payments, coalesce(sum(amount_ils), 0) as revenue from nestly.promotion_payments`));
  return { ...(await readPromotionTotals(tx, PROMOTION_TARGET_KINDS)), payments: money?.payments ?? 0, sampleRevenueIls: money?.revenue ?? 0 };
}
