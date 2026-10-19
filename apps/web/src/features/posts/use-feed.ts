import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedUnit } from '@nestly/shared';
import { NavigationType, useNavigationType } from 'react-router';
import { FEED_LOAD_FAILED_TEXT } from './feed-texts';
import { useSessionAccount } from '@/hooks/use-session-account';
import { userIdOfAccessToken } from '@/lib/access-token';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { fetchFeedPage } from '@/services/api/feed';
import { setLike } from '@/services/api/likes';
import { deletePost } from '@/services/api/posts';
import { setHidden } from '@/services/api/post-hides';
import { LIKE_FAILED_TEXT } from './comments-texts';
import { forgetFeed, recallFeed, rememberFeed, type FeedScroll } from './feed-memory';
import { INITIAL_FEED, withHideResult, withLike, withoutHidden, withPage, withPublished, type FeedState, type HideResult } from './feed-state';
import { HIDDEN_STATUS, HIDE_FAILED_TEXT, OWN_POST_HIDE_TEXT, UNDO_FAILED_TEXT, UNHIDDEN_STATUS } from './hide-texts';
import { DELETE_FAILED_TEXT, DELETED_STATUS, POST_UNAVAILABLE_TEXT } from './posts-texts';
import { failureText } from './post-outcome';
import type { ReportResult } from '@/hooks/use-report';
import { ALREADY_REPORTED_STATUS, POST_REPORTED_STATUS, REPORT_UNAVAILABLE_STATUS } from '@/lib/report-texts';

export interface FeedFlow {
  state: FeedState;
  /** Fetch the page after `nextCursor`. */
  loadMore: () => void;
  /** Send the failed request again: the first page, or the same cursor. */
  retry: () => void;
  /** Toggle the viewer's like on a unit: the count moves at once, one request at a time per unit, reverted when it fails. */
  toggleLike: (unitId: string) => void;
  /** Hide a unit for the viewer (one PUT; F3.9 c9), or undo that hide (one DELETE). One request at a time per unit. */
  hide: (unitId: string) => void;
  undoHide: (unitId: string) => void;
  /** Delete the viewer's own post (one DELETE; F3.9 c13): on 204 or 404 the card goes and "הפוסט נמחק" is said; else the failure text. */
  remove: (unitId: string) => Promise<{ ok: true } | { ok: false; failure: string }>;
  /** A post just published by the viewer goes first in the loaded list (no request; the next snapshot shows only the server's order). */
  addPublished: (unit: FeedUnit) => void;
  /**
   * After a report of a unit's post (F3.7 c13; 7א): filed or already filed, the card goes (also from Back's memory) and the status is said;
   * 404, the card stays and the status is said. The report itself is the window's (useReport).
   */
  reported: (unitId: string, result: ReportResult) => void;
  /** The scroll to go back to when the list came from memory, else null. */
  restoredScroll: FeedScroll | null;
}

