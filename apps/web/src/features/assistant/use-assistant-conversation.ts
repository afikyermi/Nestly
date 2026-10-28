import { ASSISTANT_HISTORY_MAX, assistantTextProblem, isUrgentAssistantText, type AssistantTurn } from '@nestly/shared';
import { useCallback, useRef, useState } from 'react';
import { useSessionAccount } from '@/hooks/use-session-account';
import { askAssistant, fetchAssistantStatus, type AssistantResult } from '@/services/api/assistant';

// The Nestly assistant's conversation (Afik 28.10.2026; FR-AI-001, BR-093, NFR-PRIV-008). Kept in memory only, in the protected layout: it stays
// while the user moves between screens and is gone on a refresh or sign-out. Nothing is saved. Each message goes with the last few answered
// messages of this conversation (ASSISTANT_HISTORY_MAX) and nothing else. The urgent banner comes from the typed text (BR-093), not the model.

export type AssistantEntry =
  | { readonly id: number; readonly kind: 'user'; readonly text: string; readonly urgent: boolean }
  | { readonly id: number; readonly kind: 'assistant'; readonly text: string }
  | { readonly id: number; readonly kind: 'notice'; readonly notice: 'unavailable' | 'rate-limited' };

export type AssistantAvailability = 'unknown' | 'available' | 'unavailable';

/** The answered turns to send with a new message: user/answer pairs only (a message with no answer is left out), the last few. */
export function historyOf(entries: readonly AssistantEntry[]): AssistantTurn[] {
  const turns: AssistantTurn[] = [];
  entries.forEach((entry, index) => {
    const next = entries[index + 1];
    if (entry.kind === 'user' && next?.kind === 'assistant') turns.push({ role: 'user', text: entry.text }, { role: 'assistant', text: next.text });
  });
  return turns.slice(-ASSISTANT_HISTORY_MAX);
}

export function useAssistantConversation() {
  const account = useSessionAccount();
  const [entries, setEntries] = useState<readonly AssistantEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [availability, setAvailability] = useState<AssistantAvailability>('unknown');
  const nextId = useRef(1);
  const busy = useRef(false);

  const withToken = useCallback(
    async <T,>(run: (token: string) => Promise<AssistantResult<T>>): Promise<AssistantResult<T>> => {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      if (token === null) return { kind: 'unavailable' };
      const result = await run(token);
      if (result.kind === 'unauthenticated') void account?.recheck();
      return result;
    },
    [account],
  );

  /**
   * Asks whether the assistant can answer, each time the window opens until it is known to be available. Only the server's own "no" makes it
   * unavailable; a failed check leaves it unknown, so the composer stays and a failed send says so in the thread (ERR-055).
   */
  const checkAvailability = useCallback(async () => {
    if (availability === 'available') return;
    const result = await withToken(fetchAssistantStatus);
    if (result.kind === 'ok') setAvailability(result.value.available ? 'available' : 'unavailable');
  }, [availability, withToken]);

  /** Sends one message; returns false (nothing sent) when the text breaks VAL-053 or a message is on its way. */
  const send = useCallback(
    async (raw: string): Promise<boolean> => {
      if (busy.current || assistantTextProblem(raw) !== null) return false;
      const text = raw.trim();
      busy.current = true;
      setSending(true);
      const history = historyOf(entries);
      const userEntry: AssistantEntry = { id: nextId.current++, kind: 'user', text, urgent: isUrgentAssistantText(text) };
      setEntries((current) => [...current, userEntry]);
      const result = await withToken((token) => askAssistant(token, text, history));
      const reply: AssistantEntry =
        result.kind === 'ok'
          ? { id: nextId.current++, kind: 'assistant', text: result.value.answer }
          : { id: nextId.current++, kind: 'notice', notice: result.kind === 'rate-limited' ? 'rate-limited' : 'unavailable' };
      setEntries((current) => [...current, reply]);
      busy.current = false;
      setSending(false);
      return true;
    },
    [entries, withToken],
  );

  return { entries, sending, availability, checkAvailability, send };
}
