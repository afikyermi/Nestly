// The image approval queue (I5; Afik 20.10.2026; §3.2 CONTENT_MODERATE, the Admin always). Signed in: the authentication hook has run first.
//   GET  /api/admin/media-queue → 200 { items: [{ id, kind, queueReason, topLabel, topScore, createdAt, url, width, height }] } (oldest first)
//        · 403 forbidden (no CONTENT_MODERATE now)
//   POST /api/admin/media/:id/decision { decision: approved|rejected|suspected, isChild } (strict) → 200 {} · 400 invalid
//        · 404 not_found (not queued any more, not the caller's to decide, or gone)
//   POST /api/admin/media/:id/removal { suspected } (strict) → 200 {} · 400 invalid · 403 forbidden (no CONTENT_MODERATE and REPORTS_VIEW)
//        · 404 not_found (not a checked image the caller reads, no report on its post or uploader and no suspicion, or gone)
//   POST /api/admin/media/:id/match { decision: confirmed|not_abuse } (strict) → 200 {} · 400 invalid · 404 not_found (no undecided block-list
//        match the caller may decide; I14 completion B, Afik 21.10.2026: not_abuse takes its matched hashes off the list, audited)
//   all: 401/503 session guard · 503 · 500. The decision is audited by the database. Logs carry a fixed line and the SQLSTATE only.

import { mediaDecisionBody, mediaMatchDecisionBody, mediaQueueResponse, mediaRemovalBody } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import type { JobKick } from '../media/job-kick.js';
import type { MediaStorage } from '../media/storage-admin.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { decideBlockListMatch, decideQueuedImage, readMediaQueue, removeImageAfterReport } from '../services/media-queue-service.js';

export interface MediaQueueRouteDependencies {
  readonly database: Database | undefined;
  readonly storage: MediaStorage;
  /** Asks the background job to run now: a rejected image's file goes at once, after its training copy (Afik 20.10.2026). */
  readonly kick: JobKick;
}

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown, line: string): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  const code = readDatabaseFault(error)?.code;
  request.log.error({ sqlstate: code }, line);
  if (code === '42501') return reply.code(404).send({ error: 'not_found' });
  if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'internal' });
}

export function registerMediaQueueRoutes(app: FastifyInstance, deps: MediaQueueRouteDependencies): void {
  app.route({
    method: 'GET',
    url: '/api/admin/media-queue',
    handler: async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      const { identity } = request;
      if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
      try {
        const outcome = await readMediaQueue(deps.database, identity, deps.storage);
        if (outcome.kind === 'forbidden') return reply.code(403).send({ error: 'forbidden' });
        return reply.code(200).send(mediaQueueResponse.parse({ items: outcome.items }));
      } catch (error) {
        return replyFailure(request, reply, error, 'media queue read failed');
      }
    },
  });

  app.route({
    method: 'POST',
    url: '/api/admin/media/:id/decision',
    handler: async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const id = z.guid().safeParse(Reflect.get(request.params ?? {}, 'id'));
      const body = mediaDecisionBody.safeParse(request.body);
      if (!id.success || !body.success) return reply.code(400).send({ error: 'invalid' });
      const { identity } = request;
      if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
      try {
        const outcome = await decideQueuedImage(deps.database, identity, id.data.toLowerCase(), body.data.decision, body.data.isChild);
        if (outcome.kind !== 'decided') return reply.code(404).send({ error: 'not_found' });
        await deps.kick();
        return reply.code(200).send({});
      } catch (error) {
        return replyFailure(request, reply, error, 'media decision failed');
      }
    },
  });

  app.route({
    method: 'POST',
    url: '/api/admin/media/:id/match',
    handler: async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const id = z.guid().safeParse(Reflect.get(request.params ?? {}, 'id'));
      const body = mediaMatchDecisionBody.safeParse(request.body);
      if (!id.success || !body.success) return reply.code(400).send({ error: 'invalid' });
      const { identity } = request;
      if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
      try {
        const outcome = await decideBlockListMatch(deps.database, identity, id.data.toLowerCase(), body.data.decision);
        if (outcome.kind !== 'decided') return reply.code(404).send({ error: 'not_found' });
        await deps.kick();
        return reply.code(200).send({});
      } catch (error) {
        return replyFailure(request, reply, error, 'media match decision failed');
      }
    },
  });

  app.route({
    method: 'POST',
    url: '/api/admin/media/:id/removal',
    handler: async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const id = z.guid().safeParse(Reflect.get(request.params ?? {}, 'id'));
      const body = mediaRemovalBody.safeParse(request.body);
      if (!id.success || !body.success) return reply.code(400).send({ error: 'invalid' });
      const { identity } = request;
      if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
      try {
        const outcome = await removeImageAfterReport(deps.database, identity, id.data.toLowerCase(), body.data.suspected);
        if (outcome.kind === 'forbidden') return reply.code(403).send({ error: 'forbidden' });
        if (outcome.kind !== 'removed') return reply.code(404).send({ error: 'not_found' });
        // no job run here: the file of an image removed while its report is still open waits for the daily run, so closing the report with
        // action taken first makes it a training candidate (BR-076) before its file goes
        return reply.code(200).send({});
      } catch (error) {
        return replyFailure(request, reply, error, 'media removal failed');
      }
    },
  });
}