// The feed's flow (F3.2b): the first page, the next ones on demand (one request at a time), a retry that re-sends the same cursor, and
// Back's restore. The server and RLS decide what is in the feed; this only asks, keeps what came (the service validates it) and never
// reads, builds or shows a cursor. A refused token (401) or a stopped account (403) asks the session for the account state again
// (ERR-038, ERR-037).
export function useFeed(onRestart: () => void): FeedFlow {
  const account = useSessionAccount();
  // How the screen was reached, read once: an overlay's own history entry (a card's menu, F3.9) changes the type without leaving the feed.
  const [navigationType] = useState(useNavigationType());
  const [state, setState] = useState<FeedState>(INITIAL_FEED);
  const [restoredScroll, setRestoredScroll] = useState<FeedScroll | null>(null);
  const busy = useRef(false);
  const flying = useRef(new Set<string>());
  const flyingHides = useRef(new Set<string>());
  const latest = useRef(state);
  latest.current = state;
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
    if (state.phase === 'ready' || state.phase === 'more-error') rememberFeed(withoutHidden(state.items, state.hiddenIds), state.nextCursor, owner.current);
  }, [state.phase, state.items, state.nextCursor, state.hiddenIds]);

  const loadMore = useCallback(() => {
    if (state.phase === 'ready' && state.nextCursor !== null) void run(state.nextCursor, false);
  }, [run, state.phase, state.nextCursor]);

  const retry = useCallback(() => {
    if (state.phase === 'first-error') void run(null, true);
    else if (state.phase === 'more-error' && state.nextCursor !== null) void run(state.nextCursor, true);
  }, [run, state.phase, state.nextCursor]);

  const toggleLike = useCallback(
    async (unitId: string) => {
      if (flying.current.has(unitId)) return;
      const before = latest.current.items.find((unit) => unit.id === unitId)?.likedByMe;
      if (before === undefined) return;
      flying.current.add(unitId);
      const apply = (liked: boolean, likeStatus: string) =>
        setState((current) => ({ ...current, likeStatus, hideStatus: '', items: withLike(current.items, unitId, liked) }));
      apply(!before, '');
      try {
        const token = account === null ? null : await account.getAccessToken().catch(() => null);
        const outcome = token === null ? ({ kind: 'failed' } as const) : await setLike(token, 'posts', unitId, !before);
        if (outcome.kind === 'done') return;
        if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
        apply(before, outcome.kind === 'account-unavailable' ? STOPPED_TEXT : LIKE_FAILED_TEXT);
      } finally {
        flying.current.delete(unitId);
      }
    },
    [account],
  );

  // A hide or an undo (F3.9 c9, c11): the card changes only on the server's answer, never before it. The placeholder stays only while this
  // screen is mounted; a hidden unit is never kept for Back (the remember effect above).
  const changeHidden = useCallback(
    async (unitId: string, hidden: boolean) => {
      if (flyingHides.current.has(unitId)) return;
      const current = latest.current;
      if (!current.items.some((unit) => unit.id === unitId) || current.hiddenIds.includes(unitId) === hidden) return;
      flyingHides.current.add(unitId);
      setState((now) => ({ ...now, pendingHideIds: [...now.pendingHideIds, unitId] }));
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      const outcome = token === null ? ({ kind: 'failed' } as const) : await setHidden(token, unitId, hidden);
      flyingHides.current.delete(unitId);
      if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
      const stopped = outcome.kind === 'account-unavailable' ? STOPPED_TEXT : undefined;
      let result: HideResult;
      if (outcome.kind === 'done') result = hidden ? { kind: 'hidden', status: HIDDEN_STATUS } : { kind: 'unhidden', status: UNHIDDEN_STATUS };
      else if (!hidden) result = { kind: 'undo-failed', status: stopped ?? UNDO_FAILED_TEXT };
      else if (outcome.kind === 'unavailable') result = { kind: 'removed', status: POST_UNAVAILABLE_TEXT };
      else if (outcome.kind === 'own-post') result = { kind: 'hide-failed', status: OWN_POST_HIDE_TEXT };
      else result = { kind: 'hide-failed', status: stopped ?? HIDE_FAILED_TEXT };
      setState((now) => withHideResult(now, unitId, result));
    },
    [account],
  );

  const remove = useCallback(
    async (unitId: string): Promise<{ ok: true } | { ok: false; failure: string }> => {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      const outcome = token === null ? ({ kind: 'failed' } as const) : await deletePost(token, unitId);
      if (outcome.kind === 'deleted' || outcome.kind === 'unavailable') {
        setState((now) => withHideResult(now, unitId, { kind: 'removed', status: DELETED_STATUS }));
        return { ok: true };
      }
      if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
      return { ok: false, failure: outcome.kind === 'account-unavailable' ? STOPPED_TEXT : failureText(outcome, DELETE_FAILED_TEXT) };
    },
    [account],
  );

  const addPublished = useCallback((unit: FeedUnit) => setState((current) => withPublished(current, unit)), []);
  const reported = useCallback((unitId: string, result: ReportResult) => {
    const outcome: HideResult =
      result === 'unavailable'
        ? { kind: 'noted', status: REPORT_UNAVAILABLE_STATUS }
        : { kind: 'removed', status: result === 'received' ? POST_REPORTED_STATUS : ALREADY_REPORTED_STATUS };
    setState((now) => withHideResult(now, unitId, outcome));
  }, []);

  return {
    state,
    remove,
    reported,
    loadMore,
    retry,
    toggleLike: (unitId) => void toggleLike(unitId),
    hide: (unitId) => void changeHidden(unitId, true),
    undoHide: (unitId) => void changeHidden(unitId, false),
    addPublished,
    restoredScroll,
  };
}
