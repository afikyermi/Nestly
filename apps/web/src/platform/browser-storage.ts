import type { KeyValueStorage } from '@/services/auth/auth-client';

// The one place web logic reaches the browser's storage (the lint ban on window, document and localStorage covers hooks, services
// and lib). Handed to the Auth client, which keeps the session in it under one key (F1.5 DR-3).
export function browserStorage(): KeyValueStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    // Storage blocked by the browser: the session then lives in memory and a reload ends it.
    return undefined;
  }
}
