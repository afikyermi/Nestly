// Server-Timing on a Vercel deployment, Preview and Production (VERCEL_ENV=preview or production; never development, never a local
// test unless the test turns it on): where an /api request's time went, for the preview-e2e flows to print next to each timed
// request and for measuring the live site from the browser (24.10). These metrics and nothing else — no id, no route, no SQL, no parameter,
// no user data:
//   cold      1 for the first request this server instance answers (a cold start), else 0
//   inflight  (desc, a count; 26.10) the requests this instance was answering when this one arrived, this one included: whether
//             Fluid compute sends several requests to one instance, all queueing on its one connection
//   dbwait    time from asking for a transaction until its first statement may run (acquiring a pooled connection, and BEGIN)
//   acq       (26.10, part of dbwait) waiting for this instance's one connection (db/client.ts, max 1) to be freed by the instance's
//             other transactions: to the moment the transaction before it settled
//   conn      (26.10, part of dbwait; only when it happened) opening a new connection while the transaction waited — TCP, TLS, the
//             pooler's start-up, the client's one type lookup — and the transaction's own BEGIN, which postgres.js sends on the new
//             connection as its first statement (no hook tells them apart); from asking, or from the old connection closing
//   begin     (26.10) BEGIN's round trip when the connection was already open (the rest of dbwait), then the transaction's setup —
//             an isolation level, the role, the claims and the guard (identity-transaction.ts enter()) — which db and s1.. count too
//             acq, conn and begin appear once a transaction ran; acq + conn + BEGIN's part of begin = dbwait, up to rounding
//   db        time inside the request's transactions (its statements and the work between them)
//   total     from the request's arrival to its answer being sent
//   s1..sN    each statement's time in the order the request sent them (25.10, to find the slow one): from the statement being sent to
//             the next one, or to the end of its transaction; at most STATEMENT_LIMIT, by position only
// The request's numbers live in an AsyncLocalStorage store opened by the first onRequest hook, so the transaction helpers
// (db/identity-transaction.ts) add to them without being handed the request. Outside a store (a job, a test) nothing is counted.

import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import type { FastifyInstance, FastifyRequest } from 'fastify';

interface RequestTiming {
  readonly start: number;
  readonly cold: boolean;
  readonly inflight: number;
  dbWait: number;
  db: number;
  /** dbWait's split and the setup after it, summed over the request's transactions that had a clock (`split` of them). */
  acq: number;
  conn: number;
  begin: number;
  connected: boolean;
  split: number;
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
// The requests this instance is answering now: from onRequest to onResponse (or the client going away), each once.
let inflight = 0;
const counted = new WeakSet<FastifyRequest>();
function leave(request: FastifyRequest): void {
  if (counted.delete(request)) inflight -= 1;
}

/** Whether this deployment adds the header: a Vercel Preview or Production deployment. */
export function serverTimingEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env['VERCEL_ENV'] === 'preview' || env['VERCEL_ENV'] === 'production';
}

/** How one transaction's wait divides (ConnectionClock.began). */
export interface WaitSplit {
  readonly acq: number;
  readonly conn: number;
  /** BEGIN's round trip on an open connection: the rest of the wait. 0 when a connection was opened (conn holds it). */
  readonly begin: number;
}

interface Span {
  readonly from: number;
  readonly to: number;
}

const overlap = (from: number, to: number, span: Span | undefined): number =>
  span === undefined ? 0 : Math.max(0, Math.min(to, span.to) - Math.max(from, span.from));

/**
 * What one postgres.js client of one connection (db/client.ts, max 1) did between a transaction being asked for and its callback
 * starting, from what is observable without another query and without postgres.js's debug hook (with it, an error carries its
 * query and parameters as enumerable fields): when each top-level transaction was asked for, began and settled, and when the
 * connection closed. With one connection a waiting transaction's BEGIN is sent the moment the one before it settles; a connection
 * is opened when a transaction is asked for while none is open, or when the open one closes while transactions wait. It counts
 * every top-level transaction of the client, in a timed request or not, and holds times only.
 */
export class ConnectionClock {
  private open = false;
  private waiting = 0;
  private connectingSince: number | undefined;
  private lastConnect: Span | undefined;
  private lastFreed = Number.NEGATIVE_INFINITY;

  asked(at: number): void {
    this.waiting += 1;
    if (!this.open && this.connectingSince === undefined) this.connectingSince = at;
  }

  /** The transaction's callback started (its BEGIN came back): the connection is open. */
  began(asked: number, at: number): WaitSplit {
    this.waiting -= 1;
    if (this.connectingSince !== undefined) this.lastConnect = { from: this.connectingSince, to: at };
    this.connectingSince = undefined;
    this.open = true;
    const conn = overlap(asked, at, this.lastConnect);
    const freed = this.lastFreed > asked && this.lastFreed <= at ? this.lastFreed : asked;
    const acq = Math.max(0, freed - asked - overlap(asked, freed, this.lastConnect));
    return { acq, conn, begin: conn > 0 ? 0 : Math.max(0, at - asked - acq) };
  }

