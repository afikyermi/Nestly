import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleJobRequest } from '../src/jobs/handler.js';
import { startErrorMonitor } from '../src/lib/error-monitoring.js';

// The background job's function (api/jobs.ts at the root exposes it). Separate from the request server's function: it alone imports the
// job's credential and the model (tests/credentials.static.test.ts). Its failures are reported like the server's (lib/error-monitoring.ts).
const monitor = startErrorMonitor(process.env);

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleJobRequest(req, res, monitor);
  await monitor.flush();
}
