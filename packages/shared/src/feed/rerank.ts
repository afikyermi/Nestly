// Re-ranking of one page (I3 F3.2 a1; I3-algorithm.md -> Pipeline 4). Pure and deterministic: the same ranked units and caps give the
// same order. Units move down, never out, except a duplicate of an original already placed. The anonymous author is not known here:
// a unit carries only the flag, and an anonymous unit is its own creator.
import type { FeedConfig } from './config.js';

export type RerankUnit = {
  id: string;
  /** `posts.shared_post_id`: set on a share, null on an original. */
  sharedPostId: string | null;
  /** The named author. Null for an anonymous unit (the column is null there); never read for one. */
  authorId: string | null;
  isAnonymous: boolean;
};

export type RerankCaps = Pick<FeedConfig, 'maxSameCreatorInWindow' | 'maxAnonymousInWindow' | 'diversityWindow'>;

/** The original post a unit belongs to: `coalesce(shared_post_id, id)`. */
export function groupOf(unit: RerankUnit): string {
  return unit.sharedPostId ?? unit.id;
}

function namedCreator(unit: RerankUnit): string | null {
  return unit.isAnonymous ? null : unit.authorId;
}

/** (1) keep the first-ranked unit of each original-and-its-shares group; (2) greedy placement under the two caps. */
export function rerank<T extends RerankUnit>(ranked: readonly T[], caps: RerankCaps): T[] {
  const seen = new Set<string>();
  const remaining: T[] = [];
  for (const unit of ranked) {
    const group = groupOf(unit);
    if (seen.has(group)) continue;
    seen.add(group);
    remaining.push(unit);
  }
  const placed: T[] = [];
  while (remaining.length > 0) {
    // Only the windows ending at the new slot are new: the earlier ones were judged when their last slot was filled.
    const tail = placed.slice(Math.max(0, placed.length - (caps.diversityWindow - 1)));
    const fits = (unit: T): boolean => {
      if (unit.isAnonymous) return tail.filter((t) => t.isAnonymous).length + 1 <= caps.maxAnonymousInWindow;
      const creator = namedCreator(unit);
      if (creator === null) return true;
      return tail.filter((t) => namedCreator(t) === creator).length + 1 <= caps.maxSameCreatorInWindow;
    };
    let index = remaining.findIndex(fits);
    if (index < 0) index = 0;
    const [chosen] = remaining.splice(index, 1);
    if (chosen) placed.push(chosen);
  }
  return placed;
}

export type FeedPageSelection<T> = {
  /** The page in display order. */
  units: T[];
  /** The last unit of the page in ranked order, before re-ranking, suppressed ones included; null on the last page. */
  cursorFrom: T | null;
};

/**
 * `ranked` is the fetch in ranked order, `pageSize + 1` long when there is more. The page is its first `pageSize` units and the
 * extra one only says "more exists". The next cursor is built from the last of those `pageSize` in ranked order, not display order,
 * so a unit displaced by the caps or dropped as a duplicate is neither repeated nor skipped on the next page.
 */
export function selectFeedPage<T extends RerankUnit>(ranked: readonly T[], config: FeedConfig): FeedPageSelection<T> {
  const page = ranked.slice(0, config.pageSize);
  const hasMore = ranked.length > config.pageSize;
  return { units: rerank(page, config), cursorFrom: hasMore ? (page[page.length - 1] ?? null) : null };
}
