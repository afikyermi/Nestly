// F1.5 part b, the real session source over a FAKE Auth port (criteria 5, 7, 8, 9, 11, 12, 13, 14), observed only through the public hooks
// (useSession, useSessionAccount) inside SessionProvider. Derived from spec.md and interface.md "Session source" only.
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '@/app/SessionProvider';
import { useSession } from '@/hooks/use-session';
import { useSessionAccount } from '@/hooks/use-session-account';
import { createAuthSessionSource } from '@/services/session/auth-session-source';

type Deps = Parameters<typeof createAuthSessionSource>[0];
type Auth = Deps['auth'];
type Outcome = Awaited<ReturnType<Deps['accountState']>>;
type Restore = Awaited<ReturnType<Auth['restore']>>;
type SignInAnswer = Awaited<ReturnType<Auth['signIn']>>;
type AuthEvent = Parameters<Parameters<Auth['subscribe']>[0]>[0];

const CREDS = { email: 'dana.cohen@example.com', password: 'correct horse 42 zq' };
const FAILED = (code: string, status = 400): SignInAnswer => ({ accessToken: null, failure: { code, status, name: 'AuthApiError' } });

interface Latest {
  state: string;
  notice: string | null;
  deletionScheduled: boolean;
  signOut: () => unknown;
  account: ReturnType<typeof useSessionAccount>;
}
let latest: Latest;
let renders: string[];

function Probe() {
  const s = useSession();
  const account = useSessionAccount();
  latest = { state: s.state, notice: s.notice, deletionScheduled: s.deletionScheduled, signOut: s.signOut, account };
  renders.push(s.state);
  return <output>{s.state}</output>;
}

function setup(over: { restore?: Restore; outcomes?: Outcome[]; signIn?: SignInAnswer | Error; signOut?: Promise<boolean> | boolean; random?: number } = {}) {
  let authListener: ((e: AuthEvent) => void) | undefined;
  const visible: Array<() => void> = [];
  const removed: Array<() => void> = [];
  const firstOutcome: Outcome = 'active';
  const outcomes = [...(over.outcomes ?? [firstOutcome])];
  let clock = 5_000_000;
  const randomValue = over.random ?? 0.5; // 0.5 = no jitter: the delay is exactly the base
  let tabIsVisible = true;
  // The mocks are held in variables and exposed as such, so that tests never read a method off the port object (unbound-method).
  const authSignIn = vi.fn((): Promise<SignInAnswer> => (over.signIn instanceof Error ? Promise.reject(over.signIn) : Promise.resolve(over.signIn ?? { accessToken: 'tok-signin', failure: null })));
  const authRestore = vi.fn((): Promise<Restore> => Promise.resolve(over.restore ?? 'session'));
  const authSignOut = vi.fn((): Promise<boolean> => Promise.resolve(over.signOut ?? true));
  const auth: Auth = {
    signIn: authSignIn,
    restore: authRestore,
    getAccessToken: vi.fn(() => Promise.resolve('tok-held')),
    signOut: authSignOut,
    subscribe: vi.fn((l: Parameters<Auth['subscribe']>[0]) => {
      authListener = l;
      return () => undefined;
    }),
  };
  const accountState = vi.fn((token: string): Promise<Outcome> => {
    void token;
    return Promise.resolve(outcomes.length > 1 ? (outcomes.shift() ?? 'active') : (outcomes[0] ?? 'active'));
  });
  const source = createAuthSessionSource({
    auth,
    accountState,
    now: () => clock,
    random: () => randomValue,
    events: {
      onTabVisible: (l) => (visible.push(l), () => undefined),
      onSessionRemovedElsewhere: (l) => (removed.push(l), () => undefined),
      isTabVisible: () => tabIsVisible,
    },
  });
  renders = [];
  const view = render(
    <SessionProvider source={source}>
      <Probe />
    </SessionProvider>,
  );
  return {
    authSignIn,
    authRestore,
    authSignOut,
    accountState,
    view,
    emit: (e: AuthEvent) => inAct(() => authListener?.(e)),
    tabVisible: () => inAct(() => visible.forEach((l) => l())),
    removedElsewhere: () => inAct(() => removed.forEach((l) => l())),
    advanceClock: (ms: number) => void (clock += ms),
    setTabVisible: (v: boolean) => void (tabIsVisible = v),
  };
}

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

