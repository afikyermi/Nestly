// Notifications (FR-NOTIF-001/002/003; AC-040, AC-041). Signed in: the authentication hook has run before anything here. The caller is never
// named; a notification is named by its id in the path.
//   GET  /api/notifications[?before=<cursor>][&poll=1] → 200 { items:[{id,type,actor,actorName,targetKind,targetId,createdAt,isRead}], unreadCount, nextCursor } · 400 invalid
//   GET  /api/notifications/counts                → 200 { unreadCount, chatUnread, latestId } (the bell's light poll)
//   POST /api/notifications/read-all              → 200 {}   (Mark all as read)
//   POST /api/notifications/:id/read              → 200 {} · 404 unavailable (not the caller's) · 400 invalid
//   GET  /api/notification-preferences            → 200 { categories:[{category,isEnabled}], friends:[{userId,fullName,isEnabled}] }
//   PUT  /api/notification-preferences/categories/:category   { isEnabled } → 200 {} · 400 invalid
//   PUT  /api/notification-preferences/friends/:userId        { isEnabled } → 200 {} · 404 unavailable (not a Friend) · 400 invalid
//   all: 403 account_unavailable (stopped, ERR-037) · 403 forbidden (not a Regular or Professional account) · 401/503 session guard · 500.
// Logs carry a fixed line and the SQLSTATE, never a body, a name or an id (NFR-PRIV-001).

import { noteFailure } from '../lib/failure-report.js';
import {
  bellCountsResponse,
  checkCategoryUpdate,
  checkFriendFollowBody,
  checkUserId,
  notificationPreferencesResponse,
  notificationsResponse,
  parseNotificationsCursor,
} from '@nestly/shared';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import {
  markEverythingRead,
  markRead,
  readBell,
  readNotifications,
  readPreferences,
  setCategory,
  setFriendFollow,
  type MarkOutcome,
  type WriteOutcome,
} from '../services/notifications-service.js';

export interface NotificationsRouteDependencies {
  readonly database: Database | undefined;
}

type Refusal = { readonly kind: 'stopped' } | { readonly kind: 'forbidden' };

function replyRefusal(reply: FastifyReply, refusal: Refusal): FastifyReply {
  return reply.code(403).send({ error: refusal.kind === 'stopped' ? 'account_unavailable' : 'forbidden' });
}

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown, line: string): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, line);
  noteFailure(request, error);
  if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'internal' });
}

function replyWrite(reply: FastifyReply, outcome: MarkOutcome | WriteOutcome): FastifyReply {
  if (outcome.kind === 'done') return reply.code(200).send({});
  if (outcome.kind === 'unavailable') return reply.code(404).send({ error: 'unavailable' });
  return replyRefusal(reply, outcome);
}

const idParam = z.guid();

export function registerNotificationsRoutes(app: FastifyInstance, deps: NotificationsRouteDependencies): void {
  const guarded =
    (line: string, work: (database: Database, request: FastifyRequest, reply: FastifyReply, identity: NonNullable<FastifyRequest['identity']>) => Promise<FastifyReply>) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('cache-control', 'no-store');
      const { identity } = request;
      if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
      try {
        return await work(deps.database, request, reply, identity);
      } catch (error) {
        return replyFailure(request, reply, error, line);
      }
    };

  app.route({
    method: 'GET',
    url: '/api/notifications',
    handler: guarded('notifications read failed', async (database, request, reply, identity) => {
      const query = z.strictObject({ before: z.string().optional(), poll: z.literal('1').optional() }).safeParse(request.query ?? {});
      const before = query.success ? parseNotificationsCursor(query.data.before) : 'invalid';
      if (before === 'invalid') return reply.code(400).send({ error: 'invalid' });
      // poll=1: the bell's background refresh, which reads only (no birthday is delivered on it, OP-059)
      const outcome = await readNotifications(database, identity, before, { deliver: query.success && query.data.poll === undefined });
      if (outcome.kind !== 'ok') return replyRefusal(reply, outcome);
      return reply.code(200).send(notificationsResponse.parse({ items: outcome.items, unreadCount: outcome.unreadCount, nextCursor: outcome.nextCursor }));
    }),
  });

  app.route({
    method: 'GET',
    url: '/api/notifications/counts',
    handler: guarded('notification counts read failed', async (database, _request, reply, identity) => {
      const outcome = await readBell(database, identity);
      if (outcome.kind !== 'ok') return replyRefusal(reply, outcome);
      return reply.code(200).send(bellCountsResponse.parse({ unreadCount: outcome.unreadCount, chatUnread: outcome.chatUnread, latestId: outcome.latestId }));
    }),
  });

  app.route({
    method: 'POST',
    url: '/api/notifications/read-all',
    handler: guarded('notifications mark-all failed', async (database, _request, reply, identity) =>
      replyWrite(reply, await markEverythingRead(database, identity)),
    ),
  });

  app.route({
    method: 'POST',
    url: '/api/notifications/:id/read',
    handler: guarded('notification mark failed', async (database, request, reply, identity) => {
      const id = idParam.safeParse(Reflect.get(request.params ?? {}, 'id'));
      if (!id.success) return reply.code(400).send({ error: 'invalid' });
      return replyWrite(reply, await markRead(database, identity, id.data.toLowerCase()));
    }),
  });

  app.route({
    method: 'GET',
    url: '/api/notification-preferences',
    handler: guarded('notification preferences read failed', async (database, _request, reply, identity) => {
      const outcome = await readPreferences(database, identity);
      if (outcome.kind !== 'ok') return replyRefusal(reply, outcome);
      return reply.code(200).send(notificationPreferencesResponse.parse({ categories: outcome.categories, friends: outcome.friends }));
    }),
  });

  app.route({
    method: 'PUT',
    url: '/api/notification-preferences/categories/:category',
    handler: guarded('notification category write failed', async (database, request, reply, identity) => {
      const checked = checkCategoryUpdate(Reflect.get(request.params ?? {}, 'category'), request.body);
      if (!checked.ok) return reply.code(400).send({ error: 'invalid' });
      return replyWrite(reply, await setCategory(database, identity, checked.value.category, checked.value.isEnabled));
    }),
  });

  app.route({
    method: 'PUT',
    url: '/api/notification-preferences/friends/:userId',
    handler: guarded('notification friend write failed', async (database, request, reply, identity) => {
      const friend = checkUserId(Reflect.get(request.params ?? {}, 'userId'));
      const body = checkFriendFollowBody(request.body);
      if (!friend.ok || !body.ok || friend.userId === identity.userId.toLowerCase()) return reply.code(400).send({ error: 'invalid' });
      return replyWrite(reply, await setFriendFollow(database, identity, friend.userId, body.value));
    }),
  });
}
