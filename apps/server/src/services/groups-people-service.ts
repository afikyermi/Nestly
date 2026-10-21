// Groups (I10): members, Roles, requests, blocks, invitations, recommendations, the notification mode and the pin (FR-GRP-002/003, FR-ALG-010,
// AC-038, AC-050, VAL-021, VAL-035). The same rules as groups-service.ts: the database decides, this layer names the outcome.

import {
  GROUP_MEMBERS_PAGE_SIZE,
  GROUPS_PAGE_SIZE,
  type GroupDetail,
  type GroupFriend,
  type GroupInvitation,
  type GroupMember,
  type GroupNotificationMode,
  type GroupPerson,
  type GroupRole,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { readListedRows, readVisibleNames } from '../repositories/friends-repository.js';
import {
  answerInvitation,
  decideRequest,
  deleteBan,
  deleteMember,
  insertBan,
  readBanned,
  insertInvitation,
  insertRecommendation,
  readBans,
  readFriendFlags,
  readGroupDetail,
  readMemberRole,
  readMembers,
  readOwnInvitations,
  readPendingRequests,
  stepDownOwner,
  updateGroup,
  updateMemberRole,
  upsertMode,
} from '../repositories/groups-repository.js';


import { asMember, detailIn, fail, ok, refusalOf, type GroupResult } from './groups-service.js';

export async function listMembers(database: Database, identity: Identity, id: string): Promise<GroupResult<GroupMember[]>> {
  return asMember(database, identity, async (tx) => {
    const group = await readGroupDetail(tx, id);
    if (group === undefined) return fail('group_unavailable');
    if (group.myRole === null) return fail('not_allowed');
    return ok(await readMembers(tx, id, GROUP_MEMBERS_PAGE_SIZE));
  });
}

/**
 * PATCH /api/groups/:id/members/:userId { role }: the hierarchy is the database's (AC-038). `owner` is a transfer: the target becomes Owner and
 * the caller steps down to Admin, in one transaction (one Owner at commit).
 */
export async function changeRole(database: Database, identity: Identity, id: string, userId: string, role: GroupRole): Promise<GroupResult<GroupMember[]>> {
  if (userId === identity.userId.toLowerCase()) return fail('role_not_allowed');
  return asMember(
    database,
    identity,
    async (tx) => {
      const group = await readGroupDetail(tx, id);
      if (group === undefined) return fail('group_unavailable');
      if ((await readMemberRole(tx, id, userId)) === undefined) return fail('user_unavailable');
      if ((await updateMemberRole(tx, id, userId, role)) === 0) return fail('role_not_allowed');
      if (role === 'owner' && (await stepDownOwner(tx, id)) === 0) return fail('role_not_allowed');
      return ok(await readMembers(tx, id, GROUP_MEMBERS_PAGE_SIZE));
    },
    (error) => (readDatabaseFault(error)?.code === '42501' ? fail('role_not_allowed') : refusalOf(error)),
  );
}

/** DELETE /api/groups/:id/members/:userId[?block=true]: remove a lower Role (ERR-019), and with `block` keep them out. */
export async function removeMember(database: Database, identity: Identity, id: string, userId: string, block: boolean): Promise<GroupResult<null>> {
  if (userId === identity.userId.toLowerCase()) return fail('role_not_allowed');
  return asMember(
    database,
    identity,
    async (tx) => {
      if ((await readGroupDetail(tx, id)) === undefined) return fail('group_unavailable');
      if (block) {
        if (await readBanned(tx, id, userId)) return ok(null); // already blocked: the same answer
        await insertBan(tx, id, userId);
        return ok(null);
      }
      if ((await readMemberRole(tx, id, userId)) === undefined) return fail('user_unavailable');
      return (await deleteMember(tx, id, userId)) === 0 ? fail('role_not_allowed') : ok(null);
    },
    (error) => (readDatabaseFault(error)?.code === '42501' ? fail('role_not_allowed') : refusalOf(error, fail('user_unavailable'), fail('already_member'))),
  );
}

/** GET /api/groups/:id/requests: pending Join Requests (the Owner and Admins; anyone else reads none). */
export async function listRequests(database: Database, identity: Identity, id: string): Promise<GroupResult<GroupPerson[]>> {
  return asMember(database, identity, async (tx) => {
    const group = await readGroupDetail(tx, id);
    if (group === undefined) return fail('group_unavailable');
    if (group.myRole !== 'owner' && group.myRole !== 'admin') return fail('not_allowed');
    return ok(await readPendingRequests(tx, id, GROUP_MEMBERS_PAGE_SIZE));
  });
}

/** PUT /api/groups/:id/requests/:userId { decision }: approve (the requester becomes a member) or reject. */
export async function decide(database: Database, identity: Identity, id: string, userId: string, decision: 'approve' | 'reject'): Promise<GroupResult<null>> {
  return asMember(
    database,
    identity,
    async (tx) => {
      if ((await readGroupDetail(tx, id)) === undefined) return fail('group_unavailable');
      return (await decideRequest(tx, id, userId, decision === 'approve' ? 'approved' : 'rejected')) === 0 ? fail('user_unavailable') : ok(null);
    },
    (error) => refusalOf(error),
  );
}

/** GET /api/groups/:id/bans and DELETE /api/groups/:id/bans/:userId (Moderators and higher). */
export async function listBans(database: Database, identity: Identity, id: string): Promise<GroupResult<GroupPerson[]>> {
  return asMember(database, identity, async (tx) => {
    const group = await readGroupDetail(tx, id);
    if (group === undefined) return fail('group_unavailable');
    if (group.myRole === null || group.myRole === 'member') return fail('not_allowed');
    return ok(await readBans(tx, id, GROUP_MEMBERS_PAGE_SIZE));
  });
}

export async function unblock(database: Database, identity: Identity, id: string, userId: string): Promise<GroupResult<null>> {
  return asMember(database, identity, async (tx) => {
    if ((await readGroupDetail(tx, id)) === undefined) return fail('group_unavailable');
    if ((await deleteBan(tx, id, userId)) > 0) return ok(null);
    // still blocked (a higher Role's block: ERR-019), or no longer blocked at all
    return (await readBanned(tx, id, userId)) ? fail('role_not_allowed') : fail('user_unavailable');
  });
}

/** GET /api/groups/:id/friends: the caller's Friends with whether each is a member, invited, or already recommended by the caller. */
export async function listFriendsForGroup(database: Database, identity: Identity, id: string): Promise<GroupResult<GroupFriend[]>> {
  return asMember(database, identity, async (tx) => {
    if ((await readGroupDetail(tx, id)) === undefined) return fail('group_unavailable');
    const me = identity.userId.toLowerCase();
    const friendIds = (await readListedRows(tx)).filter((row) => row.status === 'accepted').map((row) => (row.requesterId === me ? row.addresseeId : row.requesterId));
    const names = new Map((await readVisibleNames(tx, friendIds)).map((n) => [n.userId, n.fullName]));
    const flags = new Map((await readFriendFlags(tx, id, friendIds)).map((f) => [f.userId, f]));
    const friends = friendIds.flatMap((userId): GroupFriend[] => {
      const fullName = names.get(userId);
      const flag = flags.get(userId);
      return fullName === undefined || flag === undefined ? [] : [{ userId, fullName, isMember: flag.isMember, isInvited: flag.isInvited, isRecommended: flag.isRecommended }];
    });
    return ok(friends.sort((a, b) => a.fullName.localeCompare(b.fullName, 'he') || a.userId.localeCompare(b.userId)));
  });
}

/** POST /api/groups/:id/invitations { userId }: the Owner or an Admin invites an active Friend. */
export async function invite(database: Database, identity: Identity, id: string, userId: string): Promise<GroupResult<null>> {
  return asMember(
    database,
    identity,
    async (tx) => {
      const group = await readGroupDetail(tx, id);
      if (group === undefined) return fail('group_unavailable');
      if (group.myRole !== 'owner' && group.myRole !== 'admin') return fail('not_allowed');
      if ((await readMemberRole(tx, id, userId)) !== undefined) return fail('already_member');
      if (await readBanned(tx, id, userId)) return fail('blocked_from_group');
      await insertInvitation(tx, id, userId);
      return ok(null);
    },
    (error) => (readDatabaseFault(error)?.code === '42501' ? fail('not_a_friend') : refusalOf(error, fail('user_unavailable'), fail('already_requested'))),
  );
}

/** POST /api/groups/:id/recommendations { userId } (AC-050): a Regular user recommends the Group to an active Friend. */
export async function recommend(database: Database, identity: Identity, id: string, userId: string): Promise<GroupResult<null>> {
  return asMember(
    database,
    identity,
    async (tx) => {
      if ((await readGroupDetail(tx, id)) === undefined) return fail('group_unavailable');
      await insertRecommendation(tx, id, userId);
      return ok(null);
    },
    (error) => (readDatabaseFault(error)?.code === '42501' ? fail('not_a_friend') : refusalOf(error)),
  );
}

/** GET /api/group-invitations: the caller's pending invitations. */
export async function listOwnInvitations(database: Database, identity: Identity): Promise<GroupResult<GroupInvitation[]>> {
  return asMember(database, identity, async (tx) =>
    ok(
      (await readOwnInvitations(tx, GROUPS_PAGE_SIZE)).map((row) => ({
        id: row.id,
        group: { id: row.groupId, name: row.groupName, privacy: row.privacy },
        inviterName: row.inviterName,
        createdAt: row.createdAt,
      })),
    ),
  );
}

/** PUT /api/group-invitations/:id { answer }: accept (become a member) or decline. */
export async function answer(database: Database, identity: Identity, invitationId: string, accept: boolean): Promise<GroupResult<{ groupId: string }>> {
  return asMember(
    database,
    identity,
    async (tx) => {
      const groupId = await answerInvitation(tx, invitationId, accept ? 'accepted' : 'declined');
      return groupId === undefined ? fail('group_unavailable') : ok({ groupId });
    },
    (error) => refusalOf(error, fail('group_unavailable'), fail('already_member')),
  );
}

/** PUT /api/groups/:id/notifications { mode } (VAL-035): a member's own mode. */
export async function setMode(database: Database, identity: Identity, id: string, mode: GroupNotificationMode): Promise<GroupResult<null>> {
  return asMember(
    database,
    identity,
    async (tx) => {
      const group = await readGroupDetail(tx, id);
      if (group === undefined) return fail('group_unavailable');
      if (group.myRole === null) return fail('not_allowed');
      await upsertMode(tx, id, mode);
      return ok(null);
    },
    (error) => refusalOf(error, fail('not_allowed')),
  );
}

/** PUT /api/groups/:id/pin { postId|null }: the Owner or an Admin pins a post of the Group, or unpins. */
export async function pin(database: Database, identity: Identity, id: string, postId: string | null): Promise<GroupResult<GroupDetail>> {
  return asMember(
    database,
    identity,
    async (tx) => {
      if ((await readGroupDetail(tx, id)) === undefined) return fail('group_unavailable');
      if ((await updateGroup(tx, id, { pinnedPostId: postId })) === 0) return fail('not_allowed');
      const detail = await detailIn(tx, id);
      return detail === undefined ? fail('group_unavailable') : ok(detail);
    },
    (error) => refusalOf(error, fail('not_allowed')),
  );
}

