import { createContext, useContext } from 'react';
import { createAuthPort, type AuthPort } from '@/services/auth/auth-client';

// The default is the real Auth client, created once and only used when sign-up is pressed. App takes an `authPort` prop and
// tests wrap a screen in AuthPortContext, so a fake answers instead of the network.
export const AuthPortContext = createContext<AuthPort>(createAuthPort());

export function useAuthPort(): AuthPort {
  return useContext(AuthPortContext);
}
