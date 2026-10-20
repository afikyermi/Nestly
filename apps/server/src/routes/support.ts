// Support (I8; FR-ADMIN-001/002, FR-CHAT-004). Signed in: the authentication hook has run before anything here. No body names the caller.
// The user's side:
//   POST {support} { topic, text }               → 201 { id } · 403 not_allowed (staff send none) · 429 rate_limited (5 in 24 hours)
//   GET  {support}                               → 200 { requests[] } the caller's own requests
//   GET  {support}/:id                           → 200 the request and its thread, without internal notes (marks it read) · 404 unavailable
//   POST {support}/:id/messages { text }         → 204 · 409 closed · 404 unavailable
// The staff's side, on the admin screens (nestly.staff_view):
//   GET  {admin}/support?status=                 → 200 { items[] } the inbox                                    (SUPPORT_VIEW)
//   GET  {admin}/support/:id                     → 200 the request and its whole thread                         (SUPPORT_VIEW)
//   POST {admin}/support/:id/messages { text, internal } → 201 {} a reply as "Support" or an internal note (SUPPORT_HANDLE; audited)
//   POST {admin}/support/:id/status { status }   → 200 {} · 409 not_applicable (a closed request is final)     (SUPPORT_HANDLE; audited)
//   POST {admin}/reports/message { messageId }   → 200 the reported message and its sender (REPORTS_VIEW; every opening audited, §9.6)
//   all: 400 invalid · 401/503 session guard · 403 forbidden · 404 not_found · 500. Other methods → 405 with Allow.
// Logs carry a fixed line and the SQLSTATE, never an id or a text.

import { chatIdParams, chatMessageSchema, reportedMessageSchema, supportInboxQuery, supportRequestSchema, supportStaffMessageSchema, supportStatusSchema } from '@nestly/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import {
  changeSupportStatus,
  createSupportRequest,
  listOwnRequests,
  openOwnThread,
  readSupportInbox,
  readSupportRequest,
  replyAsSupport,
  replyOwn,
  viewReportedMessage,
} from '../services/support-service.js';
import { answer } from './admin-reply.js';
import { chatAnswer, notAllowedMethod } from './chat.js';

export interface SupportRouteDependencies {
  readonly database: Database | undefined;
}

const SUPPORT = '/api/support';
const ADMIN = '/api/admin';
const ALL = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
type Method = (typeof ALL)[number];

export function registerSupportRoutes(app: FastifyInstance, deps: SupportRouteDependencies): void {
  const db = () => deps.database;
  const others = (url: string, allowed: readonly Method[]) =>
    app.route({ method: ALL.filter((method) => !allowed.includes(method)), url, handler: notAllowedMethod(allowed.join(', ')) });
  const id = (request: FastifyRequest) => chatIdParams.safeParse(request.params);

  // ---- the user's side
  app.post(SUPPORT, (request, reply) => {
    const body = supportRequestSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
    return chatAnswer(request, reply, db(), 'support request failed', (database, identity) => createSupportRequest(database, identity, body.data.topic, body.data.text), (ok) => ({ id: ok.id }), 201);
  });
  app.get(SUPPORT, (request, reply) =>
    chatAnswer(request, reply, db(), 'support list failed', async (database, identity) => ({ kind: 'ok', requests: await listOwnRequests(database, identity) }), (ok) => ({
      requests: ok.requests,
    })),
  );
  others(SUPPORT, ['GET', 'POST']);

  app.get(`${SUPPORT}/:id`, (request, reply) => {
    const params = id(request);
    if (!params.success) return reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
    return chatAnswer(request, reply, db(), 'support thread failed', (database, identity) => openOwnThread(database, identity, params.data.id), (ok) => ok.thread);
  });
  others(`${SUPPORT}/:id`, ['GET']);

  app.post(`${SUPPORT}/:id/messages`, (request, reply) => {
    const params = id(request);
    const body = chatMessageSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
    return chatAnswer(request, reply, db(), 'support reply failed', (database, identity) => replyOwn(database, identity, params.data.id, body.data.text), () => null);
  });
  others(`${SUPPORT}/:id/messages`, ['POST']);

  // ---- the staff's side
  const staff = (request: FastifyRequest) => {
    const database = db();
    return request.identity === null || database === undefined ? undefined : { identity: request.identity, database };
  };

  app.get(`${ADMIN}/support`, (request, reply) => {
    const query = supportInboxQuery.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
    const caller = staff(request);
    if (caller === undefined) return reply.code(503).send({ error: 'unavailable' });
    return answer(request, reply, 'support inbox failed', () => readSupportInbox(caller.database, caller.identity, query.data.status), (ok) => ({ items: ok.items }));
  });
  others(`${ADMIN}/support`, ['GET']);

  app.get(`${ADMIN}/support/:id`, (request, reply) => {
    const params = id(request);
    if (!params.success) return reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
    const caller = staff(request);
    if (caller === undefined) return reply.code(503).send({ error: 'unavailable' });
    return answer(request, reply, 'support detail failed', () => readSupportRequest(caller.database, caller.identity, params.data.id), (ok) => ok.detail);
  });
  others(`${ADMIN}/support/:id`, ['GET']);

  app.post(`${ADMIN}/support/:id/messages`, (request, reply) => {
    const params = id(request);
    const body = supportStaffMessageSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
    const caller = staff(request);
    if (caller === undefined) return reply.code(503).send({ error: 'unavailable' });
    return answer(request, reply, 'support staff reply failed', () => replyAsSupport(caller.database, caller.identity, params.data.id, body.data.text, body.data.internal), () => ({}), 201);
  });
  others(`${ADMIN}/support/:id/messages`, ['POST']);

  app.post(`${ADMIN}/support/:id/status`, (request, reply) => {
    const params = id(request);
    const body = supportStatusSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
    const caller = staff(request);
    if (caller === undefined) return reply.code(503).send({ error: 'unavailable' });
    return answer(request, reply, 'support status failed', () => changeSupportStatus(caller.database, caller.identity, params.data.id, body.data.status), () => ({}));
  });
  others(`${ADMIN}/support/:id/status`, ['POST']);

  app.post(`${ADMIN}/reports/message`, (request, reply) => {
    const body = reportedMessageSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
    const caller = staff(request);
    if (caller === undefined) return reply.code(503).send({ error: 'unavailable' });
    return answer(request, reply, 'reported message failed', () => viewReportedMessage(caller.database, caller.identity, body.data.messageId), (ok) => ok.message);
  });
  others(`${ADMIN}/reports/message`, ['POST']);
}
