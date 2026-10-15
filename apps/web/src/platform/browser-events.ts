import { AUTH_STORAGE_KEY } from '@/services/auth/storage-key';

/** The two things the browser tells the session source (F1.5 criteria 12, 13). A test passes its own and fires them by hand. */
export interface BrowserEvents {
  /** Calls `listener` when the tab becomes visible. Returns the function that stops it. */
  onTabVisible(listener: () => void): () => void;
  /** Calls `listener` when another tab removes the stored Auth session (it signed out). Returns the function that stops it. */
  onSessionRemovedElsewhere(listener: () => void): () => void;
}

export function windowBrowserEvents(): BrowserEvents {
  return {
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
        if ((event.key === AUTH_STORAGE_KEY || event.key === null) && event.newValue === null) listener();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        window.removeEventListener('storage', onStorage);
      };
    },
  };
}
