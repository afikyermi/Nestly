// GET /api/journeys, POST /api/children, PUT /api/children/:id (I2 F2.2a; FR-PROFILE-002, PG-012, VAL-040, AC-090), POST
// /api/journeys, PUT /api/journeys/:id (F2.2b1; VAL-039, VAL-044, AC-089). The caller's own journeys and children. Signed in: the
// authentication hook has run before anything here (401 before the body is read, and no database query). No route takes a user
// id; a child or a journey is named by its row id only, and RLS decides whether it is the caller's.
//   GET  /api/journeys       → 200 { journeys:[{id, stage, dueDate}], children:[{id, name, sex, birthDate}] } (children by slot)
//   POST /api/children       { name, sex, birthDate:{day, month, year} } (strict) → 201 the journeys and children after the add ·
//                            409 children_too_many
//   PUT  /api/children/:id   the same body → 200 the journeys and children after the edit · 404 not_found (not a uuid: no query)
//   POST /api/journeys       { dueDate:{day, month, year} } (strict; all empty = none) → 201 after adding the pregnancy ·
//                            409 stage_conflict (a pregnant or planning journey exists)
//                            { ..., endPlanning: true } after the confirmation (F2.2b2 c23): planning ends in the same transaction
//   PUT  /api/journeys/:id   { dueDate } → 200 after the due-date edit · 404 not_found (not a uuid: no query; not a pregnancy)
//   DELETE /api/journeys/:id no body → 200 after ending the pregnancy (DR-1 A, DR-2r) · 404 not_found (also planning, has_child)
//   POST /api/journeys/:id/birth  the child body → 201 after the birth: the pregnancy deleted, the child added (DR-2 A) · 404 · 409
//                            children_too_many (the pregnancy kept)
//   DELETE /api/children/:id no body → 200 after the removal (the last child's takes has_child with it, DR-4 A) · 404 not_found
//   writes: 400 { error: 'invalid', reason } before any database work, judged against the server's date (c5, c14; the due date
//   from UTC date − 30 to UTC date + 1 + 300); a DELETE with a body → 400 reason invalid_body.
//   all: 403 account_unavailable · 404 no_profile (nothing created) · 401/503 session guard · 503 · 500; other methods → 405.
// Logs carry a fixed line and the SQLSTATE, never the body, a name, a sex, a date, a stage, a token or an id (NFR-PRIV-001, c11).

import { checkChildWrite, checkDueDateWrite, checkPregnancyAddWrite, childPathParams, journeyPathParams } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { serverEarliestToday, serverToday } from '../lib/server-today.js';
import { replySessionRefused } from '../plugins/authentication.js';
import {
  addOwnChild,
  addOwnPregnancy,
  editOwnChild,
  editOwnDueDate,
  endOwnPregnancy,
  readOwnJourneysAndChildren,
  recordOwnBirth,
  removeOwnChild,
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
const JOURNEY_PATH = '/api/journeys/:id';
const BIRTH_PATH = '/api/journeys/:id/birth';

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
    case 'stage_conflict':
      return reply.code(409).send({ error: 'stage_conflict' });
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

async function addPregnancy(request: FastifyRequest, reply: FastifyReply, deps: JourneysRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const now = deps.clock();
  const checked = checkPregnancyAddWrite(request.body, serverToday(now), serverEarliestToday(now));
  if (!checked.ok) return reply.code(400).send({ error: 'invalid', reason: checked.reason });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  const { dueDate, endPlanning } = checked.value;
  try {
    return replyOutcome(reply, await addOwnPregnancy(deps.database, identity, dueDate, endPlanning), 201);
  } catch (error) {
    return replyFailure(request, reply, error, 'pregnancy add failed');
  }
}

async function editDueDate(request: FastifyRequest, reply: FastifyReply, deps: JourneysRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const params = journeyPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send({ error: 'not_found' });
  const now = deps.clock();
  const checked = checkDueDateWrite(request.body, serverToday(now), serverEarliestToday(now));
  if (!checked.ok) return reply.code(400).send({ error: 'invalid', reason: checked.reason });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await editOwnDueDate(deps.database, identity, params.data.id, checked.value), 200);
  } catch (error) {
    return replyFailure(request, reply, error, 'due date edit failed');
  }
}

type DeleteWork = (database: Database, identity: Identity, id: string) => Promise<JourneysOutcome>;

/** DELETE of a child or a pregnancy: id (404, no query) → no body (400) → the work, which answers 200 with the view after it. */
async function remove(request: FastifyRequest, reply: FastifyReply, deps: JourneysRouteDependencies, work: DeleteWork, line: string) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const params = childPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send({ error: 'not_found' });
  if (request.body !== undefined) return reply.code(400).send({ error: 'invalid', reason: 'invalid_body' });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await work(deps.database, identity, params.data.id), 200);
  } catch (error) {
    return replyFailure(request, reply, error, line);
  }
}

async function birth(request: FastifyRequest, reply: FastifyReply, deps: JourneysRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const params = journeyPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send({ error: 'not_found' });
  const checked = checkChildWrite(request.body, serverToday(deps.clock()));
  if (!checked.ok) return reply.code(400).send({ error: 'invalid', reason: checked.reason });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await recordOwnBirth(deps.database, identity, params.data.id, checked.value), 201);
  } catch (error) {
    return replyFailure(request, reply, error, 'birth failed');
  }
}

/** Any other method: 405 with the Allow header. Authentication still comes first, like everywhere. */
function notAllowed(allow: string) {
  return (_request: FastifyRequest, reply: FastifyReply) =>
    reply.code(405).header('allow', allow).header('cache-control', 'no-store').send({ error: 'method_not_allowed' });
}

export function registerJourneysRoutes(app: FastifyInstance, deps: JourneysRouteDependencies): void {
  app.route({ method: 'GET', url: JOURNEYS_PATH, handler: (request, reply) => read(request, reply, deps) });
  app.route({ method: 'POST', url: JOURNEYS_PATH, handler: (request, reply) => addPregnancy(request, reply, deps) });
  app.route({ method: ['PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: JOURNEYS_PATH, handler: notAllowed('GET, POST') });

  app.route({ method: 'PUT', url: JOURNEY_PATH, handler: (request, reply) => editDueDate(request, reply, deps) });
  app.route({
    method: 'DELETE',
    url: JOURNEY_PATH,
    handler: (request, reply) => remove(request, reply, deps, endOwnPregnancy, 'pregnancy end failed'),
  });
  app.route({ method: ['GET', 'POST', 'PATCH', 'OPTIONS'], url: JOURNEY_PATH, handler: notAllowed('PUT, DELETE') });

  app.route({ method: 'POST', url: BIRTH_PATH, handler: (request, reply) => birth(request, reply, deps) });
  app.route({ method: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: BIRTH_PATH, handler: notAllowed('POST') });

  app.route({ method: 'POST', url: CHILDREN_PATH, handler: (request, reply) => add(request, reply, deps) });
  app.route({ method: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: CHILDREN_PATH, handler: notAllowed('POST') });

  app.route({ method: 'PUT', url: CHILD_PATH, handler: (request, reply) => edit(request, reply, deps) });
  app.route({
    method: 'DELETE',
    url: CHILD_PATH,
    handler: (request, reply) => remove(request, reply, deps, removeOwnChild, 'child removal failed'),
  });
  app.route({ method: ['GET', 'POST', 'PATCH', 'OPTIONS'], url: CHILD_PATH, handler: notAllowed('PUT, DELETE') });
}
