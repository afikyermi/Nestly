import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Server-Timing (preview-e2e measurement and the live site's, 24.10): on a Vercel Preview or Production deployment only, and then
// numeric metrics only — no id, no route, no parameter, no user data. 26.10: inflight, and dbwait's split into acq, conn and begin.

const N = String.raw`\d+(\.\d)?`;
const HEADER = new RegExp(
  `^cold;dur=[01], inflight;desc=\\d+, dbwait;dur=${N}(, acq;dur=${N}(, conn;dur=${N})?, begin;dur=${N})?, db;dur=${N}, total;dur=${N}(, s\\d+;dur=${N})*$`,
);
const saved = process.env['VERCEL_ENV'];

afterEach(() => {
  if (saved === undefined) delete process.env['VERCEL_ENV'];
  else process.env['VERCEL_ENV'] = saved;
  vi.resetModules();
});

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The header's metrics by name: dur, or desc for inflight. */
function metrics(header: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of String(header).split(', ')) out[part.split(';')[0] ?? ''] = Number(part.split('=')[1]);
  return out;
}

async function healthHeader(env: string | undefined): Promise<string | string[] | number | undefined> {
  if (env === undefined) delete process.env['VERCEL_ENV'];
  else process.env['VERCEL_ENV'] = env;
  vi.resetModules();
  const { buildApp } = await import('../src/app.js');
  const app = buildApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    return res.headers['server-timing'];
  } finally {
    await app.close();
  }
}

