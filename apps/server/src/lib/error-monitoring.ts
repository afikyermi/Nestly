// Error monitoring of the server (SRS §12 "Error monitoring"; Afik 24.10.2026: Sentry only, errors only, no separate logger).
// Started only where SENTRY_DSN is set (Vercel Production and Preview); locally, in tests and in CI there is no DSN and every call
// is a no-op. Errors only: no tracing, no spans, no breadcrumbs, no request data, no default PII; every event passes the allow-list
// scrubber (scrub-error-event.ts) last. The SDK is imported on the first report only (27.10): loading it costs a cold start hundreds of
// milliseconds of CPU that the instance's first requests would queue behind, and most instances never report. The report is sent once
// the SDK is ready.

import { scrubServerEvent } from './scrub-error-event.js';

type SentryNode = typeof import('@sentry/node');
type Env = Readonly<Record<string, string | undefined>>;

/** What an error report says about where it happened. The route is the template (`/api/posts/:id`), never the address. */
export interface ErrorReport {
  readonly route: string;
  readonly method: string;
  readonly status: number;
  /** Which function: the request server or the background job. */
  readonly surface: 'api' | 'jobs';
}

export interface ErrorMonitor {
  readonly enabled: boolean;
  /** An error object (its type, scrubbed message and stack). */
  capture(error: unknown, report: ErrorReport): void;
  /** A 5xx answered without a thrown error: the status and route only. */
  captureStatus(report: ErrorReport): void;
  /** Waits until reports in flight are sent, at most `timeoutMs`. Resolves at once when disabled. */
  flush(timeoutMs?: number): Promise<void>;
}

export const noErrorMonitor: ErrorMonitor = {
  enabled: false,
  capture: () => undefined,
  captureStatus: () => undefined,
  flush: () => Promise.resolve(),
};

/** The SDK options; exported for the test that asserts what is and is not turned on. */
export function sentryOptions(sentry: SentryNode, dsn: string, env: Env): Parameters<SentryNode['initWithoutDefaultIntegrations']>[0] {
  const release = env.VERCEL_GIT_COMMIT_SHA?.trim();
  return {
    dsn,
    environment: env.VERCEL_ENV?.trim() || 'development',
    ...(release ? { release } : {}),
    // SDK 11 replaced `sendDefaultPii` with per-category switches; every one is off (no user, cookies, headers, bodies, query,
    // database values, queue arguments, frame variables or source lines).
    dataCollection: NO_DATA_COLLECTION,
    includeServerName: false,
    includeLocalVariables: false,
    sendClientReports: false,
    maxBreadcrumbs: 0,
    // Errors only. No tracesSampleRate: any value, even 0, turns tracing on in SDK 11 (it adds span streaming); left out, no span
    // is ever created. 'static' keeps SDK 11 from adding its span-streaming integration. Anything that is not an error event is
    // dropped before it leaves.
    traceLifecycle: 'static',
    // The SDK also reads SENTRY_DEBUG (it would print events to the function's log), SENTRY_SPOTLIGHT (a second destination) and
    // SENTRY_TRACES_SAMPLE_RATE (tracing) from the environment: the first two are fixed off here, the third is cleared after init
    // (withoutTracing), so no environment setting can turn any of them on.
    debug: false,
    spotlight: false,
    enableOpenTelemetrySetup: false,
    beforeSendTransaction: () => null,
    beforeBreadcrumb: () => null,
    // initWithoutDefaultIntegrations: nothing reads requests, console, HTTP calls, source lines or local variables.
    integrations: [
      sentry.linkedErrorsIntegration(),
      sentry.dedupeIntegration(),
      sentry.onUncaughtExceptionIntegration(),
      // 'strict' keeps Node's own behaviour on an unhandled rejection (the process ends), after the report.
      sentry.onUnhandledRejectionIntegration({ mode: 'strict' }),
    ],
    beforeSend: scrubServerEvent,
  };
}

export const NO_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  frameContextLines: 0,
} as const satisfies NonNullable<NonNullable<Parameters<SentryNode['init']>[0]>['dataCollection']>;

const DEFAULT_FLUSH_MS = 1500;

/**
 * Errors only, whatever the environment says: the SDK takes the trace sample rate from SENTRY_TRACES_SAMPLE_RATE when the options leave
 * it out, and any value turns tracing on. Removing it from the started client's options keeps span recording off.
 */
export function withoutTracing(client: { getOptions(): { tracesSampleRate?: number; tracesSampler?: unknown } } | undefined): void {
  if (client === undefined) return;
  const options = client.getOptions();
  delete options.tracesSampleRate;
  delete options.tracesSampler;
}

export function startErrorMonitor(env: Env, load: () => Promise<SentryNode> = () => import('@sentry/node')): ErrorMonitor {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return noErrorMonitor;
  let ready: Promise<SentryNode | undefined> | undefined;
  const sdk = (): Promise<SentryNode | undefined> =>
    (ready ??= load()
      .then((sentry) => {
        withoutTracing(sentry.initWithoutDefaultIntegrations(sentryOptions(sentry, dsn, env)));
        return sentry;
      })
      // Monitoring never breaks the server: a failed load or init leaves it off.
      .catch(() => undefined));
  const tags = (report: ErrorReport): Record<string, string> => ({
    route: report.route,
    method: report.method,
    status: String(report.status),
    surface: report.surface,
  });
  return {
    enabled: true,
    capture(error, report) {
      void sdk().then((sentry) => sentry?.withScope((scope) => {
        scope.setTags(tags(report));
        sentry.captureException(error);
      }));
    },
    captureStatus(report) {
      void sdk().then((sentry) => sentry?.withScope((scope) => {
        scope.setTags(tags(report));
        // One issue per status and route template: the fingerprint keeps different routes apart.
        scope.setFingerprint(['http-status', String(report.status), report.route]);
        sentry.captureMessage(`HTTP ${report.status} ${report.method} ${report.route}`, 'error');
      }));
    },
    async flush(timeoutMs = DEFAULT_FLUSH_MS) {
      // Nothing reported yet: nothing to send, and no reason to load the SDK.
      if (ready === undefined) return;
      const sentry = await ready;
      if (sentry !== undefined) await sentry.flush(timeoutMs);
    },
  };
}
