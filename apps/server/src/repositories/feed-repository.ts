// The community feed (I3 F3.2 a2; FR-FEED-001, FR-ALG-002; I3-algorithm.md -> Feed-query allow-list; schema.md, schema-b.md). Runs inside the
// caller's identity transaction and nowhere else. Which posts, counts and names the caller reads is the database's (row policies on
// posts, comments, reactions, friendships and regular_names): nothing here narrows rows for permission, and the statements name only
// what the allow-list names. Every SELECT is column-level and lists its columns. The page's statements are plan-cached SECURITY INVOKER
// functions (migration 20261027400000): the same text with the bound values as arguments, planned once per database connection.
//   - the ranking statement: candidates, score (double precision, the expression of packages/shared/src/feed/score.ts), tier, keyset;
//     a Professional viewer's `content` profile (AC-061, algorithm-review.md R2) has no Friend or Stage term and reads no friendship or tag
//   - the display statement: a separate read by the page's ids; it fills in text and names and can never change the order
//   - the configuration rows and the snapshot clock
// Timestamps leave the database as text with six fractional digits (the cursor's own format) and come back as text: never a JS Date.

import { GROUP_PRIVACIES, JOURNEY_STAGES, OFFER_HELP_STATES, POST_AUDIENCES, PROFESSIONAL_FIELDS, dbTimestamp, type FeedConfigRow } from '@nestly/shared';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { camelColumns } from './plan-cached.js';

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
  // the plan-cached invoker function of the statement (migration 20261027400000)
  const rows = await tx.execute(sql`select ${camelColumns('version', 'is_active', 'w_fresh', 'half_life_hours', 'w_friend', 'w_quality', 'quality_cap', 'w_stage', 'scored_window_days', 'max_same_creator_in_window', 'diversity_window', 'max_anonymous_in_window', 'page_size', 'w_intent', 'intent_half_life_hours')} from nestly.read_feed_config_rows()`);
  return z.array(configRow).parse(rows).map(({ version, isActive, ...values }) => ({ version, isActive, values }));
}

// ---- the snapshot clock --------------------------------------------------------------------------------------------------------------

const clockRow = z.object({ nowText: dbTimestamp, usable: z.boolean() });

/**
 * The database's `now()` as cursor text (a first page's `asOf`), and whether `cursorAsOf` (null: none) is not later than it. A cursor
 * from the future is not one this database issued.
 */
export function snapshotClockColumns(cursorAsOf: string | null): SQL {
  return sql`${isoText(sql`now()`)} as "nowText", coalesce(${cursorAsOf}::timestamptz <= now(), true) as usable`;
}

/** The clock columns of one row, checked. */
export function snapshotClockOf(row: unknown): { nowText: string; isCursorUsable: boolean } {
  const { nowText, usable } = clockRow.parse(row);
  return { nowText, isCursorUsable: usable };
}

