// Friend Requests and Friendships (I2 F2.4a; FR-REL-001, PG-036, VAL-017, BR-029, AC-034). Signed in: the authentication hook has run
// before anything here (401 before the body is read, and no database query). The caller is never named: the requester is set by the
// database from the token, and the other person is named in the path or the body by user id only.
//   POST   /api/friend-requests                  { targetUserId } (strict) → 201 {} · 404 unavailable (one body for a Professional,
//                                                 Moderator, Admin, an unknown or a stopped target) · 409 request_exists | already_friends |
//                                                 incoming_pending · 400 invalid (also the caller's own id) · 429 rate_limited (a send counts as
//                                                 one profile open, c24; no row is made)
//   POST   /api/friend-requests/:userId/accept   the request :userId sent the caller → 200 {}
//   POST   /api/friend-requests/:userId/decline  the same, declined → 200 {} (the sender is not told, DR-3 A)
//   DELETE /api/friend-requests/:userId          the caller's own request to :userId withdrawn (DR-4 A) → 200 {}
//   DELETE /api/friends/:userId                  the Friendship with :userId ended → 200 {}
//     the four: 404 unavailable (no such request or Friendship for the caller) · 409 request_gone (it is no longer open) · 400 invalid
//                (:userId is not a uuid; no query)
//   GET    /api/friends                          → 200 { incoming:[{userId, fullName, requestedAt}], sent:[same], friends:[{userId, fullName}] }
//   all:   403 account_unavailable (the account is stopped, ERR-037) · 403 forbidden (not a Regular account) · 401/503 session guard ·
//          503 · 500. Any other method → 405 with Allow.
// Logs carry a fixed line and the SQLSTATE, never a body, a name or an id (NFR-PRIV-001).

import { checkFriendRequest, checkUserId } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { replyRateLimited } from './rate-limit-reply.js';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  readFriendLists,
  removeFriend,
  sendFriendRequest,
  type ActionOutcome,
  type ActorRefusal,
  type SendOutcome,
} from '../services/friends-service.js';

export interface FriendsRouteDependencies {
  readonly database: Database | undefined;
}

function replyRefusal(reply: FastifyReply, refusal: ActorRefusal): FastifyReply {
  // ERR-037: the account is stopped. The web asks GET /api/me again and the session guard ends the session.
  return reply.code(403).send({ error: refusal.kind === 'stopped' ? 'account_unavailable' : 'forbidden' });
}

function replySend(request: FastifyRequest, reply: FastifyReply, outcome: SendOutcome): FastifyReply {
  switch (outcome.kind) {
    case 'sent':
      return reply.code(201).send({});
    case 'unavailable':
      return reply.code(404).send({ error: 'unavailable' });
    case 'conflict':
      return reply.code(409).send({ error: outcome.reason });
    case 'rate_limited':
      return replyRateLimited(request, reply, outcome);
    default:
      return replyRefusal(reply, outcome);
  }
}

function replyAction(reply: FastifyReply, outcome: ActionOutcome): FastifyReply {
  switch (outcome.kind) {
    case 'done':
      return reply.code(200).send({});
    case 'unavailable':
      return reply.code(404).send({ error: 'unavailable' });
    case 'gone':
      return reply.code(409).send({ error: 'request_gone' });
    default:
      return replyRefusal(reply, outcome);
  }
}

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown, line: string): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, line);
  if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'internal' });
}

type Action = (database: Database, identity: NonNullable<FastifyRequest['identity']>, userId: string) => Promise<ActionOutcome>;

const ID_PARAM = ':userId';

function actionHandler(deps: FriendsRouteDependencies, work: Action, line: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { identity } = request;
    reply.header('cache-control', 'no-store');
    const target = checkUserId(Reflect.get(request.params ?? {}, 'userId'));
    // The caller's own id names no other person (VAL-017): invalid, before any database work, as a send does.
    if (!target.ok || target.userId === identity?.userId.toLowerCase()) return reply.code(400).send({ error: 'invalid' });
    if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    try {
      return replyAction(reply, await work(deps.database, identity, target.userId));
    } catch (error) {
      return replyFailure(request, reply, error, line);
    }
  };
}

async function send(request: FastifyRequest, reply: FastifyReply, deps: FriendsRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const checked = checkFriendRequest(request.body);
  // A request to oneself is invalid (VAL-017: two different users); judged before any database work.
  if (!checked.ok || checked.userId === identity?.userId.toLowerCase()) return reply.code(400).send({ error: 'invalid' });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replySend(request, reply, await sendFriendRequest(deps.database, identity, checked.userId));
  } catch (error) {
    return replyFailure(request, reply, error, 'friend request send failed');
  }
}

async function lists(request: FastifyRequest, reply: FastifyReply, deps: FriendsRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const outcome = await readFriendLists(deps.database, identity);
    return outcome.kind === 'lists' ? reply.code(200).send(outcome.lists) : replyRefusal(reply, outcome);
  } catch (error) {
    return replyFailure(request, reply, error, 'friend lists read failed');
  }
}

function methodNotAllowed(app: FastifyInstance, url: string, allowed: readonly ('GET' | 'POST' | 'DELETE')[]): void {
  const others = (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const).filter((method) => !allowed.some((one) => one === method));
  // Authentication still comes first, like everywhere.
  app.route({
    method: others,
    url,
    handler: (_request, reply) =>
      reply.code(405).header('allow', allowed.join(', ')).header('cache-control', 'no-store').send({ error: 'method_not_allowed' }),
  });
}

export function registerFriendsRoutes(app: FastifyInstance, deps: FriendsRouteDependencies): void {
  app.route({ method: 'POST', url: '/api/friend-requests', handler: (request, reply) => send(request, reply, deps) });
  app.route({ method: 'GET', url: '/api/friends', handler: (request, reply) => lists(request, reply, deps) });
  app.route({
    method: 'POST',
    url: `/api/friend-requests/${ID_PARAM}/accept`,
    handler: actionHandler(deps, acceptFriendRequest, 'friend request accept failed'),
  });
  app.route({
    method: 'POST',
    url: `/api/friend-requests/${ID_PARAM}/decline`,
    handler: actionHandler(deps, declineFriendRequest, 'friend request decline failed'),
  });
  app.route({
    method: 'DELETE',
    url: `/api/friend-requests/${ID_PARAM}`,
    handler: actionHandler(deps, cancelFriendRequest, 'friend request cancel failed'),
  });
  app.route({ method: 'DELETE', url: `/api/friends/${ID_PARAM}`, handler: actionHandler(deps, removeFriend, 'friend remove failed') });

  methodNotAllowed(app, '/api/friend-requests', ['POST']);
  methodNotAllowed(app, '/api/friends', ['GET']);
  methodNotAllowed(app, `/api/friend-requests/${ID_PARAM}/accept`, ['POST']);
  methodNotAllowed(app, `/api/friend-requests/${ID_PARAM}/decline`, ['POST']);
  methodNotAllowed(app, `/api/friend-requests/${ID_PARAM}`, ['DELETE']);
  methodNotAllowed(app, `/api/friends/${ID_PARAM}`, ['DELETE']);
}
