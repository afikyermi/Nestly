import type { AuthEvent, AuthSessionPort, GoogleAuthPort, PasswordCheckPort, SignInResponse } from '@/services/auth/auth-client';
import { classifySignInFailure } from '@/services/auth/sign-in-problem';
import type { AccountStateOutcome } from '@/services/api/account-state';
import type { BrowserEvents } from '@/platform/browser-events';
import type { PasswordCheck, SessionAccount, SessionEntry, SessionNotice, SessionSource, SessionState, SignInResult } from './session-source';

// The real session source behind the F1.2 seam (F1.5). Auth holds the session (tokens, persisted, refreshed); this source holds
// what the app needs to know about it: signed in with an account, signed in with none, signed out, or not known yet. The
// server's `GET /api/me` is the only authority on the account. The state is a UX control (data stays behind the server and
// RLS), so every doubt resolves to signed-out, never to signed-in.

/** The state is asked again when the tab becomes visible and the last answer is older than this (Q1). */
export const RECHECK_AFTER_MS = 60_000;
/** While the stored session cannot be checked (Auth or the server unreachable at page load), the check is retried after this long... */
export const RESTORE_RETRY_MS = 15_000;
/** ...then after each of these, the last one from then on; each delay varies by up to +-20 %, and the timer acts only while the tab is visible. */
export const RESTORE_RETRY_DELAYS_MS: readonly number[] = [RESTORE_RETRY_MS, 30_000, 60_000, 300_000];
export const RESTORE_RETRY_JITTER = 0.2;

export type AuthSessionSource = SessionSource & SessionEntry & SessionAccount;

export interface AuthSessionSourceDeps {
  /** The Auth client. Without the Google return (a test fake), a Google return reads as a failure. */
  auth: AuthSessionPort & Partial<Pick<GoogleAuthPort, 'completeGoogleSignIn' | 'discardGoogleStart' | 'readGoogleAccount'>> & Partial<PasswordCheckPort>;
  /** Asks the server for the account state (`GET /api/me`) with this access token. */
  accountState: (accessToken: string) => Promise<AccountStateOutcome>;
  /** The clock, in milliseconds. */
  now: () => number;
  events: BrowserEvents;
  /** A number in [0, 1) for the retry jitter. Default: Math.random. */
  random?: () => number;
}

const hasSession = (state: SessionState) => state === 'signed-in' || state === 'signed-in-no-account';

type SignedInAnswer = 'active' | 'active-missing' | 'active-must-set-password' | 'deletion-scheduled' | 'unregistered';
const isSignedInAnswer = (answer: AccountStateOutcome | 'no-session'): answer is SignedInAnswer =>
  answer === 'active' || answer === 'active-missing' || answer === 'active-must-set-password' || answer === 'deletion-scheduled' || answer === 'unregistered';
// F2.0 c7, c8: a session that must set a new password has no recovery questions either (the clear removed them), so both holds are on;
// the new-password one comes first (access.ts).
const needsQuestionsFor = (answer: SignedInAnswer) => answer === 'active-missing' || answer === 'active-must-set-password';
const mustSetPasswordFor = (answer: SignedInAnswer) => answer === 'active-must-set-password';
// FR-SET-002, PG-050: a scheduled account keeps its session only to see the date and cancel; the guard holds it on PG-050.
const deletionScheduledFor = (answer: SignedInAnswer) => answer === 'deletion-scheduled';

