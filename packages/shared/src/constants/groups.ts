// Groups (I10; FR-GRP-001..004, FR-ALG-010, VAL-021, VAL-028, VAL-035; migration 20261022300000). The database holds the same lists as CHECKs.

/** Public: content readable by every signed-in user, Join at once. Private: details discoverable, content for members only, Join by request. */
export const GROUP_PRIVACIES = ['public', 'private'] as const;
export type GroupPrivacy = (typeof GROUP_PRIVACIES)[number];

/** The Group Role hierarchy, highest first (BR-041): separate from System Admin and Moderator (BR-033). */
export const GROUP_ROLES = ['owner', 'admin', 'moderator', 'member'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

/** owner 4 > admin 3 > moderator 2 > member 1; 0 = not a member. */
export function groupRoleRank(role: GroupRole | null): number {
  switch (role) {
    case 'owner':
      return 4;
    case 'admin':
      return 3;
    case 'moderator':
      return 2;
    case 'member':
      return 1;
    default:
      return 0;
  }
}

/** Group notifications per member and Group (VAL-035). No choice made = highlights. */
export const GROUP_NOTIFICATION_MODES = ['all', 'highlights', 'off'] as const;
export type GroupNotificationMode = (typeof GROUP_NOTIFICATION_MODES)[number];
export const DEFAULT_GROUP_NOTIFICATION_MODE: GroupNotificationMode = 'highlights';

export const GROUP_NAME_MIN = 3;
export const GROUP_NAME_MAX = 60;
export const GROUP_DESCRIPTION_MAX = 1000;
export const GROUP_RULES_MAX = 2000;

/** Groups per list page (discovery, my Groups) and members per page. */
export const GROUPS_PAGE_SIZE = 30;
export const GROUP_MEMBERS_PAGE_SIZE = 100;
/** Posts per page of a Group's discussion. */
export const GROUP_FEED_PAGE_SIZE = 20;

/** The caller's relation to a Group, as the Group page shows its main action. */
export const GROUP_MEMBERSHIP_STATES = ['member', 'requested', 'invited', 'none', 'blocked'] as const;
export type GroupMembershipState = (typeof GROUP_MEMBERSHIP_STATES)[number];

// ---- I10 completion C (Afik 21.10.2026, decisions-in-force §11.13-11.17; migration 20261023800000) --------------------------------

/** The three enforcement actions of a Group (§11.16): warning + mute together, removal + block together, and unblock. No plain removal. */
export const GROUP_ENFORCEMENT_KINDS = ['warn_mute', 'remove_block', 'unblock'] as const;
export type GroupEnforcementKind = (typeof GROUP_ENFORCEMENT_KINDS)[number];

/** The closed reason list of a warning or a removal; "other" comes with a free text of up to 500 characters (as reports, §11.9). */
export const GROUP_ENFORCEMENT_REASONS = ['offensive', 'spam', 'off_topic', 'privacy', 'rules', 'other'] as const;
export type GroupEnforcementReason = (typeof GROUP_ENFORCEMENT_REASONS)[number];
export const GROUP_ENFORCEMENT_TEXT_MAX = 500;

/** A mute lasts 24 hours or 7 days, and ends by itself. */
export const GROUP_MUTE_HOURS = [24, 168] as const;
export type GroupMuteHours = (typeof GROUP_MUTE_HOURS)[number];

/** The Group page's discussion: every post, or the Highlights only (the pinned post and the posts that reached the threshold). */
export const GROUP_POST_VIEWS = ['all', 'highlights'] as const;
export type GroupPostView = (typeof GROUP_POST_VIEWS)[number];

/**
 * Organic exposure of active Groups (§11.14, ⭐ of I10-C): activity in the last 7 days (new posts, comments and members), each event
 * weighted by its age (half-life 48 hours); a Group with fewer than 3 events in the window gets no lift. Never paid, no ML. Counted only
 * over what the viewer may read, so a Private Group's activity never reaches a non-member.
 */
export const GROUP_ACTIVITY_WINDOW_DAYS = 7;
export const GROUP_ACTIVITY_MIN_EVENTS = 3;
export const GROUP_ACTIVITY_HALF_LIFE_HOURS = 48;
/** Active Groups suggested on the first page of the feed of someone who is not their member (Public Groups only). */
export const FEED_GROUP_SUGGESTIONS = 3;