describe('Server-Timing', () => {
  it('is absent in development and in a test (no VERCEL_ENV)', async () => {
    expect(await healthHeader('development')).toBeUndefined();
    expect(await healthHeader(undefined)).toBeUndefined();
  });

  it.each(['preview', 'production'])('on a %s deployment carries cold, inflight, dbwait, db and total; no split without a transaction', async (env) => {
    const header = await healthHeader(env);
    expect(typeof header).toBe('string');
    expect(String(header)).toMatch(HEADER);
    expect(Object.keys(metrics(header))).toEqual(['cold', 'inflight', 'dbwait', 'db', 'total']);
  });

  it('counts the wait for a transaction and the time inside it; cold only on the instance first request', async () => {
    vi.resetModules();
    const { registerServerTiming, timeTransaction, markStatement } = await import('../src/lib/server-timing.js');
    const app = Fastify();
    registerServerTiming(app, true);
    app.get('/api/work', async () => {
      const timer = timeTransaction();
      await pause(30); // waiting for the connection
      timer.began();
      await pause(40); // the statements
      timer.settled();
      timer.freed();
      return { ok: true };
    });
    app.get('/elsewhere', () => ({ ok: true }));
    const first = await app.inject({ method: 'GET', url: '/api/work' });
    const second = await app.inject({ method: 'GET', url: '/api/work' });
    const outside = await app.inject({ method: 'GET', url: '/elsewhere' });
    await app.close();
    expect(String(first.headers['server-timing'])).toMatch(HEADER);
    const a = metrics(first.headers['server-timing']);
    // without a connection clock (a database not made by createDatabase) there is no split
    expect(Object.keys(a)).toEqual(['cold', 'inflight', 'dbwait', 'db', 'total']);
    expect(a['cold']).toBe(1);
    expect(a['dbwait']).toBeGreaterThanOrEqual(25);
    expect(a['db']).toBeGreaterThanOrEqual(35);
    expect(a['total']).toBeGreaterThanOrEqual((a['dbwait'] ?? 0) + (a['db'] ?? 0));
    expect(metrics(second.headers['server-timing'])['cold']).toBe(0);
    expect(outside.headers['server-timing']).toBeUndefined();
    // outside a timed request (a job, a test) nothing is counted and nothing throws
    const timer = timeTransaction();
    timer.began();
    timer.entered();
    timer.settled();
    timer.freed();
    markStatement();
  });

  it('times each statement by position, until the next one or the end of its transaction, and never more than the limit', async () => {
    vi.resetModules();
    const { registerServerTiming, timeTransaction, markStatement, STATEMENT_LIMIT } = await import('../src/lib/server-timing.js');
    const app = Fastify();
    registerServerTiming(app, true);
    app.get('/api/two', async () => {
      const timer = timeTransaction();
      timer.began();
      markStatement();
      await pause(10);
      markStatement();
      await pause(60);
      timer.settled();
      timer.freed();
      await pause(40); // after the transaction: not the statement's time
      return { ok: true };
    });
    app.get('/api/many', () => {
      const timer = timeTransaction();
      timer.began();
      for (let i = 0; i < STATEMENT_LIMIT + 5; i += 1) markStatement();
      timer.settled();
      timer.freed();
      return { ok: true };
    });
    const two = String((await app.inject({ method: 'GET', url: '/api/two' })).headers['server-timing']);
    const many = String((await app.inject({ method: 'GET', url: '/api/many' })).headers['server-timing']);
    await app.close();
    expect(two).toMatch(HEADER);
    const s = metrics(two);
    expect(Object.keys(s)).toEqual(['cold', 'inflight', 'dbwait', 'db', 'total', 's1', 's2']);
    expect(s['s1']).toBeGreaterThanOrEqual(5);
    expect(s['s2']).toBeGreaterThanOrEqual(55);
    expect(s['s2']).toBeLessThan(95);
    expect(many.match(/, s\d+;/g)).toHaveLength(STATEMENT_LIMIT);
  });

  it('splits a wait into acq (the connection busy), conn (a connection opened) and begin (the BEGIN round trip)', async () => {
    const { ConnectionClock } = await import('../src/lib/server-timing.js');
    const clock = new ConnectionClock();
    // the first transaction opens the connection: its whole wait is conn
    clock.asked(0);
    expect(clock.began(0, 100)).toEqual({ acq: 0, conn: 100, begin: 0 });
    clock.freed(150);
    // the connection is open and free: the wait is BEGIN's round trip
    clock.asked(200);
    expect(clock.began(200, 203)).toEqual({ acq: 0, conn: 0, begin: 3 });
    clock.freed(250);
    // B is asked for while A holds the connection: acq until A settles, then BEGIN's round trip
    clock.asked(300);
    expect(clock.began(300, 302)).toEqual({ acq: 0, conn: 0, begin: 2 });
    clock.asked(310);
    clock.freed(400);
    expect(clock.began(310, 404)).toEqual({ acq: 90, conn: 0, begin: 4 });
    clock.freed(420);
    // the connection closes while a transaction waits: a new one is opened from that moment
    clock.asked(500);
    clock.closed(510);
    expect(clock.began(500, 600)).toEqual({ acq: 0, conn: 90, begin: 0 });
    clock.freed(620);
    // a transaction that never began (its connection failed) leaves no connect behind for the next one
    clock.closed(700);
    clock.asked(800);
    clock.abandoned();
    clock.freed(850);
    clock.asked(900);
    expect(clock.began(900, 960)).toEqual({ acq: 0, conn: 60, begin: 0 });
  });

  it('reports acq, conn and begin once a transaction ran with a clock; conn only when a connection was opened; inflight counts', async () => {
    vi.resetModules();
    const { registerServerTiming, timeTransaction, ConnectionClock } = await import('../src/lib/server-timing.js');
    const clock = new ConnectionClock();
    const app = Fastify();
    registerServerTiming(app, true);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let freedHolder: () => void = () => undefined;
    const holderFreed = new Promise<void>((resolve) => {
      freedHolder = resolve;
    });
    app.get('/api/tx', async () => {
      const timer = timeTransaction(clock);
      await pause(30); // connecting (the first), or BEGIN's round trip
      timer.began();
      await pause(10); // the role, the claims and the guard
      timer.entered();
      await pause(10);
      timer.settled();
      timer.freed();
      return { ok: true };
    });
    app.get('/api/hold', async () => {
      const timer = timeTransaction(clock);
      timer.began();
      await held;
      timer.settled();
      timer.freed();
      freedHolder();
      return { ok: true };
    });
    app.get('/api/queued', async () => {
      const timer = timeTransaction(clock);
      await pause(30); // the holder still has the connection
      release();
      await holderFreed;
      await pause(5);
      timer.began();
      timer.entered();
      timer.settled();
      timer.freed();
      return { ok: true };
    });
    const opening = metrics((await app.inject({ method: 'GET', url: '/api/tx' })).headers['server-timing']);
    const reusing = String((await app.inject({ method: 'GET', url: '/api/tx' })).headers['server-timing']);
    const holding = app.inject({ method: 'GET', url: '/api/hold' });
    await pause(40); // the holder holds the connection; the queued one is asked for after 40 ms and waits for it
    const [hold, queued] = await Promise.all([holding, app.inject({ method: 'GET', url: '/api/queued' })]);
    const alone = metrics((await app.inject({ method: 'GET', url: '/api/tx' })).headers['server-timing']);
    await app.close();

    expect(Object.keys(opening)).toEqual(['cold', 'inflight', 'dbwait', 'acq', 'conn', 'begin', 'db', 'total']);
    expect(opening['conn']).toBeGreaterThanOrEqual(25);
    expect(opening['acq']).toBeLessThan(5);
    expect(opening['begin']).toBeGreaterThanOrEqual(8); // the setup only: BEGIN is inside conn
    expect(reusing).toMatch(HEADER);
    const r = metrics(reusing);
    expect(Object.keys(r)).toEqual(['cold', 'inflight', 'dbwait', 'acq', 'begin', 'db', 'total']);
    expect(r['acq']).toBeLessThan(5);
    expect(r['begin']).toBeGreaterThanOrEqual(35); // BEGIN's round trip (30) and the setup (10)
    expect((r['acq'] ?? 0) + (r['begin'] ?? 0)).toBeGreaterThanOrEqual(r['dbwait'] ?? 0);
    const q = metrics(queued.headers['server-timing']);
    expect(q['conn']).toBeUndefined();
    expect(q['acq']).toBeGreaterThanOrEqual(25); // until the holder settled
    expect(q['acq']).toBeLessThanOrEqual((q['dbwait'] ?? 0) + 0.1);
    expect(q['begin']).toBeGreaterThanOrEqual(3); // then BEGIN's round trip (5)
    // the two overlapping requests: the later one saw both in flight; a request alone sees itself only
    expect(metrics(hold.headers['server-timing'])['inflight']).toBe(1);
    expect(q['inflight']).toBe(2);
    expect(alone['inflight']).toBe(1);
  });
});

describe('[assistant] an outside call of the request', () => {
  it('is added after the statements with a fixed word and its duration, never content', async () => {
    const { serverTimingValue } = await import('../src/lib/server-timing.js');
    const value = serverTimingValue({ cold: false, inflight: 1, dbWait: 0, db: 2, total: 812, outside: { name: 'assistant', desc: 'error-404', dur: 790.4 } });
    expect(value.endsWith(', assistant;desc="error-404";dur=790.4')).toBe(true);
  });
});
