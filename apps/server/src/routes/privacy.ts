// GET and PUT /api/privacy (I2 F2.3a; FR-PRIV-001, BR-037, VAL-027). The caller's own privacy settings: visibility to
// non-Friends, the Journey Summary sentence toggle and the child-birthday consent. Signed in: the authentication hook has run
// before anything here (401 before the body is read, and no database query). Neither route takes an id, in the path, the query
// or the body: the row is the caller's by RLS.
//   GET  → 200 { profileVisibility, isEmptyJourneySentenceShown, isChildBirthdayShared } · 403 account_unavailable
//        · 404 no_profile · 401/503 session guard · 503 · 500
//   PUT  the same three (strict) → 200 the saved values · 400 { error: 'invalid' } (before any database work) · 403
//        account_unavailable · 404 no_profile (no row created) · 401/503 session guard · 503 · 500
//   any other method → 405, Allow: GET, PUT.
// Logs carry a fixed line and the SQLSTATE, never the body, a setting, a token or an id (NFR-PRIV-001).

import { noteFailure } from '../lib/failure-report.js';
import { checkPrivacySettings } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { readOwnPrivacy, updateOwnPrivacy, type PrivacyOutcome } from '../services/privacy-service.js';

export interface PrivacyRouteDependencies {
  readonly database: Database | undefined;
}

const PATH = '/api/privacy';

function replyOutcome(reply: FastifyReply, outcome: PrivacyOutcome): FastifyReply {
  switch (outcome.kind) {
    case 'settings':
      return reply.code(200).send(outcome.settings);
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
  noteFailure(request, error);
  if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'internal' });
}

async function read(request: FastifyRequest, reply: FastifyReply, deps: PrivacyRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await readOwnPrivacy(deps.database, identity));
  } catch (error) {
    return replyFailure(request, reply, error, 'privacy read failed');
  }
}

async function update(request: FastifyRequest, reply: FastifyReply, deps: PrivacyRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const checked = checkPrivacySettings(request.body);
  if (!checked.ok) return reply.code(400).send({ error: 'invalid' });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await updateOwnPrivacy(deps.database, identity, checked.value));
  } catch (error) {
    return replyFailure(request, reply, error, 'privacy update failed');
  }
}

export function registerPrivacyRoute(app: FastifyInstance, deps: PrivacyRouteDependencies): void {
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
