import { createContext, useContext } from 'react';
import type { AuthPort } from '@/services/auth/auth-client';
import { browserAuthPort } from '@/services/auth/browser-auth-port';

// The default is the real Auth client, shared with the session source and only used when sign-up is pressed. App takes an
// `authPort` prop and tests wrap a screen in AuthPortContext, so a fake answers instead of the network.
export const AuthPortContext = createContext<AuthPort>(browserAuthPort);

export function useAuthPort(): AuthPort {
  return useContext(AuthPortContext);
}
