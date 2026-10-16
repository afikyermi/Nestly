// GET /api/me (I1 F1.5 part a; FR-AUTH-002, BR-024). Tells the signed-in web which of three states the caller's account
// is in: active, unavailable (suspended or banned, one answer) or unregistered (an Auth user with no account row). The
// authentication hook has run before anything here. The route takes no id and no body; the answer is the state word, and for
// an active account also `recoveryQuestions` (set or missing, F1.6).
//
// Logs carry the status and the SQLSTATE, never the token, the ids or the error object (NFR-PRIV-001).

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { clientAddress } from '../recovery/client-ip.js';
import type { RecoveryDependencies } from '../recovery/dependencies.js';
import { readAccountState, type HandleRekey } from '../services/account-state-service.js';

export interface MeRouteDependencies {
  readonly database: Database | undefined;
  readonly recovery: RecoveryDependencies;
}

const PATH = '/api/me';

/**
 * What a re-key of the caller's recovery handle needs, or undefined when it cannot run: no pepper, or a token without an
 * email or an issue time. It is liveness only (the handle follows the Auth email), never authorization, so it is skipped
 * rather than failed.
 */
function rekeyFor(request: FastifyRequest, deps: MeRouteDependencies): HandleRekey | undefined {
  const keys = deps.recovery.keys();
  const email = request.verifiedEmail;
  const issuedAt = request.verifiedIssuedAt;
  if (keys === undefined || email === null || issuedAt === null) return undefined;
  return {
    keys,
    email,
    issuedAt,
    addressKey: clientAddress(request.ip).key,
    onFailure: (sqlstate) => request.log.warn({ sqlstate }, 'recovery handle re-key failed'),
  };
}

async function me(request: FastifyRequest, reply: FastifyReply, deps: MeRouteDependencies) {
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });

  // A state is never cached: the next request must see a status change (BR-024).
  reply.header('cache-control', 'no-store');
  try {
    return reply.code(200).send(await readAccountState(deps.database, identity, rekeyFor(request, deps)));
  } catch (error) {
    const refused = replySessionRefused(reply, error);
    if (refused !== undefined) return refused;
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
