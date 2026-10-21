// Value lists of the admin core (migrations 20261020300000, 20261020400000). Held once here; the CHECK constraints state the same.

/** The Permission Keys an Admin can assign to a Moderator (SRS §3.1, FR-ADMIN-004). The Admin holds every key and the Admin-only ones of §3.2. */
export const PERMISSION_KEYS = [
  'SUPPORT_VIEW',
  'SUPPORT_HANDLE',
  'REPORTS_VIEW',
  'CONTENT_MODERATE',
  'MARKETPLACE_MODERATE',
  'USER_VIEW',
  'USER_WARN',
  'USER_SUSPEND',
  'USER_BAN',
  'ANALYTICS_VIEW',
  'AUDIT_LOG_VIEW',
  'COMMUNITY_CONFIG',
  'SYSTEM_ANNOUNCEMENTS',
  'PRIVATE_GROUP_MODERATE',
  'CHILD_DATA_VIEW',
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** user_enforcements.kind (FR-MOD-002). */
export const ENFORCEMENT_KINDS = ['warning', 'suspension', 'reinstate', 'ban', 'unban'] as const;
export type EnforcementKind = (typeof ENFORCEMENT_KINDS)[number];

/** reports.resolution: how staff closed a report. */
export const REPORT_RESOLUTIONS = ['dismissed', 'action_taken'] as const;
export type ReportResolution = (typeof REPORT_RESOLUTIONS)[number];

/** What a moderator moves reported content to: hidden, removed, or back to active (a restore). */
export const MODERATION_STATUSES = ['hidden', 'removed', 'active'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

/** The longest staff reason or note, in code points (audit_log.reason, user_enforcements.reason, reports.handler_note). */
export const STAFF_REASON_MAX = 1000;

/** The suspension lengths of the ladder, in hours (BR-074): 24 hours, 7 days, 30 days. 72 hours is the extra option outside it. */
export const SUSPENSION_LADDER_HOURS = [24, 168, 720] as const;
export const SUSPENSION_EXTRA_HOURS = 72;

/** An enforcement counts for the ladder over this many months (BR-074). */
export const LADDER_MONTHS = 12;
