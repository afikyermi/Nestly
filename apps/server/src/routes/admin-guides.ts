// GET/POST /api/guides/manage, PUT /api/guides/manage/:id (I6; FR-ADMIN-012, BR-070, AC-095). The Admin's management of the status guides:
// read every guide (drafts and hidden too), create a draft, edit one and publish or hide it. Admin only (no Permission Key covers guides);
// the database decides and writes the Audit entry. Signed in: the authentication hook has run before anything here.
//   GET  → 200 { guides:[…] }
//   POST { stageKind, rangeFrom, rangeTo, title, body, source, sourceCheckedOn } (strict) → 201 { saved:true }
//   PUT  /:id the same fields + { status: draft | published | hidden } → 200 { saved:true } · 404 not_found (not a uuid: no query)
//   400 { error:'invalid', reason } before any database work · 403 forbidden · 401/503 session guard · 500; other methods → 405.
import { checkGuideCreate, checkGuideUpdate, trackerPathParams } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { createGuide, readGuides, saveGuide, type GuideOutcome } from '../services/guides-admin-service.js';
import { notAllowed, replyFailure } from './tracker-reply.js';

export interface AdminGuidesDependencies {
  readonly database: Database | undefined;
  readonly clock: () => Date;
}

const GUIDES = '/api/guides/manage';
const GUIDE = '/api/guides/manage/:id';

function send<T>(reply: FastifyReply, outcome: GuideOutcome<T>, status: 200 | 201, body: (value: T) => unknown): FastifyReply {
  switch (outcome.kind) {
    case 'ok':
      return reply.code(status).send(body(outcome.value));
    case 'forbidden':
      return reply.code(403).send({ error: 'forbidden' });
    case 'not_found':
      return reply.code(404).send({ error: 'not_found' });
    case 'invalid':
      return reply.code(400).send({ error: 'invalid', reason: 'invalid_body' });
  }
}

const today = (deps: AdminGuidesDependencies): string => deps.clock().toISOString().slice(0, 10);

async function list(request: FastifyRequest, reply: FastifyReply, deps: AdminGuidesDependencies) {
  reply.header('cache-control', 'no-store');
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return send(reply, await readGuides(deps.database, identity), 200, (guides) => ({ guides }));
  } catch (error) {
    return replyFailure(request, reply, error, 'admin guides read failed');
  }
}

async function create(request: FastifyRequest, reply: FastifyReply, deps: AdminGuidesDependencies) {
  reply.header('cache-control', 'no-store');
  const checked = checkGuideCreate(request.body, today(deps));
  if (!checked.ok) return reply.code(400).send({ error: 'invalid', reason: checked.reason });
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return send(reply, await createGuide(deps.database, identity, checked.value), 201, () => ({ saved: true }));
  } catch (error) {
    return replyFailure(request, reply, error, 'admin guide create failed');
  }
}

async function save(request: FastifyRequest, reply: FastifyReply, deps: AdminGuidesDependencies) {
  reply.header('cache-control', 'no-store');
  const params = trackerPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send({ error: 'not_found' });
  const checked = checkGuideUpdate(request.body, today(deps));
  if (!checked.ok || checked.status === null) return reply.code(400).send({ error: 'invalid', reason: checked.ok ? 'invalid_body' : checked.reason });
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return send(reply, await saveGuide(deps.database, identity, params.data.id, checked.value, checked.status), 200, () => ({ saved: true }));
  } catch (error) {
    return replyFailure(request, reply, error, 'admin guide save failed');
  }
}

export function registerAdminGuidesRoutes(app: FastifyInstance, deps: AdminGuidesDependencies): void {
  app.route({ method: 'GET', url: GUIDES, handler: (request, reply) => list(request, reply, deps) });
  app.route({ method: 'POST', url: GUIDES, handler: (request, reply) => create(request, reply, deps) });
  app.route({ method: ['PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: GUIDES, handler: notAllowed('GET, POST') });
  app.route({ method: 'PUT', url: GUIDE, handler: (request, reply) => save(request, reply, deps) });
  app.route({ method: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], url: GUIDE, handler: notAllowed('PUT') });
}
