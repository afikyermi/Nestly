// Value lists of the friendships schema (I2 F2.4a; migration 20261017160000). Held once here; the Drizzle schema declares its text
// enum from it, and the CHECK constraint friendships_status_check lists the same values.

/** SRS Friendship / Friend Request status (§13). Cancel (DR-4 A) is no status: it is `cancelled_at` on a pending or declined row. */
export const FRIENDSHIP_STATUSES = ['pending', 'accepted', 'declined', 'removed'] as const;
export type FriendshipStatus = (typeof FRIENDSHIP_STATUSES)[number];
