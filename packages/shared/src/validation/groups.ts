// Groups (I10; FR-GRP-001..004, FR-ALG-010, VAL-019..021, VAL-028, VAL-035, ERR-017..019, ERR-026). The web checks what it sends and the
// server checks again with the same schemas. No body names the caller: membership, ownership and every Role are bound to the token's user by
// the database. Every object is strict: an unknown key is refused (400).
import { z } from 'zod';
import {
  GROUP_DESCRIPTION_MAX,
  GROUP_MEMBERSHIP_STATES,
  GROUP_NAME_MAX,
  GROUP_NAME_MIN,
  GROUP_NOTIFICATION_MODES,
  GROUP_PRIVACIES,
  GROUP_ROLES,
  GROUP_RULES_MAX,
} from '../constants/groups.js';
import { codePointLength } from './text.js';

const noNul = (value: string) => !value.includes('\u0000');

/** The name: trimmed, 3-60 code points (the database's CHECK counts the same way). */
export const groupName = z
  .string()
  .trim()
  .refine(noNul, 'invalid')
  .refine((value) => codePointLength(value) >= GROUP_NAME_MIN, 'name_too_short')
  .refine((value) => codePointLength(value) <= GROUP_NAME_MAX, 'name_too_long');

/** An optional long text: trimmed; empty means none (null); else at most `max` code points. */
function optionalText(max: number, code: string) {
  return z
    .string()
    .trim()
    .refine(noNul, 'invalid')
    .refine((value) => codePointLength(value) <= max, code)
    .transform((value) => (value === '' ? null : value))
    .nullable();
}

export const groupDescription = optionalText(GROUP_DESCRIPTION_MAX, 'description_too_long');
export const groupRules = optionalText(GROUP_RULES_MAX, 'rules_too_long');
export const groupPrivacy = z.enum(GROUP_PRIVACIES);
export const groupRole = z.enum(GROUP_ROLES);
export const groupNotificationMode = z.enum(GROUP_NOTIFICATION_MODES);

export const GROUP_ERROR_CODES = ['name_too_short', 'name_too_long', 'description_too_long', 'rules_too_long'] as const;
export type GroupErrorCode = (typeof GROUP_ERROR_CODES)[number];

/** POST /api/groups (FR-GRP-004, VAL-028): the creator becomes the Owner; no Admin approval. */
export const createGroupBody = z.strictObject({
  name: groupName,
  description: groupDescription.optional(),
  rules: groupRules.optional(),
  privacy: groupPrivacy,
});
export type CreateGroupBody = z.infer<typeof createGroupBody>;

