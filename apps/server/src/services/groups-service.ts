// Groups (I10; FR-GRP-001..004, FR-ALG-010, BR-031..033, BR-041, BR-048; VAL-019..021, VAL-028, VAL-035; ERR-017..019, ERR-022, ERR-026).
// The caller is already authenticated; each call is one identity transaction. The database decides every permission (RLS and the group
// guard triggers): this layer refuses staff before the work (ERR-022, the same rule the policies hold), chooses the statement the caller's
// own relation calls for (Join or Request to Join), and names the outcome of a refusal by its SQLSTATE. A Group the caller cannot read, a
// deleted one and a missing one are the same answer: `group_unavailable`.

import {
  DEFAULT_GROUP_NOTIFICATION_MODE,
  GROUPS_PAGE_SIZE,
  type CreateGroupBody,
  type GroupDetail,
  type GroupSummary,
  type UpdateGroupBody,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { answerInvitation,
  cancelOwnRequest,
  deleteOwnMembership,
  insertGroup,
  insertJoinRequest,
  insertOwnMembership,
  readGroupDetail,
  readGroupPostExists,
  readGroupSummaries,
  updateGroup,
  type GroupSummaryRow,
} from '../repositories/groups-repository.js';
import { classifyMember, classifyReader, isRefusal, type MemberRefusal } from './membership.js';
import { openPrivateGroupForReview } from '../repositories/group-staff-views-repository.js';

export type GroupFailure =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'group_unavailable' }
  | { readonly kind: 'not_allowed' }
  | { readonly kind: 'owner_must_transfer' }
  | { readonly kind: 'role_not_allowed' }
  | { readonly kind: 'already_requested' }
  | { readonly kind: 'already_member' }
  | { readonly kind: 'blocked_from_group' }
  | { readonly kind: 'not_a_friend' }
  | { readonly kind: 'user_unavailable' }
  | MemberRefusal;

export type GroupResult<T> = { readonly kind: 'ok'; readonly value: T } | GroupFailure;

export const ok = <T>(value: T): GroupResult<T> => ({ kind: 'ok', value });
export const fail = (kind: Exclude<GroupFailure["kind"], "stopped" | "forbidden">): GroupFailure => ({ kind });

/** A database refusal by its SQLSTATE; anything else propagates (the route answers 500/503). */
export function refusalOf(error: unknown, foreignKey: GroupFailure = fail('user_unavailable'), unique: GroupFailure = fail('already_requested')): GroupFailure {
  switch (readDatabaseFault(error)?.code) {
    case '42501':
      return fail('not_allowed');
    case 'NS026':
      return fail('owner_must_transfer');
    case 'NS027':
      return fail('role_not_allowed');
    case 'NS028':
      return fail('blocked_from_group');
    case '23505':
      return unique;
    case '23503':
      return foreignKey;
    case '23514':
      return fail('invalid');
    default:
      throw error;
  }
}

/** One identity transaction for a member of the community (Regular or Professional); staff and stopped accounts are refused first. */
export async function asMember<T>(database: Database, identity: Identity, work: (tx: IdentityTx) => Promise<GroupResult<T>>, onFault?: (error: unknown) => GroupFailure): Promise<GroupResult<T>> {
  try {
    return await inIdentityTransaction(database, identity, async (tx) => {
      const member = await classifyMember(tx);
      if (isRefusal(member)) return member;
      return work(tx);
    });
  } catch (error) {
    if (onFault === undefined) throw error;
    return onFault(error);
  }
}

function stateOf(row: GroupSummaryRow): GroupSummary['state'] {
  if (row.myRole !== null) return 'member';
  if (row.blocked) return 'blocked';
  if (row.invitationId !== null) return 'invited';
  return row.requested ? 'requested' : 'none';
}

function summaryOf(row: GroupSummaryRow): GroupSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    privacy: row.privacy,
    // The member rows the caller may read are all of them for a Public Group or a member's own Group; a Private Group's outsider counts none.
    memberCount: row.privacy === 'public' || row.myRole !== null ? row.memberRows : null,
    myRole: row.myRole,
    state: stateOf(row),
  };
}

/** GET /api/groups: my Groups or discovery (optionally matching `q`). */
export async function listGroups(database: Database, identity: Identity, scope: 'mine' | 'discover', q: string | null): Promise<GroupResult<GroupSummary[]>> {
  return asReader(database, identity, async (tx) => ok((await readGroupSummaries(tx, scope, q, GROUPS_PAGE_SIZE)).map(summaryOf)));
}

/**
 * One identity transaction for a reader: a community member, or a staff account reviewing (I14 completion, §9.7). For staff, `groupId` names a
 * Group whose page is read: a Private one is opened for review, audited, when the staff member holds PRIVATE_GROUP_MODERATE (the database decides).
 */
export async function asReader<T>(database: Database, identity: Identity, work: (tx: IdentityTx) => Promise<GroupResult<T>>, groupId?: string): Promise<GroupResult<T>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const reader = await classifyReader(tx);
    if (isRefusal(reader)) return reader;
    if (reader.kind === 'staff' && groupId !== undefined) await openPrivateGroupForReview(tx, groupId);
    return work(tx);
  });
}

