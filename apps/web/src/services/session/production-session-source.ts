import { fetchAccountState } from '@/services/api/account-state';
import { windowBrowserEvents } from '@/platform/browser-events';
import { browserAuthPort } from '@/services/auth/browser-auth-port';
import { createAuthSessionSource } from './auth-session-source';

// The source the deployed app uses (F1.5): the Auth session in the browser, checked against the server. Nothing is read or
// called until the app first listens, so a visitor with no stored session makes no request.
export const productionSessionSource = createAuthSessionSource({
  auth: browserAuthPort,
  accountState: fetchAccountState,
  now: () => Date.now(),
  events: windowBrowserEvents(),
});
