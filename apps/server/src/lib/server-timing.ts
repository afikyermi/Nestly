// Server-Timing on a Vercel deployment, Preview and Production (VERCEL_ENV=preview or production; never development, never a local
// test unless the test turns it on): where an /api request's time went, for the preview-e2e flows to print next to each timed
// request and for measuring the live site from the browser (24.10). These metrics and nothing else — no id, no route, no SQL, no parameter,
// no user data:
//   cold    1 for the first request this server instance answers (a cold start), else 0
//   dbwait  time from asking for a transaction until its first statement may run (acquiring a pooled connection, and BEGIN)
//   db      time inside the request's transactions (its statements and the work between them)
//   total   from the request's arrival to its answer being sent
//   s1..sN  each statement's time in the order the request sent them (25.10, to find the slow one): from the statement being sent to the
//           next one, or to the end of its transaction; at most STATEMENT_LIMIT, by position only
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
  /** Each statement's start, and its end once known (the next statement or its transaction's end). */
  readonly statements: { readonly at: number; end?: number }[];
}

/** The most statements the header lists; later ones are not timed one by one (db still counts them). */
export const STATEMENT_LIMIT = 30;

function closeLast(timing: RequestTiming, at: number): void {
  const last = timing.statements.at(-1);
  if (last !== undefined && last.end === undefined) last.end = at;
}

/** Marks a statement being sent (the client's debug hook, db/client.ts). A no-op outside a timed request. */
export function markStatement(): void {
  const timing = store.getStore();
  if (timing === undefined) return;
  const at = performance.now();
  closeLast(timing, at);
  if (timing.statements.length < STATEMENT_LIMIT) timing.statements.push({ at });
}

const store = new AsyncLocalStorage<RequestTiming>();
// The same numbers by request, for the onSend hook (it may run outside the store's async context, e.g. after an error).
const byRequest = new WeakMap<FastifyRequest, RequestTiming>();
let answered = false;

/** Whether this deployment adds the header: a Vercel Preview or Production deployment. */
export function serverTimingEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env['VERCEL_ENV'] === 'preview' || env['VERCEL_ENV'] === 'production';
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
      const ended = performance.now();
      timing.db += ended - began;
      closeLast(timing, ended);
    };
  };
}

const ms = (value: number): string => (Math.round(value * 10) / 10).toString();

/** The header's value: the four metrics, then each timed statement by position. */
export function serverTimingValue(timing: { cold: boolean; dbWait: number; db: number; total: number; statements?: readonly number[] }): string {
  const statements = (timing.statements ?? []).map((dur, i) => `, s${i + 1};dur=${ms(dur)}`).join('');
  return `cold;dur=${timing.cold ? 1 : 0}, dbwait;dur=${ms(timing.dbWait)}, db;dur=${ms(timing.db)}, total;dur=${ms(timing.total)}${statements}`;
}

/** Registers the hooks when `enabled`; otherwise adds nothing at all. Registered right after the bypass-header strip (app.ts). */
export function registerServerTiming(app: FastifyInstance, enabled: boolean): void {
  if (!enabled) return;
  app.addHook('onRequest', (request, _reply, done) => {
    const timing: RequestTiming = { start: performance.now(), cold: !answered, dbWait: 0, db: 0, statements: [] };
    answered = true;
    byRequest.set(request, timing);
    store.run(timing, done);
  });
  app.addHook('onSend', (request, reply, payload, done) => {
    const timing = byRequest.get(request);
    if (timing !== undefined && request.url.startsWith('/api')) {
      const now = performance.now();
      const statements = timing.statements.map((s) => (s.end ?? now) - s.at);
      reply.header('server-timing', serverTimingValue({ cold: timing.cold, dbWait: timing.dbWait, db: timing.db, total: now - timing.start, statements }));
    }
    done(null, payload);
  });
}
