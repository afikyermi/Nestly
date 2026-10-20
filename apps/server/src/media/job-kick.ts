// After an upload, the request server asks the background job to check now instead of waiting for the daily run (Afik 20.10.2026,
// decisions-in-force.md §7). The job is a separate function of the same deployment (api/jobs.ts) protected by CRON_SECRET; this file is the
// only one outside src/jobs/ that names it (tests/credentials.static.test.ts). The request server never holds the job's database credential.
// The address is the deployment's own (VERCEL_URL, set by the platform), never a request header: the secret goes nowhere else. Fire and
// forget: the answer is not awaited past a short limit, and a failed call only means the daily run (or the next upload) checks the image.
// A deployment behind Vercel's Deployment Protection refuses the call unless "Protection Bypass for Automation" is on: the platform then sets
// VERCEL_AUTOMATION_BYPASS_SECRET, sent here as its header (Afik's project setting).

const JOBS_SECRET_ENV = 'CRON_SECRET';
const DEPLOYMENT_HOST_ENV = 'VERCEL_URL';
const PROTECTION_BYPASS_ENV = 'VERCEL_AUTOMATION_BYPASS_SECRET';
const KICK_TIMEOUT_MS = 500;
const HOST = /^[a-z0-9.-]+(:\d+)?$/i;

type Env = Readonly<Record<string, string | undefined>>;

export type JobKick = () => Promise<void>;

export function createJobKick(env: Env = process.env): JobKick {
  const secret = env[JOBS_SECRET_ENV]?.trim();
  const host = env[DEPLOYMENT_HOST_ENV]?.trim();
  if (secret === undefined || secret === '' || host === undefined || !HOST.test(host)) return () => Promise.resolve();
  const url = `https://${host}/api/jobs/media-check`;
  const bypass = env[PROTECTION_BYPASS_ENV]?.trim();
  const headers: Record<string, string> = { authorization: `Bearer ${secret}`, ...(bypass === undefined || bypass === '' ? {} : { 'x-vercel-protection-bypass': bypass }) };
  return async () => {
    try {
      await fetch(url, { method: 'POST', headers, signal: AbortSignal.timeout(KICK_TIMEOUT_MS) });
    } catch {
      // the job runs on its own invocation; a timeout here does not stop it, and a refusal is caught by the daily run
    }
  };
}
