import type { SessionEntry, SessionSource, SessionState } from './session-source';

// TEST ONLY. A source the tests drive by hand, so every state and transition can be reached with no
// network and no login screen (F1.2, criterion 12). The app loads it only in the `e2e` build mode
// (main.tsx), so the deployed build never contains it: a test searches the built files for the marker.
export const CONTROLLABLE_SESSION_MARKER = 'nestly-controllable-session-source';

export interface ControllableSessionSource extends SessionSource, SessionEntry {
  readonly marker: typeof CONTROLLABLE_SESSION_MARKER;
  /** Moves the source to `state` and tells its listeners. */
  set(state: SessionState): void;
  /** From now on `getState` throws, as a broken source would; listeners are told. */
  fail(): void;
  /** When true, `signOut` rejects and the state does not change. */
  rejectSignOut(reject: boolean): void;
  /** What `getNeedsRecoveryQuestions` answers from now on (default false); listeners are told. */
  setNeedsRecoveryQuestions(needs: boolean): void;
  /** What `getMustSetPassword` answers from now on (default false); listeners are told (F2.0 c14). */
  setMustSetPassword(must: boolean): void;
  /** How many times `signOut` was called. */
  signOutCalls(): number;
}

export function createControllableSessionSource(initial: SessionState = 'loading'): ControllableSessionSource {
  const listeners = new Set<() => void>();
  let state = initial;
  let broken = false;
  let signOutRejects = false;
  let calls = 0;
  let needsQuestions = false;
  let mustSetPassword = false;

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  return {
    marker: CONTROLLABLE_SESSION_MARKER,
    getState: () => {
      if (broken) throw new Error('Controllable session source: failed on purpose.');
      return state;
    },
    getNeedsRecoveryQuestions: () => needsQuestions,
    getMustSetPassword: () => mustSetPassword,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    signOut: () => {
      calls += 1;
      if (signOutRejects) return Promise.reject(new Error('Controllable session source: sign-out rejected on purpose.'));
      state = 'signed-out';
      notify();
      return Promise.resolve();
    },
    signIn: () => {
      state = 'signed-in';
      notify();
    },
    set: (next) => {
      state = next;
      notify();
    },
    fail: () => {
      broken = true;
      notify();
    },
    rejectSignOut: (reject) => {
      signOutRejects = reject;
    },
    setNeedsRecoveryQuestions: (needs) => {
      needsQuestions = needs;
      notify();
    },
    setMustSetPassword: (must) => {
      mustSetPassword = must;
      notify();
    },
    signOutCalls: () => calls,
  };
}
