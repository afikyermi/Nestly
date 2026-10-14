import { BrowserRouter } from 'react-router';
import { productionSessionSource } from '@/services/session/production-session-source';
import type { SessionSource } from '@/services/session/session-source';
import { AppRoutes } from './AppRoutes';
import { SessionProvider } from './SessionProvider';

export interface AppProps {
  /** Where the session comes from. The deployed app uses the production source. */
  sessionSource?: SessionSource;
}

export function App({ sessionSource = productionSessionSource }: AppProps) {
  return (
    <SessionProvider source={sessionSource}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </SessionProvider>
  );
}
