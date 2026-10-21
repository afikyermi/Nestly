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
