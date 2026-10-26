import { createContext, useContext } from 'react';

/** The Chat unread count the last light bell poll read; `seq` changes with every poll, so an equal count still reaches the Chat button. */
export interface BellPoll {
  readonly chatUnread: number;
  readonly seq: number;
}
export const BellPollContext = createContext<BellPoll | null>(null);

/** The latest light poll's Chat count (the notifications provider owns the poll), or null before the first one and outside a provider. */
export function useBellPoll(): BellPoll | null {
  return useContext(BellPollContext);
}

/** Asks for the bell's counters now (one light request); its Chat count lands in `useBellPoll`. */
export type BellRefresh = () => void;
export const BellRefreshContext = createContext<BellRefresh | null>(null);

/** The call that asks for the counters now, or null when there is none to ask: outside a provider, or an account with no notifications. */
export function useBellRefresh(): BellRefresh | null {
  return useContext(BellRefreshContext);
}
