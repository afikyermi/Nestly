import { useEffect, useRef, useState } from 'react';
import { normalizeSearchText, SEARCH_QUERY_MIN, type SearchResponse } from '@nestly/shared';
import { useSessionAccount } from '@/hooks/use-session-account';
import { fetchSearch } from '@/services/api/search';

export type SearchView =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'results'; data: SearchResponse }
  | { kind: 'failed' };

/** Results are kept for a minute per text: the dropdown and the results screen share one search, so one typed text counts once (NFR-SEC-006). */
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; data: SearchResponse }>();

/** How long typing must pause before a search runs (a search counts against the hourly limit, so it never runs per keystroke). */
export const DEBOUNCE_MS = 600;

/**
 * The results of `text` (all kinds at once), after a pause in typing and only from the minimum length. The text is the caller's, trimmed and
 * folded here the way the server does. A new text cancels the previous one.
 */
export function useSearch(text: string, enabled = true, retry = 0): SearchView {
  const account = useSessionAccount();
  const [view, setView] = useState<SearchView>({ kind: 'idle' });
  const runs = useRef(0);
  const normalized = normalizeSearchText(text);

  useEffect(() => {
    const run = (runs.current += 1);
    if (!enabled || [...normalized].length < SEARCH_QUERY_MIN) {
      setView({ kind: 'idle' });
      return;
    }
    const hit = cache.get(normalized);
    if (retry === 0 && hit !== undefined && Date.now() - hit.at < CACHE_MS) {
      setView({ kind: 'results', data: hit.data });
      return;
    }
    setView({ kind: 'loading' });
    const timer = setTimeout(() => {
      void (async () => {
        const accessToken = account === null ? null : await account.getAccessToken().catch(() => null);
        const outcome = accessToken === null ? ({ kind: 'failed' } as const) : await fetchSearch(accessToken, normalized, 'all');
        if (run !== runs.current) return;
        if (outcome.kind === 'results') {
          cache.set(normalized, { at: Date.now(), data: outcome.data });
          setView({ kind: 'results', data: outcome.data });
        } else {
          if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
          setView({ kind: 'failed' });
        }
      })();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [normalized, enabled, account, retry]);

  return view;
}

/** Test seam: forget the kept results. */
export function clearSearchCache(): void {
  cache.clear();
}
