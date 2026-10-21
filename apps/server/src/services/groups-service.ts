// Groups (I10; FR-GRP-001..004, FR-ALG-010, BR-031..033, BR-041, BR-048; VAL-019..021, VAL-028, VAL-035; ERR-017..019, ERR-022, ERR-026).
// The caller is already authenticated; each call is one identity transaction. The database decides every permission (RLS and the group
// guard triggers): this layer refuses staff before the work (ERR-022, the same rule the policies hold), chooses the statement the caller's
// own relation calls for (Join or Request to Join), and names the outcome of a refusal by its SQLSTATE. A Group the caller cannot read, a
// deleted one and a missing one are the same answer: `group_unavailable`.

import {
  DEFAULT_GROUP_NOTIFICATION_MODE,
  GROUP_FEED_PAGE_SIZE,
  GROUP_MEMBERS_PAGE_SIZE,
  GROUPS_PAGE_SIZE,
  feedPageResponse,
  type CreateGroupBody,
  type FeedPageResponse,
  type FeedUnit,
  type GroupDetail,
  type GroupFriend,
  type GroupInvitation,
  type GroupMember,
  type GroupNotificationMode,
  type GroupPerson,
  type GroupRole,
  type GroupSummary,
  type UpdateGroupBody,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { readDisplayPosts } from '../repositories/feed-repository.js';
import { readListedRows, readVisibleNames } from '../repositories/friends-repository.js';
import {
  answerInvitation,
  cancelOwnRequest,
  decideRequest,
  deleteBan,
  deleteMember,
  deleteOwnMembership,
  insertBan,
  insertGroup,
  insertInvitation,
  insertJoinRequest,
  insertOwnMembership,
  insertRecommendation,
  readBans,
  readFriendFlags,
  readGroupDetail,
  readGroupPostExists,
  readGroupPostIds,
  readGroupSummaries,
  readMemberRole,
  readMembers,
  readOwnInvitations,
  readPendingRequests,
  stepDownOwner,
  updateGroup,
  updateMemberRole,
  upsertMode,
  type GroupSummaryRow,
} from '../repositories/groups-repository.js';
import { readCommentCounts, readLikeCounts, readLikedTargetIds } from '../repositories/likes-repository.js';
import type { MediaStorage } from '../media/storage-admin.js';
import type { PostImageRow } from '../repositories/media-repository.js';
import { unitOf } from './feed-service.js';
import { classifyMember, isRefusal, type MemberRefusal } from './membership.js';
import { imagesByPost, readPostImageRows } from './posts-service.js';

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

const ok = <T>(value: T): GroupResult<T> => ({ kind: 'ok', value });
const fail = (kind: Exclude<GroupFailure['kind'], 'stopped' | 'forbidden'>): GroupFailure => ({ kind }) as GroupFailure;

/** A database refusal by its SQLSTATE; anything else propagates (the route answers 500/503). */
function refusalOf(error: unknown, foreignKey: GroupFailure = fail('user_unavailable'), unique: GroupFailure = fail('already_requested')): GroupFailure {
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
async function asMember<T>(database: Database, identity: Identity, work: (tx: IdentityTx) => Promise<GroupResult<T>>, onFault?: (error: unknown) => GroupFailure): Promise<GroupResult<T>> {
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
  return asMember(database, identity, async (tx) => ok((await readGroupSummaries(tx, scope, q, GROUPS_PAGE_SIZE)).map(summaryOf)));
}

async function detailIn(tx: IdentityTx, id: string): Promise<GroupDetail | undefined> {
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
  return asMember(database, identity, async (tx) => {
    const detail = await detailIn(tx, id);
    return detail === undefined ? fail('group_unavailable') : ok(detail);
  });
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
      if (group.privacy === 'public') await insertOwnMembership(tx, id);
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
    return (await deleteBan(tx, id, userId)) === 0 ? fail('user_unavailable') : ok(null);
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

// ---- the Group's discussion ----------------------------------------------------------------------------------------------------

/** The discussion's cursor: the last post's time (microseconds, UTC) and id. Opaque to the web app. */
const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export function parseGroupFeedCursor(raw: unknown): { at: string; id: string } | null | 'invalid' {
  if (raw === undefined) return null;
  if (typeof raw !== 'string') return 'invalid';
  const m = CURSOR.exec(raw);
  return m === null || m[1] === undefined || m[2] === undefined ? 'invalid' : { at: m[1], id: m[2] };
}

/**
 * GET /api/groups/:id/posts: the Group's posts the caller may read, newest first, the pinned post first on the first page. The same units as
 * the feed (FeedPageResponse), so the web app shows them with the feed's cards. A Private Group's outsider reads none (posts_group_hide).
 */
export async function readGroupFeed(
  database: Database,
  identity: Identity,
  id: string,
  after: { at: string; id: string } | null,
  storage?: MediaStorage,
): Promise<GroupResult<FeedPageResponse>> {
  const imageRows: PostImageRow[] = [];
  const result = await inIdentityTransaction(
    database,
    identity,
    async (tx): Promise<GroupResult<FeedPageResponse>> => {
      const member = await classifyMember(tx);
      if (isRefusal(member)) return member;
      const group = await readGroupDetail(tx, id);
      if (group === undefined) return fail('group_unavailable');
      const pinned = after === null && group.pinnedPostId !== null && (await readGroupPostExists(tx, id, group.pinnedPostId)) ? group.pinnedPostId : null;
      const rows = await readGroupPostIds(tx, id, after, group.pinnedPostId, GROUP_FEED_PAGE_SIZE + 1);
      const page = rows.slice(0, GROUP_FEED_PAGE_SIZE);
      const ids = [...(pinned === null ? [] : [pinned]), ...page.map((row) => row.id)];
      const display = new Map((await readDisplayPosts(tx, ids)).map((row) => [row.id, row]));
      const likeCounts = await readLikeCounts(tx, 'post', ids);
      const commentCounts = await readCommentCounts(tx, ids);
      const liked = await readLikedTargetIds(tx, ids);
      imageRows.push(...(await readPostImageRows(tx, storage, ids)));
      const items = ids.flatMap((postId): FeedUnit[] => {
        const row = display.get(postId);
        const unit = row === undefined ? undefined : unitOf(row, { likeCount: likeCounts.get(postId) ?? 0, commentCount: commentCounts.get(postId) ?? 0, likedByMe: liked.has(postId) });
        return unit === undefined ? [] : [unit];
      });
      const last = page.at(-1);
      const nextCursor = rows.length > GROUP_FEED_PAGE_SIZE && last !== undefined ? `${last.createdAt}_${last.id}` : null;
      return ok(feedPageResponse.parse({ items, nextCursor, configVersion: 0 }));
    },
    { isolationLevel: 'repeatable read' },
  );
  if (result.kind !== 'ok' || imageRows.length === 0) return result;
  const imagesOf = await imagesByPost(storage, imageRows);
  const items = result.value.items.map((item) => {
    const images = item.kind === 'post' ? imagesOf.get(item.id) : undefined;
    return images === undefined ? item : { ...item, images };
  });
  return ok(feedPageResponse.parse({ ...result.value, items }));
}
