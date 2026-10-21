// Chat (I8; FR-CHAT-001..003, FR-SERV-009; Afik's decisions of 20.10.2026, §9). Signed in: the authentication hook has run before anything here
// (401 before the body is read, and no query). No body or path names the caller; the database binds the sender, the requester and the blocker.
//   GET    /api/chat                              → 200 the Chat Center { conversations, incoming, outgoing, support, unreadTotal }
//   GET    /api/chat/unread                       → 200 { count } (the badge)
//   POST   /api/chat/start { userId, text }       → 200 { kind: 'conversation', conversationId } | { kind: 'request' } (FR-CHAT-002)
//   GET    /api/chat/conversations/:id            → 200 the thread (marks it read) · 404 unavailable
//   POST   /api/chat/conversations/:id/messages { text } → 201 { id, at } · 403 blocked (a Chat Block, §9.4) · 404 unavailable
//   POST   /api/chat/requests/:id/accept          → 200 { conversationId } · 403 not_allowed · 404 unavailable
//   POST   /api/chat/requests/:id/decline         → 204 · 404 unavailable (that request only: a decline is no block, §9.3)
//   DELETE /api/chat/requests/:id                 → 204 · 404 unavailable (the requester withdraws it)
//   PUT    /api/users/:id/chat-block              → 204 (also a repeat) · 404 unavailable · 403 not_allowed · 429 rate_limited
//   DELETE /api/users/:id/chat-block              → 204 (also when there was none)
//   all: 400 invalid · 401/503 session guard · 409 request_pending · 429 rate_limited · 503 · 500 server_error. Other methods → 405 with Allow.
// Logs carry a fixed line and the SQLSTATE, never an id or a text (NFR-PRIV-001, BR-052).

import { chatIdParams, chatMessageSchema, chatStartSchema } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import type { Identity } from '../lib/token-verifier.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import {
  acceptChatRequest,
  changeChatBlock,
  endChatRequest,
  openThread,
  readOverview,
  readUnread,
  sendMessage,
  startChat,
  type ChatOutcome,
  type ChatRefusal,
} from '../services/chat-service.js';

export interface ChatRouteDependencies {
  readonly database: Database | undefined;
}

const STATUS: Record<ChatRefusal['kind'], number> = {
  invalid: 400,
  unavailable: 404,
  not_allowed: 403,
  blocked: 403,
  request_pending: 409,
  closed: 409,
  rate_limited: 429,
};

export function replyChatFailure(request: FastifyRequest, reply: FastifyReply, error: unknown, line: string): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, line);
  if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'server_error' });
}

/** Runs a call for a signed-in caller and answers its outcome: `shape` on success (null: 204), the refusal's status otherwise. */
export async function chatAnswer<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  database: Database | undefined,
  line: string,
  call: (database: Database, identity: Identity) => Promise<ChatOutcome<T>>,
  shape: (ok: T) => unknown,
  status = 200,
): Promise<FastifyReply> {
  reply.header('cache-control', 'no-store');
  const { identity } = request;
  if (identity === null || database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const outcome = await call(database, identity);
    if (outcome.kind !== 'ok') return reply.code(STATUS[outcome.kind]).send({ error: outcome.kind });
    const body = shape(outcome);
    return body === null ? reply.code(204).send() : reply.code(status).send(body);
  } catch (error) {
    return replyChatFailure(request, reply, error, line);
  }
}

export function notAllowedMethod(allow: string) {
  return (_request: FastifyRequest, reply: FastifyReply) =>
    reply.code(405).header('allow', allow).header('cache-control', 'no-store').send({ error: 'method_not_allowed' });
}

const ALL = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
type Method = (typeof ALL)[number];

export function registerChatRoutes(app: FastifyInstance, deps: ChatRouteDependencies): void {
  const db = () => deps.database;
  const others = (url: string, allowed: readonly Method[]) =>
    app.route({ method: ALL.filter((method) => !allowed.includes(method)), url, handler: notAllowedMethod(allowed.join(', ')) });
  const id = (request: FastifyRequest) => chatIdParams.safeParse(request.params);

  app.get('/api/chat', (request, reply) =>
    chatAnswer(request, reply, db(), 'chat overview failed', async (database, identity) => ({ kind: 'ok', overview: await readOverview(database, identity) }), (ok) => ok.overview),
  );
  others('/api/chat', ['GET']);

  app.get('/api/chat/unread', (request, reply) =>
    chatAnswer(request, reply, db(), 'chat unread failed', async (database, identity) => ({ kind: 'ok', count: await readUnread(database, identity) }), (ok) => ({ count: ok.count })),
  );
  others('/api/chat/unread', ['GET']);

  app.post('/api/chat/start', (request, reply) => {
    const body = chatStartSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
    return chatAnswer(request, reply, db(), 'chat start failed', (database, identity) => startChat(database, identity, body.data.userId, body.data.text), (ok) => ok.result);
  });
  others('/api/chat/start', ['POST']);

  app.get('/api/chat/conversations/:id', (request, reply) => {
    const params = id(request);
    if (!params.success) return reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
    return chatAnswer(request, reply, db(), 'chat thread failed', (database, identity) => openThread(database, identity, params.data.id), (ok) => ok.thread);
  });
  others('/api/chat/conversations/:id', ['GET']);

  app.post('/api/chat/conversations/:id/messages', (request, reply) => {
    const params = id(request);
    const body = chatMessageSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
    return chatAnswer(
      request,
      reply,
      db(),
      'chat message failed',
      (database, identity) => sendMessage(database, identity, params.data.id, body.data.text),
      (ok) => ({ id: ok.id, at: ok.at }),
      201,
    );
  });
  others('/api/chat/conversations/:id/messages', ['POST']);

  app.post('/api/chat/requests/:id/accept', (request, reply) => {
    const params = id(request);
    if (!params.success || request.body !== undefined) return reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
    return chatAnswer(request, reply, db(), 'chat accept failed', (database, identity) => acceptChatRequest(database, identity, params.data.id), (ok) => ({
      conversationId: ok.conversationId,
    }));
  });
  others('/api/chat/requests/:id/accept', ['POST']);

  app.post('/api/chat/requests/:id/decline', (request, reply) => {
    const params = id(request);
    if (!params.success || request.body !== undefined) return reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
    return chatAnswer(request, reply, db(), 'chat decline failed', (database, identity) => endChatRequest(database, identity, params.data.id, 'target'), () => null);
  });
  others('/api/chat/requests/:id/decline', ['POST']);

  app.delete('/api/chat/requests/:id', (request, reply) => {
    const params = id(request);
    if (!params.success || request.body !== undefined) return reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
    return chatAnswer(request, reply, db(), 'chat cancel failed', (database, identity) => endChatRequest(database, identity, params.data.id, 'requester'), () => null);
  });
  others('/api/chat/requests/:id', ['DELETE']);

  const chatBlock = (block: boolean) => (request: FastifyRequest, reply: FastifyReply) => {
    const params = id(request);
    if (!params.success || request.body !== undefined) return reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
    return chatAnswer(request, reply, db(), 'chat block failed', (database, identity) => changeChatBlock(database, identity, params.data.id, block), () => null);
  };
  app.put('/api/users/:id/chat-block', chatBlock(true));
  app.delete('/api/users/:id/chat-block', chatBlock(false));
  others('/api/users/:id/chat-block', ['PUT', 'DELETE']);
}
