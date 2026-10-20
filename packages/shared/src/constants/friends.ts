// Value lists of the friendships schema (I2 F2.4a; migration 20261017160000). Held once here; the Drizzle schema declares its text
// enum from it, and the CHECK constraint friendships_status_check lists the same values.

/** SRS Friendship / Friend Request status (§13). Cancel (DR-4 A) is no status: it is `cancelled_at` on a pending or declined row. */
export const FRIENDSHIP_STATUSES = ['pending', 'accepted', 'declined', 'removed'] as const;
export type FriendshipStatus = (typeof FRIENDSHIP_STATUSES)[number];

/** NFR-SEC-006 / BR-025 Configuration keys held in `security_limits` (migrations 20261017170000, 20261020400000): the profile-open limit and the People Search limit. */
export const SECURITY_LIMIT_KEYS = ['profile_open', 'people_search'] as const;
export type SecurityLimitKey = (typeof SECURITY_LIMIT_KEYS)[number];

/** NFR-SEC-006 (5) Security event kinds held in `security_events`. */
export const SECURITY_EVENT_KINDS = ['profile_open_limit', 'people_search_limit'] as const;
export type SecurityEventKind = (typeof SECURITY_EVENT_KINDS)[number];

/** The viewer's relationship to the person whose profile is read (F2.4c1 c19): `none` · `sent` · `received` · `friends`. */
export const RELATIONSHIP_STATES = ['none', 'sent', 'received', 'friends'] as const;
export type RelationshipState = (typeof RELATIONSHIP_STATES)[number];

/** What `profile_view` says about one open: counted and read, or refused by the profile-open limit (c20). */
export const PROFILE_VIEW_OUTCOMES = ['shown', 'limited'] as const;
export type ProfileViewOutcome = (typeof PROFILE_VIEW_OUTCOMES)[number];
