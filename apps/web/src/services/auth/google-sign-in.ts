import type { GoogleAuthPort } from './auth-client';

/** The Google button's one action (F1.8): ask Auth for the authorize URL and leave for it. */
export interface GoogleSignIn {
  /** 'left' once the browser has been sent to Google; 'failed' for every other outcome (Auth not configured, refused, an unusable URL). */
  start(): Promise<'left' | 'failed'>;
  /** Calls `listener` when the page comes back from the back/forward cache (the button left busy must be reset). Returns the stop. A source without it never fires. */
  onRestoredFromCache?: ((listener: () => void) => () => void) | undefined;
}

export interface GoogleSignInDeps {
  auth: Pick<GoogleAuthPort, 'startGoogleSignIn'>;
  /** The address Google sends the user back to (Preview or production origin plus the return path). */
  redirectTo: () => string;
  leave: (url: string) => void;
  onRestoredFromCache?: ((listener: () => void) => () => void) | undefined;
}

/** A page of Google's or Auth's, over https (http only on localhost for development); anything else is never navigated to. */
function isLeavableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
}

export function createGoogleSignIn({ auth, redirectTo, leave, onRestoredFromCache }: GoogleSignInDeps): GoogleSignIn {
  return {
    onRestoredFromCache,
    async start() {
      try {
        const started = await auth.startGoogleSignIn(redirectTo());
        if (started.url === null || !isLeavableUrl(started.url)) return 'failed';
        leave(started.url);
        return 'left';
      } catch {
        return 'failed';
      }
    },
  };
}
