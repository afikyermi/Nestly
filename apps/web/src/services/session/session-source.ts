// The session seam (FR-AUTH-004). The route guard, the shell and the menu learn about the session only
// through it: three states and one action. A source implements SessionSource; createSessionStore wraps it
// so that a source that throws or rejects is read as signed-out (fails closed). The seam is a UX control:
// the data stays protected by the server and by RLS.

export const SESSION_STATES = ['loading', 'signed-in', 'signed-out'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export interface SessionSource {
  /** The current state. */
  getState(): SessionState;
  /** Calls `listener` after every change of state. Returns the function that stops it. */
  subscribe(listener: () => void): () => void;
  /** Ends the session. The source then reports `signed-out`. */
  signOut(): Promise<void>;
}

/** What registration calls once an account and its session exist (F1.4). A source that can take a session implements it. */
export interface SessionEntry {
  /** The source then reports `signed-in` and tells its listeners. */
  signIn(): void;
}

export const isSessionEntry = (source: SessionSource): source is SessionSource & SessionEntry =>
  'signIn' in source && typeof source.signIn === 'function';

/** What the app reads. Its members are plain functions, safe to pass around unbound. */
export interface SessionStore {
  getState: () => SessionState;
  subscribe: (listener: () => void) => () => void;
  /** Ends the session. Never rejects: a failed sign-out leaves the store `signed-out`. */
  signOut: () => Promise<void>;
}

export interface SessionStoreOptions {
  /** Receives the error of a failing source. The user sees none of it; the store reads as signed-out. */
  onError?: (error: unknown) => void;
}

const reportToConsole = (error: unknown) => {
  console.error('Session source failed; the session is treated as signed-out.', error);
};

const isSessionState = (value: unknown): value is SessionState => SESSION_STATES.some((state) => state === value);

export function createSessionStore(source: SessionSource, { onError = reportToConsole }: SessionStoreOptions = {}): SessionStore {
  const listeners = new Set<() => void>();
  let stopSource: (() => void) | null = null;
  // Once the source has failed, the store stays signed-out: a broken source is never trusted again.
  let failed = false;
  let pendingSignOut: Promise<void> | null = null;

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  const fail = (error: unknown) => {
    onError(error);
    if (failed) return;
    failed = true;
    stopSource?.();
    stopSource = null;
    notify();
  };

  const getState = (): SessionState => {
    if (failed) return 'signed-out';
    let state: unknown;
    try {
      state = source.getState();
    } catch (error) {
      // Read during render, so no listener is called here: every later read returns signed-out as well.
      onError(error);
      failed = true;
      return 'signed-out';
    }
    if (isSessionState(state)) return state;
    onError(new Error(`Session source reported an unknown state: ${String(state)}`));
    failed = true;
    return 'signed-out';
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (stopSource === null && !failed) {
      try {
        stopSource = source.subscribe(notify);
      } catch (error) {
        fail(error);
      }
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && stopSource !== null) {
        stopSource();
        stopSource = null;
      }
    };
  };

  // One sign-out at a time: a second call while one is running joins it instead of calling the source again.
  const signOut = () => {
    if (pendingSignOut !== null) return pendingSignOut;
    let result: Promise<void>;
    try {
      result = source.signOut();
    } catch (error) {
      result = Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    pendingSignOut = result.then(
      () => undefined,
      (error: unknown) => {
        fail(error);
      },
    );
    void pendingSignOut.finally(() => {
      pendingSignOut = null;
    });
    return pendingSignOut;
  };

  return { getState, subscribe, signOut };
}
