// The last step before a browser error report leaves for Sentry (SRS §12 "Error monitoring": errors only, no personal data;
// NFR-PRIV-001). An allow-list: the event keeps the error's type, its scrubbed message, the stack frames, the page as a route template
// (`/u/:id`, never the address) and the browser's user agent, so a bug can be found and told apart by browser. Everything else goes:
// the user, extra data, cookies, the query, foreign tags and contexts. Breadcrumbs keep only page changes, clicks and calls to the
// server, each as a route template, never console output or what was typed.

import { scrubText, templateUrl } from '@nestly/shared';
import type { Breadcrumb, ErrorEvent, Exception, StackFrame } from '@sentry/react';

const KEPT_CONTEXTS = ['trace'] as const;
const KEPT_TAGS = ['surface'] as const;
const KEPT_BREADCRUMB_DATA = ['method', 'status_code'] as const;
const URL_BREADCRUMB_DATA = ['url', 'from', 'to'] as const;

function pick<V>(source: Readonly<Record<string, V>> | undefined, keys: readonly string[]): Record<string, V> | undefined {
  if (source === undefined) return undefined;
  const entries = Object.entries(source).filter(([key]) => keys.includes(key));
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function scrubFrame(frame: StackFrame): StackFrame {
  const kept: StackFrame = {};
  if (frame.filename !== undefined) kept.filename = templateUrl(frame.filename);
  if (frame.abs_path !== undefined) kept.abs_path = templateUrl(frame.abs_path);
  if (frame.function !== undefined) kept.function = frame.function;
  if (frame.lineno !== undefined) kept.lineno = frame.lineno;
  if (frame.colno !== undefined) kept.colno = frame.colno;
  if (frame.in_app !== undefined) kept.in_app = frame.in_app;
  return kept;
}

function scrubException(exception: Exception): Exception {
  const kept: Exception = {};
  if (exception.type !== undefined) kept.type = exception.type;
  if (exception.value !== undefined) kept.value = scrubText(exception.value);
  if (exception.mechanism !== undefined) {
    const { type, handled, synthetic } = exception.mechanism;
    kept.mechanism = { type, ...(handled === undefined ? {} : { handled }), ...(synthetic === undefined ? {} : { synthetic }) };
  }
  if (exception.stacktrace?.frames !== undefined) kept.stacktrace = { frames: exception.stacktrace.frames.map(scrubFrame) };
  return kept;
}

/** Sentry's `beforeBreadcrumb` and the breadcrumb half of `beforeSend`: a kept breadcrumb, reduced, or null. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const category = breadcrumb.category ?? '';
  const kind = category === 'navigation' || category === 'fetch' || category === 'xhr' ? category : category === 'ui.click' ? 'click' : undefined;
  if (kind === undefined) return null;
  const kept: Breadcrumb = { category };
  if (breadcrumb.timestamp !== undefined) kept.timestamp = breadcrumb.timestamp;
  if (breadcrumb.type !== undefined) kept.type = breadcrumb.type;
  if (breadcrumb.level !== undefined) kept.level = breadcrumb.level;
  // A click's message is the element's selector: its attributes (a label, a title) may hold a name, so they are scrubbed.
  if (kind === 'click' && breadcrumb.message !== undefined) kept.message = scrubText(breadcrumb.message);
  const data: Record<string, unknown> = {};
  for (const key of KEPT_BREADCRUMB_DATA) {
    const value: unknown = breadcrumb.data?.[key];
    if (typeof value === 'string' || typeof value === 'number') data[key] = value;
  }
  for (const key of URL_BREADCRUMB_DATA) {
    const value: unknown = breadcrumb.data?.[key];
    if (typeof value === 'string') data[key] = templateUrl(value);
  }
  if (Object.keys(data).length > 0) kept.data = data;
  return kept;
}

/** Sentry's `beforeSend` for the web app. Returns the same event, reduced; never drops it. */
export function scrubBrowserEvent(event: ErrorEvent): ErrorEvent {
  const userAgent = event.request?.headers?.['User-Agent'];
  const url = event.request?.url;
  delete event.request;
  if (url !== undefined || userAgent !== undefined) {
    event.request = { ...(url === undefined ? {} : { url: templateUrl(url) }), ...(userAgent === undefined ? {} : { headers: { 'User-Agent': userAgent } }) };
  }
  delete event.user;
  delete event.extra;
  delete event.server_name;
  delete event.modules;
  delete event.sdkProcessingMetadata;
  const tags = pick(event.tags, KEPT_TAGS);
  if (tags === undefined) delete event.tags;
  else event.tags = tags;
  const contexts = pick(event.contexts, KEPT_CONTEXTS);
  if (contexts === undefined) delete event.contexts;
  else event.contexts = contexts;
  if (event.message !== undefined) event.message = scrubText(event.message);
  if (event.logentry !== undefined) event.logentry = { message: scrubText(event.logentry.message ?? '') };
  if (event.transaction !== undefined) event.transaction = templateUrl(event.transaction);
  if (event.exception?.values !== undefined) event.exception = { values: event.exception.values.map(scrubException) };
  if (event.breadcrumbs !== undefined) {
    const kept = event.breadcrumbs.map(scrubBreadcrumb).filter((b): b is Breadcrumb => b !== null);
    if (kept.length === 0) delete event.breadcrumbs;
    else event.breadcrumbs = kept;
  }
  return event;
}
