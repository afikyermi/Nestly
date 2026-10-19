import { useCallback, useEffect, useRef, useState } from 'react';
import { NavigationType, useNavigationType } from 'react-router';
import { FEED_LOAD_FAILED_TEXT } from './feed-texts';
import { useSessionAccount } from '@/hooks/use-session-account';
import { userIdOfAccessToken } from '@/lib/access-token';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { fetchFeedPage } from '@/services/api/feed';
import { forgetFeed, recallFeed, rememberFeed, type FeedScroll } from './feed-memory';
import { INITIAL_FEED, withPage, type FeedState } from './feed-state';

export interface FeedFlow {
  state: FeedState;
  /** Fetch the page after `nextCursor`. */
  loadMore: () => void;
  /** Send the failed request again: the first page, or the same cursor. */
  retry: () => void;
  /** The scroll to go back to when the list came from memory, else null. */
  restoredScroll: FeedScroll | null;
}

// The feed's flow (F3.2b): the first page, the next ones on demand (one request at a time), a retry that re-sends the same cursor, and
// Back's restore. The server and RLS decide what is in the feed; this only asks, keeps what came (the service validates it) and never
// reads, builds or shows a cursor. A refused token (401) or a stopped account (403) asks the session for the account state again
// (ERR-038, ERR-037).
export function useFeed(onRestart: () => void): FeedFlow {
  const account = useSessionAccount();
  const navigationType = useNavigationType();
  const [state, setState] = useState<FeedState>(INITIAL_FEED);
  const [restoredScroll, setRestoredScroll] = useState<FeedScroll | null>(null);
  const busy = useRef(false);
  const runs = useRef(0);
  const owner = useRef<string | null>(null);
  const restarted = useRef(onRestart);
  restarted.current = onRestart;

  const run = useCallback(
    async (cursor: string | null, afterRetry: boolean) => {
      if (busy.current) return;
      busy.current = true;
      const id = (runs.current += 1);
      setState((current) => ({ ...current, loading: true, focusIndex: null }));
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      const outcome = token === null ? ({ kind: 'failed' } as const) : await fetchFeedPage(token, cursor);
      if (id !== runs.current) return;
      if (outcome.kind === 'page') {
        busy.current = false;
        if (token !== null) owner.current = userIdOfAccessToken(token);
        if (cursor !== null && outcome.page.restarted === true) restarted.current();
        setState((current) => withPage(current, outcome.page, cursor === null, afterRetry));
        return;
      }
      busy.current = false;
      if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
      if (outcome.kind === 'not-allowed') {
        setState((current) => ({ ...current, phase: 'blocked', loading: false }));
        return;
      }
      const message = outcome.kind === 'account-unavailable' ? STOPPED_TEXT : FEED_LOAD_FAILED_TEXT;
      setState((current) => ({ ...current, phase: cursor === null ? 'first-error' : 'more-error', loading: false, message }));
    },
    [account],
  );

  // Back (a history pop) brings the remembered pages and scroll back, only when the current token names the user they were kept for (else
  // they are forgotten and the feed is fetched); anything else starts a new snapshot.
  useEffect(() => {
    let cancelled = false;
    const start = () => {
      forgetFeed();
      void run(null, false);
    };
    if (navigationType !== NavigationType.Pop) start();
    else {
      void (async () => {
        const token = account === null ? null : await account.getAccessToken().catch(() => null);
        if (cancelled) return;
        const current = token === null ? null : userIdOfAccessToken(token);
        const saved = recallFeed(current);
        if (saved === null) {
          start();
          return;
        }
        owner.current = current;
        setState({ ...INITIAL_FEED, phase: 'ready', items: saved.items, nextCursor: saved.nextCursor });
        setRestoredScroll(saved.scroll);
      })();
    }
    return () => {
      cancelled = true;
      runs.current += 1;
      busy.current = false;
    };
  }, [run, account, navigationType]);

  useEffect(() => {
    if (state.phase === 'ready' || state.phase === 'more-error') rememberFeed(state.items, state.nextCursor, owner.current);
  }, [state.phase, state.items, state.nextCursor]);

  const loadMore = useCallback(() => {
    if (state.phase === 'ready' && state.nextCursor !== null) void run(state.nextCursor, false);
  }, [run, state.phase, state.nextCursor]);

  const retry = useCallback(() => {
    if (state.phase === 'first-error') void run(null, true);
    else if (state.phase === 'more-error' && state.nextCursor !== null) void run(state.nextCursor, true);
  }, [run, state.phase, state.nextCursor]);

  return { state, loadMore, retry, restoredScroll };
}