/** Runs a synchronous trigger inside act and lets the promises it started settle. */
const inAct = (fn: () => void) =>
  act(async () => {
    fn();
    await Promise.resolve();
  });

const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
async function signIn() {
  const account = latest.account;
  if (account === null) throw new Error('the session source has no account port');
  let out: Awaited<ReturnType<typeof account.signInWithPassword>> | undefined;
  await act(async () => {
    out = await account.signInWithPassword(CREDS);
  });
  if (out === undefined) throw new Error('no result');
  return out;
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }));
afterEach(() => vi.useRealTimers());

describe('[F1.5 c11] restore on load (DR-3)', () => {
  it('a stored session: loading first, then /api/me is asked with the held token, then signed-in', async () => {
    const t = setup({ restore: 'session', outcomes: ['active'] });
    expect(renders[0]).toBe('loading');
    expect(latest.state).toBe('loading');
    await settle();
    expect(t.accountState).toHaveBeenCalledTimes(1);
    expect(t.accountState).toHaveBeenCalledWith('tok-held');
    expect(latest.state).toBe('signed-in');
    expect(renders.indexOf('signed-in')).toBeGreaterThan(renders.indexOf('loading'));
  });

  it('nothing stored -> signed-out, no /api/me, no notice', async () => {
    const t = setup({ restore: 'none' });
    await settle();
    expect(latest.state).toBe('signed-out');
    expect(latest.notice).toBeNull();
    expect(t.accountState).not.toHaveBeenCalled();
  });

  it('a refresh token Auth refuses -> signed-out with the "expired" notice (the screen shows "ההתחברות פגה"), no /api/me', async () => {
    const t = setup({ restore: 'refused' });
    await settle();
    expect(latest.state).toBe('signed-out');
    expect(latest.notice).toBe('expired');
    expect(t.accountState).not.toHaveBeenCalled();
  });

  it('/api/me answers 401 (unauthenticated) -> signed-out, "expired"', async () => {
    setup({ restore: 'session', outcomes: ['unauthenticated'] });
    await settle();
    expect(latest.state).toBe('signed-out');
    expect(latest.notice).toBe('expired');
  });

  it('unavailable at restore -> the Auth session is ended, signed-out, notice "stopped", never signed-in on the way', async () => {
    const t = setup({ restore: 'session', outcomes: ['unavailable'] });
    await settle();
    expect(t.authSignOut).toHaveBeenCalled();
    expect(latest.state).toBe('signed-out');
    expect(latest.notice).toBe('stopped');
    expect(renders).not.toContain('signed-in');
  });

  it('unregistered at restore -> signed-in-no-account (completion), not signed-in', async () => {
    setup({ restore: 'session', outcomes: ['unregistered'] });
    await settle();
    expect(latest.state).toBe('signed-in-no-account');
    expect(renders).not.toContain('signed-in');
  });

  it('[Amendment 1] /api/me unreachable at restore -> stays loading (no sign-out, nothing protected) and retries with backoff 15 s, 30 s, 60 s, then every 300 s', async () => {
    const t = setup({ restore: 'session', outcomes: ['unreachable'] });
    await settle();
    expect(latest.state).toBe('loading');
    expect(t.authSignOut).not.toHaveBeenCalled();
    const steps: Array<[number, number]> = [
      [15_000, 2],
      [30_000, 3],
      [60_000, 4],
      [300_000, 5],
      [300_000, 6],
    ];
    await advance(200); // every retry below is checked 200 ms before and 200 ms after its due time
    for (const [delay, calls] of steps) {
      await advance(delay - 400);
      expect(t.accountState, `not yet at ${delay}`).toHaveBeenCalledTimes(calls - 1);
      await advance(400);
      expect(t.accountState, `retried after ${delay}`).toHaveBeenCalledTimes(calls);
      expect(latest.state).toBe('loading');
    }
    expect(renders).not.toContain('signed-out');
  });

  it('[Amendment 1] a retry that succeeds ends loading: unreachable, then active -> signed-in', async () => {
    const t = setup({ restore: 'session', outcomes: ['unreachable', 'active'] });
    await settle();
    await advance(15_500);
    expect(t.accountState).toHaveBeenCalledTimes(2);
    expect(latest.state).toBe('signed-in');
    expect(renders).not.toContain('signed-out');
  });

  it.each([
    [0, 12_000],
    [1, 18_000],
  ])('[Amendment 1] jitter is ±20 %%: with random() = %d the first retry comes at %d ms', async (random, at) => {
    const t = setup({ restore: 'session', outcomes: ['unreachable'], random });
    await settle();
    await advance(at - 200);
    expect(t.accountState).toHaveBeenCalledTimes(1);
    await advance(400);
    expect(t.accountState).toHaveBeenCalledTimes(2);
  });

  it('[Amendment 1] the retry timer does not fire while the tab is hidden; becoming visible while loading retries at once', async () => {
    const t = setup({ restore: 'session', outcomes: ['unreachable', 'active'] });
    await settle();
    t.setTabVisible(false);
    await advance(20 * 60_000);
    expect(t.accountState).toHaveBeenCalledTimes(1);
    expect(latest.state).toBe('loading');
    t.setTabVisible(true);
    await t.tabVisible();
    await settle();
    expect(t.accountState).toHaveBeenCalledTimes(2);
    expect(latest.state).toBe('signed-in');
  });

  it('[Amendment 1] /api/me failed (500, 404, unreadable) at restore -> signed-out, the stored session kept (no Auth sign-out), no notice, no retry timer', async () => {
    const t = setup({ restore: 'session', outcomes: ['failed'] });
    await settle();
    expect(latest.state).toBe('signed-out');
    expect(latest.notice).toBeNull();
    expect(t.authSignOut).not.toHaveBeenCalled();
    await advance(20 * 60_000);
    expect(t.accountState).toHaveBeenCalledTimes(1);
    expect(t.authRestore).toHaveBeenCalledTimes(1);
  });

  it('Auth unreachable at restore -> stays loading, retried on the 15 s timer, storage not cleared (no signOut)', async () => {
    const t = setup({ restore: 'unreachable' });
    await settle();
    expect(latest.state).toBe('loading');
    expect(t.authSignOut).not.toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(15_500)));
    expect(t.authRestore.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(renders).not.toContain('signed-out');
  });

  it('the stored session is read once, when the first subscriber arrives, not at construction', async () => {
    const t = setup({ restore: 'none' });
    await settle();
    expect(t.authRestore).toHaveBeenCalledTimes(1);
  });
});

