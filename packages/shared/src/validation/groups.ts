// Groups (I10; FR-GRP-001..004, FR-ALG-010, VAL-019..021, VAL-028, VAL-035, ERR-017..019, ERR-026). The web checks what it sends and the
// server checks again with the same schemas. No body names the caller: membership, ownership and every Role are bound to the token's user by
// the database. Every object is strict: an unknown key is refused (400).
import { z } from 'zod';
import {
  GROUP_DESCRIPTION_MAX,
  GROUP_ENFORCEMENT_KINDS,
  GROUP_ENFORCEMENT_REASONS,
  GROUP_ENFORCEMENT_TEXT_MAX,
  GROUP_MEMBERSHIP_STATES,
  GROUP_NAME_MAX,
  GROUP_NAME_MIN,
  GROUP_NOTIFICATION_MODES,
  GROUP_POST_VIEWS,
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
export const groupPostPathParams = z.object({ id: z.guid(), postId: z.guid() });
export const groupInvitationDecisionPathParams = z.object({ id: z.guid(), invitationId: z.guid() });

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
  /** I10-C: the caller's own mute in this Group (read-only until `until`), or null (§11.16). */
  myMute: z.strictObject({ until: z.iso.datetime(), reason: z.enum(GROUP_ENFORCEMENT_REASONS), reasonText: z.string().nullable() }).nullable(),
  /** I10-C: the likes and comments by others at which a post of this Group is a Highlight now (members only; FR-ALG-010). */
  highlightThreshold: z.number().int().min(1).nullable(),
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
  /** I10-C: invited by the caller to a Private Group, waiting for the Owner's or an Admin's approval. */
  isAwaitingApproval: z.boolean(),
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
  'muted', // 403: the caller is muted in the Group (read-only until the mute ends; I10-C)
  'invitation_unavailable', // 409: the invitation is no longer valid (the inviter left, or the invitee is already a member)
] as const;
export type GroupActionError = (typeof GROUP_ACTION_ERRORS)[number];
export const groupErrorBody = z.object({ error: z.string() });

// ---- I10 completion C (§11.13-11.17) ----------------------------------------------------------------------------------------------

/** GET /api/groups/:id/posts?cursor=&view=all|highlights: the discussion, or its Highlights only. */
export const groupPostsQuery = z.strictObject({ cursor: z.string().max(200).optional(), view: z.enum(GROUP_POST_VIEWS).default('all') });

const enforcementText = z
  .string()
  .trim()
  .refine(noNul, 'invalid')
  .refine((value) => value !== '' && codePointLength(value) <= GROUP_ENFORCEMENT_TEXT_MAX, 'invalid');

/**
 * POST /api/groups/:id/enforcements (§11.16): warn_mute (a reason, 24 or 168 hours) or remove_block (a reason). "other" comes with its
 * text, and only it. Unblock is DELETE /api/groups/:id/bans/:userId.
 */
export const groupEnforcementBody = z
  .strictObject({
    userId: z.guid(),
    kind: z.enum(['warn_mute', 'remove_block']),
    reason: z.enum(GROUP_ENFORCEMENT_REASONS),
    reasonText: enforcementText.optional(),
    muteHours: z.union([z.literal(24), z.literal(168)]).optional(),
  })
  .refine((v) => (v.kind === 'warn_mute') === (v.muteHours !== undefined), 'invalid')
  .refine((v) => (v.reason === 'other') === (v.reasonText !== undefined), 'invalid');
export type GroupEnforcementBody = z.infer<typeof groupEnforcementBody>;

/** One record of the Group's enforcement history (the Group's Moderators and higher): never who acted. */
export const groupEnforcementRecord = z.strictObject({
  id: z.guid(),
  userId: z.guid(),
  fullName: z.string().nullable(),
  kind: z.enum(GROUP_ENFORCEMENT_KINDS),
  reason: z.enum(GROUP_ENFORCEMENT_REASONS).nullable(),
  reasonText: z.string().nullable(),
  muteUntil: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type GroupEnforcementRecord = z.infer<typeof groupEnforcementRecord>;
export const groupEnforcementsResponse = z.strictObject({ records: z.array(groupEnforcementRecord) });

/** An invitation to a Private Group waiting for the Owner's or an Admin's approval (§11.15). */
export const groupPendingInvitation = z.strictObject({
  id: z.guid(),
  inviter: z.strictObject({ userId: z.guid(), fullName: z.string().nullable() }),
  invitee: z.strictObject({ userId: z.guid(), fullName: z.string().nullable() }),
  createdAt: z.iso.datetime(),
});
export type GroupPendingInvitation = z.infer<typeof groupPendingInvitation>;
export const groupPendingInvitationsResponse = z.strictObject({ invitations: z.array(groupPendingInvitation) });
/** PUT /api/groups/:id/invitations/:invitationId { decision }. */
export const groupInvitationDecisionBody = z.strictObject({ decision: z.enum(['approve', 'reject']) });

/** POST /api/groups/:id/invitations answers which way the invitation went: sent to the invitee, or waiting for approval. */
export const groupInviteResponse = z.strictObject({ status: z.enum(['sent', 'awaiting_approval']) });
export type GroupInviteResponse = z.infer<typeof groupInviteResponse>;

/** An active Group suggested in the feed of someone who is not its member (§11.14): Public Groups only, basic details only. */
export const feedGroupSuggestion = z.strictObject({
  id: z.guid(),
  name: z.string(),
  description: z.string().nullable(),
  memberCount: z.number().int().min(0),
});
export type FeedGroupSuggestion = z.infer<typeof feedGroupSuggestion>;