/** PATCH /api/groups/:id: any of these, at least one. Privacy is the Owner's (the database refuses anyone else, NS027). */
export const updateGroupBody = z
  .strictObject({
    name: groupName.optional(),
    description: groupDescription.optional(),
    rules: groupRules.optional(),
    privacy: groupPrivacy.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'invalid');
export type UpdateGroupBody = z.infer<typeof updateGroupBody>;

export type GroupBodyCheck<T> = { ok: true; value: T } | { ok: false; reason: 'invalid' | GroupErrorCode };

const isGroupErrorCode = (message: string): message is GroupErrorCode => GROUP_ERROR_CODES.some((code) => code === message);

function checked<T>(result: { success: true; data: T } | { success: false; error: z.ZodError }): GroupBodyCheck<T> {
  if (result.success) return { ok: true, value: result.data };
  const [first] = result.error.issues.map((issue) => issue.message);
  return { ok: false, reason: first !== undefined && isGroupErrorCode(first) ? first : 'invalid' };
}

export const checkCreateGroup = (body: unknown): GroupBodyCheck<CreateGroupBody> => checked(createGroupBody.safeParse(body));
export const checkUpdateGroup = (body: unknown): GroupBodyCheck<UpdateGroupBody> => checked(updateGroupBody.safeParse(body));

/** `:id` of a Group path, and `:userId` of a member / requester / blocked user. A uuid's text form, else 404 before any query. */
export const groupPathParams = z.object({ id: z.guid() });
export const groupUserPathParams = z.object({ id: z.guid(), userId: z.guid() });
export const groupInvitationPathParams = z.object({ id: z.guid() });

/** GET /api/groups?scope=mine|discover&q=: my Groups, or discovery (every active Group, newest first, or matching `q`). */
export const groupsListQuery = z.strictObject({
  scope: z.enum(['mine', 'discover']).default('discover'),
  q: z.string().max(100).optional(),
});

export const groupRoleBody = z.strictObject({ role: groupRole });
export const groupRequestDecisionBody = z.strictObject({ decision: z.enum(['approve', 'reject']) });
export const groupInviteBody = z.strictObject({ userId: z.guid() });
export const groupRecommendBody = z.strictObject({ userId: z.guid() });
export const groupModeBody = z.strictObject({ mode: groupNotificationMode });
export const groupPinBody = z.strictObject({ postId: z.guid().nullable() });
export const groupInvitationAnswerBody = z.strictObject({ answer: z.enum(['accept', 'decline']) });
/** DELETE /api/groups/:id/members/:userId?block=true: remove, and with `block` also keep them out (GroupMemberEnforcement). */
export const groupRemoveQuery = z.strictObject({ block: z.enum(['true', 'false']).optional() });

/** A Group in a list (PG-033): the details everyone may read, the member count when the caller may count the members, and the caller's relation. */
export const groupSummary = z.strictObject({
  id: z.guid(),
  name: z.string(),
  description: z.string().nullable(),
  privacy: groupPrivacy,
  memberCount: z.number().int().min(0).nullable(),
  myRole: groupRole.nullable(),
  state: z.enum(GROUP_MEMBERSHIP_STATES),
});
export type GroupSummary = z.infer<typeof groupSummary>;

export const groupsListResponse = z.strictObject({ groups: z.array(groupSummary) });
export type GroupsList = z.infer<typeof groupsListResponse>;

/** The Group page (PG-034): the summary plus the rules, the pinned post's id, the caller's notification mode (a member only) and the invitation to answer. */
export const groupDetail = groupSummary.extend({
  rules: z.string().nullable(),
  pinnedPostId: z.guid().nullable(),
  notificationMode: groupNotificationMode.nullable(),
  invitationId: z.guid().nullable(),
  createdAt: z.iso.datetime(),
});
export type GroupDetail = z.infer<typeof groupDetail>;

/** A member as the member list shows it (fellow members only; a Professional has no name yet). */
export const groupMember = z.strictObject({
  userId: z.guid(),
  fullName: z.string().nullable(),
  role: groupRole,
  isMe: z.boolean(),
  joinedAt: z.iso.datetime(),
});
export type GroupMember = z.infer<typeof groupMember>;
export const groupMembersResponse = z.strictObject({ members: z.array(groupMember) });

/** A pending Join Request (the Owner and Admins), or a blocked user (Moderators and higher). */
export const groupPerson = z.strictObject({ userId: z.guid(), fullName: z.string().nullable(), at: z.iso.datetime() });
export type GroupPerson = z.infer<typeof groupPerson>;
export const groupPeopleResponse = z.strictObject({ people: z.array(groupPerson) });

/** One of the caller's Friends as the invite / recommend window shows them. */
export const groupFriend = z.strictObject({
  userId: z.guid(),
  fullName: z.string(),
  isMember: z.boolean(),
  isInvited: z.boolean(),
  isRecommended: z.boolean(),
});
export type GroupFriend = z.infer<typeof groupFriend>;
export const groupFriendsResponse = z.strictObject({ friends: z.array(groupFriend) });

/** An invitation the caller received and has not answered. */
export const groupInvitation = z.strictObject({
  id: z.guid(),
  group: z.strictObject({ id: z.guid(), name: z.string(), privacy: groupPrivacy }),
  inviterName: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type GroupInvitation = z.infer<typeof groupInvitation>;
export const groupInvitationsResponse = z.strictObject({ invitations: z.array(groupInvitation) });

/** What a refused Group action answers (besides 400 invalid, 401, 403 account_unavailable, 503). */
export const GROUP_ACTION_ERRORS = [
  'group_unavailable', // 404: no such Group, deleted, or (a member action) not a member
  'not_allowed', // 403: the caller's Role does not allow it, or staff (ERR-022)
  'owner_must_transfer', // 409: the Owner leaves or steps down before transferring ownership (ERR-026)
  'role_not_allowed', // 403: a Role acting on an equal or higher Role, or a change reserved to the Owner (ERR-019)
  'already_requested', // 409: a pending request exists (ERR-018)
  'blocked_from_group', // 403: the user is blocked from the Group
  'not_a_friend', // 422: an invitation or recommendation to someone who is not an active Friend
  'already_member', // 409
  'user_unavailable', // 404: no such member / requester / blocked user
] as const;
export type GroupActionError = (typeof GROUP_ACTION_ERRORS)[number];
export const groupErrorBody = z.object({ error: z.string() });
