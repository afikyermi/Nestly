// PUT|DELETE /api/posts/:id/hide (I3 F3.9; FR-ALG-009 — the Hide action only; Afik 8א). Signed in: the authentication hook has run before
// anything here (401 before the body is read, and no database query). No route takes a user id; the hider is the caller's by the database,
// and the database decides which posts may be hidden (the hide guard over posts_select_viewer) and whose hide is removed.
//   PUT    no body → 204 (also a repeat: one row) · 404 post_unavailable (unknown or not readable: one body for every reason) · 409 own_post
//          (the caller's own post, named or anonymous; nothing about the author) · 403 not_allowed (not an active Regular account)
//   DELETE no body → 204 (also no row, never hidden, or not readable: no oracle) · 403 not_allowed
//   both:  400 invalid (not a uuid, or a body) · 401/503 session guard · 503 · 500 server_error. Any other method → 405 with Allow.
// Nothing is returned on success. Logs carry a fixed line and the SQLSTATE, never a post or user id (NFR-PRIV-001, F3.9 c6).

import { hidePathParams } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { hideFaultReply, isConnectionFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { hidePost, unhidePost } from '../services/post-hides-service.js';

export interface PostHidesRouteDependencies {
  readonly database: Database | undefined;
}

const HIDE_PATH = '/api/posts/:id/hide';

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, 'hide change failed');
  if (isConnectionFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  const fault = hideFaultReply(error);
  if (fault !== undefined) return reply.code(fault.status).send({ error: fault.error });
  return reply.code(500).send({ error: 'server_error' });
}

function change(action: typeof hidePost, deps: PostHidesRouteDependencies) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { identity } = request;
    reply.header('cache-control', 'no-store');
    const params = hidePathParams.safeParse(request.params);
    if (!params.success || request.body !== undefined) return reply.code(400).send({ error: 'invalid' });
    if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    try {
      const outcome = await action(deps.database, identity, params.data.id.toLowerCase());
      return outcome.kind === 'done' ? reply.code(204).send() : reply.code(403).send({ error: 'not_allowed' });
    } catch (error) {
      return replyFailure(request, reply, error);
    }
  };
}

/** Any other method: 405 with the Allow header. Authentication still comes first, like everywhere. */
function notAllowed(_request: FastifyRequest, reply: FastifyReply) {
  return reply.code(405).header('allow', 'PUT, DELETE').header('cache-control', 'no-store').send({ error: 'method_not_allowed' });
}

export function registerPostHidesRoutes(app: FastifyInstance, deps: PostHidesRouteDependencies): void {
  app.route({ method: 'PUT', url: HIDE_PATH, handler: change(hidePost, deps) });
  app.route({ method: 'DELETE', url: HIDE_PATH, handler: change(unhidePost, deps) });
  app.route({ method: ['GET', 'POST', 'PATCH', 'OPTIONS'], url: HIDE_PATH, handler: notAllowed });
}