  /** The transaction never began (its BEGIN or the connection failed). */
  abandoned(): void {
    this.waiting -= 1;
    if (this.waiting === 0 && !this.open) this.connectingSince = undefined;
  }

  /** The transaction settled (COMMIT or ROLLBACK came back, or it failed): the connection is free for the next one. */
  freed(at: number): void {
    this.lastFreed = at;
  }

  /** The client's connection closed (postgres.js onclose); a waiting transaction makes it open a new one at once. */
  closed(at: number): void {
    this.open = false;
    this.connectingSince = this.waiting > 0 ? at : undefined;
  }
}

/** One transaction's marks, in this order. The request's numbers are not touched outside a timed request. */
export interface TransactionTimer {
  /** The transaction's callback started. */
  began(): void;
  /** Its setup is done (the role, the claims, the guard): the end of `begin`. */
  entered(): void;
  /** The callback settled. */
  settled(): void;
  /** The transaction's promise settled, whatever the outcome: after COMMIT or ROLLBACK, or a failed BEGIN. */
  freed(): void;
}

/** Call it when a transaction is asked for, with its client's clock (Database.clock) when it has one. */
export function timeTransaction(clock?: ConnectionClock): TransactionTimer {
  const timing = store.getStore();
  const asked = performance.now();
  clock?.asked(asked);
  let began: number | undefined;
  let entered = false;
  return {
    began() {
      began = performance.now();
      const split = clock?.began(asked, began);
      if (timing === undefined) return;
      timing.dbWait += began - asked;
      if (split === undefined) return;
      timing.acq += split.acq;
      timing.conn += split.conn;
      timing.begin += split.begin;
      if (split.conn > 0) timing.connected = true;
      timing.split += 1;
    },
    entered() {
      if (began === undefined || entered) return;
      entered = true;
      if (timing !== undefined && clock !== undefined) timing.begin += performance.now() - began;
    },
    settled() {
      if (timing === undefined || began === undefined) return;
      const ended = performance.now();
      timing.db += ended - began;
      closeLast(timing, ended);
    },
    freed() {
      if (began === undefined) clock?.abandoned();
      clock?.freed(performance.now());
    },
  };
}

const ms = (value: number): string => (Math.round(value * 10) / 10).toString();

/** dbwait's split, when a transaction ran with a clock: conn only when a connection was opened. */
export interface WaitParts {
  readonly acq: number;
  readonly conn?: number;
  readonly begin: number;
}

/** The header's value: cold, inflight, dbwait and its parts, db, total, then each timed statement by position. */
export function serverTimingValue(timing: {
  cold: boolean;
  inflight: number;
  dbWait: number;
  parts?: WaitParts;
  db: number;
  total: number;
  statements?: readonly number[];
}): string {
  const statements = (timing.statements ?? []).map((dur, i) => `, s${i + 1};dur=${ms(dur)}`).join('');
  const { parts } = timing;
  const split =
    parts === undefined
      ? ''
      : `, acq;dur=${ms(parts.acq)}${parts.conn === undefined ? '' : `, conn;dur=${ms(parts.conn)}`}, begin;dur=${ms(parts.begin)}`;
  return (
    `cold;dur=${timing.cold ? 1 : 0}, inflight;desc=${timing.inflight}, dbwait;dur=${ms(timing.dbWait)}${split}, ` +
    `db;dur=${ms(timing.db)}, total;dur=${ms(timing.total)}${statements}`
  );
}

/** Registers the hooks when `enabled`; otherwise adds nothing at all. Registered right after the bypass-header strip (app.ts). */
export function registerServerTiming(app: FastifyInstance, enabled: boolean): void {
  if (!enabled) return;
  app.addHook('onRequest', (request, _reply, done) => {
    inflight += 1;
    counted.add(request);
    const timing: RequestTiming = {
      start: performance.now(),
      cold: !answered,
      inflight,
      dbWait: 0,
      db: 0,
      acq: 0,
      conn: 0,
      begin: 0,
      connected: false,
      split: 0,
      statements: [],
    };
    answered = true;
    byRequest.set(request, timing);
    store.run(timing, done);
  });
  app.addHook('onSend', (request, reply, payload, done) => {
    const timing = byRequest.get(request);
    if (timing !== undefined && request.url.startsWith('/api')) {
      const now = performance.now();
      const statements = timing.statements.map((s) => (s.end ?? now) - s.at);
      const parts: WaitParts | undefined =
        timing.split === 0 ? undefined : { acq: timing.acq, begin: timing.begin, ...(timing.connected ? { conn: timing.conn } : {}) };
      reply.header(
        'server-timing',
        serverTimingValue({
          cold: timing.cold,
          inflight: timing.inflight,
          dbWait: timing.dbWait,
          ...(parts === undefined ? {} : { parts }),
          db: timing.db,
          total: now - timing.start,
          statements,
        }),
      );
    }
    done(null, payload);
  });
  app.addHook('onResponse', (request, _reply, done) => {
    leave(request);
    done();
  });
  app.addHook('onRequestAbort', (request, done) => {
    leave(request);
    done();
  });
}
