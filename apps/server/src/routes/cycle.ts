// GET/POST /api/cycle, PUT/DELETE /api/cycle/:id (I6; FR-TRACK-001 "cycle and ovulation"). The caller's own cycle entries: a start date
// and an average length; the ovulation window is computed from the latest (never stored). Health data: owner only, decided by RLS.
//   GET    → 200 { entries:[{id,startDate,cycleLengthDays}], window: {…}|null }
//   POST   { startDate:'YYYY-MM-DD', cycleLengthDays } (strict) → 201 { saved:true } · 409 duplicate_date
//   PUT    /:id the same body → 200 · 404 not_found (not a uuid: no query) · 409 duplicate_date
//   DELETE /:id no body → 200 · 404
//   writes: 400 { error:'invalid', reason } before any database work. all: 403 · 404 no_profile · 401/503 · 500; other methods → 405.
import { checkCycleWrite, israelDay, trackerPathParams } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { serverToday } from '../lib/server-today.js';
import { addCycle, editCycle, readCycle, removeCycle } from '../services/trackers-service.js';
import { notAllowed, replyFailure, replyOutcome } from './tracker-reply.js';

export interface CycleRouteDependencies {
  readonly database: Database | undefined;
  readonly clock: () => Date;
}

const CYCLE = '/api/cycle';
const ENTRY = '/api/cycle/:id';
const saved = () => ({ saved: true });

async function read(request: FastifyRequest, reply: FastifyReply, deps: CycleRouteDependencies) {
  reply.header('cache-control', 'no-store');
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await readCycle(deps.database, identity, israelDay(deps.clock())), 200, (view) => view);
  } catch (error) {
    return replyFailure(request, reply, error, 'cycle read failed');
  }
}

async function add(request: FastifyRequest, reply: FastifyReply, deps: CycleRouteDependencies) {
  reply.header('cache-control', 'no-store');
  const checked = checkCycleWrite(request.body, serverToday(deps.clock()));
  if (!checked.ok) return reply.code(400).send({ error: 'invalid', reason: checked.reason });
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await addCycle(deps.database, identity, checked.value), 201, saved);
  } catch (error) {
    return replyFailure(request, reply, error, 'cycle add failed');
  }
}

async function edit(request: FastifyRequest, reply: FastifyReply, deps: CycleRouteDependencies) {
  reply.header('cache-control', 'no-store');
  const params = trackerPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send({ error: 'not_found' });
  const checked = checkCycleWrite(request.body, serverToday(deps.clock()));
  if (!checked.ok) return reply.code(400).send({ error: 'invalid', reason: checked.reason });
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await editCycle(deps.database, identity, params.data.id, checked.value), 200, saved);
  } catch (error) {
    return replyFailure(request, reply, error, 'cycle edit failed');
  }
}

async function remove(request: FastifyRequest, reply: FastifyReply, deps: CycleRouteDependencies) {
  reply.header('cache-control', 'no-store');
  const params = trackerPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send({ error: 'not_found' });
  if (request.body !== undefined) return reply.code(400).send({ error: 'invalid', reason: 'invalid_body' });
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await removeCycle(deps.database, identity, params.data.id), 200, saved);
  } catch (error) {
    return replyFailure(request, reply, error, 'cycle removal failed');
  }
}

export function registerCycleRoutes(app: FastifyInstance, deps: CycleRouteDependencies): void {
  app.route({ method: 'GET', url: CYCLE, handler: (request, reply) => read(request, reply, deps) });
  app.route({ method: 'POST', url: CYCLE, handler: (request, reply) => add(request, reply, deps) });
  app.route({ method: ['PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: CYCLE, handler: notAllowed('GET, POST') });
  app.route({ method: 'PUT', url: ENTRY, handler: (request, reply) => edit(request, reply, deps) });
  app.route({ method: 'DELETE', url: ENTRY, handler: (request, reply) => remove(request, reply, deps) });
  app.route({ method: ['GET', 'POST', 'PATCH', 'OPTIONS'], url: ENTRY, handler: notAllowed('PUT, DELETE') });
}
