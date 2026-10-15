import { BrowserRouter } from 'react-router';
import { AuthPortContext } from '@/hooks/use-auth-port';
import { browserStorage } from '@/platform/browser-storage';
import { windowBrowserEvents } from '@/platform/browser-events';
import { fetchAccountState } from '@/services/api/account-state';
import { createAuthPort, type AuthPort } from '@/services/auth/auth-client';
import { AUTH_STORAGE_KEY } from '@/services/auth/storage-key';
import { createAuthSessionSource } from '@/services/session/auth-session-source';
import type { SessionSource } from '@/services/session/session-source';
import { AppRoutes } from './AppRoutes';
import { SessionProvider } from './SessionProvider';

// The deployed app's wiring (F1.5): one real Auth port, shared by registration and the session source, so there is a single Auth
// client and a single stored session; and the session source over it, checked against the server. Nothing is read or called
// until the app first listens, so a visitor with no stored session makes no request. The browser adapters (platform/) are
// handed in here; hooks and services only name their types.
const productionAuthPort = createAuthPort(undefined, { keyValueStorage: browserStorage() });
const productionSessionSource = createAuthSessionSource({
  auth: productionAuthPort,
  accountState: fetchAccountState,
  now: () => Date.now(),
  events: windowBrowserEvents(AUTH_STORAGE_KEY),
});

export interface AppProps {
  /** Where the session comes from. The deployed app uses the production source. */
  sessionSource?: SessionSource;
  /** The Auth client registration signs up with. Default: the real one. Tests pass a fake. */
  authPort?: AuthPort;
}

export function App({ sessionSource = productionSessionSource, authPort = productionAuthPort }: AppProps) {
  return (
    <AuthPortContext value={authPort}>
      <SessionProvider source={sessionSource}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </SessionProvider>
    </AuthPortContext>
  );
}
