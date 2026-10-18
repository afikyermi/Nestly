// F1.5 part b, component level through the whole <App>: sign-in success (7), stopped account and fail closed with no protected render at
// any moment (8, 9), restore (11), re-check on tab visible (13), logout from the menu (14), the completion state (15 → /register).
// The login screen is part c: sign-in is driven through the session source's account port (useSessionAccount), the screen texts are
// asserted there. Derived from spec.md and interface.md only.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { createAuthSessionSource } from '@/services/session/auth-session-source';

type Deps = Parameters<typeof createAuthSessionSource>[0];
type Auth = Deps['auth'];
type Outcome = Awaited<ReturnType<Deps['accountState']>>;
type Restore = Awaited<ReturnType<Auth['restore']>>;

const CREDS = { email: 'dana.cohen@example.com', password: 'correct horse 42 zq' };
const WELCOME = 'הצטרפות ל-Nestly';
const PROTECTED_H1 = ['בית', 'פיד', 'הפיד', 'פרופיל', 'הגדרות'];
const protectedHeading = () => screen.queryByRole('heading', { level: 1, name: (n) => PROTECTED_H1.includes(n) });

function mount(path: string, over: { restore?: Restore; outcomes?: Outcome[]; signOut?: boolean } = {}) {
  const visible: Array<() => void> = [];
  const firstOutcome: Outcome = 'active';
  const outcomes = [...(over.outcomes ?? [firstOutcome])];
  let clock = 1_000_000;
  // Mocks are held in variables and exposed as such (no method read off the port object: unbound-method).
  const authSignOut = vi.fn((): Promise<boolean> => Promise.resolve(over.signOut ?? true));
  const auth: Auth = {
    signIn: vi.fn(() => Promise.resolve({ accessToken: 'tok', failure: null })),
    restore: vi.fn((): Promise<Restore> => Promise.resolve(over.restore ?? 'none')),
    getAccessToken: vi.fn(() => Promise.resolve('tok')),
    signOut: authSignOut,
    subscribe: vi.fn(() => () => undefined),
  };
  const accountState = vi.fn((token: string): Promise<Outcome> => {
    void token;
    return Promise.resolve(outcomes.length > 1 ? (outcomes.shift() ?? 'active') : (outcomes[0] ?? 'active'));
  });
  const source = createAuthSessionSource({
    auth,
    accountState,
    now: () => clock,
    events: {
      onTabVisible: (l) => (visible.push(l), () => undefined),
      onSessionRemovedElsewhere: () => () => undefined,
    },
  });
  // Record every protected text or navigation that is ever added to the DOM, even for one render.
  const seen: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const r of records)
      r.addedNodes.forEach((n) => {
        if (!(n instanceof Element)) return;
        if (n.matches('nav[aria-label="ניווט ראשי"]') || n.querySelector('nav[aria-label="ניווט ראשי"]')) seen.push('shell-nav');
        const heads = n.matches('h1') ? [n] : Array.from(n.querySelectorAll('h1'));
        for (const h of heads) if (PROTECTED_H1.includes((h.textContent ?? '').trim())) seen.push(`protected-h1:${h.textContent}`);
      });
  });
  act(() => {
    window.history.replaceState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  const view = render(<App sessionSource={source} />);
  return {
    authSignOut,
    accountState,
    seen,
    view,
    stop: () => observer.disconnect(),
    tabVisible: () =>
      act(async () => {
        visible.forEach((l) => l());
        await Promise.resolve();
      }),
    advance: (ms: number) => void (clock += ms),
    source,
  };
}

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const path = () => window.location.pathname;

afterEach(() => vi.restoreAllMocks());

describe('[F1.5 c11] reload with a stored session', () => {
  it('a protected page: "בטעינה" first, then the page asked for; no login screen and no Welcome at any moment', async () => {
    const m = mount('/profile', { restore: 'session', outcomes: ['active'] });
    expect(screen.getByRole('status')).toHaveTextContent('בטעינה');
    expect(protectedHeading()).toBeNull();
    expect(await screen.findByRole('heading', { level: 1, name: 'פרופיל' })).toBeInTheDocument();
    expect(path()).toBe('/profile');
    expect(screen.queryByRole('heading', { level: 1, name: WELCOME })).not.toBeInTheDocument();
    m.stop();
  });

  it('while /api/me has not answered, nothing protected is rendered (loading)', async () => {
    const m = mount('/feed', { restore: 'session' });
    m.accountState.mockImplementation(() => new Promise<Outcome>(() => undefined));
    await flush();
    expect(protectedHeading()).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'ניווט ראשי' })).not.toBeInTheDocument();
    m.stop();
  });

  it('a refresh token Auth refuses -> the user ends on /login (not Welcome), with no protected render', async () => {
    const m = mount('/feed', { restore: 'refused' });
    await waitFor(() => expect(path()).toBe('/login'));
    expect(m.seen).toEqual([]);
    m.stop();
  });

  it('nothing stored on a protected path -> / (Welcome) as a Guest, not /login', async () => {
    const m = mount('/feed', { restore: 'none' });
    expect(await screen.findByRole('heading', { level: 1, name: WELCOME })).toBeInTheDocument();
    expect(path()).toBe('/');
    m.stop();
  });
});

