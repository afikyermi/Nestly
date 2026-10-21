// Groups (I10; FR-GRP-001..004, FR-ALG-010). Signed in: the authentication hook has run before anything here. No route takes the caller's id;
// a path names a Group, a member or an invitation, and the database decides what the caller may read and do.
//   GET    /api/groups?scope=mine|discover&q=           → 200 { groups:[GroupSummary] }
//   POST   /api/groups { name, description?, rules?, privacy }   → 201 GroupDetail · 422 name_too_short|name_too_long|description_too_long|rules_too_long
//   GET    /api/groups/:id                              → 200 GroupDetail
//   PATCH  /api/groups/:id { name?, description?, rules?, privacy? } → 200 GroupDetail
//   DELETE /api/groups/:id                              → 204 (the Owner only)
//   PUT    /api/groups/:id/membership                   → 200 GroupDetail (Join a Public Group, or Request to Join a Private one)
//   DELETE /api/groups/:id/membership                   → 200 GroupDetail (leave, or cancel one's own request; never the Owner: 409)
//   GET    /api/groups/:id/posts[?cursor=]               → 200 FeedPageResponse (the Group's discussion, pinned first)
//   GET    /api/groups/:id/members                      → 200 { members }        PATCH /api/groups/:id/members/:userId { role } → 200 { members }
//   DELETE /api/groups/:id/members/:userId[?block=true] → 204
//   GET    /api/groups/:id/requests                     → 200 { people }         PUT /api/groups/:id/requests/:userId { decision } → 204
//   GET    /api/groups/:id/bans                         → 200 { people }         DELETE /api/groups/:id/bans/:userId → 204
//   GET    /api/groups/:id/friends                      → 200 { friends }
//   POST   /api/groups/:id/invitations { userId }       → 204                   POST /api/groups/:id/recommendations { userId } → 204
//   PUT    /api/groups/:id/notifications { mode }       → 204                   PUT /api/groups/:id/pin { postId|null } → 200 GroupDetail
//   GET    /api/group-invitations                       → 200 { invitations }   PUT /api/group-invitations/:id { answer } → 200 { groupId }
//   Refusals: 400 invalid · 404 group_unavailable | user_unavailable · 403 not_allowed | role_not_allowed | blocked_from_group ·
//   409 owner_must_transfer | already_requested | already_member · 422 not_a_friend · 403 account_unavailable | forbidden (staff, ERR-022) ·
//   401/503 session guard · 500. Logs carry a fixed line and the SQLSTATE, never a name, a text or an id (NFR-PRIV-001).

import {
  checkCreateGroup,
  checkUpdateGroup,
  groupDetail,
  groupFriendsResponse,
  groupInvitationAnswerBody,
  groupInvitationPathParams,
  groupInvitationsResponse,
  groupInviteBody,
  groupMembersResponse,
  groupModeBody,
  groupPathParams,
  groupPeopleResponse,
  groupPinBody,
  groupRecommendBody,
  groupRemoveQuery,
  groupRequestDecisionBody,
  groupRoleBody,
  groupsListQuery,
  groupsListResponse,
  groupUserPathParams,
} from '@nestly/shared';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import type { Identity } from '../lib/token-verifier.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import type { MediaStorage } from '../media/storage-admin.js';
import * as groups from '../services/groups-service.js';
import type { GroupFailure, GroupResult } from '../services/groups-service.js';

export interface GroupsRouteDependencies {
  readonly database: Database | undefined;
  readonly storage?: MediaStorage;
}

const STATUS: Record<GroupFailure['kind'], number> = {
  invalid: 400,
  group_unavailable: 404,
  user_unavailable: 404,
  not_allowed: 403,
  role_not_allowed: 403,
  blocked_from_group: 403,
  owner_must_transfer: 409,
  already_requested: 409,
  already_member: 409,
  not_a_friend: 422,
  stopped: 403,
  forbidden: 403,
};

function replyFailure(reply: FastifyReply, failure: GroupFailure): FastifyReply {
  const error = failure.kind === 'stopped' ? 'account_unavailable' : failure.kind;
  return reply.code(STATUS[failure.kind]).send({ error });
}

function send<T>(reply: FastifyReply, result: GroupResult<T>, onOk: (value: T) => FastifyReply): FastifyReply {
  return result.kind === 'ok' ? onOk(result.value) : replyFailure(reply, result);
}

