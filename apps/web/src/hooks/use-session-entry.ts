import { createContext, useContext } from 'react';
import type { SessionEntry } from '@/services/session/session-source';

// How a screen tells the app that a session now exists (after registration): null when the source cannot take one.
export const SessionEntryContext = createContext<SessionEntry | null>(null);

export function useSessionEntry(): SessionEntry | null {
  return useContext(SessionEntryContext);
}