describe('[F1.5 c5][c7][c8][c9] signInWithPassword', () => {
  it('[c7][AC-004] valid credentials and active -> signed-in, result signed-in; /api/me asked with the token Auth returned', async () => {
    const t = setup({ restore: 'none', outcomes: ['active'] });
    await settle();
    const result = await signIn();
    expect(result).toEqual({ kind: 'signed-in' });
    expect(t.accountState).toHaveBeenCalledWith('tok-signin');
    expect(latest.state).toBe('signed-in');
  });

  it.each(['invalid_credentials', 'user_not_found', 'email_not_confirmed', 'user_banned'])(
    '[c5][ERR-001] Auth answers %s -> failed/invalid_credentials, /api/me is NOT called, no session, state stays signed-out',
    async (code) => {
      const t = setup({ restore: 'none', signIn: FAILED(code) });
      await settle();
      const result = await signIn();
      expect(result).toEqual({ kind: 'failed', problem: 'invalid_credentials' });
      expect(t.accountState).not.toHaveBeenCalled();
      expect(latest.state).toBe('signed-out');
      expect(renders).not.toContain('signed-in');
    },
  );

  it('[c5] an unknown email and a wrong password produce the identical result', async () => {
    setup({ restore: 'none', signIn: FAILED('invalid_credentials') });
    await settle();
    const wrong = await signIn();
    const other = setup({ restore: 'none', signIn: FAILED('user_not_found') });
    await settle();
    expect(await signIn()).toEqual(wrong);
    other.view.unmount();
  });

  it.each([
    ['429', FAILED('over_request_rate_limit', 429), 'rate_limited'],
    ['503', FAILED('x', 503), 'unavailable'],
    ['an odd 4xx', FAILED('something_new', 400), 'unknown'],
  ] as const)('[c6] Auth %s -> failed/%s, no /api/me', async (_l, answer, problem) => {
    const t = setup({ restore: 'none', signIn: answer });
    await settle();
    expect(await signIn()).toEqual({ kind: 'failed', problem });
    expect(t.accountState).not.toHaveBeenCalled();
  });

  it('[c6] the Auth call rejecting -> failed/unavailable, no unhandled rejection, still signed-out', async () => {
    setup({ restore: 'none', signIn: new TypeError('Failed to fetch') });
    await settle();
    expect(await signIn()).toEqual({ kind: 'failed', problem: 'unavailable' });
    expect(latest.state).toBe('signed-out');
  });

  it('[c8][DR-1] unavailable after correct credentials -> the Auth session is ended, result stopped, signed-out, never signed-in at any render', async () => {
    const t = setup({ restore: 'none', outcomes: ['unavailable'] });
    await settle();
    expect(await signIn()).toEqual({ kind: 'stopped' });
    expect(t.authSignOut).toHaveBeenCalledTimes(1);
    expect(latest.state).toBe('signed-out');
    expect(renders).not.toContain('signed-in');
    expect(renders).not.toContain('signed-in-no-account');
  });

  it('[c16 link][DR-2] unregistered -> signed-in-no-account and result unregistered', async () => {
    setup({ restore: 'none', outcomes: ['unregistered'] });
    await settle();
    expect(await signIn()).toEqual({ kind: 'unregistered' });
    expect(latest.state).toBe('signed-in-no-account');
    expect(renders).not.toContain('signed-in');
  });

  it.each(['unauthenticated', 'unreachable', 'failed'] as const)(
    '[c9][rule 15] /api/me %s after Auth accepted -> fail closed: session ended locally, failed/unavailable, never signed-in at any render',
    async (bad) => {
      const t = setup({ restore: 'none', outcomes: [bad] });
      await settle();
      expect(await signIn()).toEqual({ kind: 'failed', problem: 'unavailable' });
      expect(t.authSignOut).toHaveBeenCalled();
      expect(latest.state).toBe('signed-out');
      expect(renders).not.toContain('signed-in');
    },
  );

  it('[c19 source] a double activation joins the first call: one Auth sign-in, one /api/me', async () => {
    const t = setup({ restore: 'none' });
    await settle();
    const account = latest.account;
    let both: unknown[] = [];
    await act(async () => {
      both = await Promise.all([account?.signInWithPassword(CREDS), account?.signInWithPassword(CREDS)]);
    });
    expect(t.authSignIn).toHaveBeenCalledTimes(1);
    expect(t.accountState).toHaveBeenCalledTimes(1);
    expect(both[0]).toEqual(both[1]);
  });

  it('[c7] a sign-in clears an earlier notice', async () => {
    setup({ restore: 'refused' });
    await settle();
    expect(latest.notice).toBe('expired');
    await signIn();
    expect(latest.notice).toBeNull();
  });
});

