// Value lists and limits of the reports schema (I3 F3.7; migrations 20261018200000, 20261019200000). Held once here; the CHECK constraints
// reports_target_kind_check, reports_reason_check and reports_details_length_check state the same.

/** What a report names (FR-MOD-001): a post, a comment (or reply), or another user's account. */
export const REPORT_TARGET_KINDS = ['post', 'comment', 'user'] as const;
export type ReportTargetKind = (typeof REPORT_TARGET_KINDS)[number];

/**
 * The eight reasons, in FR-MOD-001's order (AC-106, decision 16.10 "Before I3–I5" (3)): the order the report window shows them. The queue
 * priority of each is I4's (BR-074). A change is a migration of reports_reason_check and this list together (FR-ADMIN-007 is later).
 */
export const REPORT_REASONS = [
  'child_safety',
  'harassment',
  'sexual_violent_hateful',
  'personal_information',
  'medical_misinformation',
  'impersonation',
  'spam',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * The longest report text, in code points (F3.7 Q1; "SRS gap": the VAL id is assigned at I3's SRS update). The database enforces the same
 * number with `char_length(details) <= 1000` (reports_details_length_check), so a change is a migration and this constant together.
 */
export const REPORT_DETAILS_MAX = 1000;
