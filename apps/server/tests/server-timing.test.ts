import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Server-Timing (preview-e2e measurement, 24.10): on a Vercel Preview only, and then exactly four numeric metrics — no id, no route,
// no parameter, no user data.

const HEADER = /^cold;dur=[01], dbwait;dur=\d+(\.\d)?, db;dur=\d+(\.\d)?, total;dur=\d+(\.\d)?$/;
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
  it('is absent in Production, in development and in a test (no VERCEL_ENV)', async () => {
    expect(await healthHeader('production')).toBeUndefined();
    expect(await healthHeader('development')).toBeUndefined();
    expect(await healthHeader(undefined)).toBeUndefined();
  });

  it('on a Preview carries exactly cold, dbwait, db and total', async () => {
    const header = await healthHeader('preview');
    expect(typeof header).toBe('string');
    expect(String(header)).toMatch(HEADER);
  });

  it('counts the wait for a transaction and the time inside it; cold only on the instance first request', async () => {
    vi.resetModules();
    const { registerServerTiming, timeTransaction } = await import('../src/lib/server-timing.js');
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
  });
});