describe('[F1.5 c12][c13] re-check of the account state (Q1)', () => {
  const signedInSetup = async (outcomes: Outcome[]) => {
    const t = setup({ restore: 'session', outcomes });
    await settle();
    expect(latest.state).toBe('signed-in');
    return t;
  };

  it('[c13] after each token refresh /api/me is asked again with the held token', async () => {
    const t = await signedInSetup(['active']);
    await t.emit('refreshed');
    await t.emit('refreshed');
    expect(t.accountState).toHaveBeenCalledTimes(3);
  });

  it('[c13] a refresh followed by "unavailable" -> session ended, signed-out, notice "stopped"', async () => {
    const t = await signedInSetup(['active', 'unavailable']);
    await t.emit('refreshed');
    expect(t.authSignOut).toHaveBeenCalled();
    expect(latest.state).toBe('signed-out');
    expect(latest.notice).toBe('stopped');
  });

  it('[c13] a refresh followed by "unregistered" -> signed-in-no-account', async () => {
    const t = await signedInSetup(['active', 'unregistered']);
    await t.emit('refreshed');
    expect(latest.state).toBe('signed-in-no-account');
  });

  it('[c13] a refresh followed by 401 -> signed-out, "expired"', async () => {
    const t = await signedInSetup(['active', 'unauthenticated']);
    await t.emit('refreshed');
    expect(latest.state).toBe('signed-out');
    expect(latest.notice).toBe('expired');
  });

  it.each(['unreachable', 'failed'] as const)('[c13] /api/me %s on a re-check -> no sign-out, still signed-in; the next trigger retries', async (bad) => {
    const t = await signedInSetup(['active', bad, 'active']);
    await t.emit('refreshed');
    expect(latest.state).toBe('signed-in');
    expect(t.authSignOut).not.toHaveBeenCalled();
    await t.emit('refreshed');
    expect(t.accountState).toHaveBeenCalledTimes(3);
    expect(latest.state).toBe('signed-in');
  });

  it('[c13] tab visible: no check at 60 s or less since the last answer, a check over 60 s', async () => {
    const t = await signedInSetup(['active']);
    t.advanceClock(30_000);
    await t.tabVisible();
    expect(t.accountState).toHaveBeenCalledTimes(1);
    t.advanceClock(30_000); // exactly 60 s since the answer: "over 60 s" is not met
    await t.tabVisible();
    expect(t.accountState).toHaveBeenCalledTimes(1);
    t.advanceClock(1);
    await t.tabVisible();
    expect(t.accountState).toHaveBeenCalledTimes(2);
  });

  it('[c13] the 60 s counts from the LAST answer: a check resets it', async () => {
    const t = await signedInSetup(['active']);
    t.advanceClock(61_000);
    await t.tabVisible();
    expect(t.accountState).toHaveBeenCalledTimes(2);
    t.advanceClock(30_000);
    await t.tabVisible();
    expect(t.accountState).toHaveBeenCalledTimes(2);
  });

  it('[c13] a stopped account noticed on tab visible -> signed-out with "stopped"; nothing protected afterwards', async () => {
    const t = await signedInSetup(['active', 'unavailable']);
    t.advanceClock(61_000);
    await t.tabVisible();
    expect(latest.state).toBe('signed-out');
    expect(latest.notice).toBe('stopped');
    await t.emit('refreshed');
    expect(latest.state).toBe('signed-out');
  });

  it('[c13] concurrent re-checks share one request', async () => {
    let release: (o: Outcome) => void = () => undefined;
    const t = setup({ restore: 'session', outcomes: ['active'] });
    await settle();
    t.accountState.mockImplementationOnce(() => new Promise<Outcome>((resolve) => (release = resolve)));
    t.advanceClock(61_000);
    await t.tabVisible();
    await t.emit('refreshed');
    await t.tabVisible();
    expect(t.accountState).toHaveBeenCalledTimes(2); // the restore + one shared re-check
    await inAct(() => release('active'));
    expect(latest.state).toBe('signed-in');
  });

  it('[c13] no re-check while signed out (nothing to check, no token)', async () => {
    const t = setup({ restore: 'none' });
    await settle();
    t.advanceClock(120_000);
    await t.tabVisible();
    await t.emit('refreshed');
    expect(t.accountState).not.toHaveBeenCalled();
  });

  it('[c13] a re-check also runs while in completion (signed-in-no-account), and a now-registered account becomes signed-in', async () => {
    const t = setup({ restore: 'session', outcomes: ['unregistered', 'active'] });
    await settle();
    expect(latest.state).toBe('signed-in-no-account');
    await t.emit('refreshed');
    expect(latest.state).toBe('signed-in');
  });

  it('[c12][Amendment 1] this tab\'s own refresh refused (event refresh-refused) while signed in -> signed-out with "expired"', async () => {
    const t = await signedInSetup(['active']);
    await t.emit('refresh-refused');
    expect(latest.state).toBe('signed-out');
    expect(latest.notice).toBe('expired');
  });

  it('[c12][Amendment 1] a sign-out whose cause this tab does not know (event signed-out) ends the session with NO notice', async () => {
    const t = await signedInSetup(['active']);
    await t.emit('signed-out');
    expect(latest.state).toBe('signed-out');
    expect(latest.notice).toBeNull();
  });

  it('[c12] the session removed in another tab -> signed-out within the one event, no notice', async () => {
    const t = await signedInSetup(['active']);
    await t.removedElsewhere();
    expect(latest.state).toBe('signed-out');
    expect(latest.notice).toBeNull();
  });

  it('[c12] a removal in another tab while signed out changes nothing', async () => {
    const t = setup({ restore: 'none' });
    await settle();
    await t.removedElsewhere();
    expect(latest.state).toBe('signed-out');
  });
});

