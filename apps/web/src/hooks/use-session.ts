import { createContext, useContext, useSyncExternalStore } from 'react';
import type { SessionState, SessionStore } from '@/services/session/session-source';

export const SessionContext = createContext<SessionStore | null>(null);

export interface Session {
  state: SessionState;
  signOut: () => Promise<void>;
}

// The one way a screen learns about the session: its state, and the sign-out action.
export function useSession(): Session {
  const store = useContext(SessionContext);
  if (store === null) throw new Error('useSession is used outside a SessionProvider.');
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return { state, signOut: store.signOut };
}
