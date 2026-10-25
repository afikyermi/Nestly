import { useSyncExternalStore } from 'react';

// The Chat unread count as the Top Bar's Chat button last read it (FR-CHAT-001, BR-036), for the one other place that shows it: a
// Professional's "שיחות" tab (I11 completion C, §11.20). Held here so the count is asked for once and a change re-renders only the badge, not
// the shell around the screen. No browser API; lost on reload, which reads it again.

let count = 0;
const listeners = new Set<() => void>();

export function publishChatUnread(next: number): void {
  if (next === count) return;
  count = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const read = (): number => count;

export function useChatUnread(): number {
  return useSyncExternalStore(subscribe, read, read);
}
