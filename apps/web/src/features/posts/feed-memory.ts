import type { FeedUnit } from '@nestly/shared';

// What the feed remembers for one browser session so that Back from a post restores the loaded pages and the scroll (F3.2 c20). Memory
// only: a reload starts a new snapshot. It belongs to one user id; another user, or an unknown one, gets nothing.
export interface FeedScroll {
  main: number;
  page: number;
}

export interface RememberedFeed {
  userId: string;
  items: FeedUnit[];
  nextCursor: string | null;
  scroll: FeedScroll;
}

let remembered: RememberedFeed | null = null;

export function rememberFeed(userId: string, items: FeedUnit[], nextCursor: string | null): void {
  remembered = { userId, items, nextCursor, scroll: remembered?.userId === userId ? remembered.scroll : { main: 0, page: 0 } };
}

export function rememberScroll(scroll: FeedScroll): void {
  if (remembered !== null) remembered = { ...remembered, scroll };
}

export function recallFeed(userId: string | null): RememberedFeed | null {
  return userId !== null && remembered?.userId === userId ? remembered : null;
}

export function forgetFeed(): void {
  remembered = null;
}
