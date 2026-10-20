// Vercel detects Functions only under a root-level api/. The background job's adapter lives in apps/server/api; this file only exposes it.
export { default } from '../apps/server/api/jobs.js';