type Work = (database: Database, identity: Identity, request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>;

export function registerGroupsRoutes(app: FastifyInstance, deps: GroupsRouteDependencies): void {
  const guarded = (line: string, work: Work) => async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('cache-control', 'private, no-store');
    const { identity } = request;
    if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    try {
      return await work(deps.database, identity, request, reply);
    } catch (error) {
      const refused = replySessionRefused(reply, error);
      if (refused !== undefined) return refused;
      request.log.error({ sqlstate: readDatabaseFault(error)?.code }, line);
      if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
      return reply.code(500).send({ error: 'server_error' });
    }
  };
  const invalid = (reply: FastifyReply) => reply.code(400).send({ error: 'invalid' });
  const notFound = (reply: FastifyReply) => reply.code(404).send({ error: 'group_unavailable' });
  const noBody = (request: FastifyRequest) => request.body === undefined || request.body === null;
  const groupId = (request: FastifyRequest) => {
    const p = groupPathParams.safeParse(request.params);
    return p.success ? p.data.id.toLowerCase() : null;
  };
  const groupUser = (request: FastifyRequest) => {
    const p = groupUserPathParams.safeParse(request.params);
    return p.success ? { id: p.data.id.toLowerCase(), userId: p.data.userId.toLowerCase() } : null;
  };
  const detailOk = (reply: FastifyReply, code = 200) => (value: z.infer<typeof groupDetail>) => reply.code(code).send(groupDetail.parse(value));
  const noContent = (reply: FastifyReply) => () => reply.code(204).send();

  app.route({
    method: 'GET',
    url: '/api/groups',
    handler: guarded('groups list failed', async (database, identity, request, reply) => {
      const query = groupsListQuery.safeParse(request.query ?? {});
      if (!query.success) return invalid(reply);
      const q = query.data.q?.replace(/\s+/g, ' ').trim() ?? '';
      const result = await groups.listGroups(database, identity, query.data.scope, q === '' ? null : q);
      return send(reply, result, (list) => reply.code(200).send(groupsListResponse.parse({ groups: list })));
    }),
  });
  app.route({
    method: 'POST',
    url: '/api/groups',
    handler: guarded('group create failed', async (database, identity, request, reply) => {
      const checked = checkCreateGroup(request.body);
      if (!checked.ok) return checked.reason === 'invalid' ? invalid(reply) : reply.code(422).send({ error: checked.reason });
      return send(reply, await groups.createGroup(database, identity, checked.value), detailOk(reply, 201));
    }),
  });
  app.route({
    method: 'GET',
    url: '/api/groups/:id',
    handler: guarded('group read failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      return send(reply, await groups.readGroup(database, identity, id), detailOk(reply));
    }),
  });
  app.route({
    method: 'PATCH',
    url: '/api/groups/:id',
    handler: guarded('group edit failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      const checked = checkUpdateGroup(request.body);
      if (!checked.ok) return checked.reason === 'invalid' ? invalid(reply) : reply.code(422).send({ error: checked.reason });
      return send(reply, await groups.editGroup(database, identity, id, checked.value), detailOk(reply));
    }),
  });
  app.route({
    method: 'DELETE',
    url: '/api/groups/:id',
    handler: guarded('group delete failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      if (!noBody(request)) return invalid(reply);
      return send(reply, await groups.removeGroup(database, identity, id), noContent(reply));
    }),
  });
  for (const method of ['PUT', 'DELETE'] as const) {
    app.route({
      method,
      url: '/api/groups/:id/membership',
      handler: guarded('group membership failed', async (database, identity, request, reply) => {
        const id = groupId(request);
        if (id === null) return notFound(reply);
        if (!noBody(request)) return invalid(reply);
        const result = method === 'PUT' ? await groups.joinGroup(database, identity, id) : await groups.leaveGroup(database, identity, id);
        return send(reply, result, detailOk(reply));
      }),
    });
  }
  app.route({
    method: 'GET',
    url: '/api/groups/:id/posts',
    handler: guarded('group posts failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      const query = z.strictObject({ cursor: z.string().max(200).optional() }).safeParse(request.query ?? {});
      if (!query.success) return invalid(reply);
      const cursor = groups.parseGroupFeedCursor(query.data.cursor);
      if (cursor === 'invalid') return invalid(reply);
      return send(reply, await groups.readGroupFeed(database, identity, id, cursor, deps.storage), (page) => reply.code(200).send(page));
    }),
  });
  app.route({
    method: 'GET',
    url: '/api/groups/:id/members',
    handler: guarded('group members failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      return send(reply, await groups.listMembers(database, identity, id), (members) => reply.code(200).send(groupMembersResponse.parse({ members })));
    }),
  });
  app.route({
    method: 'PATCH',
    url: '/api/groups/:id/members/:userId',
    handler: guarded('group role failed', async (database, identity, request, reply) => {
      const path = groupUser(request);
      if (path === null) return notFound(reply);
      const body = groupRoleBody.safeParse(request.body);
      if (!body.success) return invalid(reply);
      const result = await groups.changeRole(database, identity, path.id, path.userId, body.data.role);
      return send(reply, result, (members) => reply.code(200).send(groupMembersResponse.parse({ members })));
    }),
  });
  app.route({
    method: 'DELETE',
    url: '/api/groups/:id/members/:userId',
    handler: guarded('group remove failed', async (database, identity, request, reply) => {
      const path = groupUser(request);
      if (path === null) return notFound(reply);
      const query = groupRemoveQuery.safeParse(request.query ?? {});
      if (!query.success || !noBody(request)) return invalid(reply);
      return send(reply, await groups.removeMember(database, identity, path.id, path.userId, query.data.block === 'true'), noContent(reply));
    }),
  });
  app.route({
    method: 'GET',
    url: '/api/groups/:id/requests',
    handler: guarded('group requests failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      return send(reply, await groups.listRequests(database, identity, id), (people) => reply.code(200).send(groupPeopleResponse.parse({ people })));
    }),
  });
  app.route({
    method: 'PUT',
    url: '/api/groups/:id/requests/:userId',
    handler: guarded('group decide failed', async (database, identity, request, reply) => {
      const path = groupUser(request);
      if (path === null) return notFound(reply);
      const body = groupRequestDecisionBody.safeParse(request.body);
      if (!body.success) return invalid(reply);
      return send(reply, await groups.decide(database, identity, path.id, path.userId, body.data.decision), noContent(reply));
    }),
  });
  app.route({
    method: 'GET',
    url: '/api/groups/:id/bans',
    handler: guarded('group bans failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      return send(reply, await groups.listBans(database, identity, id), (people) => reply.code(200).send(groupPeopleResponse.parse({ people })));
    }),
  });
  app.route({
    method: 'DELETE',
    url: '/api/groups/:id/bans/:userId',
    handler: guarded('group unblock failed', async (database, identity, request, reply) => {
      const path = groupUser(request);
      if (path === null) return notFound(reply);
      if (!noBody(request)) return invalid(reply);
      return send(reply, await groups.unblock(database, identity, path.id, path.userId), noContent(reply));
    }),
  });
  app.route({
    method: 'GET',
    url: '/api/groups/:id/friends',
    handler: guarded('group friends failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      return send(reply, await groups.listFriendsForGroup(database, identity, id), (friends) => reply.code(200).send(groupFriendsResponse.parse({ friends })));
    }),
  });
  app.route({
    method: 'POST',
    url: '/api/groups/:id/invitations',
    handler: guarded('group invite failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      const body = groupInviteBody.safeParse(request.body);
      if (!body.success) return invalid(reply);
      return send(reply, await groups.invite(database, identity, id, body.data.userId.toLowerCase()), noContent(reply));
    }),
  });
  app.route({
    method: 'POST',
    url: '/api/groups/:id/recommendations',
    handler: guarded('group recommend failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      const body = groupRecommendBody.safeParse(request.body);
      if (!body.success) return invalid(reply);
      return send(reply, await groups.recommend(database, identity, id, body.data.userId.toLowerCase()), noContent(reply));
    }),
  });
  app.route({
    method: 'PUT',
    url: '/api/groups/:id/notifications',
    handler: guarded('group mode failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      const body = groupModeBody.safeParse(request.body);
      if (!body.success) return invalid(reply);
      return send(reply, await groups.setMode(database, identity, id, body.data.mode), noContent(reply));
    }),
  });
  app.route({
    method: 'PUT',
    url: '/api/groups/:id/pin',
    handler: guarded('group pin failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      const body = groupPinBody.safeParse(request.body);
      if (!body.success) return invalid(reply);
      return send(reply, await groups.pin(database, identity, id, body.data.postId?.toLowerCase() ?? null), detailOk(reply));
    }),
  });
  app.route({
    method: 'GET',
    url: '/api/group-invitations',
    handler: guarded('group invitations failed', async (database, identity, _request, reply) =>
      send(reply, await groups.listOwnInvitations(database, identity), (invitations) => reply.code(200).send(groupInvitationsResponse.parse({ invitations }))),
    ),
  });
  app.route({
    method: 'PUT',
    url: '/api/group-invitations/:id',
    handler: guarded('group invitation answer failed', async (database, identity, request, reply) => {
      const params = groupInvitationPathParams.safeParse(request.params);
      if (!params.success) return notFound(reply);
      const body = groupInvitationAnswerBody.safeParse(request.body);
      if (!body.success) return invalid(reply);
      return send(reply, await groups.answer(database, identity, params.data.id.toLowerCase(), body.data.answer === 'accept'), (value) => reply.code(200).send(value));
    }),
  });
}
