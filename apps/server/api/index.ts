import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../src/app.js';
import { startErrorMonitor } from '../src/lib/error-monitoring.js';
import { withoutRewriteParam } from '../src/lib/vercel-rewrite.js';

// Sentry only where SENTRY_DSN is set (Vercel Production and Preview); a no-op everywhere else (lib/error-monitoring.ts).
const monitor = startErrorMonitor(process.env);
const app = buildApp({ errorMonitor: monitor });

/** The longest the function waits for its answer to finish before flushing anyway (the answer itself is never delayed). */
const RESPONSE_WAIT_MS = 10_000;

/** Resolves when the response is done, so a report made while answering is sent before the function is frozen. */
function responseDone(res: ServerResponse): Promise<void> {
  if (res.writableFinished || res.destroyed) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, RESPONSE_WAIT_MS);
    const done = (): void => {
      clearTimeout(timer);
      resolve();
    };
    res.once('finish', done);
    res.once('close', done);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await app.ready();
  } catch (error) {
    monitor.capture(error, { route: 'startup', method: req.method ?? 'unknown', status: 500, surface: 'api' });
    await monitor.flush();
    throw error;
  }
  // The rewrite's `path` parameter is Vercel's, not the client's (src/lib/vercel-rewrite.ts).
  if (req.url !== undefined) req.url = withoutRewriteParam(req.url);
  app.server.emit('request', req, res);
  // The client already has its answer here; the function only waits for reports in flight (none on a normal request: instant).
  if (monitor.enabled) {
    await responseDone(res);
    await monitor.flush();
  }
}
