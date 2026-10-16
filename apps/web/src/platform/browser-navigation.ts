/** What the Google start needs of the browser: where the app lives, and leaving for another address. A test passes its own. */
export interface BrowserNavigation {
  origin(): string;
  /** Leaves the app for `url` (a full navigation, so the history keeps this page). */
  leave(url: string): void;
  /** Calls `listener` when the browser shows this page again from its back/forward cache (state kept, nothing reloaded). Returns the stop. */
  onRestoredFromCache(listener: () => void): () => void;
}

// The one place web logic navigates away from the app (F1.8): the Google authorize URL is outside the router.
export function windowNavigation(): BrowserNavigation {
  return {
    origin: () => window.location.origin,
    leave: (url) => {
      window.location.assign(url);
    },
    onRestoredFromCache: (listener) => {
      const onPageShow = (event: PageTransitionEvent) => {
        if (event.persisted) listener();
      };
      window.addEventListener('pageshow', onPageShow);
      return () => {
        window.removeEventListener('pageshow', onPageShow);
      };
    },
  };
}
