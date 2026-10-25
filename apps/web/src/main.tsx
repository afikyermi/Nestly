import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { DirectionProvider } from '@/components/ui/direction-provider';
import type { ControllableSessionSource } from '@/services/session/controllable-session-source';
import type { SessionSource } from '@/services/session/session-source';
import { monitorConfig } from '@/services/monitoring/monitor-config';
import '@/styles/index.css';

declare global {
  interface Window {
    /** Only in the `e2e` build mode: the session source the end-to-end tests drive. */
    nestlyTestSession?: ControllableSessionSource;
    /** Only read in the `e2e` build mode: set to true (Playwright `addInitScript`) before the page loads to run the real session source. */
    nestlyRealSession?: boolean;
  }
}

// Error monitoring (SRS §12): only a build with a Sentry DSN loads it, as a separate chunk, without holding up the first render. A
// failed load leaves the app as it is. Each name is read on its own: the build replaces the two deploy values one expression at a time
// (vite.config.ts), so they are not in the `import.meta.env` object.
const monitor = monitorConfig({
  VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
  VITE_DEPLOY_ENV: import.meta.env.VITE_DEPLOY_ENV,
  VITE_DEPLOY_RELEASE: import.meta.env.VITE_DEPLOY_RELEASE,
});
if (monitor !== undefined) {
  void Promise.all([import('@/platform/browser-error-monitor'), import('@/services/monitoring/scrub-browser-event')])
    .then(([{ startBrowserErrorMonitor }, { scrubBrowserEvent, scrubBreadcrumb }]) => {
      startBrowserErrorMonitor({ ...monitor, scrubEvent: scrubBrowserEvent, scrubBreadcrumb });
    })
    .catch(() => undefined);
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
