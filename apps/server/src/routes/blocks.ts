// Blocking a user (FR-REL-002). Signed in: the authentication hook has run before anything here (401 before the body is read, and no query).
// The blocker is the caller's by the database; the path names the other account only.
//   PUT    /api/users/:id/block   no body → 204 (also a repeat) · 400 invalid (not a uuid, a body, or the caller's own id) · 404 user_unavailable
//                                 (no such account) · 403 not_allowed (not an active Regular or Professional account)
//   DELETE /api/users/:id/block   no body → 204 (also when there was no block: no oracle) · 400 invalid
//   GET    /api/blocks            → 200 { blocked: [{ userId, fullName, blockedAt }] } newest first
//   all: 401/503 session guard · 503 · 500 server_error. Any other method → 405 with Allow.
// Logs carry a fixed line and the SQLSTATE, never a user id (NFR-PRIV-001).

import { blockPathParams } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isConnectionFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { blockUser, listBlocked, unblockUser, type BlockOutcome } from '../services/blocks-service.js';

export interface BlocksRouteDependencies {
  readonly database: Database | undefined;
}

const BLOCK_PATH = '/api/users/:id/block';
const LIST_PATH = '/api/blocks';

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown, line: string): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, line);
  if (isConnectionFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'server_error' });
}

const STATUS: Record<Exclude<BlockOutcome['kind'], 'done'>, number> = { invalid: 400, user_unavailable: 404, not_allowed: 403 };

function change(action: typeof blockUser, deps: BlocksRouteDependencies) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { identity } = request;
    reply.header('cache-control', 'no-store');
    const params = blockPathParams.safeParse(request.params);
    if (!params.success || request.body !== undefined) return reply.code(400).send({ error: 'invalid' });
    if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    try {
      const outcome = await action(deps.database, identity, params.data.id.toLowerCase());
      return outcome.kind === 'done' ? reply.code(204).send() : reply.code(STATUS[outcome.kind]).send({ error: outcome.kind });
    } catch (error) {
      return replyFailure(request, reply, error, 'block change failed');
    }
  };
}

function notAllowed(allow: string) {
  return (_request: FastifyRequest, reply: FastifyReply) =>
    reply.code(405).header('allow', allow).header('cache-control', 'no-store').send({ error: 'method_not_allowed' });
}

export function registerBlocksRoutes(app: FastifyInstance, deps: BlocksRouteDependencies): void {
  app.route({ method: 'PUT', url: BLOCK_PATH, handler: change(blockUser, deps) });
  app.route({ method: 'DELETE', url: BLOCK_PATH, handler: change(unblockUser, deps) });
  app.route({ method: ['GET', 'POST', 'PATCH', 'OPTIONS'], url: BLOCK_PATH, handler: notAllowed('PUT, DELETE') });
  app.route({
    method: 'GET',
    url: LIST_PATH,
    handler: async (request, reply) => {
      const { identity } = request;
      reply.header('cache-control', 'no-store');
      if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
      try {
        return reply.code(200).send({ blocked: await listBlocked(deps.database, identity) });
      } catch (error) {
        return replyFailure(request, reply, error, 'block list failed');
      }
    },
  });
  app.route({ method: ['PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], url: LIST_PATH, handler: notAllowed('GET') });
}
