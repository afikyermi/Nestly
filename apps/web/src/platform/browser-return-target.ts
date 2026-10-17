/** The one-shot note that carries a profile link across the Google round trip (F2.4c2 c27). Raw text: the caller checks and parses it. */
export interface ReturnTargetStorage {
  /** The stored text, or null when there is none or the browser blocks storage. Never throws. */
  read(): string | null;
  /** Stores `raw`; does nothing when the browser blocks storage. Never throws. */
  write(raw: string): void;
  /** Removes it. Never throws. */
  remove(): void;
}

const KEY = 'nestly.google-return-target';

// The only web storage this feature uses: sessionStorage (one tab, gone with it), one key, removed on its first read.
export function sessionReturnTarget(): ReturnTargetStorage {
  return {
    read: () => {
      try {
        return sessionStorage.getItem(KEY);
      } catch {
        return null;
      }
    },
    write: (raw) => {
      try {
        sessionStorage.setItem(KEY, raw);
      } catch {
        // Blocked storage: the sign-in then lands on the landing page.
      }
    },
    remove: () => {
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        // Blocked storage: nothing was stored.
      }
    },
  };
}
