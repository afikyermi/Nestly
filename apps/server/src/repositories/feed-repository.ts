// The community feed (I3 F3.2 a2; FR-FEED-001, FR-ALG-002; I3-algorithm.md -> Feed-query allow-list; schema.md, schema-b.md). Runs inside the
// caller's identity transaction and nowhere else. Which posts, counts and names the caller reads is the database's (row policies on
// posts, comments, reactions, friendships and regular_names): nothing here narrows rows for permission, and the statements name only
// what the allow-list names. Every SELECT is column-level and lists its columns.
//   - the ranking statement: candidates, score (double precision, the expression of packages/shared/src/feed/score.ts), tier, keyset;
//     a Professional viewer's `content` profile (AC-061, algorithm-review.md R2) has no Friend or Stage term and reads no friendship or tag
//   - the display statement: a separate read by the page's ids; it fills in text and names and can never change the order
//   - the configuration rows and the snapshot clock
// Timestamps leave the database as text with six fractional digits (the cursor's own format) and come back as text: never a JS Date.

import { JOURNEY_STAGES, OFFER_HELP_STATES, POST_AUDIENCES, PROFESSIONAL_FIELDS, dbTimestamp, type FeedConfigRow } from '@nestly/shared';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { offerHelpState } from './offer-help-state.js';

