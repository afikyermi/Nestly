// Stories (I5; FR-FEED-008, VAL-042, ERR-040, AC-102, AC-103). Signed in: the authentication hook has run before anything here.
//   GET  /api/stories → 200 { groups: [{ authorId, authorName, isMine, items: [{ id, caption, audience, createdAt, expiresAt, image }] }], postedToday }
//   POST /api/stories { mediaId, caption?, audience } (strict; the image is the caller's Story upload) → 201 { id }
//        · 400 invalid · 422 caption_too_long · 429 story_limit (ERR-040: the eleventh in 24 hours, counted by the database, AC-103)
//        · 403 not_allowed (not the caller's fresh Story image, already used, not a Regular account, or stopped)
//   all: 401/503 session guard · 503 · 500. Logs carry a fixed line and the SQLSTATE, never a caption or an id (NFR-PRIV-001).

import { noteFailure } from '../lib/failure-report.js';
import { createStoryBody, storiesResponse } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import type { MediaStorage } from '../media/storage-admin.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { createStory, readStories } from '../services/stories-service.js';

export interface StoriesRouteDependencies {
  readonly database: Database | undefined;
  readonly storage: MediaStorage;
}

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown, line: string): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, line);
  noteFailure(request, error);
  if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'internal' });
}

export function registerStoriesRoutes(app: FastifyInstance, deps: StoriesRouteDependencies): void {
  app.route({
    method: 'GET',
    url: '/api/stories',
    handler: async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      const { identity } = request;
      if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
      try {
        return reply.code(200).send(storiesResponse.parse(await readStories(deps.database, identity, deps.storage)));
      } catch (error) {
        return replyFailure(request, reply, error, 'stories read failed');
      }
    },
  });

  app.route({
    method: 'POST',
    url: '/api/stories',
    handler: async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const body = createStoryBody.safeParse(request.body);
      if (!body.success) {
        const tooLong = body.error.issues.some((issue) => issue.message === 'caption_too_long');
        return tooLong ? reply.code(422).send({ error: 'caption_too_long' }) : reply.code(400).send({ error: 'invalid' });
      }
      const { identity } = request;
      if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
      try {
        const caption = body.data.caption === undefined || body.data.caption === '' ? null : body.data.caption;
        const outcome = await createStory(deps.database, identity, { mediaId: body.data.mediaId.toLowerCase(), caption, audience: body.data.audience });
        if (outcome.kind === 'created') return reply.code(201).send({ id: outcome.id });
        if (outcome.kind === 'limit') return reply.code(429).send({ error: 'story_limit' });
        if (outcome.kind === 'caption_too_long') return reply.code(422).send({ error: 'caption_too_long' });
        return reply.code(403).send({ error: 'not_allowed' });
      } catch (error) {
        return replyFailure(request, reply, error, 'story create failed');
      }
    },
  });
}
