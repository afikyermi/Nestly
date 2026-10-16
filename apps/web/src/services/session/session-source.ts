// The session seam (FR-AUTH-004). The route guard, the shell and the menu learn about the session only
// through it: four states and one action. A source implements SessionSource; createSessionStore wraps it
// so that a source that throws or rejects is read as signed-out (fails closed). The seam is a UX control:
// the data stays protected by the server and by RLS.
import type { SignInProblem } from '@/services/auth/sign-in-problem';

// `signed-in-no-account`: Auth knows the user but the account was never created (F1.5 DR-2); only the completion screen opens.
export const SESSION_STATES = ['loading', 'signed-in', 'signed-out', 'signed-in-no-account'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

/** Why a session ended without the user asking (F1.5): the login screen says so. Memory only; cleared by the next sign-in. */
export type SessionNotice = 'expired' | 'stopped';

export interface SessionSource {
  /** The current state. */
  getState(): SessionState;
  /** Why the session ended by itself, if it did. A source that cannot tell leaves this out. */
  getNotice?(): SessionNotice | null;
  /** True while the signed-in account has not saved its recovery questions (F1.6). A source that cannot tell leaves this out. */
  getNeedsRecoveryQuestions?(): boolean;
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

/** The result of signing in with a password or Google, as the login screen and the Google return read it (F1.5 criteria 5-9). Keys only, no text. */
export type SignInResult =
  | { kind: 'signed-in' }
  | { kind: 'unregistered' } // signed in, no account yet: the state is `signed-in-no-account`
  | { kind: 'stopped' } // the account is suspended or banned; the session is already ended
  | { kind: 'failed'; problem: SignInProblem };

/** What the login and completion screens call. A source that can sign in with a password implements it. */
export interface SessionAccount {
  /** Checks the password with Auth, then asks the server for the account state. A session survives only if this reports signed-in or unregistered. */
  signInWithPassword(credentials: { email: string; password: string }): Promise<SignInResult>;
  /** Google's return (F1.8): exchanges the code for a session, then runs the same status check as for a password. A session survives only if this reports signed-in or unregistered. */
  signInWithGoogle(code: string): Promise<SignInResult>;
  /** A Google return that made no exchange (cancelled, provider error, no code): drops the PKCE verifier the start left behind. */
  discardGoogleStart(): void;
  /** The Auth user's email when the user came in through Google (the completion screen then asks for a password); null for any other user. Rejects when Auth could not answer. */
  googleAccount(): Promise<{ email: string } | null>;
  /** Asks the server for the account state now (e.g. after a 409 on completion) and acts on the answer. */
  recheck(): Promise<void>;
  /** The current access token, renewed if it has expired; null without a session. */
  getAccessToken(): Promise<string | null>;
  /** Forgets the notice. */
  clearNotice(): void;
  /** The recovery questions were saved: the account no longer needs the questions screen. No second `/api/me` call. */
  markRecoveryQuestionsSet(): void;
}

export const isSessionAccount = (source: SessionSource): source is SessionSource & SessionAccount =>
  'signInWithPassword' in source && typeof source.signInWithPassword === 'function';

export const isSessionEntry = (source: SessionSource): source is SessionSource & SessionEntry =>
  'signIn' in source && typeof source.signIn === 'function';

/** What the app reads. Its members are plain functions, safe to pass around unbound. */
export interface SessionStore {
  getState: () => SessionState;
  /** Why the session ended by itself; null when it did not, or when the source cannot say. */
  getNotice: () => SessionNotice | null;
  /** True while a signed-in account must still save its recovery questions; false otherwise, and when the source cannot say. */
  getNeedsRecoveryQuestions: () => boolean;
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

  const getNotice = (): SessionNotice | null => {
    if (failed) return null;
    try {
      return source.getNotice?.() ?? null;
    } catch (error) {
      onError(error);
      failed = true;
      return null;
    }
  };

  const getNeedsRecoveryQuestions = (): boolean => {
    if (failed) return false;
    try {
      return source.getNeedsRecoveryQuestions?.() ?? false;
    } catch (error) {
      onError(error);
      failed = true;
      return false;
    }
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

  return { getState, getNotice, getNeedsRecoveryQuestions, subscribe, signOut };
}