describe('[F1.5 c14] logout and the entry after registration', () => {
  it('signOut(): the state is signed-out at once, before Auth has answered', async () => {
    let finish: (v: boolean) => void = () => undefined;
    const pending = new Promise<boolean>((resolve) => (finish = resolve));
    const t = setup({ restore: 'session', signOut: pending });
    await settle();
    expect(latest.state).toBe('signed-in');
    act(() => void latest.signOut());
    expect(latest.state).toBe('signed-out');
    expect(t.authSignOut).toHaveBeenCalledTimes(1);
    await inAct(() => finish(true));
    expect(latest.state).toBe('signed-out');
  });

  it('when Auth cannot be told (signOut false) the user is still signed out locally', async () => {
    const t = setup({ restore: 'session', signOut: false });
    await settle();
    act(() => void latest.signOut());
    await settle();
    expect(latest.state).toBe('signed-out');
    expect(t.authSignOut).toHaveBeenCalledTimes(1);
  });

  it('a logout leaves no notice, so the guard sends to / and not /login', async () => {
    setup({ restore: 'session' });
    await settle();
    act(() => void latest.signOut());
    await settle();
    expect(latest.notice).toBeNull();
  });

  it('after a logout, a late "refreshed" event or a tab-visible does not sign the user back in', async () => {
    const t = setup({ restore: 'session' });
    await settle();
    act(() => void latest.signOut());
    await settle();
    await t.emit('refreshed');
    t.advanceClock(120_000);
    await t.tabVisible();
    expect(latest.state).toBe('signed-out');
  });
});

