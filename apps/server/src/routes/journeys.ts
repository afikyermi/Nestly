// GET /api/journeys, POST /api/children, PUT /api/children/:id (I2 F2.2a; FR-PROFILE-002, PG-012, VAL-040, AC-090). The caller's
// own journeys and children. Signed in: the authentication hook has run before anything here (401 before the body is read, and no
// database query). No route takes a user id; a child is named by its row id only, and RLS decides whether it is the caller's.
//   GET  /api/journeys       → 200 { journeys:[{id, stage, dueDate}], children:[{id, name, sex, birthDate}] } (children by slot)
//   POST /api/children       { name, sex, birthDate:{day, month, year} } (strict) → 201 the journeys and children after the add ·
//                            409 children_too_many
//   PUT  /api/children/:id   the same body → 200 the journeys and children after the edit · 404 not_found (not a uuid: no query)
//   writes: 400 { error: 'invalid', reason } before any database work, judged against the server's date (c5).
//   all: 403 account_unavailable · 404 no_profile (nothing created) · 401/503 session guard · 503 · 500; other methods → 405.
// Logs carry a fixed line and the SQLSTATE, never the body, a name, a sex, a date, a stage, a token or an id (NFR-PRIV-001, c11).

import { checkChildWrite, childPathParams } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { serverToday } from '../lib/server-today.js';
import { replySessionRefused } from '../plugins/authentication.js';
import {
  addOwnChild,
  editOwnChild,
  readOwnJourneysAndChildren,
  type JourneysOutcome,
} from '../services/journeys-service.js';

export interface JourneysRouteDependencies {
  readonly database: Database | undefined;
  /** The server's clock. A test passes a fixed one. */
  readonly clock: () => Date;
}

const JOURNEYS_PATH = '/api/journeys';
const CHILDREN_PATH = '/api/children';
const CHILD_PATH = '/api/children/:id';

function replyOutcome(reply: FastifyReply, outcome: JourneysOutcome, okStatus: 200 | 201): FastifyReply {
  switch (outcome.kind) {
    case 'journeys':
      return reply.code(okStatus).send(outcome.journeys);
    case 'unavailable':
      // ERR-037: the account is stopped. The web asks GET /api/me again and the session guard ends the session.
      return reply.code(403).send({ error: 'account_unavailable' });
    case 'no_profile':
      return reply.code(404).send({ error: 'no_profile' });
    case 'too_many':
      return reply.code(409).send({ error: 'children_too_many' });
    case 'not_found':
      return reply.code(404).send({ error: 'not_found' });
  }
}

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown, line: string): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, line);
  if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'internal' });
}

async function read(request: FastifyRequest, reply: FastifyReply, deps: JourneysRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await readOwnJourneysAndChildren(deps.database, identity), 200);
  } catch (error) {
    return replyFailure(request, reply, error, 'journeys read failed');
  }
}

async function add(request: FastifyRequest, reply: FastifyReply, deps: JourneysRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const checked = checkChildWrite(request.body, serverToday(deps.clock()));
  if (!checked.ok) return reply.code(400).send({ error: 'invalid', reason: checked.reason });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await addOwnChild(deps.database, identity, checked.value), 201);
  } catch (error) {
    return replyFailure(request, reply, error, 'child add failed');
  }
}

async function edit(request: FastifyRequest, reply: FastifyReply, deps: JourneysRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const params = childPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send({ error: 'not_found' });
  const checked = checkChildWrite(request.body, serverToday(deps.clock()));
  if (!checked.ok) return reply.code(400).send({ error: 'invalid', reason: checked.reason });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await editOwnChild(deps.database, identity, params.data.id, checked.value), 200);
  } catch (error) {
    return replyFailure(request, reply, error, 'child edit failed');
  }
}

/** Any other method: 405 with the Allow header. Authentication still comes first, like everywhere. */
function notAllowed(allow: string) {
  return (_request: FastifyRequest, reply: FastifyReply) =>
    reply.code(405).header('allow', allow).header('cache-control', 'no-store').send({ error: 'method_not_allowed' });
}

export function registerJourneysRoutes(app: FastifyInstance, deps: JourneysRouteDependencies): void {
  app.route({ method: 'GET', url: JOURNEYS_PATH, handler: (request, reply) => read(request, reply, deps) });
  app.route({ method: ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: JOURNEYS_PATH, handler: notAllowed('GET') });

  app.route({ method: 'POST', url: CHILDREN_PATH, handler: (request, reply) => add(request, reply, deps) });
  app.route({ method: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: CHILDREN_PATH, handler: notAllowed('POST') });

  app.route({ method: 'PUT', url: CHILD_PATH, handler: (request, reply) => edit(request, reply, deps) });
  app.route({ method: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], url: CHILD_PATH, handler: notAllowed('PUT') });
}
