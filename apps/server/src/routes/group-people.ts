// Groups (I10): members, Roles, requests, blocks, Friends to invite or recommend, invitations, the notification mode and the pin. See groups.ts for the list.


import {
  groupFriendsResponse,
  groupInvitationAnswerBody,
  groupInvitationPathParams,
  groupInvitationsResponse,
  groupInviteBody,
  groupMembersResponse,
  groupModeBody,
  groupPeopleResponse,
  groupPinBody,
  groupInviteResponse,
  groupRecommendBody,
  groupRequestDecisionBody,
  groupRoleBody,
} from '@nestly/shared';
import type { FastifyInstance } from 'fastify';
import * as people from '../services/groups-people-service.js';
import { groupsHelpers, send, type GroupsRouteDependencies } from './groups-shared.js';

export function registerGroupPeopleRoutes(app: FastifyInstance, deps: GroupsRouteDependencies): void {
  const { guarded, invalid, notFound, groupId, groupUser, detailOk, noContent } = groupsHelpers(deps);

  app.route({
    method: 'GET',
    url: '/api/groups/:id/members',
    handler: guarded('group members failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      return send(reply, await people.listMembers(database, identity, id), (members) => reply.code(200).send(groupMembersResponse.parse({ members })));
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
      const result = await people.changeRole(database, identity, path.id, path.userId, body.data.role);
      return send(reply, result, (members) => reply.code(200).send(groupMembersResponse.parse({ members })));
    }),
  });
  app.route({
    method: 'GET',
    url: '/api/groups/:id/requests',
    handler: guarded('group requests failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      return send(reply, await people.listRequests(database, identity, id), (people) => reply.code(200).send(groupPeopleResponse.parse({ people })));
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
      return send(reply, await people.decide(database, identity, path.id, path.userId, body.data.decision), noContent(reply));
    }),
  });
  app.route({
    method: 'GET',
    url: '/api/groups/:id/bans',
    handler: guarded('group bans failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      return send(reply, await people.listBans(database, identity, id), (people) => reply.code(200).send(groupPeopleResponse.parse({ people })));
    }),
  });
  app.route({
    method: 'GET',
    url: '/api/groups/:id/friends',
    handler: guarded('group friends failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      return send(reply, await people.listFriendsForGroup(database, identity, id), (friends) => reply.code(200).send(groupFriendsResponse.parse({ friends })));
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
      return send(reply, await people.invite(database, identity, id, body.data.userId.toLowerCase()), (status) =>
        reply.code(200).send(groupInviteResponse.parse({ status })),
      );
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
      return send(reply, await people.recommend(database, identity, id, body.data.userId.toLowerCase()), noContent(reply));
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
      return send(reply, await people.setMode(database, identity, id, body.data.mode), noContent(reply));
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
      return send(reply, await people.pin(database, identity, id, body.data.postId?.toLowerCase() ?? null), detailOk(reply));
    }),
  });
  app.route({
    method: 'GET',
    url: '/api/group-invitations',
    handler: guarded('group invitations failed', async (database, identity, _request, reply) =>
      send(reply, await people.listOwnInvitations(database, identity), (invitations) => reply.code(200).send(groupInvitationsResponse.parse({ invitations }))),
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
      return send(reply, await people.answer(database, identity, params.data.id.toLowerCase(), body.data.answer === 'accept'), (value) => reply.code(200).send(value));
    }),
  });
}
