// Work a request starts only after its answer was sent (plan ח1, 26.10): best-effort counters (a feed page's post views, the day's login)
// that used to cost the reader a second transaction before the answer. A route hands the task over while answering; it starts once the
// response has finished (or the connection closed), so it never delays or changes the answer. A task that fails is reported to the error
// monitor (the error rebuilt without data, lib/failure-report.ts) and never reaches the client. On Vercel the function would be frozen once the
// handler returns: api/index.ts waits for this request's tasks (settleAfterResponse, bounded) before it returns, as it waits for the
// Sentry flush. Under `app.listen` (local) the tasks simply run on.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ErrorMonitor } from './error-monitoring.js';
import { reportableFailure } from './failure-report.js';

/** The longest the function waits for a request's after-response work before returning anyway. */
export const AFTER_RESPONSE_WAIT_MS = 5_000;

/** The tasks in flight, by the raw request (what api/index.ts holds). */
const inFlight = new WeakMap<IncomingMessage, Promise<void>[]>();
/** Every task in flight, for a test that must see the work done. */
const everyTask = new Set<Promise<void>>();
/** The monitor of the app that answers each request (registerAfterResponse); none: a failure is dropped. */
const monitors = new WeakMap<IncomingMessage, ErrorMonitor>();

/** Resolves once the response finished or the connection closed. */
function sent(res: ServerResponse): Promise<void> {
  if (res.writableFinished || res.destroyed) return Promise.resolve();
  return new Promise((resolve) => {
    res.once('finish', () => resolve());
    res.once('close', () => resolve());
  });
}

/** Registers the app's error monitor for its requests' after-response tasks (app.ts). */
export function registerAfterResponse(app: FastifyInstance, monitor: ErrorMonitor): void {
  app.addHook('onRequest', (request, _reply, done) => {
    monitors.set(request.raw, monitor);
    done();
  });
}

/**
 * Runs `task` after this reply's response was sent. Call it before sending the answer. The task's failure is reported (route and method,
 * status of the answer already sent; nothing from the request) and swallowed.
 */
export function afterResponse(reply: FastifyReply, task: () => Promise<void>): void {
  const { request } = reply;
  const monitor = monitors.get(request.raw);
  const run = sent(reply.raw)
    .then(task)
    .catch((error: unknown) => {
      monitor?.capture(reportableFailure(error), {
        route: request.routeOptions.url ?? 'unmatched',
        method: request.method,
        status: reply.statusCode,
        surface: 'api',
      });
    })
    .finally(() => {
      everyTask.delete(run);
    });
  everyTask.add(run);
  const list = inFlight.get(request.raw);
  if (list === undefined) inFlight.set(request.raw, [run]);
  else list.push(run);
}

/** Waits for this request's after-response tasks, at most `limitMs` (the function then returns; a task still running may be cut off). */
export async function settleAfterResponse(raw: IncomingMessage, limitMs = AFTER_RESPONSE_WAIT_MS): Promise<void> {
  const list = inFlight.get(raw);
  if (list === undefined) return;
  inFlight.delete(raw);
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    Promise.allSettled(list),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, limitMs);
    }),
  ]);
  clearTimeout(timer);
}

/** Waits until no after-response task of any request is in flight (tests). */
export async function afterResponseIdle(): Promise<void> {
  while (everyTask.size > 0) await Promise.allSettled([...everyTask]);
}
