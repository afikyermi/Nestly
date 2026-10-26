import type { IncomingMessage } from 'node:http';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { afterResponse, afterResponseIdle, registerAfterResponse, settleAfterResponse } from '../src/lib/after-response.js';
import type { ErrorMonitor, ErrorReport } from '../src/lib/error-monitoring.js';

// Plan ח1 (26.10): best-effort counters are written after the answer was sent. The answer never waits for them and never changes because
// of them; a failure is reported to the error monitor without data; the deployed function can wait for them (bounded) before it returns.

function recordingMonitor(): ErrorMonitor & { readonly captured: { error: unknown; report: ErrorReport }[] } {
  const captured: { error: unknown; report: ErrorReport }[] = [];
  return { enabled: true, captured, capture: (error, report) => captured.push({ error, report }), captureStatus: () => undefined, flush: () => Promise.resolve() };
}

function gate(): { readonly open: () => void; readonly wait: Promise<void> } {
  let open = (): void => undefined;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, wait };
}

describe('[plan ח1] work after the response', () => {
  it('starts only once the response was sent, and the answer does not wait for it', async () => {
    const app = Fastify();
    registerAfterResponse(app, recordingMonitor());
    const held = gate();
    const seen: { sentFirst?: boolean; done: boolean } = { done: false };
    app.get('/x', (_request, reply) => {
      afterResponse(reply, async () => {
        seen.sentFirst = reply.raw.writableEnded;
        await held.wait;
        seen.done = true;
      });
      return reply.code(200).send({ ok: true });
    });
    const res = await app.inject({ method: 'GET', url: '/x' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    // the answer is complete while the write is still held
    expect(seen.done).toBe(false);
    held.open();
    await afterResponseIdle();
    expect(seen.sentFirst, 'the task started after the response finished').toBe(true);
    expect(seen.done, 'the task still ran to its end').toBe(true);
    await app.close();
  });

  it('a failing task never changes the answer, and is reported without the error text', async () => {
    const app = Fastify();
    const monitor = recordingMonitor();
    registerAfterResponse(app, monitor);
    app.get('/y', (_request, reply) => {
      afterResponse(reply, () => Promise.reject(new Error('insert failed for parent.marker@example.com')));
      return reply.code(200).send({ ok: true });
    });
    const res = await app.inject({ method: 'GET', url: '/y' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await afterResponseIdle();
    expect(monitor.captured).toHaveLength(1);
    expect(monitor.captured[0]?.report).toEqual({ route: '/y', method: 'GET', status: 200, surface: 'api' });
    expect(String(monitor.captured[0]?.error)).not.toContain('parent.marker@example.com');
    await app.close();
  });

  it('settleAfterResponse waits for the request’s tasks, and no longer than its limit', async () => {
    const app = Fastify();
    registerAfterResponse(app, recordingMonitor());
    const raws: IncomingMessage[] = [];
    let quickDone = false;
    const never = gate();
    app.get('/quick', (request, reply) => {
      raws.push(request.raw);
      afterResponse(reply, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        quickDone = true;
      });
      return reply.send({ ok: true });
    });
    app.get('/stuck', (request, reply) => {
      raws.push(request.raw);
      afterResponse(reply, () => never.wait);
      return reply.send({ ok: true });
    });
    await app.inject({ method: 'GET', url: '/quick' });
    const [quick] = raws;
    if (quick === undefined) throw new Error('no request');
    await settleAfterResponse(quick);
    expect(quickDone).toBe(true);
    await app.inject({ method: 'GET', url: '/stuck' });
    const stuck = raws[1];
    if (stuck === undefined) throw new Error('no request');
    const began = Date.now();
    await settleAfterResponse(stuck, 50);
    expect(Date.now() - began).toBeLessThan(1_000);
    never.open();
    await afterResponseIdle();
    await app.close();
  });

  it('the deployed function waits for this work before it returns (api/index.ts)', async () => {
    const { readFileSync } = await import('node:fs');
    const adapter = readFileSync(new URL('../api/index.ts', import.meta.url), 'utf8');
    expect(adapter).toMatch(/await responseDone\(res\);\s*await settleAfterResponse\(req\);/);
  });
});
