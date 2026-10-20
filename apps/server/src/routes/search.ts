// Global search (FR-SEARCH-001, AC-039, AC-065, AC-078). Signed in: the authentication hook has run before anything here.
//   GET /api/search?q=<text>&type=all|people|groups|posts
//     → 200 { people:[{userId,fullName}], groups:[], posts:[{id,authorId,authorName,snippet,createdAt}], peopleLimited }
//     · 400 invalid (no text, under two or over 100 characters, another key: there is no list without a query)
//     · 429 rate_limited (type=people at the People Search limit; with type=all the limit is `peopleLimited: true` and posts are answered)
//     · 403 account_unavailable | forbidden · 401/503 session guard · 500.
// The typed text is never logged or stored; only the topic the fixed rules detect (the Intent Signal).

import { checkSearchQuery, searchResponse } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { replyRateLimited } from './rate-limit-reply.js';
import { search } from '../services/search-service.js';

export interface SearchRouteDependencies {
  readonly database: Database | undefined;
}

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, 'search failed');
  if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'internal' });
}

export function registerSearchRoute(app: FastifyInstance, deps: SearchRouteDependencies): void {
  app.route({
    method: 'GET',
    url: '/api/search',
    handler: async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const { identity } = request;
      const checked = checkSearchQuery(request.query);
      if (!checked.ok) return reply.code(400).send({ error: 'invalid' });
      if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
      try {
        const outcome = await search(deps.database, identity, checked.text, checked.type);
        if (outcome.kind === 'ok') {
          const limitedPeopleOnly = outcome.response.peopleLimited && checked.type === 'people';
          if (limitedPeopleOnly) return replyRateLimited(request, reply, { kind: 'rate_limited', misconfigured: false });
          return reply.code(200).send(searchResponse.parse(outcome.response));
        }
        if (outcome.kind === 'rate_limited') return replyRateLimited(request, reply, outcome);
        return reply.code(403).send({ error: outcome.kind === 'stopped' ? 'account_unavailable' : 'forbidden' });
      } catch (error) {
        return replyFailure(request, reply, error);
      }
    },
  });
}
