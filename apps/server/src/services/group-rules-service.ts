// Groups (I10 completion C; Afik 21.10.2026 §11.15, §11.16): the Group's enforcement — warning + mute, removal + block, unblock — and the
// invitations of a Private Group that wait for the Owner's or an Admin's approval. The database decides who may do each (RLS and the
// enforcement trigger); this layer chooses the statement and names the refusal. There is no plain removal of a member.

import {
  GROUP_MEMBERS_PAGE_SIZE,
  type GroupEnforcementBody,
  type GroupEnforcementRecord,
  type GroupPendingInvitation,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { readBanned, readGroupDetail, readMemberRole } from '../repositories/groups-repository.js';
import {
  decideAwaitingInvitation,
  insertEnforcement,
  readAwaitingInvitations,
  readEnforcements,
} from '../repositories/group-rules-repository.js';
import { asMember, fail, managingRole, notManaging, ok, refusalOf, type GroupFailure, type GroupResult } from './groups-service.js';

/** A refused enforcement: an equal or higher Role (42501, ERR-019) or, for a removal racing another, a user already blocked (23505). */
function enforcementRefusal(error: unknown): GroupFailure {
  return readDatabaseFault(error)?.code === '42501' ? fail('role_not_allowed') : refusalOf(error, fail('user_unavailable'), fail('blocked_from_group'));
}

/**
 * POST /api/groups/:id/enforcements (§11.16): `warn_mute` — a notice with the reason and read-only for 24 hours or 7 days (a member only);
 * `remove_block` — out of the Group and blocked, together. A Group Moderator or higher, against a lower Role (the database decides).
 */
export async function enforce(database: Database, identity: Identity, id: string, body: GroupEnforcementBody): Promise<GroupResult<null>> {
  const userId = body.userId.toLowerCase();
  if (userId === identity.userId.toLowerCase()) return fail('role_not_allowed');
  return asMember(
    database,
    identity,
    async (tx) => {
      const group = await readGroupDetail(tx, id);
      if (group === undefined) return fail('group_unavailable');
      const role = managingRole(group);
      if (role === null || role === 'member') return notManaging(group);
      if (body.kind === 'warn_mute' && (await readMemberRole(tx, id, userId)) === undefined) return fail('user_unavailable');
      if (body.kind === 'remove_block' && (await readBanned(tx, id, userId))) return ok(null); // already blocked: the same answer
      await insertEnforcement(tx, id, {
        userId,
        kind: body.kind,
        reason: body.reason,
        reasonText: body.reasonText ?? null,
        muteHours: body.muteHours ?? null,
      });
      return ok(null);
    },
    enforcementRefusal,
  );
}

/** DELETE /api/groups/:id/bans/:userId: unblock, as an enforcement record (a block made by a higher Role stays: ERR-019). */
export async function unblock(database: Database, identity: Identity, id: string, userId: string): Promise<GroupResult<null>> {
  return asMember(
    database,
    identity,
    async (tx) => {
      const group = await readGroupDetail(tx, id);
      if (group === undefined) return fail('group_unavailable');
      // a muted Group Moderator or Admin lifts no block until the mute ends (OP-070; the database refuses it either way)
      if (group.managementPaused) return notManaging(group);
      if (!(await readBanned(tx, id, userId))) return fail('user_unavailable');
      await insertEnforcement(tx, id, { userId, kind: 'unblock', reason: null, reasonText: null, muteHours: null });
      return ok(null);
    },
    enforcementRefusal,
  );
}

/** GET /api/groups/:id/enforcements: the Group's history (its Moderators and higher), newest first; never who acted. */
export async function listEnforcements(database: Database, identity: Identity, id: string): Promise<GroupResult<GroupEnforcementRecord[]>> {
  return asMember(database, identity, async (tx) => {
    const group = await readGroupDetail(tx, id);
    if (group === undefined) return fail('group_unavailable');
    if (group.myRole === null || group.myRole === 'member') return fail('not_allowed');
    return ok(await readEnforcements(tx, id, GROUP_MEMBERS_PAGE_SIZE));
  });
}

/**
 * GET /api/groups/:id/enforcements/mine (OP-070, §13): the records about the caller in this Group — a warning and mute (also after it
 * ended), a removal and block, its lifting — for any account, a member or one who was removed; never who acted. The policy lets each user
 * read only their own records; the statement asks for no more.
 */
export async function listMyEnforcements(database: Database, identity: Identity, id: string): Promise<GroupResult<GroupEnforcementRecord[]>> {
  return asMember(database, identity, async (tx) => {
    if ((await readGroupDetail(tx, id)) === undefined) return fail('group_unavailable');
    return ok(await readEnforcements(tx, id, GROUP_MEMBERS_PAGE_SIZE, true));
  });
}

/** GET /api/groups/:id/invitations: the invitations waiting for approval (the Owner and Admins), oldest first. */
export async function listAwaitingInvitations(database: Database, identity: Identity, id: string): Promise<GroupResult<GroupPendingInvitation[]>> {
  return asMember(database, identity, async (tx) => {
    const group = await readGroupDetail(tx, id);
    if (group === undefined) return fail('group_unavailable');
    if (managingRole(group) !== 'owner' && managingRole(group) !== 'admin') return notManaging(group);
    const rows = await readAwaitingInvitations(tx, id, GROUP_MEMBERS_PAGE_SIZE);
    return ok(
      rows.map((row) => ({
        id: row.id,
        inviter: { userId: row.inviterId, fullName: row.inviterName },
        invitee: { userId: row.inviteeId, fullName: row.inviteeName },
        createdAt: row.createdAt,
      })),
    );
  });
}

/** PUT /api/groups/:id/invitations/:invitationId { decision }: approve (the invitee is invited now) or reject (§11.15). */
export async function decideInvitation(
  database: Database,
  identity: Identity,
  id: string,
  invitationId: string,
  decision: 'approve' | 'reject',
): Promise<GroupResult<null>> {
  return asMember(
    database,
    identity,
    async (tx) => {
      const group = await readGroupDetail(tx, id);
      if (group === undefined) return fail('group_unavailable');
      if (managingRole(group) !== 'owner' && managingRole(group) !== 'admin') return notManaging(group);
      const changed = await decideAwaitingInvitation(tx, id, invitationId, decision === 'approve' ? 'pending' : 'rejected');
      // 0 rows: decided already (by another manager) or gone — the same answer as an invitation no longer valid
      return changed === 0 ? fail('invitation_unavailable') : ok(null);
    },
    // 42501: the inviter left or the invitee is already a member (the invitation is no longer valid), or the caller is no Owner or Admin
    (error) => (readDatabaseFault(error)?.code === '42501' ? fail('invitation_unavailable') : refusalOf(error)),
  );
}
