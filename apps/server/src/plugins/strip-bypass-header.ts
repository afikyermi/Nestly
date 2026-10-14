// The Vercel Deployment Protection bypass secret never reaches application code (preview access for checks, CRITIC
// finding 2, decisions 2026-10-14). Checks send it as `x-vercel-protection-bypass`; Vercel's documentation does not say
// the header is removed before the function, so the server removes it itself, in the first onRequest hook — before
// authentication, before any handler, before anything can reflect or log it. The logger's request serializer carries no
// headers (apps/server/tests/strip-bypass-header.test.ts asserts that nothing logged holds the value).

import type { FastifyInstance } from 'fastify';

export const BYPASS_HEADER = 'x-vercel-protection-bypass';

export function registerStripBypassHeader(app: FastifyInstance): void {
  app.addHook('onRequest', (request, _reply, done) => {
    const raw = request.raw;
    delete raw.headers[BYPASS_HEADER];
    // rawHeaders is the flat [name, value, name, value, …] list as received; a handler reading it would see the value.
    for (let i = raw.rawHeaders.length - 2; i >= 0; i -= 2) {
      if (raw.rawHeaders[i]?.toLowerCase() === BYPASS_HEADER) raw.rawHeaders.splice(i, 2);
    }
    done();
  });
}
