// The background job's entry (I5; Afik 20.10.2026, decisions-in-force.md §7): POST or GET /api/jobs/media-check with
// `Authorization: Bearer <the job secret>` (Vercel cron sends GET daily: the full run; the upload route and a queue decision send POST: the
// short run, media-check.ts). Anything else is 401 with no
// work. Connects as app_media_jobs with its own connection string, one connection, closed when the run ends. Answers counts only.

import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import postgres from 'postgres';
import { noErrorMonitor, type ErrorMonitor } from '../lib/error-monitoring.js';
import { createJobStorage } from '../media/storage-admin.js';
import { readJobsConfig } from './config.js';
import { runMediaJob } from './media-check.js';
import { createJobDb } from './media-job-repository.js';
import { createBlockListDb } from './block-list-repository.js';
import { loadNudeNet } from './nudenet.js';

/** The function's own limit is 60 s (vercel.json); the run leaves room to close. */
const BUDGET_MS = 50_000;

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export function isAuthorized(header: string | undefined, secret: string | undefined): boolean {
  if (secret === undefined || header === undefined || !header.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function handleJobRequest(req: IncomingMessage, res: ServerResponse, monitor: ErrorMonitor = noErrorMonitor): Promise<void> {
  const started = Date.now();
  const config = readJobsConfig();
  const path = (req.url ?? '').split('?')[0];
  if (path !== '/api/jobs/media-check' || (req.method !== 'POST' && req.method !== 'GET')) return send(res, 404, { error: 'not_found' });
  if (!isAuthorized(req.headers.authorization, config.secret)) return send(res, 401, { error: 'unauthorized' });
  const storage = createJobStorage();
  if (config.databaseUrl === undefined || !storage.isConfigured()) {
    monitor.captureStatus({ route: '/api/jobs/media-check', method: req.method ?? 'unknown', status: 503, surface: 'jobs' });
    return send(res, 503, { error: 'unavailable' });
  }
  const sql = postgres(config.databaseUrl, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    const report = await runMediaJob({ db: createJobDb(sql), blockList: createBlockListDb(sql), storage, model: loadNudeNet, config, timeLeft: () => BUDGET_MS - (Date.now() - started), full: req.method === 'GET' });
    send(res, 200, report);
  } catch (error) {
    monitor.capture(error, { route: '/api/jobs/media-check', method: req.method ?? 'unknown', status: 500, surface: 'jobs' });
    send(res, 500, { error: 'internal' });
  } finally {
    await sql.end({ timeout: 2 });
  }
}
