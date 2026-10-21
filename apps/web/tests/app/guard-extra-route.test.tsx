// F1.2 criterion 6: "a route added in a test, and not on the list, is protected."
// The RouteGuard is rendered over a <Routes> that holds an extra <Route> on neither list; a Guest is redirected to /,
// a signed-in user to /feed (DR-1), and the extra route's element is never rendered for either.
// Relative imports, so the file also runs from the repository root, where the '@' alias is not defined.
// Derived from .work/app-shell-guard/spec.md only; the component interfaces are the ones given by ORCHESTRATOR.
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { RouteGuard } from '../../src/app/RouteGuard';
import { SessionProvider } from '../../src/app/SessionProvider';
import { createControllableSessionSource } from '../../src/services/session/controllable-session-source';

type State = 'loading' | 'signed-in' | 'signed-out';

function setup(initialPath: string, state: State) {
  const source = createControllableSessionSource(state);
  const extraRendered = vi.fn();
  const Extra = () => {
    extraRendered();
    return <p>EXTRA-ROUTE-CONTENT</p>;
  };
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SessionProvider source={source}>
        <RouteGuard>
          <Routes>
            <Route path="/" element={<p>LANDING-ROOT</p>} />
            <Route path="/feed" element={<p>LANDING-FEED</p>} />
            <Route path="/marketplace" element={<Extra />} />
            <Route path="/not-on-any-list/deep" element={<Extra />} />
            <Route path="*" element={<Extra />} />
          </Routes>
        </RouteGuard>
      </SessionProvider>
    </MemoryRouter>,
  );
  return { source, extraRendered };
}

describe('a route that is on neither list is protected (6)', () => {
  it.each(['/coupons', '/not-on-any-list/deep', '/anything-else'])(
    '[F1.2 c6][FR-AUTH-004] a Guest on the added route %s is redirected to / and its element is never rendered',
    async (path) => {
      const { extraRendered } = setup(path, 'signed-out');
      expect(await screen.findByText('LANDING-ROOT')).toBeInTheDocument();
      expect(screen.queryByText('EXTRA-ROUTE-CONTENT')).not.toBeInTheDocument();
      expect(extraRendered).not.toHaveBeenCalled();
    },
  );

  it.each(['/coupons', '/not-on-any-list/deep', '/anything-else'])(
    '[F1.2 c6][c10][FR-AUTH-004][DR-1] a signed-in user on the added route %s is redirected to /feed and its element is never rendered',
    async (path) => {
      const { extraRendered } = setup(path, 'signed-in');
      expect(await screen.findByText('LANDING-FEED')).toBeInTheDocument();
      expect(screen.queryByText('EXTRA-ROUTE-CONTENT')).not.toBeInTheDocument();
      expect(extraRendered).not.toHaveBeenCalled();
    },
  );

  it('[F1.2 c6][c7][FR-AUTH-004] while loading, the added route is not rendered and a status reads "בטעינה"', () => {
    const { extraRendered } = setup('/coupons', 'loading');
    expect(screen.getByRole('status')).toHaveTextContent('בטעינה');
    expect(screen.queryByText('EXTRA-ROUTE-CONTENT')).not.toBeInTheDocument();
    expect(extraRendered).not.toHaveBeenCalled();
  });

  it('[F1.2 c6][c7][FR-AUTH-004] loading, then signed-in: the added route still redirects to /feed and never renders', async () => {
    const { source, extraRendered } = setup('/coupons', 'loading');
    act(() => source.set('signed-in'));
    expect(await screen.findByText('LANDING-FEED')).toBeInTheDocument();
    expect(extraRendered).not.toHaveBeenCalled();
  });

  it('[F1.2 c6][c8][FR-AUTH-004] a signed-in session that ends leaves the user at / and the added route never renders', async () => {
    const { source, extraRendered } = setup('/feed', 'signed-in');
    expect(await screen.findByText('LANDING-FEED')).toBeInTheDocument();
    act(() => source.set('signed-out'));
    expect(await screen.findByText('LANDING-ROOT')).toBeInTheDocument();
    expect(screen.queryByText('LANDING-FEED')).not.toBeInTheDocument();
    expect(extraRendered).not.toHaveBeenCalled();
  });

  it('[F1.2 c6][c9][FR-AUTH-004] a signed-in session whose source fails leaves the user at / (fails closed) and the added route never renders', async () => {
    const { source, extraRendered } = setup('/feed', 'signed-in');
    expect(await screen.findByText('LANDING-FEED')).toBeInTheDocument();
    act(() => source.fail());
    expect(await screen.findByText('LANDING-ROOT')).toBeInTheDocument();
    expect(screen.queryByText('LANDING-FEED')).not.toBeInTheDocument();
    expect(extraRendered).not.toHaveBeenCalled();
  });
});
