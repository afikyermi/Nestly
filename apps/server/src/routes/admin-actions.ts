// The admin actions (FR-MOD-002, FR-MOD-003, BR-074, AC-077). Signed in; staff only; every body is strict and names no actor (the Actor is the
// caller's by the database). Who may do what is the Permission Key and the policies; a refusal is 403 forbidden.
//   POST {admin}/reports/handle    { targetKind, targetId, resolution, note?, moderation?: { status, reason } } → 200 { closed }
//   POST {admin}/content/moderate  { targetKind, targetId, status, reason }                                    → 200 {}
//   POST {admin}/reports/reveal    { postId }                                                                  → 200 { userId, fullName }
//   POST {admin}/enforcements      { userId, kind, reason, durationHours?, reportId?, childSafety? }           → 200 the account's state
//   all: 400 invalid | reason_required · 401/503 session guard · 403 forbidden · 404 not_found · 409 not_applicable · 500. Any other method → 405.

import { checkEnforce, checkHandleReports, checkModerateContent, checkRevealAuthor } from '@nestly/shared';
import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import type { Database } from '../db/client.js';
import { enforce, handleReports, moderateContent, revealAnonymousAuthor } from '../services/admin-service.js';
import { answer } from './admin-reply.js';

/** {admin} in the route list above. */
const ADMIN = '/api/admin';

export interface AdminActionDependencies {
  readonly database: Database | undefined;
}

export function registerAdminActionRoutes(app: FastifyInstance, deps: AdminActionDependencies): void {
  const post = (url: string, handler: RouteHandlerMethod) => {
    app.post(url, handler);
    app.route({
      method: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      url,
      handler: (_request, reply) => reply.code(405).header('allow', 'POST').header('cache-control', 'no-store').send({ error: 'method_not_allowed' }),
    });
  };

  post(`${ADMIN}/reports/handle`, (request, reply) => {
    const body = checkHandleReports(request.body);
    if (!body.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'admin report handling failed', () => handleReports(database, identity, body.value), (ok) => ({ closed: ok.closed }));
  });

  post(`${ADMIN}/content/moderate`, (request, reply) => {
    const body = checkModerateContent(request.body);
    if (!body.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'admin moderation failed', () => moderateContent(database, identity, body.value), () => ({}));
  });

  post(`${ADMIN}/reports/reveal`, (request, reply) => {
    const body = checkRevealAuthor(request.body);
    if (!body.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'admin reveal failed', () => revealAnonymousAuthor(database, identity, body.value.postId), (ok) => ok.author);
  });

  post(`${ADMIN}/enforcements`, (request, reply) => {
    const body = checkEnforce(request.body);
    if (!body.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(
      request,
      reply,
      'admin enforcement failed',
      () => enforce(database, identity, body.value),
      (ok) => ({ status: ok.user.status, suspendedUntil: ok.user.suspendedUntil }),
    );
  });
}