export async function detailIn(tx: IdentityTx, id: string): Promise<GroupDetail | undefined> {
  const row = await readGroupDetail(tx, id);
  if (row === undefined) return undefined;
  // A pin the caller cannot read (held, hidden, removed, or a Private Group's outsider) is not shown.
  const pinned = row.pinnedPostId !== null && (await readGroupPostExists(tx, id, row.pinnedPostId)) ? row.pinnedPostId : null;
  return {
    ...summaryOf(row),
    rules: row.rules,
    pinnedPostId: pinned,
    notificationMode: row.myRole === null ? null : (row.mode ?? DEFAULT_GROUP_NOTIFICATION_MODE),
    invitationId: row.invitationId,
    createdAt: row.createdAt,
  };
}

/** GET /api/groups/:id */
export async function readGroup(database: Database, identity: Identity, id: string): Promise<GroupResult<GroupDetail>> {
  return asReader(
    database,
    identity,
    async (tx) => {
      const detail = await detailIn(tx, id);
      return detail === undefined ? fail('group_unavailable') : ok(detail);
    },
    id,
  );
}

/** POST /api/groups (FR-GRP-004, AC-056): the creator becomes the Owner in the same statement. */
export async function createGroup(database: Database, identity: Identity, body: CreateGroupBody): Promise<GroupResult<GroupDetail>> {
  return asMember(
    database,
    identity,
    async (tx) => {
      const id = await insertGroup(tx, { name: body.name, description: body.description ?? null, rules: body.rules ?? null, privacy: body.privacy });
      const detail = await detailIn(tx, id);
      if (detail === undefined) throw new Error('a new group is not readable to its owner');
      return ok(detail);
    },
    (error) => refusalOf(error),
  );
}

/** PATCH /api/groups/:id: the Owner and Admins edit; privacy is the Owner's (NS027). */
export async function editGroup(database: Database, identity: Identity, id: string, body: UpdateGroupBody): Promise<GroupResult<GroupDetail>> {
  return asMember(
    database,
    identity,
    async (tx) => {
      const before = await readGroupDetail(tx, id);
      if (before === undefined) return fail('group_unavailable');
      const changed = await updateGroup(tx, id, body);
      if (changed === 0) return fail('not_allowed');
      const detail = await detailIn(tx, id);
      return detail === undefined ? fail('group_unavailable') : ok(detail);
    },
    (error) => refusalOf(error),
  );
}

/** DELETE /api/groups/:id: the Owner deletes the Group (NS027 for anyone else). */
export async function removeGroup(database: Database, identity: Identity, id: string): Promise<GroupResult<null>> {
  return asMember(
    database,
    identity,
    async (tx) => {
      if ((await readGroupDetail(tx, id)) === undefined) return fail('group_unavailable');
      return (await updateGroup(tx, id, { status: 'deleted' })) === 0 ? fail('not_allowed') : ok(null);
    },
    (error) => refusalOf(error),
  );
}

/** PUT /api/groups/:id/membership: Join a Public Group at once, or ask to join a Private one (BR-031, BR-032). */
export async function joinGroup(database: Database, identity: Identity, id: string): Promise<GroupResult<GroupDetail>> {
  return asMember(
    database,
    identity,
    async (tx) => {
      const group = await readGroupDetail(tx, id);
      if (group === undefined) return fail('group_unavailable');
      if (group.myRole !== null) return fail('already_member');
      if (group.blocked) return fail('blocked_from_group');
      // an invitation waiting for the caller is accepted by Join (it admits to a Private Group too)
      if (group.invitationId !== null) await answerInvitation(tx, group.invitationId, 'accepted');
      else if (group.privacy === 'public') await insertOwnMembership(tx, id);
      else if (!group.requested) await insertJoinRequest(tx, id);
      const detail = await detailIn(tx, id);
      return detail === undefined ? fail('group_unavailable') : ok(detail);
    },
    (error) => refusalOf(error, fail('group_unavailable'), fail('already_requested')),
  );
}

/** DELETE /api/groups/:id/membership: leave (never the Owner: ERR-026), or cancel one's own pending request. */
export async function leaveGroup(database: Database, identity: Identity, id: string): Promise<GroupResult<GroupDetail>> {
  return asMember(
    database,
    identity,
    async (tx) => {
      const group = await readGroupDetail(tx, id);
      if (group === undefined) return fail('group_unavailable');
      if (group.myRole === 'owner') return fail('owner_must_transfer');
      if (group.myRole !== null) await deleteOwnMembership(tx, id);
      else await cancelOwnRequest(tx, id);
      const detail = await detailIn(tx, id);
      return detail === undefined ? fail('group_unavailable') : ok(detail);
    },
    (error) => refusalOf(error),
  );
}

/** GET /api/groups/:id/members: fellow members only (a non-member sees the count on the Group page). */
