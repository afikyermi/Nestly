// Groups (I10 completion C; §11.15, §11.16): the Group's enforcement (warn+mute, remove+block, unblock) and the invitations that wait for
// approval. See groups.ts for the list of routes and refusals.

import {
  groupEnforcementBody,
  groupEnforcementsResponse,
  groupInvitationDecisionBody,
  groupInvitationDecisionPathParams,
  groupPendingInvitationsResponse,
} from '@nestly/shared';
import type { FastifyInstance } from 'fastify';
import * as rules from '../services/group-rules-service.js';
import { groupsHelpers, send, type GroupsRouteDependencies } from './groups-shared.js';

export function registerGroupRulesRoutes(app: FastifyInstance, deps: GroupsRouteDependencies): void {
  const { guarded, invalid, notFound, noBody, groupId, groupUser, noContent } = groupsHelpers(deps);

  app.route({
    method: 'POST',
    url: '/api/groups/:id/enforcements',
    handler: guarded('group enforcement failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      const body = groupEnforcementBody.safeParse(request.body);
      if (!body.success) return invalid(reply);
      return send(reply, await rules.enforce(database, identity, id, body.data), noContent(reply));
    }),
  });
  app.route({
    method: 'GET',
    url: '/api/groups/:id/enforcements',
    handler: guarded('group enforcements failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      return send(reply, await rules.listEnforcements(database, identity, id), (records) =>
        reply.code(200).send(groupEnforcementsResponse.parse({ records })),
      );
    }),
  });
  app.route({
    method: 'DELETE',
    url: '/api/groups/:id/bans/:userId',
    handler: guarded('group unblock failed', async (database, identity, request, reply) => {
      const path = groupUser(request);
      if (path === null) return notFound(reply);
      if (!noBody(request)) return invalid(reply);
      return send(reply, await rules.unblock(database, identity, path.id, path.userId), noContent(reply));
    }),
  });
  app.route({
    method: 'GET',
    url: '/api/groups/:id/invitations',
    handler: guarded('group awaiting invitations failed', async (database, identity, request, reply) => {
      const id = groupId(request);
      if (id === null) return notFound(reply);
      return send(reply, await rules.listAwaitingInvitations(database, identity, id), (invitations) =>
        reply.code(200).send(groupPendingInvitationsResponse.parse({ invitations })),
      );
    }),
  });
  app.route({
    method: 'PUT',
    url: '/api/groups/:id/invitations/:invitationId',
    handler: guarded('group invitation decision failed', async (database, identity, request, reply) => {
      const params = groupInvitationDecisionPathParams.safeParse(request.params);
      if (!params.success) return notFound(reply);
      const body = groupInvitationDecisionBody.safeParse(request.body);
      if (!body.success) return invalid(reply);
      const result = await rules.decideInvitation(database, identity, params.data.id.toLowerCase(), params.data.invitationId.toLowerCase(), body.data.decision);
      return send(reply, result, noContent(reply));
    }),
  });
}
