// The admin screens' reads (FR-MOD-003, FR-ADMIN-005, FR-MOD-002). Signed in: the authentication hook has run before anything here. Staff only: an
// account without the Permission Key gets 403 forbidden; the policies behind it return nothing to such an account anyway.
//   GET {admin}/access                        → 200 { staff: true, role, permissions[] } | { staff: false }
//   GET {admin}/audit?before=<ISO time>       → 200 { entries[], next }                          (AUDIT_LOG_VIEW)
//   GET {admin}/reports                       → 200 { items[] } the moderation queue              (REPORTS_VIEW)
//   GET {admin}/reports/:kind/:id             → 200 the target, its reports, the account          (REPORTS_VIEW)
//   GET {admin}/users?q=<part of a name>      → 200 { users[] } (q required, NFR-SEC-006 (2))     (USER_VIEW)
//   GET {admin}/users/:id                     → 200 the account and its enforcement history       (USER_VIEW)
//   all: 400 invalid · 401/503 session guard · 403 forbidden · 404 not_found · 500. Any other method → 405 with Allow.

import { REPORT_TARGET_KINDS, checkAuditQuery } from '@nestly/shared';
import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { listUsers, readAccessOrNone, readAudit, readReportDetail, readReportQueue, readUser } from '../services/admin-service.js';
import { answer } from './admin-reply.js';

/** {admin} in the route list above. */
const ADMIN = '/api/admin';

export interface AdminRouteDependencies {
  readonly database: Database | undefined;
}

const idParam = z.guid().transform((value) => value.toLowerCase());
const detailParams = z.object({ kind: z.enum(REPORT_TARGET_KINDS), id: idParam });
// A search text is required: no call returns accounts without one (NFR-SEC-006 (2)).
const searchQuery = z.object({ q: z.string().trim().min(1).max(60) });

export function registerAdminReadRoutes(app: FastifyInstance, deps: AdminRouteDependencies): void {
  const get = (url: string, handler: RouteHandlerMethod) => {
    app.get(url, handler);
    app.route({
      method: ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      url,
      handler: (_request, reply) => reply.code(405).header('allow', 'GET').header('cache-control', 'no-store').send({ error: 'method_not_allowed' }),
    });
  };

  get(`${ADMIN}/access`, (request, reply) => {
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'admin access failed', () => readAccessOrNone(database, identity), (ok) => (ok.access === null ? { staff: false } : { staff: true, ...ok.access }));
  });

  get(`${ADMIN}/audit`, (request, reply) => {
    const query = checkAuditQuery(request.query);
    if (!query.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'admin audit failed', () => readAudit(database, identity, query.value.before), (ok) => ok.page);
  });

  get(`${ADMIN}/reports`, (request, reply) => {
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'admin queue failed', () => readReportQueue(database, identity), (ok) => ({ items: ok.items }));
  });

  get(`${ADMIN}/reports/:kind/:id`, (request, reply) => {
    const params = detailParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'admin report detail failed', () => readReportDetail(database, identity, params.data.kind, params.data.id), (ok) => ok.detail);
  });

  get(`${ADMIN}/users`, (request, reply) => {
    const query = searchQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'admin users failed', () => listUsers(database, identity, query.data.q), (ok) => ({ users: ok.users }));
  });

  get(`${ADMIN}/users/:id`, (request, reply) => {
    const id = idParam.safeParse(Reflect.get(request.params ?? {}, 'id'));
    if (!id.success) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'admin user failed', () => readUser(database, identity, id.data), (ok) => ok.user);
  });
}