/** The cursor's timestamp format (shared/feed/cursor.ts), produced here and parsed back there. */
const TIMESTAMP_TEXT = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`);
const isoText = (column: SQL): SQL => sql`to_char(${column} at time zone 'UTC', ${TIMESTAMP_TEXT})`;

// ---- configuration -------------------------------------------------------------------------------------------------------------------

const configRow = z.object({
  version: z.number(),
  isActive: z.boolean(),
  wFresh: z.number(),
  halfLifeHours: z.number(),
  wFriend: z.number(),
  wQuality: z.number(),
  qualityCap: z.number(),
  wStage: z.number(),
  scoredWindowDays: z.number(),
  maxSameCreatorInWindow: z.number(),
  diversityWindow: z.number(),
  maxAnonymousInWindow: z.number(),
  pageSize: z.number(),
  wIntent: z.number(),
  intentHalfLifeHours: z.number(),
});

/**
 * Every stored version of the regular feed, weights as double precision (the table holds numeric, which the driver returns as text).
 * The values are not judged here: `resolveFeedConfig` refuses a drifted row and picks an older one.
 */
export async function readFeedConfigRows(tx: IdentityTx): Promise<FeedConfigRow[]> {
  const rows = await tx.execute(sql`
    select version, is_active as "isActive", w_fresh::float8 as "wFresh", half_life_hours as "halfLifeHours", w_friend::float8 as "wFriend",
           w_quality::float8 as "wQuality", quality_cap as "qualityCap", w_stage::float8 as "wStage", scored_window_days as "scoredWindowDays",
           max_same_creator_in_window as "maxSameCreatorInWindow", diversity_window as "diversityWindow",
           max_anonymous_in_window as "maxAnonymousInWindow", page_size as "pageSize",
           w_intent::float8 as "wIntent", intent_half_life_hours as "intentHalfLifeHours"
    from nestly.algorithm_configurations
    where surface = 'regular_feed'`);
  return z.array(configRow).parse(rows).map(({ version, isActive, ...values }) => ({ version, isActive, values }));
}

// ---- the snapshot clock --------------------------------------------------------------------------------------------------------------

const clockRow = z.object({ nowText: dbTimestamp, usable: z.boolean() });

/**
 * The database's `now()` as cursor text (a first page's `asOf`), and whether `cursorAsOf` (null: none) is not later than it. A cursor
 * from the future is not one this database issued.
 */
export async function readSnapshotClock(tx: IdentityTx, cursorAsOf: string | null): Promise<{ nowText: string; isCursorUsable: boolean }> {
  const rows = await tx.execute(sql`
    select ${isoText(sql`now()`)} as "nowText", coalesce(${cursorAsOf}::timestamptz <= now(), true) as usable`);
  const [row] = z.array(clockRow).length(1).parse(rows);
  if (row === undefined) throw new Error('the snapshot clock returned no row');
  return { nowText: row.nowText, isCursorUsable: row.usable };
}

// ---- the ranking statement -----------------------------------------------------------------------------------------------------------

/**
 * Which score ranks the viewer's page (AC-061; algorithm-review.md R2). `regular`: every term. `content` (a Professional viewer): the content
 * signals only, Freshness and Quality; the Friend and Stage terms are left out of the statement (not multiplied by 0), so it reads no
 * friendship, no Stage and no tag. The profile is chosen from the viewer's own account; it is never a row filter.
 */
export type RankingProfile = 'regular' | 'content';

interface RankingBase {
  readonly asOf: string;
  readonly config: {
    readonly wFresh: number;
    readonly halfLifeHours: number;
    readonly wFriend: number;
    readonly wQuality: number;
    readonly qualityCap: number;
    readonly wStage: number;
    readonly scoredWindowDays: number;
    readonly pageSize: number;
    /** FR-ALG-008; absent = 0 (off). */
    readonly wIntent?: number;
  };
  /** The last unit of the previous page in ranked order, or null on a first page. */
  readonly after: { readonly tier: 0 | 1; readonly score: number; readonly createdAt: string; readonly id: string } | null;
}

export type RankingParameters =
  | (RankingBase & {
      /** Absent means `regular` (F3.2's callers). */
      readonly profile?: 'regular';
      /** The viewer's derived Stage set, empty unless the weight is above 0. A bound parameter. */
      readonly stages: readonly string[];
      /**
       * FR-ALG-008: the viewer's search topics as (pattern, decayed weight), computed for `asOf` (so a page and its next page score alike);
       * empty unless `wIntent` is above 0. Bound parameters. Absent: none.
       */
      readonly intents?: readonly { readonly pattern: string; readonly weight: number }[];
    })
  | (RankingBase & {
      readonly profile: 'content';
      /** I11 (FR-ALG-003): the viewer's own id, a bound value, so the Follow term never lifts the viewer's own posts. Absent: no Follow term. */
      readonly viewerId?: string;
    });

export interface RankedPost {
  readonly id: string;
  readonly authorId: string | null;
  readonly isAnonymous: boolean;
  readonly sharedPostId: string | null;
  readonly tier: 0 | 1;
  readonly score: number;
  readonly createdAt: string;
}

const rankedRow = z.object({
  id: z.guid(),
  authorId: z.guid().nullable(),
  isAnonymous: z.boolean(),
  sharedPostId: z.guid().nullable(),
  tier: z.union([z.literal(0), z.literal(1)]),
  score: z.number(),
  createdAt: dbTimestamp,
});

/** The rows after the cursor in `(tier, score desc, created_at desc, id desc)`: the same float8 comparison the order uses. */
function afterCursor(after: RankingParameters['after']): SQL {
  if (after === null) return sql`true`;
  return sql`(s.tier > ${after.tier}::integer
    or (s.tier = ${after.tier}::integer and (s.score < ${after.score}::float8
      or (s.score = ${after.score}::float8 and (s.created_at < ${after.createdAt}::timestamptz
        or (s.created_at = ${after.createdAt}::timestamptz and s.id < ${after.id}::uuid))))))`;
}

/** The terms of the score inside tier 0. The `regular` text is F3.2's, byte for byte; `content` keeps two of its terms, unchanged. */
function scoreTerms(parameters: RankingParameters): SQL {
  const { asOf, config } = parameters;
  const fresh = sql`${config.wFresh}::float8 * power(2::float8, -t.age_hours / ${config.halfLifeHours}::float8)`;
  const quality = sql`${config.wQuality}::float8 * least(
              ln(1::float8 + (
                (select count(*) from nestly.reactions r where r.post_id = t.id and not r.is_by_author and r.created_at <= ${asOf}::timestamptz)
                + (select count(*) from nestly.comments m where m.post_id = t.id and not m.is_by_post_author and m.created_at <= ${asOf}::timestamptz)
              )::float8) / ln(1::float8 + ${config.qualityCap}::float8),
              1::float8)`;
  if (parameters.profile === 'content') {
    // FR-ALG-003 (I11): a Professional viewer's feed favours the Professionals it follows, with the Friend weight (a Professional has no
    // Friends). The EXISTS runs under the viewer's own Follow policy (its own Follows, and the rows naming itself), so it reads no
    // friendship, no Stage and no identity.
    if (parameters.viewerId === undefined) {
      return sql`${fresh}
          + ${quality}`;
    }
    const follows = sql`${config.wFriend}::float8 * (case
              when t.author_id is not null and t.author_id <> ${parameters.viewerId}::uuid
                and exists (select 1 from nestly.professional_follows pf where pf.professional_id = t.author_id)
              then 1::float8 else 0::float8 end)`;
    return sql`${fresh}
          + ${quality}
          + ${follows}`;
  }
  const friend = sql`${config.wFriend}::float8 * (case
              when t.is_anonymous or t.author_id is null then 0::float8
              when exists (
                select 1 from nestly.friendships f
                where f.status = 'accepted'
                  and ((f.requester_id = (select auth.uid()) and f.addressee_id = t.author_id)
                    or (f.addressee_id = (select auth.uid()) and f.requester_id = t.author_id))
              ) then 1::float8 else 0::float8 end)`;
  const stage = sql`${config.wStage}::float8 * (case when t.stage_tag = any(${sql.param([...parameters.stages])}::text[]) then 1::float8 else 0::float8 end)`;
  const intents = usesIntent(parameters) ? (parameters.intents ?? []) : [];
  if (intents.length === 0) {
    return sql`${fresh}
          + ${friend}
          + ${quality}
          + ${stage}`;
  }
  // FR-ALG-008: the decayed weights of the viewer's topics the post's text matches, capped at 1, times wIntent. The weights are bound values.
  const intent = sql`${config.wIntent ?? 0}::float8 * least(1::float8, (
              select coalesce(sum(i.weight), 0::float8)
              from unnest(${sql.param(intents.map((x) => x.pattern))}::text[], ${sql.param(intents.map((x) => x.weight))}::float8[]) as i(pattern, weight)
              where t.body ~* i.pattern))`;
  return sql`${fresh}
          + ${friend}
          + ${quality}
          + ${stage}
          + ${intent}`;
}

/** The Intent Signal term is in the statement only for the Regular profile, with a weight above 0 and at least one topic. */
function usesIntent(parameters: RankingParameters): boolean {
  return parameters.profile !== 'content' && (parameters.config.wIntent ?? 0) > 0 && (parameters.intents ?? []).length > 0;
}

/**
 * The ranking statement: `pageSize + 1` posts of the snapshot in ranked order. Every input is bounded by `asOf`; the counts are over the rows
 * the caller's policies show (a count, never who); the whole score is double precision. The `content` profile does not select the tag.
 */
export function rankingStatement(parameters: RankingParameters): SQL {
  const { asOf, config, after } = parameters;
  const tagColumn = parameters.profile === 'content' ? sql`` : usesIntent(parameters) ? sql`p.stage_tag, p.body, ` : sql`p.stage_tag, `;
  return sql`
    with candidates as (
      select p.id, p.author_id, p.is_anonymous, p.shared_post_id, ${tagColumn}p.created_at,
             extract(epoch from (${asOf}::timestamptz - p.created_at))::float8 / 3600::float8 as age_hours
      from nestly.posts p
      where p.created_at <= ${asOf}::timestamptz and p.group_id is null
    ), tiered as (
      select c.*, case when c.age_hours <= ${config.scoredWindowDays * 24}::float8 then 0 else 1 end as tier
      from candidates c
    ), scored as (
      select t.id, t.author_id, t.is_anonymous, t.shared_post_id, t.created_at, t.tier,
        case when t.tier = 1 then 0::float8 else
          ${scoreTerms(parameters)}
        end as score
      from tiered t
    )
    select s.id, s.author_id as "authorId", s.is_anonymous as "isAnonymous", s.shared_post_id as "sharedPostId", s.tier, s.score,
           ${isoText(sql`s.created_at`)} as "createdAt"
    from scored s
    where ${afterCursor(after)}
    order by s.tier asc, s.score desc, s.created_at desc, s.id desc
    limit ${config.pageSize + 1}`;
}

/**
 * The ranked posts of the snapshot after the cursor, at most `pageSize + 1`. The rows are checked on the way in. The score must reach the
 * cursor and come back bit for bit, so the transaction asks for the shortest exact float8 text: the server's default here is 0, which
 * rounds to 15 digits and would let the keyset repeat or skip posts whose scores differ in the last bits.
 */
export async function readRankedPosts(tx: IdentityTx, parameters: RankingParameters): Promise<RankedPost[]> {
  await tx.execute(sql`select pg_catalog.set_config('extra_float_digits', '3', true)`);
  return z.array(rankedRow).parse(await tx.execute(rankingStatement(parameters)));
}

// ---- the display statement -----------------------------------------------------------------------------------------------------------

const displayRow = z.object({
  id: z.guid(),
  isShare: z.boolean(),
  isAnonymous: z.boolean(),
  body: z.string().nullable(),
  audience: z.enum(POST_AUDIENCES),
  stageTag: z.enum(JOURNEY_STAGES).nullable(),
  createdAt: z.string(),
  isMine: z.boolean(),
  /** I11 completion C: the caller's Offer Help state (offer-help-state.ts); null for anyone but a Professional on an eligible post. */
  offerHelp: z.enum(OFFER_HELP_STATES).nullable(),
  authorName: z.string().nullable(),
  authorField: z.enum(PROFESSIONAL_FIELDS).nullable(),
  authorFieldOther: z.string().nullable(),
  originalId: z.guid().nullable(),
  originalBody: z.string().nullable(),
  originalAudience: z.enum(POST_AUDIENCES).nullable(),
  originalCreatedAt: z.string().nullable(),
  originalIsAnonymous: z.boolean().nullable(),
  originalIsMine: z.boolean(),
  originalAuthorName: z.string().nullable(),
  originalAuthorField: z.enum(PROFESSIONAL_FIELDS).nullable(),
  originalAuthorFieldOther: z.string().nullable(),
});

export type DisplayPost = z.infer<typeof displayRow>;

/**
 * The display statement: the text, the audience, the author's name where the caller's policy shows one, and the original of a share
 * where the caller may read it, for the page's ids only. A post no longer readable is simply absent. The author's id never leaves the
 * statement: `is_mine` and the original's `originalIsMine` (F3.5 c7) are computed here.
 */
export function displayStatement(ids: readonly string[]): SQL {
  return sql`
    select p.id, p.is_share as "isShare", p.is_anonymous as "isAnonymous", p.body, p.audience, p.stage_tag as "stageTag",
           ${isoText(sql`p.created_at`)} as "createdAt",
           coalesce(p.author_id = (select auth.uid()), false) as "isMine", ${offerHelpState('p')} as "offerHelp",
           coalesce(n.full_name, ap.full_name) as "authorName", ap.field as "authorField", ap.field_other as "authorFieldOther",
           o.id as "originalId", o.body as "originalBody", o.audience as "originalAudience",
           ${isoText(sql`o.created_at`)} as "originalCreatedAt", o.is_anonymous as "originalIsAnonymous",
           coalesce(o.author_id = (select auth.uid()), false) as "originalIsMine",
           coalesce(oa.full_name, oap.full_name) as "originalAuthorName", oap.field as "originalAuthorField",
           oap.field_other as "originalAuthorFieldOther"
    from nestly.posts p
    left join nestly.regular_names n on n.user_id = p.author_id
    left join nestly.professional_profiles ap on ap.user_id = p.author_id
    left join nestly.posts o on o.id = p.shared_post_id
    left join nestly.regular_names oa on oa.user_id = o.author_id
    left join nestly.professional_profiles oap on oap.user_id = o.author_id
    where p.id in (${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`;
}

/** The display rows of the page's ids, in no particular order: the caller orders them by the ranked list. */
export async function readDisplayPosts(tx: IdentityTx, ids: readonly string[]): Promise<DisplayPost[]> {
  if (ids.length === 0) return [];
  return z.array(displayRow).parse(await tx.execute(displayStatement(ids)));
}
