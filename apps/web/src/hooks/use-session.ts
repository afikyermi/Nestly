import { createContext, useContext, useSyncExternalStore } from 'react';
import type { SessionNotice, SessionState, SessionStore } from '@/services/session/session-source';

export const SessionContext = createContext<SessionStore | null>(null);

export interface Session {
  state: SessionState;
  /** Why the session ended by itself (expired, or the account is stopped); null otherwise. */
  notice: SessionNotice | null;
  /** The account is active but has not saved its recovery questions: the guard holds it on the questions screen (F1.6). */
  needsRecoveryQuestions: boolean;
  signOut: () => Promise<void>;
}

// The one way a screen learns about the session: its state, why it ended, and the sign-out action.
export function useSession(): Session {
  const store = useContext(SessionContext);
  if (store === null) throw new Error('useSession is used outside a SessionProvider.');
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const notice = useSyncExternalStore(store.subscribe, store.getNotice);
  const needsRecoveryQuestions = useSyncExternalStore(store.subscribe, store.getNeedsRecoveryQuestions);
  return { state, notice, needsRecoveryQuestions, signOut: store.signOut };
}
