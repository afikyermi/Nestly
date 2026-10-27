#!/usr/bin/env node
// Bundles the request server (apps/server/api/index.ts and everything it imports) into one ES module, apps/server/dist-fn/index.mjs,
// which the Vercel Function api/index.ts serves (27.10, performance: response within 2 s). Unbundled, a new instance's cold start loaded
// ~800 files (the server's own and its dependencies'); one file loads several times faster. Runs from the root postinstall, so the
// bundle exists before Vercel builds the Function and before CI type-checks api/index.ts; a failure fails the install.
//
// Left outside the bundle, loaded from node_modules when first needed: sharp (native; the first upload) and @sentry/node (the first
// error report). The job function (api/jobs.ts) is not bundled.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'apps/server/dist-fn');

export const EXTERNAL = ['sharp', '@sentry/node', 'onnxruntime-node'];

await build({
  entryPoints: [path.join(ROOT, 'apps/server/api/index.ts')],
  outfile: path.join(OUT_DIR, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  conditions: ['source'],
  external: EXTERNAL,
  // Some dependencies are CommonJS and call require(); an ES module bundle has none of its own.
  banner: { js: "import { createRequire as __nestlyCreateRequire } from 'node:module'; const require = __nestlyCreateRequire(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'warning',
});

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  path.join(OUT_DIR, 'index.d.mts'),
  "import type { IncomingMessage, ServerResponse } from 'node:http';\nexport default function handler(req: IncomingMessage, res: ServerResponse): Promise<void>;\n",
);