/** The snapshot clock on its own (a feed page reads it inside readFeedPrelude, combined-reads-repository.ts). */
export async function readSnapshotClock(tx: IdentityTx, cursorAsOf: string | null): Promise<{ nowText: string; isCursorUsable: boolean }> {
  const [row] = z.array(z.unknown()).length(1).parse(await tx.execute(sql`select ${snapshotClockColumns(cursorAsOf)}`));
  return snapshotClockOf(row);
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

const RANKED_COLUMNS = camelColumns('id', 'author_id', 'is_anonymous', 'shared_post_id', 'tier', 'score', 'created_at');

/** No tier-1 cursor: every post's (created_at, id) is below this, so the tier-1 keyset keeps every row (as no keyset did). */
const NO_TIER1_KEYSET = { createdAt: 'infinity', id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' } as const;

/** The Intent Signal term counts only for the Regular profile, with a weight above 0 and at least one topic; otherwise it adds exactly 0. */
function usesIntent(parameters: RankingParameters): boolean {
  return parameters.profile !== 'content' && (parameters.config.wIntent ?? 0) > 0 && (parameters.intents ?? []).length > 0;
}

/**
 * The ranking statement: `pageSize + 1` posts of the snapshot in ranked order, as a call of one of three plan-cached invoker functions
 * (migration 20261027400000: the statement's text, unchanged, with these values as its arguments). Every input is bounded by `asOf`; the
 * counts are over the rows the caller's policies show (a count, never who); the whole score is double precision.
 *   - `regular`: every term; the Intent Signal term (and the post's text) only with topics and wIntent above 0 (…_regular_intent).
 *   - `content` (a Professional, AC-061, R2): Freshness, Quality and, with `viewerId`, the Follow term; no Friend, Stage, tag or identity.
 * The cursor (`after`, last unit of the previous page in `(tier, score desc, created_at desc, id desc)`): a first page passes tier -1, which
 * every row is after. Tier 0 is scored only on a first page or from a tier-0 cursor; a tier-1 cursor (score 0) is also the index's keyset
 * (created_at, id) < (…), and without one that keyset is (infinity, ffffffff-…), which every post is below.
 */
export function rankingStatement(parameters: RankingParameters): SQL {
  const { asOf, config, after } = parameters;
  const windowHours = config.scoredWindowDays * 24;
  const cursor = after ?? { tier: -1, score: 0, createdAt: asOf, id: '00000000-0000-0000-0000-000000000000' };
  const tier1 = after !== null && after.tier === 1 && after.score === 0 ? after : NO_TIER1_KEYSET;
  const window = sql`p_as_of => ${asOf}::timestamptz, p_window_edge_secs => ${windowHours * 3600 + 1}::float8, p_window_hours => ${windowHours}::float8,
      p_w_fresh => ${config.wFresh}::float8, p_half_life_hours => ${config.halfLifeHours}::float8`;
  const keyset = sql`p_scores_tier0 => ${after === null || after.tier === 0}::boolean,
      p_tier1_created_at => ${tier1.createdAt}::timestamptz, p_tier1_id => ${tier1.id}::uuid,
      p_after_tier => ${cursor.tier}::integer, p_after_score => ${cursor.score}::float8,
      p_after_created_at => ${cursor.createdAt}::timestamptz, p_after_id => ${cursor.id}::uuid, p_limit => ${config.pageSize + 1}::integer`;
  if (parameters.profile === 'content') {
    return sql`select ${RANKED_COLUMNS} from nestly.read_feed_ranking_content(${window},
      p_w_quality => ${config.wQuality}::float8, p_quality_cap => ${config.qualityCap}::float8,
      p_w_friend => ${config.wFriend}::float8, p_viewer_id => ${parameters.viewerId ?? null}::uuid,
      ${keyset})`;
  }
  const regular = sql`p_w_friend => ${config.wFriend}::float8, p_w_quality => ${config.wQuality}::float8, p_quality_cap => ${config.qualityCap}::float8,
      p_w_stage => ${config.wStage}::float8, p_stages => ${sql.param([...parameters.stages])}::text[]`;
  if (!usesIntent(parameters)) return sql`select ${RANKED_COLUMNS} from nestly.read_feed_ranking_regular(${window}, ${regular}, ${keyset})`;
  const intents = parameters.intents ?? [];
  return sql`select ${RANKED_COLUMNS} from nestly.read_feed_ranking_regular_intent(${window}, ${regular},
      p_w_intent => ${config.wIntent ?? 0}::float8, p_intent_patterns => ${sql.param(intents.map((x) => x.pattern))}::text[],
      p_intent_weights => ${sql.param(intents.map((x) => x.weight))}::float8[],
      ${keyset})`;
}

/**
 * The ranked posts of the snapshot after the cursor, at most `pageSize + 1`. The rows are checked on the way in. The score must reach the
 * cursor and come back bit for bit, so the transaction asks for the shortest exact float8 text: the server's default here is 0, which
 * rounds to 15 digits and would let the keyset repeat or skip posts whose scores differ in the last bits.
 */
export async function readRankedPosts(tx: IdentityTx, parameters: RankingParameters): Promise<RankedPost[]> {
  await tx.execute(sql`select pg_catalog.set_config('extra_float_digits', '3', true)`);
  return readRankedPostsExact(tx, parameters);
}

/** readRankedPosts in a transaction that already asks for the exact float8 text (a feed page: readFeedPrelude sets it, one round trip less). */
export async function readRankedPostsExact(tx: IdentityTx, parameters: RankingParameters): Promise<RankedPost[]> {
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
  groupId: z.guid().nullable(),
  groupName: z.string().nullable(),
  groupPrivacy: z.enum(GROUP_PRIVACIES).nullable(),
});

export type DisplayPost = z.infer<typeof displayRow>;

const DISPLAY_COLUMNS = camelColumns(
  'id', 'is_share', 'is_anonymous', 'body', 'audience', 'stage_tag', 'created_at', 'is_mine', 'offer_help', 'author_name', 'author_field',
  'author_field_other', 'original_id', 'original_body', 'original_audience', 'original_created_at', 'original_is_anonymous', 'original_is_mine',
  'original_author_name', 'original_author_field', 'original_author_field_other', 'group_id', 'group_name', 'group_privacy',
);

/**
 * The display statement: the text, the audience, the author's name where the caller's policy shows one, and the original of a share
 * where the caller may read it, for the page's ids only. A post no longer readable is simply absent. The author's id never leaves the
 * statement: `is_mine` and the original's `originalIsMine` (F3.5 c7) are computed there. The statement is the plan-cached invoker function
 * nestly.read_feed_display (migration 20261027400000; its Offer Help column is offer-help-state.ts's, verbatim).
 */
export function displayStatement(ids: readonly string[]): SQL {
  return sql`select ${DISPLAY_COLUMNS} from nestly.read_feed_display(${sql.param([...ids])}::uuid[])`;
}

/** The display rows of the page's ids, in no particular order: the caller orders them by the ranked list. */
export async function readDisplayPosts(tx: IdentityTx, ids: readonly string[]): Promise<DisplayPost[]> {
  if (ids.length === 0) return [];
  return z.array(displayRow).parse(await tx.execute(displayStatement(ids)));
}
