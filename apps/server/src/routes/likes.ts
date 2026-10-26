// PUT|DELETE /api/posts/:id/like, /api/comments/:id/like (I3 F3.3 b2; FR-FEED-001; Afik 6ב). Signed in: the authentication hook has run before
// anything here (401 before the body is read, and no database query). No route takes a user id; the liker is the caller's by the database, and
// RLS decides which targets may be liked and whose like is removed.
//   PUT    no body → 204 (also a repeat: one like) · 404 not_found (not a uuid, missing or not readable: one body for every reason) · 403
//          account_unavailable | not_allowed | muted (I10-C: muted in the post's Group) · 400 invalid (a body)
//   DELETE no body → 204 (also when there is no like to remove) · 404 · 403 · 400 as above
//   all: 401/503 session guard · 503 · 500 server_error. Any other method → 405 with Allow.
// Nothing is returned: no count, no user id, no is_by_author. Logs carry a fixed line and the SQLSTATE, never an id (NFR-PRIV-001).

import { noteFailure } from '../lib/failure-report.js';
import { commentPathParams } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isConnectionFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import type { LikeTarget } from '../repositories/likes-repository.js';
import { likeTarget, unlikeTarget, type LikeRefusal } from '../services/likes-service.js';

export interface LikesRouteDependencies {
  readonly database: Database | undefined;
}

const POST_LIKE_PATH = '/api/posts/:id/like';
const COMMENT_LIKE_PATH = '/api/comments/:id/like';
const NOT_FOUND = { error: 'not_found' };

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  const fault = readDatabaseFault(error);
  request.log.error({ sqlstate: fault?.code }, 'like change failed');
  noteFailure(request, error);
  // The target went away or stopped being readable between the read and the write.
  if (fault?.code === '42501' || fault?.code === '23503') return reply.code(404).send(NOT_FOUND);
  if (isConnectionFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'server_error' });
}

function replyRefusal(reply: FastifyReply, refusal: LikeRefusal): FastifyReply {
  return reply.code(403).send({
    error: refusal.kind === 'stopped' ? 'account_unavailable' : 'not_allowed',
  });
}

function change(target: LikeTarget, action: typeof likeTarget, deps: LikesRouteDependencies) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { identity } = request;
    reply.header('cache-control', 'no-store');
    const params = commentPathParams.safeParse(request.params);
    if (!params.success) return reply.code(404).send(NOT_FOUND);
    if (request.body !== undefined) return reply.code(400).send({ error: 'invalid' });
    if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    try {
      const outcome = await action(deps.database, identity, target, params.data.id.toLowerCase());
      switch (outcome.kind) {
        case 'done':
          return reply.code(204).send();
        case 'not_found':
          return reply.code(404).send(NOT_FOUND);
        case 'muted':
          return reply.code(403).send({ error: 'muted' });
        default:
          return replyRefusal(reply, outcome);
      }
    } catch (error) {
      return replyFailure(request, reply, error);
    }
  };
}

/** Any other method: 405 with the Allow header. Authentication still comes first, like everywhere. */
function notAllowed(_request: FastifyRequest, reply: FastifyReply) {
  return reply.code(405).header('allow', 'PUT, DELETE').header('cache-control', 'no-store').send({ error: 'method_not_allowed' });
}

export function registerLikesRoutes(app: FastifyInstance, deps: LikesRouteDependencies): void {
  for (const [target, url] of [
    ['post', POST_LIKE_PATH],
    ['comment', COMMENT_LIKE_PATH],
  ] as const) {
    app.route({
      method: 'PUT',
      url,
      handler: change(target, likeTarget, deps),
    });
    app.route({
      method: 'DELETE',
      url,
      handler: change(target, unlikeTarget, deps),
    });
    app.route({
      method: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      url,
      handler: notAllowed,
    });
  }
}
