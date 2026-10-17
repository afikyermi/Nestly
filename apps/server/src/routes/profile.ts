// GET and PUT /api/profile (I2 F2.1; FR-PROFILE-001, AC-015, UC-10). The caller's own RegularProfile: the full name and the
// parent gender (DR-1 A). Signed in: the authentication hook has run before anything here (401 before the body is read, and
// no database query). Neither route takes an id, in the path, the query or the body: the row is the caller's by RLS.
//   GET  → 200 { fullName, parentGender }      · 403 account_unavailable · 404 no_profile · 401/503 session guard · 503 · 500
//   PUT  { fullName, parentGender } (strict)   → 200 the saved values · 400 { error: 'invalid', reason } (before any database
//        work) · 403 account_unavailable · 404 no_profile (no row created) · 401/503 session guard · 503 · 500
//   any other method → 405, Allow: GET, PUT.
// Logs carry a fixed line and the SQLSTATE, never the body, a name, a gender, a token or an id (NFR-PRIV-001, criterion 14).

import { checkProfileUpdate } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { readOwnProfile, updateOwnProfile, type ProfileOutcome } from '../services/profile-service.js';

export interface ProfileRouteDependencies {
  readonly database: Database | undefined;
}

const PATH = '/api/profile';

function replyOutcome(reply: FastifyReply, outcome: ProfileOutcome): FastifyReply {
  switch (outcome.kind) {
    case 'profile':
      return reply.code(200).send(outcome.profile);
    case 'unavailable':
      // ERR-037: the account is stopped. The web asks GET /api/me again and the session guard ends the session.
      return reply.code(403).send({ error: 'account_unavailable' });
    case 'no_profile':
      return reply.code(404).send({ error: 'no_profile' });
  }
}

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown, line: string): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, line);
  if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'internal' });
}

async function read(request: FastifyRequest, reply: FastifyReply, deps: ProfileRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await readOwnProfile(deps.database, identity));
  } catch (error) {
    return replyFailure(request, reply, error, 'profile read failed');
  }
}

async function update(request: FastifyRequest, reply: FastifyReply, deps: ProfileRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const checked = checkProfileUpdate(request.body);
  if (!checked.ok) return reply.code(400).send({ error: 'invalid', reason: checked.reason });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await updateOwnProfile(deps.database, identity, checked.value));
  } catch (error) {
    return replyFailure(request, reply, error, 'profile update failed');
  }
}

export function registerProfileRoute(app: FastifyInstance, deps: ProfileRouteDependencies): void {
  app.route({ method: 'GET', url: PATH, handler: (request, reply) => read(request, reply, deps) });
  app.route({ method: 'PUT', url: PATH, handler: (request, reply) => update(request, reply, deps) });

  // Any other method: 405 with the Allow header. Authentication still comes first, like everywhere.
  app.route({
    method: ['POST', 'PATCH', 'DELETE', 'OPTIONS'],
    url: PATH,
    handler: (_request, reply) =>
      reply.code(405).header('allow', 'GET, PUT').header('cache-control', 'no-store').send({ error: 'method_not_allowed' }),
  });
}
