// F1.2 criteria 2, 3, 5, 6, 13 (and the titles of 24) at unit level, through the whole App with the production
// session source (always signed-out, criterion 13). The signed-in states are driven in the Playwright specs
// (e2e/app-shell-guard*.spec.ts), which also cover //home and the other URL forms jsdom cannot hold.
// Derived from .work/app-shell-guard/spec.md only.
// Runs with `npm test -w @nestly/web` (the '@' alias lives in the web vite config).
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { actionNamed, h1, mountAt } from './util';

const WELCOME = 'הצטרפות ל-Nestly';
const LINE = 'המסך הזה ייפתח בקרוב.';

describe('Guest routes render their own placeholder (6, 2, 3)', () => {
  it.each([
    ['/login', 'התחברות'],
    ['/register', 'פרטים אישיים'], // F1.3: /register is registration step 1 (was the placeholder h1 "הרשמה")
  ])('[F1.2 c6][c2][c3][FR-AUTH-001] %s shows the h1 %s and a back control', async (path, title) => {
    await mountAt(path);
    expect(h1()).toHaveTextContent(title);
    expect(window.location.pathname).toBe(path);
    expect(actionNamed('חזרה')).toBeInTheDocument();
  });

  // F1.8 c3/c14: /auth/google is the Google return route, not a placeholder (no h1 "המשך עם Google", no back control assumed); the
  // Google button starts the sign-in (P3) instead of navigating to it.
  it('[F1.2 c2][c3][FR-AUTH-001][AC-001] "יצירת חשבון חדש" goes to /register, "כבר יש לי חשבון" to /login, each with a way back', async () => {
    for (const [action, path] of [
      ['יצירת חשבון חדש', '/register'],
      ['כבר יש לי חשבון', '/login'],
    ] as const) {
      const { unmount } = await mountAt('/');
      expect(h1()).toHaveTextContent(WELCOME);
      fireEvent.click(actionNamed(action));
      await screen.findByRole('heading', { level: 1, name: (n) => n !== WELCOME });
      expect(window.location.pathname).toBe(path);
      expect(window.location.pathname).not.toMatch(/account|type/);
      fireEvent.click(actionNamed('חזרה'));
      await screen.findByRole('heading', { level: 1, name: WELCOME });
      expect(window.location.pathname).toBe('/');
      unmount();
    }
  });

  it('[F1.2 c3][FR-AUTH-005][AC-087] no Welcome action or Guest placeholder calls fetch or sendBeacon', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in F1.2'));
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    for (const path of ['/login', '/register']) {
      const { unmount } = await mountAt(path);
      unmount();
    }
    await mountAt('/');
    for (const name of ['יצירת חשבון חדש', 'כבר יש לי חשבון']) {
      fireEvent.click(actionNamed(name));
      await screen.findByRole('heading', { level: 1, name: (n) => n !== WELCOME });
      fireEvent.click(actionNamed('חזרה'));
      await screen.findByRole('heading', { level: 1, name: WELCOME });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('The production source reports signed-out and the guard denies by default (5, 6, 13)', () => {
  it.each(['/home', '/feed', '/profile', '/settings', '/marketplace', '/profile/123', '/xyz', '/auth', '/login/extra'])(
    '[F1.2 c5][c6][c13][FR-AUTH-004][AC-016][ERR-012] a Guest at %s ends at / with Welcome and no protected content',
    async (path) => {
      await mountAt(path);
      expect(await screen.findByRole('heading', { level: 1, name: WELCOME })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/');
      expect(screen.queryByText(LINE)).not.toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'ניווט ראשי' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'פתיחת התפריט' })).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('[F1.2 c5][FR-AUTH-004] the redirect replaces the history entry: history.length is unchanged', async () => {
    window.history.replaceState(null, '', '/feed');
    const before = window.history.length;
    await mountAt('/feed');
    expect(window.location.pathname).toBe('/');
    expect(window.history.length).toBe(before);
  });

  it('[F1.2 c5][FR-AUTH-004] hostile paths: query, hash and encoded segments do not reach a protected placeholder', async () => {
    for (const path of ['/feed?next=/login', '/feed#x', '/profile/%2e%2e/settings', '/%66eed']) {
      const { unmount } = await mountAt(path);
      expect(await screen.findByRole('heading', { level: 1, name: WELCOME }), path).toBeInTheDocument();
      expect(screen.queryByText(LINE), path).not.toBeInTheDocument();
      unmount();
    }
  });

  it('[F1.2 c24][NFR-A11Y-001] the title of Welcome is "Nestly" and of a Guest placeholder "<h1> · Nestly"', async () => {
    const { unmount } = await mountAt('/');
    expect(document.title).toBe('Nestly');
    unmount();
    await mountAt('/login');
    expect(document.title).toBe('התחברות · Nestly');
  });
});
