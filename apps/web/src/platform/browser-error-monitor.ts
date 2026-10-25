// The browser half of error monitoring (SRS §12): starts Sentry in the page. Loaded only when the build has a DSN (main.tsx), as
// its own chunk, so a build without one never downloads it. Errors only: no tracing, no Session Replay, no session pings, no
// console breadcrumbs, no data collection; the caller's scrubber runs last on every event and breadcrumb.
import {
  breadcrumbsIntegration,
  browserApiErrorsIntegration,
  dedupeIntegration,
  globalHandlersIntegration,
  httpContextIntegration,
  init,
  linkedErrorsIntegration,
  type Breadcrumb,
  type ErrorEvent,
} from '@sentry/react';

export interface BrowserErrorMonitorOptions {
  readonly dsn: string;
  readonly environment: string;
  readonly release?: string;
  readonly scrubEvent: (event: ErrorEvent) => ErrorEvent | null;
  readonly scrubBreadcrumb: (breadcrumb: Breadcrumb) => Breadcrumb | null;
}

export function startBrowserErrorMonitor(options: BrowserErrorMonitorOptions): void {
  init({
    dsn: options.dsn,
    environment: options.environment,
    ...(options.release === undefined ? {} : { release: options.release }),
    // Of the headers, the browser's user agent only (Chrome or Edge, which version); no cookies, bodies, query or user.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ['User-Agent'] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    traceLifecycle: 'static',
    sendClientReports: false,
    maxBreadcrumbs: 30,
    defaultIntegrations: false,
    integrations: [
      browserApiErrorsIntegration(),
      breadcrumbsIntegration({ dom: { maxStringLength: 80 }, fetch: true, xhr: true, history: true, sentry: false }),
      globalHandlersIntegration(),
      linkedErrorsIntegration(),
      dedupeIntegration(),
      httpContextIntegration(),
    ],
    initialScope: { tags: { surface: 'web' } },
    beforeBreadcrumb: options.scrubBreadcrumb,
    beforeSend: options.scrubEvent,
    beforeSendTransaction: () => null,
  });
}
