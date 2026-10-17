// GET /api/profiles/:userId (I2 F2.4c1; FR-PRIV-001, BR-044, OP-020, AC-078, NFR-SEC-006). Another Regular's profile, as the database's
// profile_view returns it. Signed in: the authentication hook has run before anything here (401 before the body is read, no query).
//   → 200 { fullName, gender, childrenCount, childAges, isPregnant, showsEmptyJourneySentence, relationship, friends, mutualFriends }
//     · 404 unavailable (one body for an unknown id, a Professional, Moderator or Admin, a stopped account) · 400 invalid (:userId is not
//     a uuid; no query) · 429 rate_limited (the profile-open limit; no profile, no number) · 403 account_unavailable (the viewer is
//     stopped, ERR-037) · 403 forbidden (no account row) · 401/503 session guard · 503 · 500. Any other method → 405 with Allow.
// Every call is one open and is counted by the database (c20), a 404 included. Logs carry a fixed line and the SQLSTATE, never a body, a
// name or an id (NFR-PRIV-001).

import { checkUserId } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { readUserProfile, type ViewOutcome } from '../services/profile-view-service.js';
import { replyRateLimited } from './rate-limit-reply.js';

export interface ProfileViewRouteDependencies {
  readonly database: Database | undefined;
}

const PATH = '/api/profiles/:userId';

function replyOutcome(request: FastifyRequest, reply: FastifyReply, outcome: ViewOutcome): FastifyReply {
  switch (outcome.kind) {
    case 'profile':
      return reply.code(200).send(outcome.profile);
    case 'unavailable':
      return reply.code(404).send({ error: 'unavailable' });
    case 'rate_limited':
      return replyRateLimited(request, reply, outcome);
    case 'stopped':
      // ERR-037: the account is stopped. The web asks GET /api/me again and the session guard ends the session.
      return reply.code(403).send({ error: 'account_unavailable' });
    case 'forbidden':
      return reply.code(403).send({ error: 'forbidden' });
  }
}

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, 'profile read failed');
  if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'internal' });
}

async function read(request: FastifyRequest, reply: FastifyReply, deps: ProfileViewRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const target = checkUserId(Reflect.get(request.params ?? {}, 'userId'));
  if (!target.ok) return reply.code(400).send({ error: 'invalid' });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(request, reply, await readUserProfile(deps.database, identity, target.userId));
  } catch (error) {
    return replyFailure(request, reply, error);
  }
}

export function registerProfileViewRoute(app: FastifyInstance, deps: ProfileViewRouteDependencies): void {
  app.route({ method: 'GET', url: PATH, handler: (request, reply) => read(request, reply, deps) });

  // Any other method: 405 with the Allow header. Authentication still comes first, like everywhere.
  app.route({
    method: ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    url: PATH,
    handler: (_request, reply) => reply.code(405).header('allow', 'GET').header('cache-control', 'no-store').send({ error: 'method_not_allowed' }),
  });
}