export function createAuthSessionSource({ auth, accountState, now, events, random = Math.random }: AuthSessionSourceDeps): AuthSessionSource {
  const listeners = new Set<() => void>();
  let state: SessionState = 'loading';
  let notice: SessionNotice | null = null;
  // F1.6: the account is active and has not saved its recovery questions. Always changes together with the state.
  let needsQuestions = false;
  // F2.0 c14: this session must set a new password after a takeover clear. Always changes together with the state.
  let mustSetPassword = false;
  // PG-050: the account is scheduled for deletion. Always changes together with the state.
  let deletionScheduled = false;
  // Bumped whenever the session is replaced or ended, so an answer that arrives for an older session is dropped.
  let epoch = 0;
  let lastCheckAt: number | null = null;
  let started = false;
  let restoring = false;
  let retryAttempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let checking: Promise<void> | null = null;
  let signingIn: Promise<SignInResult> | null = null;
  let stopWatching: Array<() => void> = [];

  const apply = (
    nextState: SessionState,
    nextNotice: SessionNotice | null,
    nextNeedsQuestions = needsQuestions,
    nextMustSetPassword = mustSetPassword,
    nextDeletionScheduled = deletionScheduled,
  ) => {
    if (
      state === nextState &&
      notice === nextNotice &&
      needsQuestions === nextNeedsQuestions &&
      mustSetPassword === nextMustSetPassword &&
      deletionScheduled === nextDeletionScheduled
    ) {
      return;
    }
    state = nextState;
    notice = nextNotice;
    needsQuestions = nextNeedsQuestions;
    mustSetPassword = nextMustSetPassword;
    deletionScheduled = nextDeletionScheduled;
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
    apply('signed-out', why, false, false, false);
  };

  // Work started by an event, not by a caller. If it breaks, the session is treated as signed-out (fail closed) and the break is logged.
  const inBackground = (work: Promise<void>) => {
    work.catch(() => {
      console.error('Session check failed; the session is treated as signed-out.');
      endLocally(null);
    });
  };

  // Sign-outs still telling Auth: until they finish, Auth may still hold a session that has already been ended here.
  let ending = 0;
  const end = async (why: SessionNotice | null) => {
    endLocally(why);
    ending += 1;
    try {
      await auth.signOut();
    } finally {
      ending -= 1;
    }
  };

  function scheduleRestoreRetry() {
    clearRetry();
    const base = RESTORE_RETRY_DELAYS_MS[Math.min(retryAttempt, RESTORE_RETRY_DELAYS_MS.length - 1)] ?? RESTORE_RETRY_MS;
    retryAttempt += 1;
    const delay = Math.round(base * (1 + (random() * 2 - 1) * RESTORE_RETRY_JITTER));
    retryTimer = setTimeout(() => {
      retryTimer = null;
      // A hidden tab waits: becoming visible runs the check at once.
      if (events.isTabVisible?.() === false) return;
      inBackground(restore());
    }, delay);
  }

  // What an answer from /api/me does. At restore the state is not known yet: only an unreachable server keeps it loading (and
  // retries with backoff); any other failure resolves to signed-out and keeps the stored session, so a later load asks again.
  // Once signed in, an answer that says nothing changes nothing and the next trigger asks again.
  async function decide(answer: AccountStateOutcome | 'no-session', context: 'restore' | 'recheck'): Promise<void> {
    if (answer === 'unreachable' && context === 'restore') {
      scheduleRestoreRetry();
      return;
    }
    retryAttempt = 0;
    if (isSignedInAnswer(answer)) {
      lastCheckAt = now();
      apply(answer === 'unregistered' ? 'signed-in-no-account' : 'signed-in', null, needsQuestionsFor(answer), mustSetPasswordFor(answer), deletionScheduledFor(answer));
    } else if (answer === 'unavailable') {
      await end('stopped');
    } else if (answer === 'deleted') {
      await end('deleted');
    } else if (answer === 'unauthenticated' || answer === 'no-session') {
      await end('expired');
    } else if (context === 'restore') {
      endLocally(null);
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
        apply('signed-out', null, false, false, false);
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

  // One sign-in at a time, whatever the way in (a password, or Google's code): Auth answers with a session or a failure, and nothing is
  // signed in until the server has said what the account is (F1.5 criterion 9). Google's return (F1.8 criterion 6) runs this same check.
  function signInThrough(obtain: () => Promise<SignInResponse>): Promise<SignInResult> {
    if (signingIn !== null) return signingIn;
    const attempt = (async (): Promise<SignInResult> => {
      epoch += 1;
      const startedAt = epoch;
      apply(state, null);
      let accessToken: string | null;
      try {
        const response = await obtain();
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
      if (isSignedInAnswer(answer)) {
        lastCheckAt = now();
        apply(answer === 'unregistered' ? 'signed-in-no-account' : 'signed-in', null, needsQuestionsFor(answer), mustSetPasswordFor(answer), deletionScheduledFor(answer));
        return answer === 'unregistered' ? { kind: 'unregistered' } : { kind: 'signed-in' };
      }
      await auth.signOut();
      if (answer === 'deleted') return { kind: 'deleted' };
      return answer === 'unavailable' ? { kind: 'stopped' } : { kind: 'failed', problem: 'unavailable' };
    })();
    const tracked = attempt.finally(() => {
      signingIn = null;
    });
    signingIn = tracked;
    return tracked;
  }

  // A sign-out this tab does not know the cause of (another tab, say) ends the session with no notice; only this tab's own refused
  // refresh says it expired.
  const onAuthEvent = (event: AuthEvent) => {
    if (event === 'refreshed') inBackground(recheck());
    else if (hasSession(state)) endLocally(event === 'refresh-refused' ? 'expired' : null);
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
    getNeedsRecoveryQuestions: () => needsQuestions,
    getMustSetPassword: () => mustSetPassword,
    getDeletionScheduled: () => deletionScheduled,
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
    // An account was created with the session Auth holds (registration F1.4, completion F1.5): signed in without asking the server
    // again. It applies only if nothing ended the session since the caller began, and Auth still holds one: a sign-out (here or in
    // another tab) that happened while the request was in flight wins, and this does nothing.
    signIn: () => {
      if (ending > 0) return;
      const startedAt = epoch;
      inBackground(
        auth.getAccessToken().then(async (token) => {
          if (token === null || ending > 0 || epoch !== startedAt) return;
          // F1.6: a new account has no recovery questions yet, and the questions screen must be the first thing it sees, so the
          // account state is asked once before the session is applied. An answer that cannot be read changes nothing (criterion 19).
          const answer = await accountState(token).catch((): AccountStateOutcome => 'failed');
          if (ending > 0 || epoch !== startedAt) return;
          epoch += 1;
          lastCheckAt = now();
          clearRetry();
          apply('signed-in', null, answer === 'active-missing', answer === 'active-must-set-password', false);
        }),
      );
    },
    signInWithPassword: (credentials) => signInThrough(() => auth.signIn(credentials)),
    signInWithGoogle: (code) =>
      signInThrough(() =>
        auth.completeGoogleSignIn === undefined ? Promise.reject(new Error('This Auth client has no Google return.')) : auth.completeGoogleSignIn(code),
      ),
    discardGoogleStart: () => {
      auth.discardGoogleStart?.();
    },
    googleAccount: async () => (auth.readGoogleAccount === undefined ? null : auth.readGoogleAccount()),
    recheck,
    getAccessToken: () => auth.getAccessToken(),
    clearNotice: () => {
      apply(state, null);
    },
    markRecoveryQuestionsSet: () => {
      // A check that began before the save may still answer "missing"; the new epoch drops it, and the next trigger asks again.
      epoch += 1;
      apply(state, notice, false);
    },
    // The server's password set ended every session (DR-E): signed out here, and Auth is told (scope local; it only clears storage).
    endAfterPasswordChange: () => end(null),
    // VAL-052: a separate sign-in with the password; this session, its state and its storage stay as they are.
    checkPassword: async (password): Promise<PasswordCheck> => {
      if (auth.checkPassword === undefined) return { kind: 'failed', problem: 'unavailable' };
      try {
        const response = await auth.checkPassword(password);
        if (response.failure !== null) return { kind: 'failed', problem: classifySignInFailure(response.failure) };
        return { kind: 'ok', accessToken: response.accessToken, release: response.release };
      } catch {
        return { kind: 'failed', problem: 'unavailable' };
      }
    },
  };
}
