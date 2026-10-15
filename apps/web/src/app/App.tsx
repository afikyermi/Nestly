import { BrowserRouter } from 'react-router';
import { AuthPortContext } from '@/hooks/use-auth-port';
import type { AuthPort } from '@/services/auth/auth-client';
import { productionSessionSource } from '@/services/session/production-session-source';
import type { SessionSource } from '@/services/session/session-source';
import { AppRoutes } from './AppRoutes';
import { SessionProvider } from './SessionProvider';

export interface AppProps {
  /** Where the session comes from. The deployed app uses the production source. */
  sessionSource?: SessionSource;
  /** The Auth client registration signs up with. Default: the real one. Tests pass a fake. */
  authPort?: AuthPort;
}

export function App({ sessionSource = productionSessionSource, authPort }: AppProps) {
  const routes = (
    <SessionProvider source={sessionSource}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </SessionProvider>
  );
  return authPort === undefined ? routes : <AuthPortContext value={authPort}>{routes}</AuthPortContext>;
}
