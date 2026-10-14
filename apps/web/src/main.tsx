import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { DirectionProvider } from '@/components/ui/direction-provider';
import type { ControllableSessionSource } from '@/services/session/controllable-session-source';
import { productionSessionSource } from '@/services/session/production-session-source';
import type { SessionSource } from '@/services/session/session-source';
import '@/styles/index.css';

declare global {
  interface Window {
    /** Only in the `e2e` build mode: the session source the end-to-end tests drive. */
    nestlyTestSession?: ControllableSessionSource;
  }
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root element #root not found');
}

// The `e2e` build mode (npm run build:e2e) swaps in the test-only source. In every other mode the branch is
// constant-false, so the bundler drops it and the test source never reaches the deployed build.
let sessionSource: SessionSource = productionSessionSource;
if (import.meta.env.MODE === 'e2e') {
  const { createControllableSessionSource } = await import('@/services/session/controllable-session-source');
  const testSource = createControllableSessionSource();
  window.nestlyTestSession = testSource;
  sessionSource = testSource;
}

createRoot(container).render(
  <StrictMode>
    <DirectionProvider>
      <App sessionSource={sessionSource} />
    </DirectionProvider>
  </StrictMode>,
);
