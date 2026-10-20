// GET /api/feed?cursor= (I3 F3.2 a2; FR-FEED-001, FR-ALG-002, ERR-027; I3-algorithm.md). Signed in: the authentication hook has run before
// anything here (401 before anything else, and no database query). No route input names a user or a post; eligibility is the database's.
//   GET    ?cursor=<opaque, optional> → 200 { items, nextCursor, configVersion, restarted? } (an empty feed is items [], nextCursor null)
//          400 cursor_invalid (a cursor that is not exactly one the server issued in shape, an unknown query key, or an `asOf` the database
//          has not reached; no ranking query runs) · 403 account_unavailable (stopped account) | not_allowed (an Admin or Moderator account)
//   all:   401/503 session guard · 503 · 500 server_error. Any other method → 405 with Allow.
// Logs carry a fixed line, the SQLSTATE and, for a configuration fallback, its version and class: never the cursor text or a post id.

import { parseFeedCursor } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isConnectionFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import type { MediaStorage } from '../media/storage-admin.js';
import { readFeedPage } from '../services/feed-service.js';

export interface FeedRouteDependencies {
  readonly database: Database | undefined;
  /** I5: signs the read addresses of the posts' images (absent: no images in the answer). */
  readonly storage?: MediaStorage;
}

const FEED_PATH = '/api/feed';
const CURSOR_INVALID = { error: 'cursor_invalid' };

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, 'feed read failed');
  if (isConnectionFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'server_error' });
}

/** `undefined`: no cursor (first page). `null`: a query that is not exactly "no cursor" or "one valid cursor". */
function cursorOf(query: unknown): ReturnType<typeof parseFeedCursor> | undefined {
  if (typeof query !== 'object' || query === null) return null;
  const keys = Object.keys(query);
  if (keys.length === 0) return undefined;
  if (keys.length !== 1 || keys[0] !== 'cursor') return null;
  return parseFeedCursor(Reflect.get(query, 'cursor'));
}

async function read(request: FastifyRequest, reply: FastifyReply, deps: FeedRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const cursor = cursorOf(request.query);
  if (cursor === null) return reply.code(400).send(CURSOR_INVALID);
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const outcome = await readFeedPage(deps.database, identity, cursor ?? null, deps.storage);
    switch (outcome.kind) {
      case 'page':
        if (outcome.fallback !== null) {
          request.log.warn({ configVersion: outcome.fallback.configVersion, errorClass: outcome.fallback.errorClass }, 'feed configuration fallback');
        }
        return reply.code(200).send(outcome.page);
      case 'cursor_invalid':
        return reply.code(400).send(CURSOR_INVALID);
      case 'stopped':
        return reply.code(403).send({ error: 'account_unavailable' });
      default:
        return reply.code(403).send({ error: 'not_allowed' });
    }
  } catch (error) {
    return replyFailure(request, reply, error);
  }
}

export function registerFeedRoutes(app: FastifyInstance, deps: FeedRouteDependencies): void {
  app.route({ method: 'GET', url: FEED_PATH, handler: (request, reply) => read(request, reply, deps) });
  app.route({
    method: ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    url: FEED_PATH,
    handler: (_request, reply) => reply.code(405).header('allow', 'GET').header('cache-control', 'no-store').send({ error: 'method_not_allowed' }),
  });
}
