// Monetization (I13; FR-SERV-010, FR-MKT-004, FR-PRO-002, FR-ALG-007, NFR-SEC-007). The value lists the database checks and the web shows.

/** What a promotion promotes: a Professional's own profile, its own public post, or a Regular's own listing (BR-047, BR-020). */
export const PROMOTION_TARGET_KINDS = ['profile', 'post', 'listing'] as const;
export type PromotionTargetKind = (typeof PROMOTION_TARGET_KINDS)[number];

/** The sample plans the database seeds (OP-030: always shown as "מחיר לדוגמה"). */
export const PROMOTION_PLAN_KEYS = ['profile_7', 'profile_30', 'post_3', 'post_7', 'listing_3', 'listing_7'] as const;
export type PromotionPlanKey = (typeof PROMOTION_PLAN_KEYS)[number];

/** A promotion as its owner sees it: running, stopped early, or ended by date (decisions ⭐ 10: no notification on the end). */
export const PROMOTION_STATES = ['running', 'stopped', 'ended'] as const;
export type PromotionState = (typeof PROMOTION_STATES)[number];

/** The paid events a viewer's screen reports (an impression is recorded by the server when it serves the unit). */
export const PROMOTION_CLICK = 'click' as const;

/** The minimal usage events (OP-039, Afik 21.10.2026): no content, no target. */
export const USAGE_EVENT_KINDS = ['daily_login', 'profile_view', 'post_view'] as const;
export type UsageEventKind = (typeof USAGE_EVENT_KINDS)[number];

/** The days the Professional's analytics and the Admin's promotion view count back (FR-PRO-002, AC-072). */
export const PROMOTION_ANALYTICS_DAYS = 30;
