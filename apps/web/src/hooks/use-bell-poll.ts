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
