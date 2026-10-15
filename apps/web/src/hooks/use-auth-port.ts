import { createContext, useContext } from 'react';
import { createAuthPort, type AuthPort } from '@/services/auth/auth-client';

// App provides the real Auth client. Without a provider the default is a port that is not configured: it makes no request and
// answers "not configured". Tests wrap a screen in AuthPortContext, so a fake answers instead of the network.
export const AuthPortContext = createContext<AuthPort>(createAuthPort({ url: '', publishableKey: '' }));

export function useAuthPort(): AuthPort {
  return useContext(AuthPortContext);
}
