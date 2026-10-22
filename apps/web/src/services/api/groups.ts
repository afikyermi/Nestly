import {
  feedPageResponse,
  groupDetail,
  groupEnforcementsResponse,
  groupFriendsResponse,
  groupInviteResponse,
  groupPendingInvitationsResponse,
  groupInvitationsResponse,
  groupMembersResponse,
  groupPeopleResponse,
  groupsListResponse,
  type CreateGroupBody,
  type FeedPageResponse,
  type GroupDetail,
  type GroupEnforcementBody,
  type GroupEnforcementRecord,
  type GroupFriend,
  type GroupInviteResponse,
  type GroupPendingInvitation,
  type GroupPostView,
  type GroupInvitation,
  type GroupMember,
  type GroupNotificationMode,
  type GroupPerson,
  type GroupRole,
  type GroupSummary,
  type UpdateGroupBody,
} from '@nestly/shared';
import type { FeedOutcome } from './feed';

// The Groups API (I10; FR-GRP-001..004, FR-ALG-010): /api/groups and /api/group-invitations. The caller's id is never sent: the server acts on
// the token's user, and a Group, a member or an invitation is named by id in the path. Only the status, the one `error` code and a body that
// passes the shared response schema are read; no response text reaches the screen.
export type GroupsError =
  | 'unauthenticated' // 401
  | 'account-unavailable' // 403 account_unavailable (ERR-037)
  | 'group_unavailable'
  | 'user_unavailable'
  | 'not_allowed'
  | 'role_not_allowed'
  | 'blocked_from_group'
  | 'owner_must_transfer'
  | 'already_requested'
  | 'already_member'
  | 'not_a_friend'
  | 'muted'
  | 'invitation_unavailable'
  | 'name_too_short'
  | 'name_too_long'
  | 'description_too_long'
  | 'rules_too_long'
  | 'failed';

export type GroupsOutcome<T> = { kind: 'ok'; value: T } | { kind: 'error'; error: GroupsError };

const KNOWN: ReadonlySet<string> = new Set([
  'group_unavailable',
  'user_unavailable',
  'not_allowed',
  'role_not_allowed',
  'blocked_from_group',
  'owner_must_transfer',
  'already_requested',
  'already_member',
  'not_a_friend',
  'muted',
  'invitation_unavailable',
  'name_too_short',
  'name_too_long',
  'description_too_long',
  'rules_too_long',
]);

const failed = <T>(error: GroupsError = 'failed'): GroupsOutcome<T> => ({ kind: 'error', error });

type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

/** A call answered by 204 or an empty object: nothing to read. */
const NOTHING: Schema<null> = { safeParse: () => ({ success: true, data: null }) };
const isKnown = (code: unknown): code is GroupsError => typeof code === 'string' && KNOWN.has(code);

async function call<T>(token: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body: unknown, schema: Schema<T>): Promise<GroupsOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });
  } catch {
    return failed();
  }
  if (response.status === 401) return failed('unauthenticated');
  if (response.status === 204) {
    const empty = schema.safeParse(null);
    return empty.success ? { kind: 'ok', value: empty.data } : failed();
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return failed();
  }
  if (response.status >= 400) {
    const code: unknown = typeof json === 'object' && json !== null ? Reflect.get(json, 'error') : undefined;
    if (code === 'account_unavailable') return failed('account-unavailable');
    return isKnown(code) ? failed(code) : failed();
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { kind: 'ok', value: parsed.data } : failed();
}

const g = (id: string) => `/api/groups/${encodeURIComponent(id)}`;
const listOf = <K extends string, T>(key: K, schema: Schema<Record<K, T>>): Schema<T> => ({
  safeParse(value: unknown) {
    const parsed = schema.safeParse(value);
    return parsed.success ? { success: true, data: parsed.data[key] } : { success: false };
  },
});

export const listGroups = (token: string, scope: 'mine' | 'discover', q = ''): Promise<GroupsOutcome<GroupSummary[]>> =>
  call(token, 'GET', `/api/groups?scope=${scope}${q.trim() === '' ? '' : `&q=${encodeURIComponent(q.trim())}`}`, undefined, listOf('groups', groupsListResponse));
export const createGroup = (token: string, body: CreateGroupBody): Promise<GroupsOutcome<GroupDetail>> => call(token, 'POST', '/api/groups', body, groupDetail);
export const fetchGroup = (token: string, id: string): Promise<GroupsOutcome<GroupDetail>> => call(token, 'GET', g(id), undefined, groupDetail);
export const editGroup = (token: string, id: string, body: UpdateGroupBody): Promise<GroupsOutcome<GroupDetail>> => call(token, 'PATCH', g(id), body, groupDetail);
export const deleteGroup = (token: string, id: string): Promise<GroupsOutcome<null>> => call(token, 'DELETE', g(id), undefined, NOTHING);
export const joinGroup = (token: string, id: string): Promise<GroupsOutcome<GroupDetail>> => call(token, 'PUT', `${g(id)}/membership`, undefined, groupDetail);
export const leaveGroup = (token: string, id: string): Promise<GroupsOutcome<GroupDetail>> => call(token, 'DELETE', `${g(id)}/membership`, undefined, groupDetail);
export const listMembers = (token: string, id: string): Promise<GroupsOutcome<GroupMember[]>> =>
  call(token, 'GET', `${g(id)}/members`, undefined, listOf('members', groupMembersResponse));
