// The error behind a 5xx a route answered itself (plan א ש.4; Afik 24.10.2026: Sentry only, no separate logger). A route that catches
// a failure and answers 500 or 503 notes it here; the app's onResponse hook then reports that error instead of the bare status. What
// leaves is rebuilt, never the error itself: a Drizzle error's message quotes the statement and its parameters (database values), a
// driver error's `detail` and `where` may quote a row. Kept: the error's type, the SQLSTATE, the constraint and the routine; for a
// ZodError the paths and codes of its issues (never the input); the stack of the original.

import { scrubText } from '@nestly/shared';
import { DrizzleQueryError } from 'drizzle-orm';
import postgres from 'postgres';
import { ZodError } from 'zod';
import type { FastifyRequest } from 'fastify';

const failures = new WeakMap<FastifyRequest, unknown>();

/** Notes the failure a route is about to answer with a 5xx. */
export function noteFailure(request: FastifyRequest, error: unknown): void {
  failures.set(request, error);
}

/** The failure noted for this request, if any. */
export function noteOf(request: FastifyRequest): unknown {
  return failures.get(request);
}

const MAX_ISSUES = 5;

/** The cause chain, outermost first (Drizzle wraps the driver's error as `cause`). */
function chain(error: unknown): Error[] {
  const out: Error[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    out.push(current);
    current = current.cause;
  }
  return out;
}

/** A V8 stack frame line: `at fn (location)` or `at location`, the location a path, a file URL or a Node built-in. */
const FRAME = /^\s+at (?:[^(]* \()?(?:file:|node:|\/|[A-Za-z]:[\\/]|<anonymous>|native)/;

function described(name: string, message: string, original: Error | undefined): Error {
  const error = new Error(message);
  error.name = name;
  // The original stack starts with the original message, which may hold values and line breaks: only what follows it is read, and only
  // lines that are real frames are kept (a message line that happens to start with "at " is not one).
  const stack = original?.stack ?? '';
  const header = original === undefined ? '' : String(original);
  const rest = stack.startsWith(header) ? stack.slice(header.length) : '';
  const frames = rest.split('\n').filter((line) => FRAME.test(line));
  error.stack = [`${name}: ${message}`, ...frames].join('\n');
  return error;
}

/** A report-safe copy of a failure: the type and codes that find the bug, nothing from a row or a request. */
export function reportableFailure(error: unknown): Error {
  const errors = chain(error);
  const outer = errors[0];
  const driver = errors.find((item) => item instanceof postgres.PostgresError);
  if (driver instanceof postgres.PostgresError) {
    const parts = [`sqlstate=${driver.code}`];
    if (driver.constraint_name) parts.push(`constraint=${driver.constraint_name}`);
    if (driver.routine) parts.push(`routine=${driver.routine}`);
    // Class 42 (a privilege, a missing function or column) names schema objects only, never a row: its message says which one
    if (typeof driver.code === 'string' && driver.code.startsWith('42')) parts.push(`message=${driver.message}`);
    return described('PostgresError', parts.join(' '), outer);
  }
  const zod = errors.find((item) => item instanceof ZodError);
  if (zod instanceof ZodError) {
    const issues = zod.issues.slice(0, MAX_ISSUES).map((issue) => `${issue.code}@${issue.path.map((key) => (typeof key === 'number' ? '#' : String(key))).join('.') || '(root)'}`);
    const more = zod.issues.length > MAX_ISSUES ? ` +${zod.issues.length - MAX_ISSUES}` : '';
    return described('ZodError', `${issues.join(' ')}${more}`, zod);
  }
  if (outer === undefined) return described('NonError', typeof error, undefined);
  // A wrapped statement without a driver error (the connection failed): the code of the innermost error; never the wrapper's message,
  // which quotes the statement and its parameters
  if (errors.some((item) => item instanceof DrizzleQueryError)) {
    const code: unknown = Reflect.get(errors.at(-1) ?? outer, 'code');
    return described('DrizzleQueryError', typeof code === 'string' ? `code=${code}` : 'failed', outer);
  }
  // Any other error (a TypeError in the server's own code, a failed connection): its type and its own code, else the first line of its
  // message, scrubbed; never its cause or its other properties
  const code: unknown = Reflect.get(outer, 'code');
  return described(outer.name || 'Error', typeof code === 'string' ? `code=${code}` : scrubText(outer.message.split('\n')[0] ?? ''), outer);
}
