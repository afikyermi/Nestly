import { createContext, useContext } from 'react';
import type { SessionAccount } from '@/services/session/session-source';

// How the login and completion screens sign in with a password, ask for the account state again and read the token: null when
// the source cannot (the test-only source).
export const SessionAccountContext = createContext<SessionAccount | null>(null);

export function useSessionAccount(): SessionAccount | null {
  return useContext(SessionAccountContext);
}
