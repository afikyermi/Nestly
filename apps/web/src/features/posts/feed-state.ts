import type { FeedPageResponse, FeedUnit } from '@nestly/shared';
import { loadedMoreText } from './feed-texts';

/**
 * initial: no page yet (skeleton) · ready: a page arrived (the list, or the empty state) · first-error / more-error: the request for the
 * first / a later page failed · blocked: the server says this account has no feed (a Professional).
 */
export type FeedPhase = 'initial' | 'ready' | 'first-error' | 'more-error' | 'blocked';

export interface FeedState {
  phase: FeedPhase;
  /** A request is in flight. */
  loading: boolean;
  items: FeedUnit[];
  nextCursor: string | null;
  /** The failure text of an error phase. */
  message: string;
  /** What the polite region says; changes only with a loaded page. */
  announcement: string;
  /** Counts the announcements, so two equal texts in a row are still spoken. */
  announcementTick: number;
  /** Position (0-based) of the card focus moves to after a successful retry, else null. */
  focusIndex: number | null;
}

export const INITIAL_FEED: FeedState = {
  phase: 'initial',
  loading: false,
  items: [],
  nextCursor: null,
  message: '',
  announcement: '',
  announcementTick: 0,
  focusIndex: null,
};

/** The units of `page` not shown yet (by unit id), each once. */
export function freshUnits(shown: readonly FeedUnit[], page: readonly FeedUnit[]): FeedUnit[] {
  const seen = new Set(shown.map((unit) => unit.id));
  return page.filter((unit) => {
    if (seen.has(unit.id)) return false;
    seen.add(unit.id);
    return true;
  });
}

/** A loaded page joins the list (de-duplicated by unit id), or replaces it: the first page and `restarted` (a new snapshot). */
export function withPage(state: FeedState, page: FeedPageResponse, firstPage: boolean, afterRetry: boolean): FeedState {
  const replace = firstPage || page.restarted === true;
  const kept = replace ? [] : state.items;
  const added = freshUnits(kept, page.items);
  const announced = !replace && added.length > 0;
  return {
    ...state,
    phase: 'ready',
    loading: false,
    items: [...kept, ...added],
    nextCursor: page.nextCursor,
    message: '',
    announcement: announced ? loadedMoreText(added.length) : '',
    announcementTick: announced ? state.announcementTick + 1 : state.announcementTick,
    focusIndex: afterRetry && added.length > 0 ? kept.length : null,
  };
}
