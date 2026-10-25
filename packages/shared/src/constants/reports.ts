// Value lists and limits of the reports schema (I3 F3.7; migrations 20261018200000, 20261019200000). Held once here; the CHECK constraints
// reports_target_kind_check, reports_reason_check and reports_details_length_check state the same.

/** What a report names (FR-MOD-001): a post, a comment (or reply), another user's account, a chat message (I8, §9.6), a Marketplace listing (I12), or a
 * Professional's review or article (I11 follow-ups, FR-SERV-011, FR-PRO-003). */
export const REPORT_TARGET_KINDS = ['post', 'comment', 'user', 'message', 'listing', 'review', 'article'] as const;

/** The kinds whose content staff read and move (active, hidden, removed): everything but an account and a chat message. */
export const CONTENT_TARGET_KINDS = ['post', 'comment', 'review', 'article'] as const;
export type ContentTargetKind = (typeof CONTENT_TARGET_KINDS)[number];
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
/** The eight reasons every installation starts with (their labels are the web's fallback when the list cannot be read). */
export type CoreReportReason = (typeof REPORT_REASONS)[number];
/** A reason a reporter may choose: a core one, or one the community settings added (FR-ADMIN-007; the key is the server's). */
export type ReportReason = CoreReportReason | ReviewReportReason | `custom_${string}`;

/**
 * FR-MOD-001, AC-150 (§11.10, Afik 21.10.2026): the four reasons the reviewed Professional chooses from when it reports a review about itself, in
 * this order: פוגענית · שקרית / בלי אינטראקציה · מידע אישי · אחר. Fixed (not in the community settings); nobody else uses them (the database).
 */
export const REVIEW_REPORT_REASONS = ['review_offensive', 'review_false', 'review_personal_info', 'review_other'] as const;
export type ReviewReportReason = (typeof REVIEW_REPORT_REASONS)[number];

export function isReviewReportReason(value: string): value is ReviewReportReason {
  return REVIEW_REPORT_REASONS.some((reason) => reason === value);
}

/** "אחר" of either list needs a text (VAL-048; reports_other_details_check). */
export function reportReasonNeedsDetails(reason: ReportReason): boolean {
  return reason === 'other' || reason === 'review_other';
}
/** The shape of an added reason's key (`custom_` and 8 hex characters). */
export const CUSTOM_REPORT_REASON = /^custom_[0-9a-f]{8}$/;

/**
 * The longest report text, in code points (F3.7 Q1; "SRS gap": the VAL id is assigned at I3's SRS update). The database enforces the same
 * number with `char_length(details) <= 1000` (reports_details_length_check), so a change is a migration and this constant together.
 */
export const REPORT_DETAILS_MAX = 1000;

/** A core reason or an added one's key (the web keeps only these from the server's list). */
export function isReportReason(value: string): value is ReportReason {
  return REPORT_REASONS.some((reason) => reason === value) || CUSTOM_REPORT_REASON.test(value);
}
