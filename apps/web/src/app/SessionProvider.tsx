import { useMemo, type ReactNode } from 'react';
import { SessionContext } from '@/hooks/use-session';
import { createSessionStore, type SessionSource } from '@/services/session/session-source';

export interface SessionProviderProps {
  source: SessionSource;
  children: ReactNode;
}

// Puts the session store, wrapped around one source, in reach of useSession.
export function SessionProvider({ source, children }: SessionProviderProps) {
  const store = useMemo(() => createSessionStore(source), [source]);
  return <SessionContext value={store}>{children}</SessionContext>;
}
