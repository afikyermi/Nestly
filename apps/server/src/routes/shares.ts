// POST /api/posts/:id/shares (I3 F3.5; FR-FEED-006, BR-064-066, VAL-038, ERR-034). Signed in: the authentication hook has run before anything
// here (401 before the body is read, and no database query). No route takes an author id or the original's id in the body: the original is
// the path's post (or its own original, BR-066), the author is the caller's by the database, and the database decides what may be shared.
//   POST { text?, audience } (strict) → 201 the share as GET /api/posts/:id reads it · 400 invalid (not a uuid, a bad body) · 422 body_too_long
//        · 403 not_shareable (every refused original, one body: unknown, unreadable, friends-only, anonymous, own, not active) · 403 not_allowed
//        (not an active Regular account) · 401/503 session guard · 503 · 500 server_error. Any other method → 405 with Allow.
// Logs carry a fixed line, and the SQLSTATE only for an unexpected fault: never the text, an id, or why an original was refused (NFR-PRIV-001).

import { noteFailure } from '../lib/failure-report.js';
import { checkCreateShare, postPathParams } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isConnectionFailure, readDatabaseFault, shareFaultReply } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { createShare } from '../services/shares-service.js';

export interface SharesRouteDependencies {
  readonly database: Database | undefined;
}

const SHARES_PATH = '/api/posts/:id/shares';

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  if (isConnectionFailure(error)) {
    request.log.error('share create failed: connection');
    return reply.code(503).send({ error: 'unavailable' });
  }
  const fault = shareFaultReply(error);
  if (fault !== undefined && fault.status !== 500) {
    // An expected refusal: one line for all, so the log cannot tell which original was refused or why (c5).
    request.log.info('share refused');
    return reply.code(fault.status).send({ error: fault.error });
  }
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, 'share create failed');
  noteFailure(request, error);
  return reply.code(500).send({ error: 'server_error' });
}

async function create(request: FastifyRequest, reply: FastifyReply, deps: SharesRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const params = postPathParams.safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'invalid' });
  const checked = checkCreateShare(request.body);
  if (!checked.ok) return reply.code(checked.reason === 'invalid' ? 400 : 422).send({ error: checked.reason });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return reply.code(201).send(await createShare(deps.database, identity, params.data.id.toLowerCase(), checked.value));
  } catch (error) {
    return replyFailure(request, reply, error);
  }
}

/** Any other method: 405 with the Allow header. Authentication still comes first, like everywhere. */
function notAllowed(_request: FastifyRequest, reply: FastifyReply) {
  return reply.code(405).header('allow', 'POST').header('cache-control', 'no-store').send({ error: 'method_not_allowed' });
}

export function registerSharesRoutes(app: FastifyInstance, deps: SharesRouteDependencies): void {
  app.route({ method: 'POST', url: SHARES_PATH, handler: (request, reply) => create(request, reply, deps) });
  app.route({ method: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: SHARES_PATH, handler: notAllowed });
}
