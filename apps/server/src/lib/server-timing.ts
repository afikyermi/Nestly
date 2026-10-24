// Server-Timing on a Preview deployment only (VERCEL_ENV=preview; never Production, never a local test unless the test turns it
// on): where an /api request's time went, for the preview-e2e flows to print next to each timed request. Four metrics and
// nothing else — no id, no route, no parameter, no user data:
//   cold    1 for the first request this server instance answers (a cold start), else 0
//   dbwait  time from asking for a transaction until its first statement may run (acquiring a pooled connection, and BEGIN)
//   db      time inside the request's transactions (its statements and the work between them)
//   total   from the request's arrival to its answer being sent
// The request's numbers live in an AsyncLocalStorage store opened by the first onRequest hook, so the transaction helpers
// (db/identity-transaction.ts) add to them without being handed the request. Outside a store (a job, a test) nothing is counted.

import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import type { FastifyInstance, FastifyRequest } from 'fastify';

interface RequestTiming {
  readonly start: number;
  readonly cold: boolean;
  dbWait: number;
  db: number;
}

const store = new AsyncLocalStorage<RequestTiming>();
// The same numbers by request, for the onSend hook (it may run outside the store's async context, e.g. after an error).
const byRequest = new WeakMap<FastifyRequest, RequestTiming>();
let answered = false;

/** Whether this deployment adds the header: a Vercel Preview only. */
export function serverTimingEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env['VERCEL_ENV'] === 'preview';
}

/**
 * Wraps one transaction's lifetime: call it when the transaction is asked for; call the returned `began` when its callback starts,
 * and the function `began` returns when the callback settles. A no-op outside a timed request.
 */
export function timeTransaction(): () => () => void {
  const timing = store.getStore();
  if (timing === undefined) return () => () => undefined;
  const asked = performance.now();
  return () => {
    const began = performance.now();
    timing.dbWait += began - asked;
    return () => {
      timing.db += performance.now() - began;
    };
  };
}

const ms = (value: number): string => (Math.round(value * 10) / 10).toString();

/** The header's value: exactly the four metrics. */
export function serverTimingValue(timing: { cold: boolean; dbWait: number; db: number; total: number }): string {
  return `cold;dur=${timing.cold ? 1 : 0}, dbwait;dur=${ms(timing.dbWait)}, db;dur=${ms(timing.db)}, total;dur=${ms(timing.total)}`;
}

/** Registers the hooks when `enabled`; otherwise adds nothing at all. Registered right after the bypass-header strip (app.ts). */
export function registerServerTiming(app: FastifyInstance, enabled: boolean): void {
  if (!enabled) return;
  app.addHook('onRequest', (request, _reply, done) => {
    const timing: RequestTiming = { start: performance.now(), cold: !answered, dbWait: 0, db: 0 };
    answered = true;
    byRequest.set(request, timing);
    store.run(timing, done);
  });
  app.addHook('onSend', (request, reply, payload, done) => {
    const timing = byRequest.get(request);
    if (timing !== undefined && request.url.startsWith('/api')) {
      reply.header('server-timing', serverTimingValue({ cold: timing.cold, dbWait: timing.dbWait, db: timing.db, total: performance.now() - timing.start }));
    }
    done(null, payload);
  });
}