describe('[F1.5 c7] signed-in users and Guest routes', () => {
  it.each(['/login', '/register'])('a signed-in user opening %s is sent to /feed', async (p) => {
    const m = mount(p, { restore: 'session', outcomes: ['active'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'הפיד' })).toBeInTheDocument();
    expect(path()).toBe('/feed');
    m.stop();
  });

  it('[AC-004] sign-in with credentials Auth accepts and an active account: /login is replaced by /feed, focus on main, title "הפיד · Nestly"', async () => {
    const m = mount('/login', { restore: 'none', outcomes: ['active'] });
    await flush();
    expect(path()).toBe('/login');
    const before = window.history.length;
    await signInThroughSource(m.source);
    expect(await screen.findByRole('heading', { level: 1, name: 'הפיד' })).toBeInTheDocument();
    expect(path()).toBe('/feed');
    expect(document.title).toBe('הפיד · Nestly');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('main')));
    expect(window.history.length).toBe(before); // replaced, not pushed
    m.stop();
  });
});

describe('[F1.5 c8][c9] no protected screen at any moment', () => {
  it('[c8] a stopped account at sign-in stays on /login and no shell or protected line is ever added to the DOM', async () => {
    const m = mount('/login', { restore: 'none', outcomes: ['unavailable'] });
    await flush();
    await signInThroughSource(m.source);
    await flush();
    expect(path()).toBe('/login');
    expect(m.seen).toEqual([]);
    expect(m.authSignOut).toHaveBeenCalled();
    m.stop();
  });

  it.each(['unauthenticated', 'unreachable', 'failed'] as const)('[c9][rule 15] /api/me %s after Auth accepted: stays on /login, nothing protected ever rendered', async (bad) => {
    const m = mount('/login', { restore: 'none', outcomes: [bad] });
    await flush();
    await signInThroughSource(m.source);
    await flush();
    expect(path()).toBe('/login');
    expect(m.seen).toEqual([]);
    m.stop();
  });

  it('[c8] a stopped account noticed on a visible tab: the user leaves the protected page for /login; no protected content afterwards', async () => {
    const m = mount('/feed', { restore: 'session', outcomes: ['active', 'unavailable'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'הפיד' })).toBeInTheDocument();
    m.advance(61_000);
    await m.tabVisible();
    await waitFor(() => expect(path()).toBe('/login'));
    expect(protectedHeading()).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'ניווט ראשי' })).not.toBeInTheDocument();
    m.stop();
  });
});

describe('[F1.5 c15] signed in, no account yet', () => {
  it.each(['/feed', '/profile', '/settings', '/home', '/login', '/', '/xyz'])('%s leads to /register and never renders a protected page', async (p) => {
    const m = mount(p, { restore: 'session', outcomes: ['unregistered'] });
    await waitFor(() => expect(path()).toBe('/register'));
    expect(m.seen).toEqual([]);
    expect(screen.queryByRole('navigation', { name: 'ניווט ראשי' })).not.toBeInTheDocument();
    m.stop();
  });
});

describe('[F1.5 c14][FR-MENU-001] logout from the menu', () => {
  async function logout() {
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'פתיחת התפריט' }));
    await u.click(await screen.findByRole('button', { name: 'התנתקות' }));
  }

  it('ends the Auth session once, and the guard sends to / (Welcome) with no protected content left', async () => {
    const m = mount('/feed', { restore: 'session', outcomes: ['active'] });
    await screen.findByRole('heading', { level: 1, name: 'הפיד' });
    await logout();
    expect(await screen.findByRole('heading', { level: 1, name: WELCOME })).toBeInTheDocument();
    expect(path()).toBe('/');
    expect(m.authSignOut).toHaveBeenCalledTimes(1);
    expect(protectedHeading()).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'ניווט ראשי' })).not.toBeInTheDocument();
    m.stop();
  });

  it('browser Back after a logout does not render a protected screen', async () => {
    const m = mount('/', { restore: 'none', outcomes: ['active'] });
    await screen.findByRole('heading', { level: 1, name: WELCOME });
    await userEvent.setup().click(screen.getByRole('link', { name: 'כבר יש לי חשבון' }));
    await waitFor(() => expect(path()).toBe('/login'));
    await signInThroughSource(m.source);
    await screen.findByRole('heading', { level: 1, name: 'הפיד' });
    await logout();
    await screen.findByRole('heading', { level: 1, name: WELCOME });
    act(() => window.history.back());
    await flush();
    await flush();
    expect(protectedHeading()).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'ניווט ראשי' })).not.toBeInTheDocument();
    m.stop();
  });

  it('when the Auth sign-out call fails the user is still signed out (fail closed)', async () => {
    const m = mount('/feed', { restore: 'session', outcomes: ['active'], signOut: false });
    await screen.findByRole('heading', { level: 1, name: 'הפיד' });
    await logout();
    expect(await screen.findByRole('heading', { level: 1, name: WELCOME })).toBeInTheDocument();
    expect(protectedHeading()).toBeNull();
    m.stop();
  });
});

async function signInThroughSource(source: unknown): Promise<void> {
  const signIn: unknown = typeof source === 'object' && source !== null ? Reflect.get(source, 'signInWithPassword') : undefined;
  if (typeof signIn !== 'function') throw new Error('the session source has no signInWithPassword');
  await act(async () => {
    await Reflect.apply(signIn, source, [CREDS]);
  });
}