// I9 (FR-SET-002, PG-050, FR-AUTH-002): a scheduled account keeps its session only held on PG-050; a deleted one is signed out and told so.
describe('account deletion states (I9)', () => {
  it('[I9 PG-050 AC-108] a scheduled account signs in held, and the hold ends when the server says active again', async () => {
    const t = setup({ restore: 'none', outcomes: ['deletion-scheduled', 'active'] });
    await settle();
    expect(await signIn()).toEqual({ kind: 'signed-in' });
    expect(latest.state).toBe('signed-in');
    expect(latest.deletionScheduled).toBe(true);
    expect(t.authSignOut).not.toHaveBeenCalled();
    await act(async () => {
      await latest.account?.recheck();
    });
    expect(latest.deletionScheduled).toBe(false);
  });

  it('[I9 BR-073] a deleted account: the sign-in is ended, the result says deleted; at restore the notice says deleted', async () => {
    const t = setup({ restore: 'none', outcomes: ['deleted'] });
    await settle();
    expect(await signIn()).toEqual({ kind: 'deleted' });
    expect(t.authSignOut).toHaveBeenCalledTimes(1);
    expect(renders).not.toContain('signed-in');
    t.view.unmount();
    setup({ restore: 'session', outcomes: ['deleted'] });
    await settle();
    expect(latest.state).toBe('signed-out');
    expect(latest.notice).toBe('deleted');
  });
});
