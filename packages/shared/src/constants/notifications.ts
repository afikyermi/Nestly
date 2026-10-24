// Notifications (FR-NOTIF-001/002/003; migration 20261020400000). The list of events lives here, not in the database: the table only
// checks the shape of a type and a category, so a later feature adds an event with a constant here and a definer, no schema change.

/** What happened. The wording of each is the web's; the database stores only the type, the actor and the target. */
export const NOTIFICATION_TYPES = ['friend_request', 'friend_accepted', 'post_comment', 'comment_reply', 'post_shared', 'friend_post',
  // I10 (FR-GRP-002, FR-ALG-010): Group events, written by notify_group()
  'group_recommended', 'group_invited', 'group_join_requested', 'group_join_approved', 'group_post', 'group_pinned', 'group_highlight',
  // I10 completion C (§11.15, §11.16): an invitation awaiting approval (Owner, Admins), its approval or rejection (the inviter), the mute notice
  'group_invitation_pending', 'group_invitation_approved', 'group_invitation_rejected', 'group_member_muted',
  // I11 follow-ups (OP-051 cancelled, Afik 21.10.2026): the Professional's events, written by notify_professional()
  'offer_accepted', 'offer_declined', 'review_received', 'followers_weekly',
  // SRS-audit fixes (BR-037, AC-046): a Friend's child's birthday, written by deliver_child_birthdays() when the list is opened
  'child_birthday'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** The groups a user switches on and off (FR-NOTIF-002). `security` is critical and cannot be switched off (BR-038); no event of it exists yet. */
export const NOTIFICATION_CATEGORIES = ['friends', 'comments', 'shares', 'friend_posts', 'groups', 'offers', 'reviews', 'followers', 'birthdays'] as const;
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
  group_invitation_pending: 'groups',
  group_invitation_approved: 'groups',
  group_invitation_rejected: 'groups',
  group_member_muted: 'groups',
  offer_accepted: 'offers',
  offer_declined: 'offers',
  review_received: 'reviews',
  followers_weekly: 'followers',
  child_birthday: 'birthdays',
};

/** The categories only a Regular account has (Friends), and only a Professional has (its business events). */
export const REGULAR_ONLY_CATEGORIES: readonly NotificationCategory[] = ['friends', 'friend_posts', 'birthdays'];
export const PROFESSIONAL_ONLY_CATEGORIES: readonly NotificationCategory[] = ['offers', 'reviews', 'followers'];

/** Where a notification leads: a post, a person, a Group (I10), an Offer Help or a Professional's page (I11 follow-ups). Authorized again when opened. */
export const NOTIFICATION_TARGET_KINDS = ['post', 'user', 'group', 'outreach', 'professional'] as const;
export type NotificationTargetKind = (typeof NOTIFICATION_TARGET_KINDS)[number];

/** The most notifications one page carries (the dropdown shows the latest of them). */
export const NOTIFICATIONS_PAGE_SIZE = 30;
