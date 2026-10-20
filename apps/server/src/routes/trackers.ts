// GET/POST /api/trackers/events, PUT/DELETE /api/trackers/events/:id (I6; FR-TRACK-001/002, AC-007, AC-023). The caller's own events of
// the eight child trackers. Health data about minors: owner only, decided by RLS. Signed in: the authentication hook has run before
// anything here (401 before the body is read, and no database query). No route takes a user id; an event is named by its row id.
//   GET    ?kind&childId?&from&to  → 200 { events:[…] } for the Israeli days from..to (at most 366) · 400 invalid_query
//   POST   { kind, childId, occurredAt, …the kind's fields } (strict) → 201 { saved:true } · 404 not_found (not the caller's child)
//   PUT    /:id { kind, occurredAt, …} → 200 { saved:true } · 404 not_found (not a uuid: no query; not the caller's; other kind)
//   DELETE /:id no body → 200 { saved:true } · 404 not_found
//   writes: 400 { error:'invalid', reason } before any database work, judged against the server's clock.
//   all: 403 account_unavailable · 404 no_profile · 401/503 session guard · 503 · 500; other methods → 405.
import { checkPeriod, checkTrackerEventWrite, trackerEventsQuery, trackerPathParams } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { addEvent, editEvent, readEvents, removeEvent } from '../services/trackers-service.js';
import { notAllowed, replyFailure, replyOutcome } from './tracker-reply.js';

export interface TrackersRouteDependencies {
  readonly database: Database | undefined;
  readonly clock: () => Date;
}

const EVENTS = '/api/trackers/events';
const EVENT = '/api/trackers/events/:id';
const saved = () => ({ saved: true });

async function list(request: FastifyRequest, reply: FastifyReply, deps: TrackersRouteDependencies) {
  reply.header('cache-control', 'no-store');
  const query = trackerEventsQuery.safeParse(request.query);
  const period = query.success ? checkPeriod(query.data.from, query.data.to) : undefined;
  if (!query.success || period === undefined || !period.ok) return reply.code(400).send({ error: 'invalid_query' });
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await readEvents(deps.database, identity, query.data.kind, query.data.childId, period.value), 200, (events) => ({ events }));
  } catch (error) {
    return replyFailure(request, reply, error, 'tracker events read failed');
  }
}

async function add(request: FastifyRequest, reply: FastifyReply, deps: TrackersRouteDependencies) {
  reply.header('cache-control', 'no-store');
  const checked = checkTrackerEventWrite(request.body, deps.clock(), true);
  if (!checked.ok) return reply.code(400).send({ error: 'invalid', reason: checked.reason });
  const { identity } = request;
  if (identity === null || deps.database === undefined || checked.childId === null) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await addEvent(deps.database, identity, checked.childId, checked.value), 201, saved);
  } catch (error) {
    return replyFailure(request, reply, error, 'tracker event add failed');
  }
}

async function edit(request: FastifyRequest, reply: FastifyReply, deps: TrackersRouteDependencies) {
  reply.header('cache-control', 'no-store');
  const params = trackerPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send({ error: 'not_found' });
  const checked = checkTrackerEventWrite(request.body, deps.clock(), false);
  if (!checked.ok) return reply.code(400).send({ error: 'invalid', reason: checked.reason });
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await editEvent(deps.database, identity, params.data.id, checked.value), 200, saved);
  } catch (error) {
    return replyFailure(request, reply, error, 'tracker event edit failed');
  }
}

async function remove(request: FastifyRequest, reply: FastifyReply, deps: TrackersRouteDependencies) {
  reply.header('cache-control', 'no-store');
  const params = trackerPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send({ error: 'not_found' });
  if (request.body !== undefined) return reply.code(400).send({ error: 'invalid', reason: 'invalid_body' });
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await removeEvent(deps.database, identity, params.data.id), 200, saved);
  } catch (error) {
    return replyFailure(request, reply, error, 'tracker event removal failed');
  }
}

export function registerTrackersRoutes(app: FastifyInstance, deps: TrackersRouteDependencies): void {
  app.route({ method: 'GET', url: EVENTS, handler: (request, reply) => list(request, reply, deps) });
  app.route({ method: 'POST', url: EVENTS, handler: (request, reply) => add(request, reply, deps) });
  app.route({ method: ['PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: EVENTS, handler: notAllowed('GET, POST') });
  app.route({ method: 'PUT', url: EVENT, handler: (request, reply) => edit(request, reply, deps) });
  app.route({ method: 'DELETE', url: EVENT, handler: (request, reply) => remove(request, reply, deps) });
  app.route({ method: ['GET', 'POST', 'PATCH', 'OPTIONS'], url: EVENT, handler: notAllowed('PUT, DELETE') });
}
