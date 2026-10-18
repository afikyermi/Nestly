// POST /api/posts, GET|PATCH|DELETE /api/posts/:id (I3 F3.1a; FR-FEED-002, OP-033, BR-062, VAL-036; Afik 3א, 5א). Signed in: the
// authentication hook has run before anything here (401 before the body is read, and no database query). No route takes an author id; the
// author is the caller's by the database, and RLS decides who may read, edit or delete.
//   POST   { body, audience, stageTag? } (strict) → 201 { id, body, audience, stageTag, createdAt } · 400 invalid · 422 body_required |
//          body_too_long · 403 not_allowed (not an active Regular account, from the database)
//   GET    /:id → 200 the same plus isMine · 404 not_found (also not a uuid: no query; also not readable: one body for every reason)
//   PATCH  /:id { body?, audience?, stageTag? } (strict, at least one; stageTag null clears) → 200 the stored post · 400 · 422 · 403 · 404
//   DELETE /:id no body → 204 (also a post held for an open report: the author never learns of a report) · 404 not_found
//   all: 401/503 session guard · 503 · 500 server_error. Any other method → 405 with Allow.
// Logs carry a fixed line and the SQLSTATE, never the body, an id or a tag (NFR-PRIV-001).

import { checkCreatePost, checkUpdatePost, postPathParams, type PostWriteCheck } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isConnectionFailure, postFaultReply, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { createPost, editPost, readPostById, removePost } from '../services/posts-service.js';

export interface PostsRouteDependencies {
  readonly database: Database | undefined;
}

const POSTS_PATH = '/api/posts';
const POST_PATH = '/api/posts/:id';
const NOT_FOUND = { error: 'not_found' };

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown, line: string): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, line);
  const fault = postFaultReply(error);
  if (fault !== undefined) return reply.code(fault.status).send({ error: fault.error });
  if (isConnectionFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'server_error' });
}

/** A refused body: a shape or key problem is 400; an empty or too long text is 422 with its code. */
function replyRefusedBody(reply: FastifyReply, checked: Exclude<PostWriteCheck, { ok: true }>): FastifyReply {
  return checked.reason === 'invalid' ? reply.code(400).send({ error: 'invalid' }) : reply.code(422).send({ error: checked.reason });
}

async function create(request: FastifyRequest, reply: FastifyReply, deps: PostsRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const checked = checkCreatePost(request.body);
  if (!checked.ok) return replyRefusedBody(reply, checked);
  const { body, audience, stageTag } = checked.value;
  if (body === undefined || audience === undefined) return reply.code(400).send({ error: 'invalid' });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return reply.code(201).send(await createPost(deps.database, identity, { body, audience, stageTag }));
  } catch (error) {
    return replyFailure(request, reply, error, 'post create failed');
  }
}

async function read(request: FastifyRequest, reply: FastifyReply, deps: PostsRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const params = postPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send(NOT_FOUND);
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const outcome = await readPostById(deps.database, identity, params.data.id.toLowerCase());
    return outcome.kind === 'post' ? reply.code(200).send(outcome.post) : reply.code(404).send(NOT_FOUND);
  } catch (error) {
    return replyFailure(request, reply, error, 'post read failed');
  }
}

async function edit(request: FastifyRequest, reply: FastifyReply, deps: PostsRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const params = postPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send(NOT_FOUND);
  const checked = checkUpdatePost(request.body);
  if (!checked.ok) return replyRefusedBody(reply, checked);
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const outcome = await editPost(deps.database, identity, params.data.id.toLowerCase(), checked.value);
    return outcome.kind === 'post' ? reply.code(200).send(outcome.post) : reply.code(404).send(NOT_FOUND);
  } catch (error) {
    return replyFailure(request, reply, error, 'post edit failed');
  }
}

async function remove(request: FastifyRequest, reply: FastifyReply, deps: PostsRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const params = postPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send(NOT_FOUND);
  if (request.body !== undefined) return reply.code(400).send({ error: 'invalid' });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const outcome = await removePost(deps.database, identity, params.data.id.toLowerCase());
    return outcome.kind === 'deleted' ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
  } catch (error) {
    return replyFailure(request, reply, error, 'post delete failed');
  }
}

/** Any other method: 405 with the Allow header. Authentication still comes first, like everywhere. */
function notAllowed(allow: string) {
  return (_request: FastifyRequest, reply: FastifyReply) =>
    reply.code(405).header('allow', allow).header('cache-control', 'no-store').send({ error: 'method_not_allowed' });
}

export function registerPostsRoutes(app: FastifyInstance, deps: PostsRouteDependencies): void {
  app.route({ method: 'POST', url: POSTS_PATH, handler: (request, reply) => create(request, reply, deps) });
  app.route({ method: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: POSTS_PATH, handler: notAllowed('POST') });

  app.route({ method: 'GET', url: POST_PATH, handler: (request, reply) => read(request, reply, deps) });
  app.route({ method: 'PATCH', url: POST_PATH, handler: (request, reply) => edit(request, reply, deps) });
  app.route({ method: 'DELETE', url: POST_PATH, handler: (request, reply) => remove(request, reply, deps) });
  app.route({ method: ['POST', 'PUT', 'OPTIONS'], url: POST_PATH, handler: notAllowed('GET, PATCH, DELETE') });
}
