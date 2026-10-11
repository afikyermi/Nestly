// Vercel detects Functions only under a root-level api/. The adapter lives in
// apps/server/api; this file only exposes it. No logic here.
export { default } from '../apps/server/api/index.js';
