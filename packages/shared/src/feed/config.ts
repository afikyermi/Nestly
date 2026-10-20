// Feed ranking configuration (I3 F3.2 a1; FR-ALG-002, BR-059, I3-algorithm.md -> Configuration and Fallbacks). The ranges are the
// ones of the table `algorithm_configurations`; the Zod schema repeats them so a row that drifted is refused and the fallback chain
// below picks an older one. Pure: the server reads the rows, this decides which one a page uses.
import { z } from 'zod';

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const weight = (max: number) => z.number().min(0).max(max);

/** The values of one version (camelCase of the table's columns). The two caps stay within the window. */
export const feedConfigValues = z
  .strictObject({
    wFresh: weight(5),
    halfLifeHours: int(1, 336),
    wFriend: weight(5),
    wQuality: weight(2),
    qualityCap: int(1, 1000),
    wStage: weight(2),
    scoredWindowDays: int(1, 90),
    maxSameCreatorInWindow: int(1, 20),
    diversityWindow: int(3, 20),
    maxAnonymousInWindow: int(1, 20),
    pageSize: int(5, 50),
    /** FR-ALG-008: the Intent Signal term (0 = off) and the half-life of a search topic's influence. Absent on a row read before them: off. */
    wIntent: weight(2).default(0),
    intentHalfLifeHours: int(1, 720).default(168),
  })
  .refine((c) => c.maxSameCreatorInWindow <= c.diversityWindow && c.maxAnonymousInWindow <= c.diversityWindow, {
    message: 'caps exceed diversityWindow',
  });

export type FeedConfig = z.infer<typeof feedConfigValues>;

/** `configVersion` 0 is the built-in `fallback-recency-v0`; stored versions are integers above 0 and never 0. */
export const FEED_FALLBACK_VERSION = 0;
export const FEED_FALLBACK_NAME = 'fallback-recency-v0';

/** Pure recency: only the freshness weight is on; caps and page size are the v1 defaults. */
export const FEED_FALLBACK_CONFIG: FeedConfig = {
  wFresh: 1,
  halfLifeHours: 24,
  wFriend: 0,
  wQuality: 0,
  qualityCap: 20,
  wStage: 0,
  scoredWindowDays: 14,
  maxSameCreatorInWindow: 2,
  diversityWindow: 5,
  maxAnonymousInWindow: 2,
  pageSize: 20,
  wIntent: 0,
  intentHalfLifeHours: 168,
};

/** One stored version as the repository reads it. `values` is unvalidated on purpose: this module judges it. */
export type FeedConfigRow = { version: number; isActive: boolean; values: unknown };

export type FeedConfigErrorClass = 'no_active' | 'invalid_active' | 'none_valid' | 'pinned_missing' | 'pinned_invalid';

/** What the server logs when it did not use the active version: the version used and why. No row content, no personal data. */
export type FeedConfigFallback = { configVersion: number; errorClass: FeedConfigErrorClass };

export type FeedConfigResolution = {
  config: FeedConfig;
  configVersion: number;
  /** The cursor pinned a version that is missing or invalid: this is a new first page. */
  restarted: boolean;
  fallback: FeedConfigFallback | null;
};

type ValidRow = { version: number; config: FeedConfig };

function validRow(row: FeedConfigRow): ValidRow | null {
  if (!Number.isSafeInteger(row.version) || row.version <= 0) return null;
  const parsed = feedConfigValues.safeParse(row.values);
  return parsed.success ? { version: row.version, config: parsed.data } : null;
}

function highestValidBelow(rows: readonly FeedConfigRow[], below: number): ValidRow | null {
  let best: ValidRow | null = null;
  for (const row of rows) {
    if (row.version >= below) continue;
    const valid = validRow(row);
    if (valid && (!best || valid.version > best.version)) best = valid;
  }
  return best;
}

/** The active version, else the highest valid one below it (the whole list when none is active), else built-in version 0. */
function newestUsable(rows: readonly FeedConfigRow[]): Omit<FeedConfigResolution, 'restarted'> {
  let active: FeedConfigRow | null = null;
  for (const row of rows) if (row.isActive && (!active || row.version > active.version)) active = row;
  const activeValid = active ? validRow(active) : null;
  if (activeValid) return { config: activeValid.config, configVersion: activeValid.version, fallback: null };
  const found = highestValidBelow(rows, active ? active.version : Infinity);
  const errorClass: FeedConfigErrorClass = active ? 'invalid_active' : 'no_active';
  if (found) return { config: found.config, configVersion: found.version, fallback: { configVersion: found.version, errorClass } };
  return {
    config: FEED_FALLBACK_CONFIG,
    configVersion: FEED_FALLBACK_VERSION,
    fallback: { configVersion: FEED_FALLBACK_VERSION, errorClass: 'none_valid' },
  };
}

/**
 * Which configuration a page uses. `pinnedVersion` is the cursor's `configVersion` (null on a first page). A pinned version that is
 * missing or invalid gives a new first page under the chain above with `restarted: true`: no list mixes two versions. Version 0 is
 * always available. If the chain itself fell back, that is the logged reason; the pinned failure is then visible as `restarted`.
 */
export function resolveFeedConfig(rows: readonly FeedConfigRow[], pinnedVersion: number | null): FeedConfigResolution {
  if (pinnedVersion === FEED_FALLBACK_VERSION) {
    return { config: FEED_FALLBACK_CONFIG, configVersion: FEED_FALLBACK_VERSION, restarted: false, fallback: null };
  }
  if (pinnedVersion === null) return { ...newestUsable(rows), restarted: false };
  const row = rows.find((r) => r.version === pinnedVersion);
  const valid = row ? validRow(row) : null;
  if (valid) return { config: valid.config, configVersion: valid.version, restarted: false, fallback: null };
  const fresh = newestUsable(rows);
  return {
    ...fresh,
    restarted: true,
    fallback: fresh.fallback ?? { configVersion: fresh.configVersion, errorClass: row ? 'pinned_invalid' : 'pinned_missing' },
  };
}
