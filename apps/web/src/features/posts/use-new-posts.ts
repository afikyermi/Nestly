import { useEffect, useRef, useState } from 'react';
import type { FeedUnit } from '@nestly/shared';
import { useSessionAccount } from '@/hooks/use-session-account';
import { useTabVisibility } from '@/hooks/use-tab-visibility';
import { fetchFeedPage } from '@/services/api/feed';

/** How often the feed looks for new posts while the reader is away from its top (and the tab is visible). */
const CHECK_EVERY_MS = 3 * 60_000;

/**
 * "N פוסטים חדשים" (FR-FEED-001, AC-207; redesign 27.10.2026): while the reader is scrolled away from the top of the community feed, the first
 * page is asked for again now and then, and the posts above the first one already shown are counted. Nothing in the list changes and nothing
 * moves: the screen shows the count, and only a press brings the new snapshot. Promoted units are not counted. At the top, or in a Group,
 * nothing is asked.
 */
export function useNewPosts(items: readonly FeedUnit[], away: boolean, enabled: boolean): { count: number; clear: () => void } {
  const account = useSessionAccount();
  const visibility = useTabVisibility();
  const [count, setCount] = useState(0);
  const latest = useRef(items);
  latest.current = items;

  useEffect(() => {
    if (!enabled || !away) return;
    let cancelled = false;
    const check = async () => {
      if (visibility !== null && visibility.isTabVisible?.() === false) return;
      const known = new Set(latest.current.map((unit) => unit.id));
      if (known.size === 0) return;
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
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [account, away, enabled, visibility]);

  return { count, clear: () => setCount(0) };
}
