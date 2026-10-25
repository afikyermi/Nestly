import { useCallback, useRef, useState } from 'react';
import { chatTextProblem } from '@nestly/shared';
import { useProCall } from '@/hooks/use-pro-call';
import { ACTION_FAILED, MESSAGE_TOO_LONG, OFFER_ALREADY, OFFER_LIMIT, OFFER_NOT_ALLOWED, OFFER_SENT, OFFER_TEXT_REQUIRED } from '@/lib/professional-texts';
import { offerHelp } from '@/services/api/professionals';

/** The open Offer Help window: the post, its first message, the check's result and the request. */
export interface OfferHelpDraft {
  postId: string;
  /** The post carries no name: the window says the identity stays hidden until an accept (AC-147). */
  isAnonymous: boolean;
  text: string;
  error: string | null;
  sending: boolean;
  /** Why the last send failed (the daily limit, a refusal, the network): the window stays with what was written. */
  failure: string | null;
}

export interface OfferHelpFlow {
  draft: OfferHelpDraft | null;
  /** Whether an offer on the post went in this visit (the card then says "נשלחה הצעה" before its next read). */
  isSent: (postId: string) => boolean;
  start: (postId: string, isAnonymous: boolean) => void;
  change: (text: string) => void;
  send: () => void;
  cancel: () => void;
}

// A Professional's Offer Help from a feed card or a post page (FR-SERV-005, BR-007..010; §13.2-13.3): one window at a time, the first message
// checked by the chat rule, one POST. One per post and 100 a day are the database's; their refusals keep the window open with the text that
// says so, but an offer already sent closes it as sent. `onDone` gets what to announce.
export function useOfferHelp(onDone: (postId: string, status: string) => void): OfferHelpFlow {
  const call = useProCall();
  const [draft, setDraft] = useState<OfferHelpDraft | null>(null);
  const [sent, setSent] = useState<ReadonlySet<string>>(() => new Set());
  const busy = useRef(false);
  const latest = useRef(draft);
  latest.current = draft;
  const done = useRef(onDone);
  done.current = onDone;

  const markSent = (postId: string) => setSent((now) => new Set([...now, postId]));

  const send = useCallback(async () => {
    const now = latest.current;
    if (now === null || busy.current) return;
    const problem = chatTextProblem(now.text);
    if (problem !== null) {
      setDraft({ ...now, error: problem === 'long' ? MESSAGE_TOO_LONG : OFFER_TEXT_REQUIRED, failure: null });
      return;
    }
    busy.current = true;
    setDraft({ ...now, error: null, failure: null, sending: true });
    try {
      const result = await call((token) => offerHelp(token, now.postId, now.text));
      if (result.kind === 'ok' || result.kind === 'already-done') {
        markSent(now.postId);
        setDraft(null);
        done.current(now.postId, result.kind === 'ok' ? OFFER_SENT : OFFER_ALREADY);
        return;
      }
      const failure = result.kind === 'rate-limited' ? OFFER_LIMIT : result.kind === 'not-allowed' ? OFFER_NOT_ALLOWED : ACTION_FAILED;
      setDraft((current) => (current === null ? null : { ...current, sending: false, failure }));
    } finally {
      busy.current = false;
    }
  }, [call]);

  return {
    draft,
    isSent: (postId) => sent.has(postId),
    start: (postId, isAnonymous) => {
      if (!busy.current) setDraft({ postId, isAnonymous, text: '', error: null, sending: false, failure: null });
    },
    change: (text) => setDraft((now) => (now === null ? null : { ...now, text, error: null })),
    send: () => void send(),
    cancel: () => {
      if (!busy.current) setDraft(null);
    },
  };
}
