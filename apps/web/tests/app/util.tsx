// F1.2 test helpers: render the app at a path, with the production session source (always signed-out, criterion 13).
import { act, render, screen } from '@testing-library/react';
import { App } from '@/app/App';

/** Points the jsdom location at `path` (works for BrowserRouter and for a module-level data router) and renders the app. */
export async function mountAt(path: string): Promise<ReturnType<typeof render>> {
  act(() => {
    window.history.replaceState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const view = render(<App />);
  // Let the session source resolve and the guard act.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

/** A Welcome action or back control: a link or a button with this name. */
export function actionNamed(name: string): HTMLElement {
  return screen.queryByRole('link', { name }) ?? screen.getByRole('button', { name });
}

export const h1 = (): HTMLElement => screen.getByRole('heading', { level: 1 });
