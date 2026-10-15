// GET /api/me (I1 F1.5 part a; FR-AUTH-002, BR-024). Tells the signed-in web which of three states the caller's account
// is in: active, unavailable (suspended or banned, one answer) or unregistered (an Auth user with no account row). The
// authentication hook has run before anything here. The route takes no id and no body; the answer is the state word, and for
// an active account also `recoveryQuestions` (set or missing, F1.6).
//
// Logs carry the status and the SQLSTATE, never the token, the ids or the error object (NFR-PRIV-001).

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { readAccountState } from '../services/account-state-service.js';

export interface MeRouteDependencies {
  readonly database: Database | undefined;
}

const PATH = '/api/me';

async function me(request: FastifyRequest, reply: FastifyReply, deps: MeRouteDependencies) {
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });

  // A state is never cached: the next request must see a status change (BR-024).
  reply.header('cache-control', 'no-store');
  try {
    return reply.code(200).send(await readAccountState(deps.database, identity));
  } catch (error) {
    const fault = readDatabaseFault(error);
    request.log.error({ sqlstate: fault?.code }, 'account state read failed');
    if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
    return reply.code(500).send({ error: 'internal' });
  }
}

export function registerMeRoute(app: FastifyInstance, deps: MeRouteDependencies): void {
  app.route({
    method: 'GET',
    url: PATH,
    handler: (request, reply) => me(request, reply, deps),
  });

  // Any other method: 405 with the Allow header. Authentication still comes first, like everywhere.
  app.route({
    method: ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    url: PATH,
    handler: (_request, reply) =>
      reply.code(405).header('allow', 'GET').header('cache-control', 'no-store').send({ error: 'method_not_allowed' }),
  });
}
