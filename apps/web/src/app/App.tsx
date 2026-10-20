import { BrowserRouter } from 'react-router';
import { AuthPortContext } from '@/hooks/use-auth-port';
import { GoogleSignInContext } from '@/hooks/use-google-sign-in';
import { ReturnTargetContext, type ReturnTarget } from '@/hooks/use-return-target';
import { AudienceStorageContext } from '@/hooks/use-audience-memory';
import { LinkCopierContext, type LinkCopier } from '@/hooks/use-copy-profile-link';
import { DeviceShareContext } from '@/hooks/use-share-link';
import { TabVisibilityContext, type TabVisibility } from '@/hooks/use-tab-visibility';
import { sessionReturnTarget } from '@/platform/browser-return-target';
import { windowClipboard } from '@/platform/browser-clipboard';
import { windowDeviceShare, type DeviceShare } from '@/platform/browser-share';
import { windowNavigation } from '@/platform/browser-navigation';
import { browserStorage } from '@/platform/browser-storage';
import { windowBrowserEvents } from '@/platform/browser-events';
import { fetchAccountState } from '@/services/api/account-state';
import { createAuthPort, type AuthPort } from '@/services/auth/auth-client';
import { takeReturnTarget } from '@/services/auth/return-target';
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
const browserEvents = windowBrowserEvents(AUTH_STORAGE_KEY);
const productionSessionSource = createAuthSessionSource({
  auth: productionAuthPort,
  accountState: fetchAccountState,
  now: () => Date.now(),
  events: browserEvents,
});
// The notifications bell pauses its polling while the tab is hidden (FR-NOTIF-001).
const tabVisibility: TabVisibility = { isTabVisible: () => browserEvents.isTabVisible?.() ?? true, onTabVisible: (l) => browserEvents.onTabVisible(l) };
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
// A profile link held across the round trip to Google (F2.4c2 c27): taken at every load.
const returnStorage = sessionReturnTarget();
// Every fresh load removes the note; only a load on the Google return uses what it held.
const taken = takeReturnTarget(returnStorage, Date.now());
const returnTarget: ReturnTarget = { storage: returnStorage, landed: navigation.pathname() === PATHS.googleEntry ? taken : null };

// The copy-my-profile-link button (F2.4c2): the app's address and the clipboard.
const clipboard = windowClipboard();
const productionLinkCopier: LinkCopier = { origin: () => navigation.origin(), writeText: (text) => clipboard.writeText(text) };
// The share-link window's "אפשרויות נוספות" (F3.6): the device's own share sheet, where the browser has one.
const productionDeviceShare = windowDeviceShare();

export interface AppProps {
  /** Where the session comes from. The deployed app uses the production source. */
  sessionSource?: SessionSource;
  /** The Auth client registration signs up with. Default: the real one. Tests pass a fake. */
  authPort?: AuthPort;
  /** What the "המשך עם Google" button does. Default: the real one. Tests pass a fake. */
  googleSignIn?: GoogleSignIn;
  /** The app's address and the clipboard the copy-link button uses. Default: the browser's. Tests pass a fake. */
  linkCopier?: LinkCopier;
  /** The device share sheet of the share-link window. Default: the browser's. Tests pass a fake. */
  deviceShare?: DeviceShare;
}

export function App(props: AppProps) {
  const { sessionSource = productionSessionSource, authPort = productionAuthPort, googleSignIn = productionGoogleSignIn } = props;
  const { linkCopier = productionLinkCopier, deviceShare = productionDeviceShare } = props;
  return (
    <AuthPortContext value={authPort}>
      <GoogleSignInContext value={googleSignIn}>
        <AudienceStorageContext value={browserStorage}>
          <LinkCopierContext value={linkCopier}>
            <DeviceShareContext value={deviceShare}>
              <ReturnTargetContext value={returnTarget}>
                <TabVisibilityContext value={tabVisibility}>
                  <SessionProvider source={sessionSource}>
                    <BrowserRouter>
                      <AppRoutes />
                    </BrowserRouter>
                  </SessionProvider>
                </TabVisibilityContext>
              </ReturnTargetContext>
            </DeviceShareContext>
          </LinkCopierContext>
        </AudienceStorageContext>
      </GoogleSignInContext>
    </AuthPortContext>
  );
}
