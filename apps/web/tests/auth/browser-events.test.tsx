// F1.5 part b, Amendment 1 (criteria 12, 13): the real window events behind the session source, driven with jsdom-dispatched events.
// A write to the Auth key by another tab (a token refresh) must NOT sign this tab out; a removal or a full clear must. A tab that
// becomes hidden is not "visible". Derived from spec.md (Amendment 1) and interface.md only.
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '@/app/SessionProvider';
import { useSession } from '@/hooks/use-session';
import { windowBrowserEvents } from '@/platform/browser-events';
import { createAuthSessionSource } from '@/services/session/auth-session-source';

const KEY = 'nestly-auth';

const storageEvent = (init: StorageEventInit) => window.dispatchEvent(new StorageEvent('storage', init));
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  Reflect.deleteProperty(document, 'visibilityState');
  vi.restoreAllMocks();
});

describe('[F1.5 c12] windowBrowserEvents: which storage events mean "the session was removed elsewhere"', () => {
  function listen() {
    const removed = vi.fn();
    const stop = windowBrowserEvents(KEY).onSessionRemovedElsewhere(removed);
    return { removed, stop };
  }

  it('a write to the Auth key (newValue set: another tab refreshed the token) does not fire', () => {
    const { removed, stop } = listen();
    storageEvent({ key: KEY, oldValue: '{"a":1}', newValue: '{"a":2}' });
    storageEvent({ key: KEY, oldValue: null, newValue: '{"a":2}' });
    expect(removed).not.toHaveBeenCalled();
    stop();
  });

  it('a removal of the Auth key (newValue null) fires once per event', () => {
    const { removed, stop } = listen();
    storageEvent({ key: KEY, oldValue: '{"a":1}', newValue: null });
    expect(removed).toHaveBeenCalledTimes(1);
    stop();
  });

  it('a full clear (key null) fires', () => {
    const { removed, stop } = listen();
    storageEvent({ key: null, oldValue: null, newValue: null });
    expect(removed).toHaveBeenCalledTimes(1);
    stop();
  });

  it('another key being removed or written does not fire', () => {
    const { removed, stop } = listen();
    storageEvent({ key: 'theme', oldValue: 'dark', newValue: null });
    storageEvent({ key: 'nestly-auth-other', oldValue: 'x', newValue: null });
    storageEvent({ key: 'theme', oldValue: null, newValue: 'light' });
    expect(removed).not.toHaveBeenCalled();
    stop();
  });

  it('the listener uses the key it was given', () => {
    const removed = vi.fn();
    const stop = windowBrowserEvents('some-other-key').onSessionRemovedElsewhere(removed);
    storageEvent({ key: KEY, oldValue: 'x', newValue: null });
    expect(removed).not.toHaveBeenCalled();
    storageEvent({ key: 'some-other-key', oldValue: 'x', newValue: null });
    expect(removed).toHaveBeenCalledTimes(1);
    stop();
  });

  it('after stop() nothing fires', () => {
    const { removed, stop } = listen();
    stop();
    storageEvent({ key: KEY, oldValue: 'x', newValue: null });
    storageEvent({ key: null, oldValue: null, newValue: null });
    expect(removed).not.toHaveBeenCalled();
  });
});

describe('[F1.5 c13] windowBrowserEvents: the tab becoming visible', () => {
  it('visibilitychange to visible fires; to hidden does not; after stop() nothing', () => {
    const visible = vi.fn();
    const stop = windowBrowserEvents(KEY).onTabVisible(visible);
    setVisibility('hidden');
    expect(visible).not.toHaveBeenCalled();
    setVisibility('visible');
    expect(visible).toHaveBeenCalledTimes(1);
    stop();
    setVisibility('visible');
    expect(visible).toHaveBeenCalledTimes(1);
  });

  it('[Amendment 1] isTabVisible is provided and follows document.visibilityState (the restore retry runs only while visible)', () => {
    const events = windowBrowserEvents(KEY);
    expect(typeof events.isTabVisible).toBe('function');
    setVisibility('hidden');
    expect(events.isTabVisible?.()).toBe(false);
    setVisibility('visible');
    expect(events.isTabVisible?.()).toBe(true);
  });
});

describe('[F1.5 c12] the session source with the real window events', () => {
  let state = '';
  let notice: string | null = null;
  function Probe() {
    const s = useSession();
    state = s.state;
    notice = s.notice;
    return <output>{s.state}</output>;
  }

  async function signedInTab() {
    const accountState = vi.fn((token: string) => {
      void token;
      return Promise.resolve<'active'>('active');
    });
    const source = createAuthSessionSource({
      auth: {
        signIn: vi.fn(() => Promise.resolve({ accessToken: 'tok', failure: null })),
        restore: vi.fn(() => Promise.resolve<'session'>('session')),
        getAccessToken: vi.fn(() => Promise.resolve('tok')),
        signOut: vi.fn(() => Promise.resolve(true)),
        subscribe: vi.fn(() => () => undefined),
      },
      accountState,
      now: () => 1_000_000,
      events: windowBrowserEvents(KEY),
    });
    render(
      <SessionProvider source={source}>
        <Probe />
      </SessionProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(state).toBe('signed-in');
    return accountState;
  }

  it("another tab's refresh (a write to the key) leaves this tab signed-in, with no /api/me call and no notice", async () => {
    const accountState = await signedInTab();
    await act(async () => {
      storageEvent({ key: KEY, oldValue: '{"a":1}', newValue: '{"a":2}' });
      await Promise.resolve();
    });
    expect(state).toBe('signed-in');
    expect(notice).toBeNull();
    expect(accountState).toHaveBeenCalledTimes(1);
  });

  it("another tab's logout (the key removed) signs this tab out at once, without a notice", async () => {
    await signedInTab();
    await act(async () => {
      storageEvent({ key: KEY, oldValue: '{"a":1}', newValue: null });
      await Promise.resolve();
    });
    expect(state).toBe('signed-out');
    expect(notice).toBeNull();
  });

  it('a clear of all storage (key null) signs this tab out', async () => {
    await signedInTab();
    await act(async () => {
      storageEvent({ key: null, oldValue: null, newValue: null });
      await Promise.resolve();
    });
    expect(state).toBe('signed-out');
  });
});
