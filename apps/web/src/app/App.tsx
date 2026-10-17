import { BrowserRouter } from 'react-router';
import { AuthPortContext } from '@/hooks/use-auth-port';
import { GoogleSignInContext } from '@/hooks/use-google-sign-in';
import { LinkCopierContext, type LinkCopier } from '@/hooks/use-copy-profile-link';
import { windowClipboard } from '@/platform/browser-clipboard';
import { windowNavigation } from '@/platform/browser-navigation';
import { browserStorage } from '@/platform/browser-storage';
import { windowBrowserEvents } from '@/platform/browser-events';
import { fetchAccountState } from '@/services/api/account-state';
import { createAuthPort, type AuthPort } from '@/services/auth/auth-client';
import { createGoogleSignIn, type GoogleSignIn } from '@/services/auth/google-sign-in';
import { AUTH_STORAGE_KEY } from '@/services/auth/storage-key';
import { createAuthSessionSource } from '@/services/session/auth-session-source';
import type { SessionSource } from '@/services/session/session-source';
import { AppRoutes } from './AppRoutes';
import { PATHS } from './paths';
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
const navigation = windowNavigation();
// The Google button (F1.8): the same Auth client builds the authorize URL; the browser leaves for it and Google returns to /auth/google.
const productionGoogleSignIn = createGoogleSignIn({
  auth: productionAuthPort,
  redirectTo: () => navigation.origin() + PATHS.googleEntry,
  leave: (url) => {
    navigation.leave(url);
  },
  onRestoredFromCache: (listener) => navigation.onRestoredFromCache(listener),
});
// The copy-my-profile-link button (F2.4c2): the app's address and the clipboard.
const clipboard = windowClipboard();
const productionLinkCopier: LinkCopier = { origin: () => navigation.origin(), writeText: (text) => clipboard.writeText(text) };

export interface AppProps {
  /** Where the session comes from. The deployed app uses the production source. */
  sessionSource?: SessionSource;
  /** The Auth client registration signs up with. Default: the real one. Tests pass a fake. */
  authPort?: AuthPort;
  /** What the "המשך עם Google" button does. Default: the real one. Tests pass a fake. */
  googleSignIn?: GoogleSignIn;
  /** The app's address and the clipboard the copy-link button uses. Default: the browser's. Tests pass a fake. */
  linkCopier?: LinkCopier;
}

export function App({ sessionSource = productionSessionSource, authPort = productionAuthPort, googleSignIn = productionGoogleSignIn, linkCopier = productionLinkCopier }: AppProps) {
  return (
    <AuthPortContext value={authPort}>
      <GoogleSignInContext value={googleSignIn}>
        <LinkCopierContext value={linkCopier}>
          <SessionProvider source={sessionSource}>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </SessionProvider>
        </LinkCopierContext>
      </GoogleSignInContext>
    </AuthPortContext>
  );
}
