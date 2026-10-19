// POST|GET /api/posts/:id/comments, DELETE /api/comments/:id (I3 F3.3 b1; FR-FEED-003, AC-076, VAL-036; Afik 3א, 18.10). Signed in: the
// authentication hook has run before anything here (401 before the body is read, and no database query). No route takes an author id; the
// commenter is the caller's by the database, and RLS decides who may read, comment or delete.
//   POST   { body, parentId? } (strict) → 201 { comment } · 400 invalid | parent_invalid · 422 body_required | body_too_long ·
//          404 post_unavailable (missing, or not readable: one body for every reason) · 403 account_unavailable | not_allowed
//   GET    ?cursor= → 200 { items, nextCursor } · 400 cursor_invalid · 404 post_unavailable · 403 as above
//   GET    /comments/:id/replies ?cursor= → 200 { items, nextCursor } · 400 cursor_invalid · 404 comment_unavailable (unknown, a reply, held or on an unreadable post: one body) · 403 as above
//   DELETE /comments/:id no body → 204 (also a comment held for an open report) · 404 not_found (not a uuid, unknown or not the caller's) · 403
//   all: 401/503 session guard · 503 · 500 server_error. Any other method → 405 with Allow.
// Logs carry a fixed line and the SQLSTATE, never the body or an id (NFR-PRIV-001).

import { checkCreateComment, commentPathParams, parseCommentCursor } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { commentFaultReply, isConnectionFailure, readDatabaseFault, type CommentOperation } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { createComment, readReplies, readThread, removeComment, type CommentRefusal } from '../services/comments-service.js';

export interface CommentsRouteDependencies {
  readonly database: Database | undefined;
}

const POST_COMMENTS_PATH = '/api/posts/:id/comments';
const COMMENT_PATH = '/api/comments/:id';
const REPLIES_PATH = '/api/comments/:id/replies';
const NOT_FOUND = { error: 'not_found' };
const POST_UNAVAILABLE = { error: 'post_unavailable' };
const COMMENT_UNAVAILABLE = { error: 'comment_unavailable' };

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown, line: string, operation: CommentOperation = 'other'): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, line);
  const fault = commentFaultReply(error, operation);
  if (fault !== undefined) return reply.code(fault.status).send({ error: fault.error });
  if (isConnectionFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'server_error' });
}

function replyRefusal(reply: FastifyReply, refusal: CommentRefusal): FastifyReply {
  return reply.code(403).send({ error: refusal.kind === 'stopped' ? 'account_unavailable' : 'not_allowed' });
}

/** `undefined`: no cursor (first page). `null`: a query that is not exactly "no cursor" or "one valid cursor". */
function cursorOf(query: unknown): ReturnType<typeof parseCommentCursor> | undefined {
  if (typeof query !== 'object' || query === null) return null;
  const keys = Object.keys(query);
  if (keys.length === 0) return undefined;
  if (keys.length !== 1 || keys[0] !== 'cursor') return null;
  return parseCommentCursor(Reflect.get(query, 'cursor'));
}

async function create(request: FastifyRequest, reply: FastifyReply, deps: CommentsRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const params = commentPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send(POST_UNAVAILABLE);
  const checked = checkCreateComment(request.body);
  if (!checked.ok) return checked.reason === 'invalid' ? reply.code(400).send({ error: 'invalid' }) : reply.code(422).send({ error: checked.reason });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const outcome = await createComment(deps.database, identity, params.data.id.toLowerCase(), checked.value);
    switch (outcome.kind) {
      case 'comment':
        return reply.code(201).send({ comment: outcome.comment });
      case 'post_unavailable':
        return reply.code(404).send(POST_UNAVAILABLE);
      case 'parent_invalid':
        return reply.code(400).send({ error: 'parent_invalid' });
      default:
        return replyRefusal(reply, outcome);
    }
  } catch (error) {
    return replyFailure(request, reply, error, 'comment create failed', checked.value.parentId === undefined ? 'create' : 'create_reply');
  }
}

async function read(request: FastifyRequest, reply: FastifyReply, deps: CommentsRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const params = commentPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send(POST_UNAVAILABLE);
  const cursor = cursorOf(request.query);
  if (cursor === null) return reply.code(400).send({ error: 'cursor_invalid' });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const outcome = await readThread(deps.database, identity, params.data.id.toLowerCase(), cursor ?? null);
    switch (outcome.kind) {
      case 'thread':
        return reply.code(200).send(outcome.page);
      case 'post_unavailable':
        return reply.code(404).send(POST_UNAVAILABLE);
      default:
        return replyRefusal(reply, outcome);
    }
  } catch (error) {
    return replyFailure(request, reply, error, 'comment thread read failed');
  }
}

async function readReplyList(request: FastifyRequest, reply: FastifyReply, deps: CommentsRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const params = commentPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send(COMMENT_UNAVAILABLE);
  const cursor = cursorOf(request.query);
  if (cursor === null) return reply.code(400).send({ error: 'cursor_invalid' });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const outcome = await readReplies(deps.database, identity, params.data.id.toLowerCase(), cursor ?? null);
    switch (outcome.kind) {
      case 'replies':
        return reply.code(200).send(outcome.page);
      case 'cursor_invalid':
        return reply.code(400).send({ error: 'cursor_invalid' });
      case 'comment_unavailable':
        return reply.code(404).send(COMMENT_UNAVAILABLE);
      default:
        return replyRefusal(reply, outcome);
    }
  } catch (error) {
    return replyFailure(request, reply, error, 'comment replies read failed');
  }
}

async function remove(request: FastifyRequest, reply: FastifyReply, deps: CommentsRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const params = commentPathParams.safeParse(request.params);
  if (!params.success) return reply.code(404).send(NOT_FOUND);
  if (request.body !== undefined) return reply.code(400).send({ error: 'invalid' });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const outcome = await removeComment(deps.database, identity, params.data.id.toLowerCase());
    switch (outcome.kind) {
      case 'deleted':
        return reply.code(204).send();
      case 'not_found':
        return reply.code(404).send(NOT_FOUND);
      default:
        return replyRefusal(reply, outcome);
    }
  } catch (error) {
    return replyFailure(request, reply, error, 'comment delete failed');
  }
}

/** Any other method: 405 with the Allow header. Authentication still comes first, like everywhere. */
function notAllowed(allow: string) {
  return (_request: FastifyRequest, reply: FastifyReply) =>
    reply.code(405).header('allow', allow).header('cache-control', 'no-store').send({ error: 'method_not_allowed' });
}

export function registerCommentsRoutes(app: FastifyInstance, deps: CommentsRouteDependencies): void {
  app.route({ method: 'POST', url: POST_COMMENTS_PATH, handler: (request, reply) => create(request, reply, deps) });
  app.route({ method: 'GET', url: POST_COMMENTS_PATH, handler: (request, reply) => read(request, reply, deps) });
  app.route({ method: ['PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: POST_COMMENTS_PATH, handler: notAllowed('GET, POST') });

  app.route({ method: 'DELETE', url: COMMENT_PATH, handler: (request, reply) => remove(request, reply, deps) });
  app.route({ method: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'], url: COMMENT_PATH, handler: notAllowed('DELETE') });

  app.route({ method: 'GET', url: REPLIES_PATH, handler: (request, reply) => readReplyList(request, reply, deps) });
  app.route({ method: ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: REPLIES_PATH, handler: notAllowed('GET') });
}