export const setMemberRole = (token: string, id: string, userId: string, role: GroupRole): Promise<GroupsOutcome<GroupMember[]>> =>
  call(token, 'PATCH', `${g(id)}/members/${encodeURIComponent(userId)}`, { role }, listOf('members', groupMembersResponse));
export const listRequests = (token: string, id: string): Promise<GroupsOutcome<GroupPerson[]>> =>
  call(token, 'GET', `${g(id)}/requests`, undefined, listOf('people', groupPeopleResponse));
export const decideRequest = (token: string, id: string, userId: string, decision: 'approve' | 'reject'): Promise<GroupsOutcome<null>> =>
  call(token, 'PUT', `${g(id)}/requests/${encodeURIComponent(userId)}`, { decision }, NOTHING);
export const listBans = (token: string, id: string): Promise<GroupsOutcome<GroupPerson[]>> => call(token, 'GET', `${g(id)}/bans`, undefined, listOf('people', groupPeopleResponse));
export const unblock = (token: string, id: string, userId: string): Promise<GroupsOutcome<null>> =>
  call(token, 'DELETE', `${g(id)}/bans/${encodeURIComponent(userId)}`, undefined, NOTHING);
export const listGroupFriends = (token: string, id: string): Promise<GroupsOutcome<GroupFriend[]>> =>
  call(token, 'GET', `${g(id)}/friends`, undefined, listOf('friends', groupFriendsResponse));
/** I10-C (§11.15): any member invites; the answer says whether it was sent or waits for the Owner's or an Admin's approval. */
export const inviteFriend = (token: string, id: string, userId: string): Promise<GroupsOutcome<GroupInviteResponse['status']>> =>
  call(token, 'POST', `${g(id)}/invitations`, { userId }, listOf('status', groupInviteResponse));
/** I10-C (§11.16): warning + mute, or removal + block, of a member of a lower Role. */
export const enforceMember = (token: string, id: string, body: GroupEnforcementBody): Promise<GroupsOutcome<null>> =>
  call(token, 'POST', `${g(id)}/enforcements`, body, NOTHING);
export const listEnforcements = (token: string, id: string): Promise<GroupsOutcome<GroupEnforcementRecord[]>> =>
  call(token, 'GET', `${g(id)}/enforcements`, undefined, listOf('records', groupEnforcementsResponse));
export const listAwaitingInvitations = (token: string, id: string): Promise<GroupsOutcome<GroupPendingInvitation[]>> =>
  call(token, 'GET', `${g(id)}/invitations`, undefined, listOf('invitations', groupPendingInvitationsResponse));
export const decideInvitation = (token: string, id: string, invitationId: string, decision: 'approve' | 'reject'): Promise<GroupsOutcome<null>> =>
  call(token, 'PUT', `${g(id)}/invitations/${encodeURIComponent(invitationId)}`, { decision }, NOTHING);
export const recommendGroup = (token: string, id: string, userId: string): Promise<GroupsOutcome<null>> => call(token, 'POST', `${g(id)}/recommendations`, { userId }, NOTHING);
export const setGroupMode = (token: string, id: string, mode: GroupNotificationMode): Promise<GroupsOutcome<null>> => call(token, 'PUT', `${g(id)}/notifications`, { mode }, NOTHING);
/** DELETE /api/groups/:id/posts/:postId: a Group Moderator or higher removes a lower Role's post (403 role_not_allowed otherwise). */
export const removeGroupPost = (token: string, id: string, postId: string): Promise<GroupsOutcome<null>> =>
  call(token, 'DELETE', `${g(id)}/posts/${encodeURIComponent(postId)}`, undefined, NOTHING);
export const pinPost = (token: string, id: string, postId: string | null): Promise<GroupsOutcome<GroupDetail>> => call(token, 'PUT', `${g(id)}/pin`, { postId }, groupDetail);
export const listInvitations = (token: string): Promise<GroupsOutcome<GroupInvitation[]>> =>
  call(token, 'GET', '/api/group-invitations', undefined, listOf('invitations', groupInvitationsResponse));
export const answerInvitation = (token: string, id: string, answer: 'accept' | 'decline'): Promise<GroupsOutcome<null>> =>
  call(token, 'PUT', `/api/group-invitations/${encodeURIComponent(id)}`, { answer }, NOTHING);

/** GET /api/groups/:id/posts?cursor=&view=: a page of the Group's discussion (or its Highlights), in the feed's own shape (the feed's cards show it). */
export async function fetchGroupFeedPage(token: string, groupId: string, cursor: string | null, view: GroupPostView = 'all'): Promise<FeedOutcome> {
  const query = new URLSearchParams();
  if (cursor !== null) query.set('cursor', cursor);
  if (view === 'highlights') query.set('view', view);
  const search = query.toString();
  const outcome = await call<FeedPageResponse>(token, 'GET', `${g(groupId)}/posts${search === '' ? '' : `?${search}`}`, undefined, feedPageResponse);
  if (outcome.kind === 'ok') return { kind: 'page', page: outcome.value };
  if (outcome.error === 'unauthenticated') return { kind: 'unauthenticated' };
  if (outcome.error === 'account-unavailable') return { kind: 'account-unavailable' };
  return outcome.error === 'not_allowed' ? { kind: 'not-allowed' } : { kind: 'failed' };
}
