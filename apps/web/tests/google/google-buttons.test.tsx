// F1.8 P3 criterion 17, the part a real browser build cannot reach: Auth not configured. Pressing "המשך עם Google" shows the criterion 3
// text inline and starts no navigation. Derived from .work/google-sign-in/spec.md only; the real Auth client with a blank config.
import type { ReactNode } from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { GoogleSignInContext, useGoogleSignIn } from '@/hooks/use-google-sign-in';
import type { GoogleSignIn } from '@/services/auth/google-sign-in';
import { createAuthPort } from '@/services/auth/auth-client';
import { createAuthSessionSource } from '@/services/session/auth-session-source';

const FAIL = 'לא הצלחנו להשלים את הכניסה עם Google. אפשר לנסות שוב, או להתחבר עם אימייל וסיסמה.';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('F1.8 c17 Auth not configured [FR-AUTH-005]', () => {
  it.each([['Welcome', '/'], ['Login', '/login'], ['Register step 1', '/register']])(
    '[F1.8 c17] %s: pressing the button shows the failure text inline and navigates nowhere',
    async (_name, path) => {
      const fetchStub = vi.fn(() => Promise.reject(new Error('no network expected')));
      const auth = createAuthPort({ url: '', publishableKey: '' }, { fetch: fetchStub });
      const source = createAuthSessionSource({
        auth,
        accountState: () => Promise.resolve('active'),
        now: () => Date.now(),
        events: { onTabVisible: () => () => undefined, onSessionRemovedElsewhere: () => () => undefined },
      });
      act(() => {
        window.history.replaceState(null, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      render(<App sessionSource={source} authPort={auth} />);
      await userEvent.setup().click(await screen.findByRole('button', { name: 'המשך עם Google' }));
      expect(await screen.findByText(FAIL)).toBeTruthy();
      expect(window.location.pathname).toBe(path);
      expect(fetchStub).not.toHaveBeenCalled();
    },
  );
});

describe('F1.8 c16 back/forward cache [FR-AUTH-005]', () => {
  it('[F1.8 c16] a page restored from the back/forward cache resets a button left busy, and it can be pressed again', () => {
    let restore: () => void = () => undefined;
    const stop = vi.fn();
    const start = vi.fn(() => new Promise<'left' | 'failed'>(() => undefined)); // the browser left: never settles
    const google: GoogleSignIn = {
      start,
      onRestoredFromCache: (listener) => {
        restore = listener;
        return stop;
      },
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <GoogleSignInContext.Provider value={google}>{children}</GoogleSignInContext.Provider>
    );
    const { result, unmount } = renderHook(() => useGoogleSignIn(), { wrapper });
    act(() => result.current.onPress());
    expect(result.current.busy).toBe(true);
    act(() => result.current.onPress());
    expect(start).toHaveBeenCalledTimes(1);
    act(() => restore());
    expect(result.current.busy).toBe(false);
    expect(result.current.message).toBeNull();
    act(() => result.current.onPress());
    expect(start).toHaveBeenCalledTimes(2);
    unmount();
    expect(stop).toHaveBeenCalled();
  });
});
