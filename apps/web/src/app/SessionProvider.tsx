import { useMemo, type ReactNode } from 'react';
import { SessionContext } from '@/hooks/use-session';
import { SessionEntryContext } from '@/hooks/use-session-entry';
import { createSessionStore, isSessionEntry, type SessionSource } from '@/services/session/session-source';

export interface SessionProviderProps {
  source: SessionSource;
  children: ReactNode;
}

// Puts the session store, wrapped around one source, in reach of useSession, and the source's way to take a session
// (registration, F1.4) in reach of useSessionEntry.
export function SessionProvider({ source, children }: SessionProviderProps) {
  const store = useMemo(() => createSessionStore(source), [source]);
  const entry = isSessionEntry(source) ? source : null;
  return (
    <SessionContext value={store}>
      <SessionEntryContext value={entry}>{children}</SessionEntryContext>
    </SessionContext>
  );
}
