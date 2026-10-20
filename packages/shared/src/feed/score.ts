// The organic score of one post (I3 F3.2 a1; I3-algorithm.md -> Pipeline 3). The ranking query computes the same expression in SQL
// (float8); this is the reference the fixtures are written against and the Stage-is-a-signal test runs on. Everything is a double,
// as in the query: no rounding, no integer maths, so a score survives the round trip through the cursor.
import type { JourneyStage } from '../constants/index.js';
import type { FeedConfig } from './config.js';

export type ScoreInput = {
  /** Hours from `asOf` back to the post's `created_at` (never from now). */
  ageHours: number;
  /** The viewer is a Friend of the named author. Ignored for an anonymous post: its Friend term is 0 by construction. */
  isFriend: boolean;
  isAnonymous: boolean;
  /** Likes and comments by others than the author, counted by the query. A count, never who. */
  n: number;
  stageTag: JourneyStage | null;
  /** The viewer's derived Stage set (empty when the viewer has none). */
  viewerStages: readonly JourneyStage[];
  /**
   * FR-ALG-008: the sum of the decayed weights of the viewer's search topics the post matches (each topic: the sum over its searches of
   * 2^(-hours since the search / intentHalfLifeHours), searches up to `asOf` and at most 30 days before it). Absent: 0.
   */
  intent?: number;
};

/** 0 for a post within `scoredWindowDays`, 1 for an older one (pure recency, score 0). */
export function rankTier(config: FeedConfig, ageHours: number): 0 | 1 {
  return ageHours <= config.scoredWindowDays * 24 ? 0 : 1;
}

/** `wFresh*2^(-age/halfLife) + wFriend*friend + wQuality*min(ln(1+n)/ln(1+cap), 1) + wStage*stageMatch + wIntent*min(intent, 1)`; 0 in tier 1. */
export function scorePost(config: FeedConfig, input: ScoreInput): number {
  if (rankTier(config, input.ageHours) === 1) return 0;
  const fresh = Math.pow(2, -input.ageHours / config.halfLifeHours);
  const friend = input.isFriend && !input.isAnonymous ? 1 : 0;
  const quality = Math.min(Math.log(1 + input.n) / Math.log(1 + config.qualityCap), 1);
  const stage = input.stageTag !== null && input.viewerStages.includes(input.stageTag) ? 1 : 0;
  const base = config.wFresh * fresh + config.wFriend * friend + config.wQuality * quality + config.wStage * stage;
  const intent = input.intent ?? 0;
  return config.wIntent > 0 && intent > 0 ? base + config.wIntent * Math.min(intent, 1) : base;
}

/** The order key `(tier asc, score desc, created_at desc, id desc)`. Timestamps are fixed-width text and ids lowercase uuids. */
export type RankKey = { tier: 0 | 1; score: number; createdAt: string; id: string };

/** What the content profile scores (a Professional viewer, AC-061): the post's age and its count, nothing about the viewer. */
export type ContentScoreInput = Pick<ScoreInput, 'ageHours' | 'n'>;

/**
 * The content profile (algorithm-review.md R2): `wFresh*2^(-age/halfLife) + wQuality*min(ln(1+n)/ln(1+cap), 1)`; 0 in tier 1. The Friend
 * and Stage terms are not part of it, whatever their weights.
 */
export function scoreContentPost(config: FeedConfig, input: ContentScoreInput): number {
  if (rankTier(config, input.ageHours) === 1) return 0;
  const fresh = Math.pow(2, -input.ageHours / config.halfLifeHours);
  const quality = Math.min(Math.log(1 + input.n) / Math.log(1 + config.qualityCap), 1);
  return config.wFresh * fresh + config.wQuality * quality;
}
