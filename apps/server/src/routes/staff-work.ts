// The staff's work (I14 completion, Afik 21.10.2026). Signed in; staff only (403 forbidden otherwise); every body is strict.
//   GET  /api/admin/my-work                                         → 200 { permissions, counters, oldest, next }   (any staff account)
//   GET  /api/admin/overview                                        → 200 the Admin's home                          (the Admin)
//   POST /api/admin/reports/escalate   { targetKind, targetId, note } → 201 {} · 404 no open report · 409 already escalated (a Moderator, REPORTS_VIEW)
//   GET  /api/admin/child-trends?metric=&field=&dimension=&days=    → 200 { metric, field, dimension, days, cells }  (CHILD_DATA_VIEW; audited)
// Errors: 400 invalid · 401/503 session guard · 403 forbidden · 404 not_found · 409 not_applicable · 500.

import { checkChildTrendsQuery, checkEscalate } from '@nestly/shared';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/client.js';
import { escalateReport, readAdminOverview, readChildTrendsView, readMyWork } from '../services/staff-work-service.js';
import { answer } from './admin-reply.js';

export interface StaffWorkRouteDependencies {
  readonly database: Database | undefined;
}

const ADMIN = '/api/admin';

export function registerStaffWorkRoutes(app: FastifyInstance, deps: StaffWorkRouteDependencies): void {
  app.get(`${ADMIN}/my-work`, (request, reply) => {
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'my work failed', () => readMyWork(database, identity), (ok) => ok.work);
  });

  app.get(`${ADMIN}/overview`, (request, reply) => {
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'admin overview failed', () => readAdminOverview(database, identity), (ok) => ok.overview);
  });

  app.post(`${ADMIN}/reports/escalate`, (request, reply) => {
    const body = checkEscalate(request.body);
    if (!body.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'escalation failed', () => escalateReport(database, identity, body.value), () => ({}), 201);
  });

  app.get(`${ADMIN}/child-trends`, (request, reply) => {
    const query = checkChildTrendsQuery(request.query);
    if (!query.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'child trends failed', () => readChildTrendsView(database, identity, query.value), (ok) => ok.trends);
  });
}
