import type { AuthSessionPort } from '@/services/auth/auth-client';
import { classifySignInFailure } from '@/services/auth/sign-in-problem';
import type { AccountStateOutcome } from '@/services/api/account-state';
import type { BrowserEvents } from '@/platform/browser-events';
import type { SessionAccount, SessionEntry, SessionNotice, SessionSource, SessionState, SignInResult } from './session-source';

// The real session source behind the F1.2 seam (F1.5). Auth holds the session (tokens, persisted, refreshed); this source holds
// what the app needs to know about it: signed in with an account, signed in with none, signed out, or not known yet. The
// server's `GET /api/me` is the only authority on the account. The state is a UX control (data stays behind the server and
// RLS), so every doubt resolves to signed-out, never to signed-in.

/** The state is asked again when the tab becomes visible and the last answer is older than this (Q1). */
export const RECHECK_AFTER_MS = 60_000;
/** While the stored session cannot be checked (Auth or the server unreachable at page load), the check is retried this often. */
export const RESTORE_RETRY_MS = 15_000;

export type AuthSessionSource = SessionSource & SessionEntry & SessionAccount;

export interface AuthSessionSourceDeps {
  auth: AuthSessionPort;
  /** Asks the server for the account state (`GET /api/me`) with this access token. */
  accountState: (accessToken: string) => Promise<AccountStateOutcome>;
  /** The clock, in milliseconds. */
  now: () => number;
  events: BrowserEvents;
}

const hasSession = (state: SessionState) => state === 'signed-in' || state === 'signed-in-no-account';

