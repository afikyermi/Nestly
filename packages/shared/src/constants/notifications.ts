// Notifications (FR-NOTIF-001/002/003; migration 20261020400000). The list of events lives here, not in the database: the table only
// checks the shape of a type and a category, so a later feature adds an event with a constant here and a definer, no schema change.

/** What happened. The wording of each is the web's; the database stores only the type, the actor and the target. */
export const NOTIFICATION_TYPES = ['friend_request', 'friend_accepted', 'post_comment', 'comment_reply', 'post_shared', 'friend_post',
  // I10 (FR-GRP-002, FR-ALG-010): Group events, written by notify_group()
  'group_recommended', 'group_invited', 'group_join_requested', 'group_join_approved', 'group_post', 'group_pinned', 'group_highlight'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** The groups a user switches on and off (FR-NOTIF-002). `security` is critical and cannot be switched off (BR-038); no event of it exists yet. */
export const NOTIFICATION_CATEGORIES = ['friends', 'comments', 'shares', 'friend_posts', 'groups'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Which category switches an event on or off. */
export const NOTIFICATION_CATEGORY_OF: Readonly<Record<NotificationType, NotificationCategory>> = {
  friend_request: 'friends',
  friend_accepted: 'friends',
  post_comment: 'comments',
  comment_reply: 'comments',
  post_shared: 'shares',
  friend_post: 'friend_posts',
  group_recommended: 'groups',
  group_invited: 'groups',
  group_join_requested: 'groups',
  group_join_approved: 'groups',
  group_post: 'groups',
  group_pinned: 'groups',
  group_highlight: 'groups',
};

/** Where a notification leads: a post, a person or a Group (I10). Authorized again when opened. */
export const NOTIFICATION_TARGET_KINDS = ['post', 'user', 'group'] as const;
export type NotificationTargetKind = (typeof NOTIFICATION_TARGET_KINDS)[number];

/** The most notifications one page carries (the dropdown shows the latest of them). */
export const NOTIFICATIONS_PAGE_SIZE = 30;
