import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Server-Timing (preview-e2e measurement and the live site's, 24.10): on a Vercel Preview or Production deployment only, and then
// exactly four numeric metrics — no id, no route, no parameter, no user data.

const HEADER = /^cold;dur=[01], dbwait;dur=\d+(\.\d)?, db;dur=\d+(\.\d)?, total;dur=\d+(\.\d)?(, s\d+;dur=\d+(\.\d)?)*$/;
const saved = process.env['VERCEL_ENV'];

afterEach(() => {
  if (saved === undefined) delete process.env['VERCEL_ENV'];
  else process.env['VERCEL_ENV'] = saved;
  vi.resetModules();
});

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

  it.each(['preview', 'production'])('on a %s deployment carries exactly cold, dbwait, db and total', async (env) => {
    const header = await healthHeader(env);
    expect(typeof header).toBe('string');
    expect(String(header)).toMatch(HEADER);
  });

  it('counts the wait for a transaction and the time inside it; cold only on the instance first request', async () => {
    vi.resetModules();
    const { registerServerTiming, timeTransaction, markStatement } = await import('../src/lib/server-timing.js');
    const app = Fastify();
    registerServerTiming(app, true);
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    app.get('/api/work', async () => {
      const began = timeTransaction();
      await pause(30); // waiting for the connection
      const settled = began();
      await pause(40); // the statements
      settled();
      return { ok: true };
    });
    app.get('/elsewhere', () => ({ ok: true }));
    const metrics = (header: unknown): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const part of String(header).split(', ')) out[part.split(';')[0] ?? ''] = Number(part.split('dur=')[1]);
      return out;
    };
    const first = await app.inject({ method: 'GET', url: '/api/work' });
    const second = await app.inject({ method: 'GET', url: '/api/work' });
    const outside = await app.inject({ method: 'GET', url: '/elsewhere' });
    await app.close();
    expect(String(first.headers['server-timing'])).toMatch(HEADER);
    const a = metrics(first.headers['server-timing']);
    expect(Object.keys(a)).toEqual(['cold', 'dbwait', 'db', 'total']);
    expect(a['cold']).toBe(1);
    expect(a['dbwait']).toBeGreaterThanOrEqual(25);
    expect(a['db']).toBeGreaterThanOrEqual(35);
    expect(a['total']).toBeGreaterThanOrEqual((a['dbwait'] ?? 0) + (a['db'] ?? 0));
    expect(metrics(second.headers['server-timing'])['cold']).toBe(0);
    expect(outside.headers['server-timing']).toBeUndefined();
    // outside a timed request (a job, a test) nothing is counted and nothing throws
    timeTransaction()()();
    markStatement();
  });

  it('times each statement by position, until the next one or the end of its transaction, and never more than the limit', async () => {
    vi.resetModules();
    const { registerServerTiming, timeTransaction, markStatement, STATEMENT_LIMIT } = await import('../src/lib/server-timing.js');
    const app = Fastify();
    registerServerTiming(app, true);
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    app.get('/api/two', async () => {
      const settled = timeTransaction()();
      markStatement();
      await pause(10);
      markStatement();
      await pause(60);
      settled();
      await pause(40); // after the transaction: not the statement's time
      return { ok: true };
    });
    app.get('/api/many', () => {
      const settled = timeTransaction()();
      for (let i = 0; i < STATEMENT_LIMIT + 5; i += 1) markStatement();
      settled();
      return { ok: true };
    });
    const two = String((await app.inject({ method: 'GET', url: '/api/two' })).headers['server-timing']);
    const many = String((await app.inject({ method: 'GET', url: '/api/many' })).headers['server-timing']);
    await app.close();
    expect(two).toMatch(HEADER);
    const s: Record<string, number> = Object.fromEntries(two.split(', ').map((p): [string, number] => [p.split(';')[0] ?? '', Number(p.split('dur=')[1])]));
    expect(Object.keys(s)).toEqual(['cold', 'dbwait', 'db', 'total', 's1', 's2']);
    expect(s['s1']).toBeGreaterThanOrEqual(5);
    expect(s['s2']).toBeGreaterThanOrEqual(55);
    expect(s['s2']).toBeLessThan(95);
    expect(many.match(/, s\d+;/g)).toHaveLength(STATEMENT_LIMIT);
  });
});
