import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { DirectionProvider } from '@/components/ui/direction-provider';
import type { ControllableSessionSource } from '@/services/session/controllable-session-source';
import type { SessionSource } from '@/services/session/session-source';
import '@/styles/index.css';

declare global {
  interface Window {
    /** Only in the `e2e` build mode: the session source the end-to-end tests drive. */
    nestlyTestSession?: ControllableSessionSource;
    /** Only read in the `e2e` build mode: set to true (Playwright `addInitScript`) before the page loads to run the real session source. */
    nestlyRealSession?: boolean;
  }
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root element #root not found');
}

// The `e2e` build mode (npm run build:e2e) swaps in the test-only source, unless the test sets `window.nestlyRealSession` first:
// then the app runs the real source (Auth and /api/me are stubbed at the network layer, F1.5 criteria 10, 14). In every other mode
// the branch is constant-false, so the bundler drops it and the test source never reaches the deployed build.
let sessionSource: SessionSource | undefined;
if (import.meta.env.MODE === 'e2e' && window.nestlyRealSession !== true) {
  const { createControllableSessionSource } = await import('@/services/session/controllable-session-source');
  const testSource = createControllableSessionSource();
  window.nestlyTestSession = testSource;
  sessionSource = testSource;
}

createRoot(container).render(
  <StrictMode>
    <DirectionProvider>
      <App {...(sessionSource !== undefined ? { sessionSource } : {})} />
    </DirectionProvider>
  </StrictMode>,
);
