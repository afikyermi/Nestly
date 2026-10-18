import type { FeedUnit } from '@nestly/shared';

// What the feed remembers for one browser session so that Back from a post restores the loaded pages and the scroll (F3.2 c20). Memory
// only: a reload starts a new snapshot. It belongs to the signed-in session, not to a user id (Auth may not tell one): ending the
// session forgets it (RouteGuard), so another user never sees it.
export interface FeedScroll {
  main: number;
  page: number;
}

export interface RememberedFeed {
  items: FeedUnit[];
  nextCursor: string | null;
  scroll: FeedScroll;
}

let remembered: RememberedFeed | null = null;

export function rememberFeed(items: FeedUnit[], nextCursor: string | null): void {
  remembered = { items, nextCursor, scroll: remembered?.scroll ?? { main: 0, page: 0 } };
}

export function rememberScroll(scroll: FeedScroll): void {
  if (remembered !== null) remembered = { ...remembered, scroll };
}

export function recallFeed(): RememberedFeed | null {
  return remembered;
}

export function forgetFeed(): void {
  remembered = null;
}
