// The Moderators team (I14). Signed in; every body is strict; who may do what is the database's (a refusal is 403 forbidden).
//   GET   /api/admin/team                                   → 200 { moderators, invitations }             (the Admin)
//   POST  /api/admin/team/invitations           { note }    → 201 { id, code, expiresAt }                  (the Admin; the code is answered once)
//   POST  /api/admin/team/invitations/:id/revoke            → 200 {}                                       (the Admin; 404 when not open)
//   PUT   /api/admin/team/:userId/permissions   { permissions } → 200 {}                                   (the Admin; BR-028 bases included)
//   POST  /api/team/join                        { code }    → 201 {} · 409 has_account · 410 invalid_code (an account with no Nestly row)
//   GET   /api/admin/announcements                          → 200 { items }                                (SYSTEM_ANNOUNCEMENTS)
//   POST  /api/admin/announcements              { title, body } → 201 the announcement (a draft)
//   PATCH /api/admin/announcements/:id          { title, body } → 200 the announcement · 409 removed
//   POST  /api/admin/announcements/:id/status   { status }  → 200 the announcement · 409 already so, or removed
//   GET   /api/admin/report-reasons                         → 200 { items }                                (COMMUNITY_CONFIG)
//   POST  /api/admin/report-reasons             { label, priority, sortOrder } → 201 the reason
//   PATCH /api/admin/report-reasons/:key        { label, priority, sortOrder, isActive } → 200 the reason
//   GET   /api/report-reasons                               → 200 { items: [{ key, label }] }              (any active account)
//   GET   /api/admin/analytics?days=7|30|90                 → 200 numbers only                             (ANALYTICS_VIEW)
//   GET   /api/admin/inbox                                  → 200 { openReports?, queuedImages? }          (staff, by key: AC-044)
// Errors: 400 invalid · 401/503 session guard · 403 forbidden · 404 not_found · 409 not_applicable · 500.

import {
  checkAnalyticsQuery,
  checkAnnouncement,
  checkAnnouncementStatus,
  checkInvitationCreate,
  checkJoinTeam,
  checkModeratorKeys,
  checkReportReasonCreate,
  checkReportReasonUpdate,
} from '@nestly/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import {
  activeReportReasons,
  addReportReason,
  changeAnnouncementStatus,
  changeReportReason,
  createAnnouncement,
  editAnnouncement,
  inviteModerator,
  joinTeam,
  listAnnouncements,
  listReportReasons,
  readAdminAnalytics,
  readStaffInbox,
  readTeam,
  revokeModeratorInvitation,
  setModeratorKeys,
} from '../services/team-service.js';
import { answer, replyFailure } from './admin-reply.js';

export interface TeamRouteDependencies {
  readonly database: Database | undefined;
}

const ADMIN = '/api/admin';
const idParam = z.object({ id: z.guid().transform((value) => value.toLowerCase()) });
const userParam = z.object({ userId: z.guid().transform((value) => value.toLowerCase()) });
const keyParam = z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/) });

export function registerTeamRoutes(app: FastifyInstance, deps: TeamRouteDependencies): void {
  app.get(`${ADMIN}/team`, (request, reply) => {
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'team read failed', () => readTeam(database, identity), (ok) => ok.team);
  });

  app.post(`${ADMIN}/team/invitations`, (request, reply) => {
    const body = checkInvitationCreate(request.body);
    if (!body.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'invitation failed', () => inviteModerator(database, identity, body.value.note), (ok) => ok.invitation, 201);
  });

  app.post(`${ADMIN}/team/invitations/:id/revoke`, (request, reply) => {
    const params = idParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'invitation revoke failed', () => revokeModeratorInvitation(database, identity, params.data.id), () => ({}));
  });

  app.put(`${ADMIN}/team/:userId/permissions`, (request, reply) => {
    const params = userParam.safeParse(request.params);
    const body = checkModeratorKeys(request.body);
    if (!params.success || !body.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'moderator keys failed', () => setModeratorKeys(database, identity, params.data.userId, body.value.permissions), () => ({}));
  });

  app.post('/api/team/join', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const body = checkJoinTeam(request.body);
    if (!body.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    try {
      const outcome = await joinTeam(deps.database, request.identity, body.value.code);
      if (outcome.kind === 'joined') return reply.code(201).send({});
      if (outcome.kind === 'has_account') return reply.code(409).send({ error: 'has_account' });
      return reply.code(410).send({ error: 'invalid_code' });
    } catch (error) {
      return replyFailure(request, reply, error, 'team join failed');
    }
  });

  app.get(`${ADMIN}/announcements`, (request, reply) => {
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'announcements read failed', () => listAnnouncements(database, identity), (ok) => ({ items: ok.items }));
  });

  app.post(`${ADMIN}/announcements`, (request, reply) => {
    const body = checkAnnouncement(request.body);
    if (!body.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'announcement create failed', () => createAnnouncement(database, identity, body.value), (ok) => ok.item, 201);
  });

  app.patch(`${ADMIN}/announcements/:id`, (request, reply) => {
    const params = idParam.safeParse(request.params);
    const body = checkAnnouncement(request.body);
    if (!params.success || !body.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'announcement edit failed', () => editAnnouncement(database, identity, params.data.id, body.value), (ok) => ok.item);
  });

  app.post(`${ADMIN}/announcements/:id/status`, (request, reply) => {
    const params = idParam.safeParse(request.params);
    const body = checkAnnouncementStatus(request.body);
    if (!params.success || !body.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'announcement status failed', () => changeAnnouncementStatus(database, identity, params.data.id, body.value.status), (ok) => ok.item);
  });

  app.get(`${ADMIN}/report-reasons`, (request, reply) => {
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'report reasons read failed', () => listReportReasons(database, identity), (ok) => ({ items: ok.items }));
  });

  app.post(`${ADMIN}/report-reasons`, (request, reply) => {
    const body = checkReportReasonCreate(request.body);
    if (!body.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'report reason create failed', () => addReportReason(database, identity, body.value), (ok) => ok.item, 201);
  });

  app.patch(`${ADMIN}/report-reasons/:key`, (request, reply) => {
    const params = keyParam.safeParse(request.params);
    const body = checkReportReasonUpdate(request.body);
    if (!params.success || !body.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'report reason edit failed', () => changeReportReason(database, identity, params.data.key, body.value), (ok) => ok.item);
  });

  app.get('/api/report-reasons', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    try {
      return reply.code(200).send({ items: await activeReportReasons(deps.database, request.identity) });
    } catch (error) {
      return replyFailure(request, reply, error, 'report reasons failed');
    }
  });

  app.get(`${ADMIN}/analytics`, (request, reply) => {
    const query = checkAnalyticsQuery(request.query ?? {});
    if (!query.ok) return reply.code(400).send({ error: 'invalid' });
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'analytics read failed', () => readAdminAnalytics(database, identity, query.value.days), (ok) => ok.view);
  });

  app.get(`${ADMIN}/inbox`, (request, reply) => {
    if (request.identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    const { identity } = request;
    const database = deps.database;
    return answer(request, reply, 'inbox read failed', () => readStaffInbox(database, identity), (ok) => ok.inbox);
  });
}
