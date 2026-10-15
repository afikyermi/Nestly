import type { SessionEntry, SessionSource, SessionState } from './session-source';

// The deployed app's source until sign-in exists (F1.5): signed-out, and signed-in only after registration hands over a
// session (F1.4). Held in memory only (Q7): a reload signs the user out. The access token itself stays inside the Auth client.
export type MemorySessionSource = SessionSource & SessionEntry;

export function createMemorySessionSource(): MemorySessionSource {
  const listeners = new Set<() => void>();
  let state: SessionState = 'signed-out';

  const set = (next: SessionState) => {
    if (state === next) return;
    state = next;
    for (const listener of [...listeners]) listener();
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    signOut: () => {
      set('signed-out');
      return Promise.resolve();
    },
    signIn: () => {
      set('signed-in');
    },
  };
}
