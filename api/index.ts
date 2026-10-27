// Vercel detects Functions only under a root-level api/. The adapter lives in apps/server/api; this file serves it bundled into one
// file (tools/bundle-server.mjs, built at install), so a cold start loads one file instead of ~800. No logic here.
export { default } from '../apps/server/dist-fn/index.mjs';
