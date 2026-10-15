/** The part of web storage the Auth session needs; `localStorage` fits. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// The one place web logic reaches the browser's storage. The app wires it into the Auth client, which keeps the session in it
// under one key (F1.5 DR-3).
export function browserStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    // Storage blocked by the browser: the session then lives in memory and a reload ends it.
    return undefined;
  }
}
