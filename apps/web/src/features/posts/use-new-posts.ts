import { useEffect, useRef, useState } from 'react';
import type { FeedUnit } from '@nestly/shared';
import { useSessionAccount } from '@/hooks/use-session-account';
import { useTabVisibility } from '@/hooks/use-tab-visibility';
import { fetchFeedPage } from '@/services/api/feed';

/** At most one look for new posts in this long (server load, Afik 28.10.2026). */
const AT_MOST_EVERY_MS = 3 * 60_000;

/**
 * "N פוסטים חדשים" (FR-FEED-001, AC-207; redesign 27.10.2026): when the reader comes back to the tab while away from the top of the community
 * feed, the first page is asked for again (at most once every three minutes, and no timer: an open feed asks nothing on its own) and the posts
 * above the first one already shown are counted. Nothing in the list changes and nothing moves: the screen shows the count, and only a press
 * brings the new snapshot. Promoted units are not counted. At the top, or in a Group, nothing is asked.
 */
export function useNewPosts(items: readonly FeedUnit[], away: boolean, enabled: boolean): { count: number; clear: () => void } {
  const account = useSessionAccount();
  const visibility = useTabVisibility();
  const [count, setCount] = useState(0);
  const latest = useRef(items);
  latest.current = items;
  // The feed's own first page counts as the last look.
  const lastAsked = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !away || visibility === null) return;
    lastAsked.current ??= Date.now();
    let cancelled = false;
    const check = async () => {
      if (lastAsked.current !== null && Date.now() - lastAsked.current < AT_MOST_EVERY_MS) return;
      const known = new Set(latest.current.map((unit) => unit.id));
      if (known.size === 0) return;
      lastAsked.current = Date.now();
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      if (token === null || cancelled) return;
      const outcome = await fetchFeedPage(token, null);
      if (cancelled || outcome.kind !== 'page') return;
      let fresh = 0;
      for (const unit of outcome.page.items) {
        if (known.has(unit.id)) break;
        if (unit.source === 'organic') fresh += 1;
      }
      setCount(fresh);
    };
    const stop = visibility.onTabVisible(() => void check());
    return () => {
      cancelled = true;
      stop();
    };
  }, [account, away, enabled, visibility]);

  return { count, clear: () => setCount(0) };
}
