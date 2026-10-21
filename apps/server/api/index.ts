import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../src/app.js';
import { withoutRewriteParam } from '../src/lib/vercel-rewrite.js';

const app = buildApp();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await app.ready();
  // The rewrite's `path` parameter is Vercel's, not the client's (src/lib/vercel-rewrite.ts).
  if (req.url !== undefined) req.url = withoutRewriteParam(req.url);
  app.server.emit('request', req, res);
}
