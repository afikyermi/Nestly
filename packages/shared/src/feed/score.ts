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
};

/** 0 for a post within `scoredWindowDays`, 1 for an older one (pure recency, score 0). */
export function rankTier(config: FeedConfig, ageHours: number): 0 | 1 {
  return ageHours <= config.scoredWindowDays * 24 ? 0 : 1;
}

/** `wFresh*2^(-age/halfLife) + wFriend*friend + wQuality*min(ln(1+n)/ln(1+cap), 1) + wStage*stageMatch`; 0 in tier 1. */
export function scorePost(config: FeedConfig, input: ScoreInput): number {
  if (rankTier(config, input.ageHours) === 1) return 0;
  const fresh = Math.pow(2, -input.ageHours / config.halfLifeHours);
  const friend = input.isFriend && !input.isAnonymous ? 1 : 0;
  const quality = Math.min(Math.log(1 + input.n) / Math.log(1 + config.qualityCap), 1);
  const stage = input.stageTag !== null && input.viewerStages.includes(input.stageTag) ? 1 : 0;
  return config.wFresh * fresh + config.wFriend * friend + config.wQuality * quality + config.wStage * stage;
}

export type RankKey = { tier: 0 | 1; score: number; createdAt: string; id: string };

/** The order key `(tier asc, score desc, created_at desc, id desc)`. Timestamps are fixed-width text and ids lowercase uuids. */
export function compareRankKeys(a: RankKey, b: RankKey): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.score !== b.score) return b.score - a.score;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return 0;
}
