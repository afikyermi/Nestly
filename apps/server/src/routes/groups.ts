// Groups (I10; FR-GRP-001..004, FR-ALG-010). Signed in: the authentication hook has run before anything here. No route takes the caller's id;
// a path names a Group, a member or an invitation, and the database decides what the caller may read and do.
//   GET    /api/groups?scope=mine|discover&q=           → 200 { groups:[GroupSummary] }
//   POST   /api/groups { name, description?, rules?, privacy }   → 201 GroupDetail · 422 name_too_short|name_too_long|description_too_long|rules_too_long
//   GET    /api/groups/:id                              → 200 GroupDetail
//   PATCH  /api/groups/:id { name?, description?, rules?, privacy? } → 200 GroupDetail
//   DELETE /api/groups/:id                              → 204 (the Owner only)
//   PUT    /api/groups/:id/membership                   → 200 GroupDetail (Join a Public Group, or Request to Join a Private one)
//   DELETE /api/groups/:id/membership                   → 200 GroupDetail (leave, or cancel one's own request; never the Owner: 409)
//   GET    /api/groups/:id/posts[?cursor=&view=all|highlights] → 200 FeedPageResponse (the Group's discussion, pinned first; or its Highlights)
//   DELETE /api/groups/:id/posts/:postId                → 204 (the author or a Group Moderator+; 403 role_not_allowed: an equal or higher Role's post)
//   GET    /api/groups/:id/members                      → 200 { members }        PATCH /api/groups/:id/members/:userId { role } → 200 { members }
//   POST   /api/groups/:id/enforcements { userId, kind, reason, reasonText?, muteHours? } → 204 (warn+mute, remove+block; I10-C)
//   GET    /api/groups/:id/enforcements → 200 { records }   GET /api/groups/:id/invitations → 200 { invitations } (awaiting approval)
//   GET    /api/groups/:id/enforcements/mine → 200 { records } (the records about the caller, any account; OP-070)
//   PUT    /api/groups/:id/invitations/:invitationId { decision } → 204
//   GET    /api/groups/:id/requests                     → 200 { people }         PUT /api/groups/:id/requests/:userId { decision } → 204
//   GET    /api/groups/:id/bans                         → 200 { people }         DELETE /api/groups/:id/bans/:userId → 204
//   GET    /api/groups/:id/friends                      → 200 { friends }
//   POST   /api/groups/:id/invitations { userId }       → 200 { status }                   POST /api/groups/:id/recommendations { userId } → 204
//   PUT    /api/groups/:id/notifications { mode }       → 204                   PUT /api/groups/:id/pin { postId|null } → 200 GroupDetail
//   GET    /api/group-invitations                       → 200 { invitations }   PUT /api/group-invitations/:id { answer } → 200 { groupId }
//   Refusals: 400 invalid · 404 group_unavailable | user_unavailable · 403 not_allowed | role_not_allowed | blocked_from_group ·
//   409 owner_must_transfer | already_requested | already_member | invitation_unavailable · 403 muted · 422 not_a_friend · 403 account_unavailable | forbidden (staff, ERR-022) ·
//   401/503 session guard · 500. Logs carry a fixed line and the SQLSTATE, never a name, a text or an id (NFR-PRIV-001).


import { checkCreateGroup, checkUpdateGroup, groupPostPathParams, groupPostsQuery, groupsListQuery, groupsListResponse } from '@nestly/shared';
import type { FastifyInstance } from 'fastify';
import * as groups from '../services/groups-service.js';
import * as feed from '../services/groups-feed-service.js';
import { registerGroupPeopleRoutes } from './group-people.js';
import { registerGroupRulesRoutes } from './group-rules.js';
import { groupsHelpers, send, type GroupsRouteDependencies } from './groups-shared.js';

export type { GroupsRouteDependencies } from './groups-shared.js';

export function registerGroupsRoutes(app: FastifyInstance, deps: GroupsRouteDependencies): void {
  const { guarded, invalid, notFound, noBody, groupId, detailOk, noContent } = groupsHelpers(deps);

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
      const query = groupPostsQuery.safeParse(request.query ?? {});
      if (!query.success) return invalid(reply);
      const cursor = feed.parseGroupFeedCursor(query.data.cursor);
      if (cursor === 'invalid') return invalid(reply);
      return send(reply, await feed.readGroupFeed(database, identity, id, cursor, deps.storage, query.data.view), (page) => reply.code(200).send(page));
    }),
  });
  app.route({
    method: 'DELETE',
    url: '/api/groups/:id/posts/:postId',
    handler: guarded('group post remove failed', async (database, identity, request, reply) => {
      const params = groupPostPathParams.safeParse(request.params);
      if (!params.success) return notFound(reply);
      if (!noBody(request)) return invalid(reply);
      const result = await feed.removeGroupPost(database, identity, params.data.id.toLowerCase(), params.data.postId.toLowerCase());
      return send(reply, result, () => reply.code(204).send());
    }),
  });
  registerGroupPeopleRoutes(app, deps);
  registerGroupRulesRoutes(app, deps);
}
