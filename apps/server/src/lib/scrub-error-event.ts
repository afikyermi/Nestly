// The last step before a server error report leaves for Sentry (SRS §12 "Error monitoring": errors only, no personal data;
// NFR-PRIV-001). An allow-list: the event keeps what finds a bug — the error's type, its scrubbed message, the stack frames' file,
// line and function, the route template, method and status — and loses everything else. Request data (body, cookies, headers,
// query, the address itself), the user, IP, extra data, breadcrumbs, the host name, modules and frame variables are removed even
// though the SDK is configured not to collect them, so a future integration or SDK default cannot start sending them.

import { scrubText, templateUrl } from '@nestly/shared';
import type { ErrorEvent, Exception, StackFrame } from '@sentry/node';

/** The only tags an event may carry (set by error-monitoring.ts). */
export const ALLOWED_TAGS = ['route', 'method', 'status', 'surface'] as const;
/** The only contexts kept: the trace id groups one request's events, the runtime is Node's version. */
const ALLOWED_CONTEXTS = ['trace', 'runtime'] as const;

function scrubFrame(frame: StackFrame): StackFrame {
  const kept: StackFrame = {};
  if (frame.filename !== undefined) kept.filename = templateUrl(frame.filename);
  if (frame.abs_path !== undefined) kept.abs_path = templateUrl(frame.abs_path);
  if (frame.module !== undefined) kept.module = frame.module;
  if (frame.function !== undefined) kept.function = frame.function;
  if (frame.lineno !== undefined) kept.lineno = frame.lineno;
  if (frame.colno !== undefined) kept.colno = frame.colno;
  if (frame.in_app !== undefined) kept.in_app = frame.in_app;
  return kept;
}

export function scrubException(exception: Exception): Exception {
  const kept: Exception = {};
  if (exception.type !== undefined) kept.type = exception.type;
  if (exception.value !== undefined) kept.value = scrubText(exception.value);
  if (exception.mechanism !== undefined) {
    // The mechanism's `data` may carry handler arguments; only the fields that say how the error was caught are copied.
    const { type, handled, synthetic, exception_id, parent_id, is_exception_group, source } = exception.mechanism;
    kept.mechanism = {
      type,
      ...(handled === undefined ? {} : { handled }),
      ...(synthetic === undefined ? {} : { synthetic }),
      ...(exception_id === undefined ? {} : { exception_id }),
      ...(parent_id === undefined ? {} : { parent_id }),
      ...(is_exception_group === undefined ? {} : { is_exception_group }),
      ...(source === undefined ? {} : { source }),
    };
  }
  if (exception.stacktrace?.frames !== undefined) kept.stacktrace = { frames: exception.stacktrace.frames.map(scrubFrame) };
  return kept;
}

function pick<V>(source: Readonly<Record<string, V>> | undefined, keys: readonly string[]): Record<string, V> | undefined {
  if (source === undefined) return undefined;
  const entries = Object.entries(source).filter(([key]) => keys.includes(key));
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

/** Sentry's `beforeSend` for the server. Returns the same event, reduced; never drops it. */
export function scrubServerEvent(event: ErrorEvent): ErrorEvent {
  delete event.request;
  delete event.user;
  delete event.extra;
  delete event.breadcrumbs;
  delete event.server_name;
  delete event.modules;
  delete event.sdkProcessingMetadata;
  delete event.threads;
  const tags = pick(event.tags, ALLOWED_TAGS);
  if (tags === undefined) delete event.tags;
  else event.tags = tags;
  const contexts = pick(event.contexts, ALLOWED_CONTEXTS);
  if (contexts === undefined) delete event.contexts;
  else event.contexts = contexts;
  if (event.message !== undefined) event.message = scrubText(event.message);
  if (event.logentry !== undefined) event.logentry = { message: scrubText(event.logentry.message ?? '') };
  if (event.transaction !== undefined) event.transaction = templateUrl(event.transaction);
  if (event.exception?.values !== undefined) event.exception = { values: event.exception.values.map(scrubException) };
  return event;
}