export function createAuthSessionSource({ auth, accountState, now, events }: AuthSessionSourceDeps): AuthSessionSource {
  const listeners = new Set<() => void>();
  let state: SessionState = 'loading';
  let notice: SessionNotice | null = null;
  // Bumped whenever the session is replaced or ended, so an answer that arrives for an older session is dropped.
  let epoch = 0;
  let lastCheckAt: number | null = null;
  let started = false;
  let restoring = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let checking: Promise<void> | null = null;
  let signingIn: Promise<SignInResult> | null = null;
  let stopWatching: Array<() => void> = [];

  const apply = (nextState: SessionState, nextNotice: SessionNotice | null) => {
    if (state === nextState && notice === nextNotice) return;
    state = nextState;
    notice = nextNotice;
    for (const listener of [...listeners]) listener();
  };

  const clearRetry = () => {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  };

  // Signed-out at once, in this tab; the Auth call that follows only clears storage and tells Auth.
  const endLocally = (why: SessionNotice | null) => {
    epoch += 1;
    lastCheckAt = null;
    clearRetry();
    apply('signed-out', why);
  };

  // Work started by an event, not by a caller. If it breaks, the session is treated as signed-out (fail closed) and the break is logged.
  const inBackground = (work: Promise<void>) => {
    work.catch(() => {
      console.error('Session check failed; the session is treated as signed-out.');
      endLocally(null);
    });
  };

  const end = async (why: SessionNotice | null) => {
    endLocally(why);
    await auth.signOut();
  };

  // What an answer from /api/me does. `restore`: the state is not known yet, so an answer that says nothing keeps it `loading`
  // and tries again; once signed in, such an answer changes nothing and the next trigger asks again.
  async function decide(answer: AccountStateOutcome | 'no-session', context: 'restore' | 'recheck'): Promise<void> {
    if (answer === 'active' || answer === 'unregistered') {
      lastCheckAt = now();
      apply(answer === 'active' ? 'signed-in' : 'signed-in-no-account', null);
    } else if (answer === 'unavailable') {
      await end('stopped');
    } else if (answer === 'unauthenticated' || answer === 'no-session') {
      await end('expired');
    } else if (context === 'restore') {
      clearRetry();
      retryTimer = setTimeout(() => {
        inBackground(restore());
      }, RESTORE_RETRY_MS);
    }
  }

  async function answerNow(): Promise<AccountStateOutcome | 'no-session'> {
    const token = await auth.getAccessToken();
    return token === null ? 'no-session' : accountState(token);
  }

  async function restore(): Promise<void> {
    if (restoring || state !== 'loading') return;
    restoring = true;
    const startedAt = epoch;
    try {
      clearRetry();
      const outcome = await auth.restore();
      if (epoch !== startedAt) return;
      if (outcome === 'none') {
        apply('signed-out', null);
      } else if (outcome === 'refused') {
        endLocally('expired');
      } else if (outcome === 'unreachable') {
        await decide('unreachable', 'restore');
      } else {
        const answer = await answerNow();
        if (epoch === startedAt) await decide(answer, 'restore');
      }
    } finally {
      restoring = false;
    }
  }

  function recheck(): Promise<void> {
    if (!hasSession(state)) return Promise.resolve();
    if (checking !== null) return checking;
    const startedAt = epoch;
    const run = (async () => {
      const answer = await answerNow();
      if (epoch === startedAt) await decide(answer, 'recheck');
    })();
    const tracked = run.finally(() => {
      checking = null;
    });
    checking = tracked;
    return tracked;
  }

  function signInWithPassword(credentials: { email: string; password: string }): Promise<SignInResult> {
    if (signingIn !== null) return signingIn;
    const attempt = (async (): Promise<SignInResult> => {
      epoch += 1;
      const startedAt = epoch;
      apply(state, null);
      let accessToken: string | null;
      try {
        const response = await auth.signIn(credentials);
        if (response.failure !== null) return { kind: 'failed', problem: classifySignInFailure(response.failure) };
        accessToken = response.accessToken;
      } catch {
        // A call that never answered is a network failure (criterion 6).
        return { kind: 'failed', problem: 'unavailable' };
      }
      // Auth accepted the credentials; nothing is signed in until the server has said what the account is (criterion 9).
      const answer = await accountState(accessToken);
      if (epoch !== startedAt) {
        await auth.signOut();
        return { kind: 'failed', problem: 'unavailable' };
      }
      if (answer === 'active' || answer === 'unregistered') {
        lastCheckAt = now();
        apply(answer === 'active' ? 'signed-in' : 'signed-in-no-account', null);
        return answer === 'active' ? { kind: 'signed-in' } : { kind: 'unregistered' };
      }
      await auth.signOut();
      return answer === 'unavailable' ? { kind: 'stopped' } : { kind: 'failed', problem: 'unavailable' };
    })();
    const tracked = attempt.finally(() => {
      signingIn = null;
    });
    signingIn = tracked;
    return tracked;
  }

  const onAuthEvent = (event: 'refreshed' | 'signed-out') => {
    if (event === 'refreshed') inBackground(recheck());
    else if (hasSession(state)) endLocally('expired');
  };

  const onTabVisible = () => {
    if (state === 'loading') {
      inBackground(restore());
    } else if (hasSession(state) && lastCheckAt !== null && now() - lastCheckAt > RECHECK_AFTER_MS) {
      inBackground(recheck());
    }
  };

  // Another tab signed out: this one follows, with no notice (the user did it).
  const onRemovedElsewhere = () => {
    if (hasSession(state)) endLocally(null);
  };

  const watch = () => {
    if (stopWatching.length > 0) return;
    stopWatching = [auth.subscribe(onAuthEvent), events.onTabVisible(onTabVisible), events.onSessionRemovedElsewhere(onRemovedElsewhere)];
  };

  const unwatch = () => {
    for (const stop of stopWatching) stop();
    stopWatching = [];
  };

  return {
    getState: () => state,
    getNotice: () => notice,
    subscribe: (listener) => {
      listeners.add(listener);
      watch();
      // The stored session is read once, when the app first listens.
      if (!started) {
        started = true;
        inBackground(restore());
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) unwatch();
      };
    },
    signOut: async () => {
      await end(null);
    },
    // Registration created the account with this session (F1.4): signed in without asking the server again.
    signIn: () => {
      epoch += 1;
      lastCheckAt = now();
      clearRetry();
      apply('signed-in', null);
    },
    signInWithPassword,
    recheck,
    getAccessToken: () => auth.getAccessToken(),
    clearNotice: () => {
      apply(state, null);
    },
  };
}
