// Images (I5; FR-FEED-002, FR-PROFILE-001, NFR-MEDIA-001, VAL-041, ERR-039, AC-104, AC-105). Signed in: the authentication hook has run before
// anything here. No route takes an owner: the uploader is the caller's by the database.
//   POST   /api/media?kind=post|profile|story   body: the image bytes (Content-Type image/jpeg | image/png | image/webp, at most 4 MB)
//          → 201 { id, state: "pending", url, width, height } · 400 invalid (kind) · 413 (too large) · 415 unsupported_image (not one of the
//          three types, or not a readable picture: ERR-039) · 403 not_allowed (not a Regular or Professional account, or stopped)
//          · 503 unavailable (storage not configured or not reachable: nothing is kept)
//   GET    /api/profile/photo                    → 200 { photo: image | null }   (the caller's own, in any state)
//   PUT    /api/profile/photo { mediaId }        → 200 { photo } · 422 image_not_available (not the caller's profile image, or refused)
//   DELETE /api/profile/photo                    → 204
//   all: 401/503 session guard · 500. Logs carry a fixed line and the SQLSTATE, never an id or a byte of the image (NFR-PRIV-001).

import { MEDIA_UPLOAD_MAX_BYTES, MEDIA_UPLOAD_TYPES, mediaKindParam, mediaUploadResponse, profilePhotoBody } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { readOwnProfilePhoto, removeProfilePhoto, setProfilePhoto, StorageUnavailable, uploadImage, type MediaDependencies } from '../services/media-service.js';

export interface MediaRouteDependencies {
  readonly database: Database | undefined;
  readonly media: MediaDependencies;
}

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown, line: string): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  if (error instanceof StorageUnavailable) {
    request.log.error({ cause: 'storage' }, line);
    return reply.code(503).send({ error: 'unavailable' });
  }
  const code = readDatabaseFault(error)?.code;
  request.log.error({ sqlstate: code }, line);
  if (code === '42501' || code === '23503') return reply.code(403).send({ error: 'not_allowed' });
  if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'internal' });
}

export function registerMediaRoutes(app: FastifyInstance, deps: MediaRouteDependencies): void {
  // The image bytes, as one buffer, for these three types only; any other type is 415 before a handler runs.
  app.addContentTypeParser([...MEDIA_UPLOAD_TYPES], { parseAs: 'buffer', bodyLimit: MEDIA_UPLOAD_MAX_BYTES }, (_request, body, done) => {
    done(null, body);
  });

  app.route({
    method: 'POST',
    url: '/api/media',
    bodyLimit: MEDIA_UPLOAD_MAX_BYTES,
    handler: async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const query = z.strictObject({ kind: mediaKindParam }).safeParse(request.query ?? {});
      if (!query.success) return reply.code(400).send({ error: 'invalid' });
      const body: unknown = request.body;
      if (!(body instanceof Uint8Array) || body.byteLength === 0) return reply.code(415).send({ error: 'unsupported_image' });
      const { identity } = request;
      if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
      try {
        const outcome = await uploadImage(deps.database, identity, deps.media, query.data.kind, body);
        if (outcome.kind === 'unsupported') return reply.code(415).send({ error: 'unsupported_image' });
        if (outcome.kind === 'unconfigured') return reply.code(503).send({ error: 'unavailable' });
        return reply.code(201).send(mediaUploadResponse.parse(outcome.image));
      } catch (error) {
        return replyFailure(request, reply, error, 'media upload failed');
      }
    },
  });

  app.route({
    method: 'GET',
    url: '/api/profile/photo',
    handler: async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const { identity } = request;
      if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
      try {
        return reply.code(200).send({ photo: await readOwnProfilePhoto(deps.database, identity, deps.media.storage) });
      } catch (error) {
        return replyFailure(request, reply, error, 'profile photo read failed');
      }
    },
  });

  app.route({
    method: 'PUT',
    url: '/api/profile/photo',
    handler: async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const body = profilePhotoBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'invalid' });
      const { identity } = request;
      if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
      try {
        const outcome = await setProfilePhoto(deps.database, identity, deps.media.storage, body.data.mediaId.toLowerCase());
        if (outcome.kind === 'set') return reply.code(200).send({ photo: outcome.photo });
        return reply.code(422).send({ error: 'image_not_available' });
      } catch (error) {
        const code = readDatabaseFault(error)?.code;
        if (code === '42501' || code === '23505' || code === '23503') return reply.code(422).send({ error: 'image_not_available' });
        return replyFailure(request, reply, error, 'profile photo write failed');
      }
    },
  });

  app.route({
    method: 'DELETE',
    url: '/api/profile/photo',
    handler: async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const { identity } = request;
      if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
      try {
        await removeProfilePhoto(deps.database, identity, deps.media.storage);
        return reply.code(204).send();
      } catch (error) {
        return replyFailure(request, reply, error, 'profile photo delete failed');
      }
    },
  });
}
