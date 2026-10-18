import type { FeedUnit } from '@nestly/shared';

// What the feed remembers for one browser session so that Back from a post restores the loaded pages and the scroll (F3.2 c20). Memory
// only: a reload starts a new snapshot. It carries the user id the access token named when it was kept, and is restored only for a token
// naming the same id (an unknown id never restores); ending the session also forgets it (RouteGuard).
export interface FeedScroll {
  main: number;
  page: number;
}

export interface RememberedFeed {
  items: FeedUnit[];
  nextCursor: string | null;
  /** The token owner at the time (null: unknown, so never restored). */
  owner: string | null;
  scroll: FeedScroll;
}

let remembered: RememberedFeed | null = null;

export function rememberFeed(items: FeedUnit[], nextCursor: string | null, owner: string | null): void {
  remembered = { items, nextCursor, owner, scroll: remembered?.scroll ?? { main: 0, page: 0 } };
}

export function rememberScroll(scroll: FeedScroll): void {
  if (remembered !== null) remembered = { ...remembered, scroll };
}

/** The remembered feed, only when `owner` (the current token's user id) is known and is the one it was kept for. */
export function recallFeed(owner: string | null): RememberedFeed | null {
  return remembered !== null && owner !== null && remembered.owner === owner ? remembered : null;
}

export function forgetFeed(): void {
  remembered = null;
}
