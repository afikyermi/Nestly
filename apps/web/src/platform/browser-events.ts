/** The things the browser tells the session source (F1.5 criteria 12, 13). A test passes its own and fires them by hand. */
export interface BrowserEvents {
  /** True while the tab is visible. A source without it counts the tab as visible. */
  isTabVisible?(): boolean;
  /** Calls `listener` when the tab becomes visible. Returns the function that stops it. */
  onTabVisible(listener: () => void): () => void;
  /** Calls `listener` when another tab removes the stored Auth session (it signed out). Returns the function that stops it. */
  onSessionRemovedElsewhere(listener: () => void): () => void;
}

/** `storageKey`: the key the Auth session is stored under. */
export function windowBrowserEvents(storageKey: string): BrowserEvents {
  return {
    isTabVisible: () => document.visibilityState === 'visible',
    onTabVisible: (listener) => {
      const onChange = () => {
        if (document.visibilityState === 'visible') listener();
      };
      document.addEventListener('visibilitychange', onChange);
      return () => {
        document.removeEventListener('visibilitychange', onChange);
      };
    },
    onSessionRemovedElsewhere: (listener) => {
      // The event fires only in the other tabs. `key` is null when the whole storage was cleared.
      const onStorage = (event: StorageEvent) => {
        if ((event.key === storageKey || event.key === null) && event.newValue === null) listener();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        window.removeEventListener('storage', onStorage);
      };
    },
  };
}
