import { useCallback, useRef, useState } from 'react';
import { checkCreateShare, shareTargetOf, type FeedUnit, type PostAudience, type PostPageView, type ShareReadView } from '@nestly/shared';
import { useAudienceMemory } from '@/hooks/use-audience-memory';
import { useSessionAccount } from '@/hooks/use-session-account';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { createShare } from '@/services/api/shares';
import { NOT_SHAREABLE_TEXT, SHARE_FAILED_TEXT } from './share-texts';

/**
 * What the window quotes of the post being shared (c10): its author (a null name: "מהקהילה"; no author: the name is not known here, as on a
 * plain post's own page, and the line is left out), text, audience and time.
 */
export interface ShareQuote {
  author: { name: string | null } | null;
  body: string;
  audience: PostAudience;
  createdAt: string;
}

/** The open share window: who opened it, what is shared and quoted, what was written and chosen, and the request. */
export interface ShareFeedDraft {
  /** The card (or post page) whose "שיתוף בפיד" opened the window: focus goes back to it. */
  openerId: string;
  /** The post the share names: the post itself, or a share's original (BR-066). */
  targetId: string;
  quote: ShareQuote;
  text: string;
  audience: PostAudience;
  /** The text is over the limit; shown from the first refused send, then on every change. */
  tooLong: boolean;
  validating: boolean;
  sending: boolean;
  /** Why the last send failed, in the window, the text kept: not shareable (no retry), or ERR-004 / the session's text (retry). */
  failure: { text: string; retry: boolean } | null;
  /** Focus the text box, once per tick (after a refused send). */
  focusTick: number;
}

export interface ShareInFeedFlow {
  draft: ShareFeedDraft | null;
  /** Opens the window for a unit; nothing happens for one that cannot be shared. */
  start: (unit: FeedUnit | PostPageView) => void;
  changeText: (text: string) => void;
  changeAudience: (audience: PostAudience) => void;
  /** Checks by the shared rule and sends one request; a second press while it is in flight sends nothing. */
  send: () => void;
  /** Closes the window with no request (ביטול, Escape, a press outside, Back). Not while the request is in flight. */
  cancel: () => void;
}

/** The quoted post: a named post itself (the post page's own read has no name), or a share's available original. */
function quoteOf(unit: FeedUnit | PostPageView): ShareQuote | null {
  if (unit.kind === 'share') {
    const { original } = unit;
    return original.available ? { author: original.author, body: original.body, audience: original.audience, createdAt: original.createdAt } : null;
  }
  if (unit.isAnonymous || unit.body === null) return null;
  return { author: 'author' in unit ? unit.author : null, body: unit.body, audience: unit.audience, createdAt: unit.createdAt };
}

// The share-in-feed window's flow (F3.5 c10, c11; FR-FEED-006): one window at a time, the text and the audience (preselected from the
// composer's stored choice, 1א, and stored again by a share that went through), the check (the same shared rule the server applies) and one
// POST. The server and the database decide what may be shared; a refusal keeps the window with what was written. A share that went through
// closes it and goes to `onShared`; a refusal of the caller (403 not_allowed) closes it and goes to `onNotAllowed`. A refused token (401) or
// a stopped account asks the session for the account state again (ERR-038, ERR-037).
export function useShareInFeed(
  owner: string | null,
  onShared: (share: ShareReadView, openerId: string) => void,
  onNotAllowed: (openerId: string) => void,
): ShareInFeedFlow {
  const account = useSessionAccount();
  const memory = useAudienceMemory(owner);
  const [draft, setDraft] = useState<ShareFeedDraft | null>(null);
  const busy = useRef(false);
  const latest = useRef(draft);
  latest.current = draft;
  const done = useRef({ onShared, onNotAllowed });
  done.current = { onShared, onNotAllowed };

  const start = useCallback(
    (unit: FeedUnit | PostPageView) => {
      if (busy.current) return;
      const targetId = shareTargetOf(unit);
      const quote = quoteOf(unit);
      if (targetId === null || quote === null) return;
      const audience = memory.read() ?? 'everyone';
      setDraft({ openerId: unit.id, targetId, quote, text: '', audience, tooLong: false, validating: false, sending: false, failure: null, focusTick: 0 });
    },
    [memory],
  );

  const changeText = useCallback((text: string) => {
    setDraft((now) => {
      if (now === null) return null;
      const checked = checkCreateShare({ text, audience: now.audience });
      return { ...now, text, tooLong: now.validating && !checked.ok && checked.reason === 'body_too_long' };
    });
  }, []);

  const send = useCallback(async () => {
    const now = latest.current;
    if (now === null || busy.current) return;
    const checked = checkCreateShare({ text: now.text, audience: now.audience });
    if (!checked.ok) {
      setDraft({ ...now, validating: true, tooLong: checked.reason === 'body_too_long', failure: null, focusTick: now.focusTick + 1 });
      return;
    }
    busy.current = true;
    setDraft({ ...now, tooLong: false, failure: null, sending: true });
    try {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      const outcome = token === null ? ({ kind: 'failed' } as const) : await createShare(token, now.targetId, checked.value);
      if (outcome.kind === 'shared') {
        memory.write(now.audience);
        setDraft(null);
        done.current.onShared(outcome.share, now.openerId);
        return;
      }
      if (outcome.kind === 'not-allowed') {
        setDraft(null);
        done.current.onNotAllowed(now.openerId);
        return;
      }
      if (outcome.kind === 'too-long') {
        setDraft((current) => (current === null ? null : { ...current, sending: false, validating: true, tooLong: true, focusTick: current.focusTick + 1 }));
        return;
      }
      if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
      const failure =
        outcome.kind === 'not-shareable'
          ? { text: NOT_SHAREABLE_TEXT, retry: false }
          : { text: outcome.kind === 'account-unavailable' ? STOPPED_TEXT : SHARE_FAILED_TEXT, retry: outcome.kind !== 'account-unavailable' };
      setDraft((current) => (current === null ? null : { ...current, sending: false, failure }));
    } finally {
      busy.current = false;
    }
  }, [account, memory]);

  return {
    draft,
    start,
    changeText,
    changeAudience: (audience) => setDraft((now) => (now === null ? null : { ...now, audience })),
    send: () => void send(),
    cancel: () => {
      if (!busy.current) setDraft(null);
    },
  };
}

/** The window's values of an open draft (ShareFeedSheet), less its actions and where focus returns, which the screen gives. */
export function shareFeedSheetValues(draft: ShareFeedDraft) {
  const { quote, text, audience, tooLong, sending, failure, focusTick } = draft;
  return { quote, text, audience, tooLong, sending, failure, focusTick };
}
