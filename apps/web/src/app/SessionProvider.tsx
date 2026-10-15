import { useMemo, type ReactNode } from 'react';
import { SessionAccountContext } from '@/hooks/use-session-account';
import { SessionContext } from '@/hooks/use-session';
import { SessionEntryContext } from '@/hooks/use-session-entry';
import { createSessionStore, isSessionAccount, isSessionEntry, type SessionSource } from '@/services/session/session-source';

export interface SessionProviderProps {
  source: SessionSource;
  children: ReactNode;
}

// Puts the session store, wrapped around one source, in reach of useSession, the source's way to take a session
// (registration, F1.4) in reach of useSessionEntry, and its sign-in with a password (F1.5) in reach of useSessionAccount.
export function SessionProvider({ source, children }: SessionProviderProps) {
  const store = useMemo(() => createSessionStore(source), [source]);
  const entry = isSessionEntry(source) ? source : null;
  const account = isSessionAccount(source) ? source : null;
  return (
    <SessionContext value={store}>
      <SessionEntryContext value={entry}>
        <SessionAccountContext value={account}>{children}</SessionAccountContext>
      </SessionEntryContext>
    </SessionContext>
  );
}
