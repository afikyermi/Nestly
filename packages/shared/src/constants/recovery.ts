// Value lists, bounds and limits of password recovery by security questions (I1 F1.6; FR-AUTH-003, AC-092, OP-029).
// Each list and number lives here once: the Zod schemas read them, the Drizzle schema declares its text enums from
// them, and the CHECK constraints of supabase/migrations/20261015200000_recovery_questions.sql list the same values.

/** DR-A: the three questions offered. The user picks two. The wording is the web's; the server knows ids only. */
export const RECOVERY_QUESTION_IDS = ['pet', 'nickname', 'street'] as const;
export type RecoveryQuestionId = (typeof RECOVERY_QUESTION_IDS)[number];

/** Exactly two answers are saved, changed and redeemed. */
export const RECOVERY_ANSWER_COUNT = 2;

/** An answer's length in code points after normalising (spec, "Answer storage"). */
export const RECOVERY_ANSWER_MIN_LENGTH = 2;
export const RECOVERY_ANSWER_MAX_LENGTH = 60;

/** Raw bound on an answer as received, in UTF-16 units: it bounds the work, it does not validate content. */
export const RAW_ANSWER_MAX_UNITS = 600;

/**
 * scrypt parameters for a new answer hash (spec: N=2^15, r=8, p=1), stored with the hash. The database refuses a log2 N
 * outside 15-17, r outside 8-16 and p outside 1-4.
 */
export const RECOVERY_SCRYPT = { logN: 15, r: 8, p: 1 } as const;

/** NFR-SEC-010 (Afik 17.10 and 20.10.2026). All counts and locks use the database clock; the values are fixed, not configurable. */
export const RECOVERY_LIMITS = {
  /**
   * Per account (email handle), the lock ladder (Afik 20.10.2026): failures are counted from the last success, with no window; the 3rd
   * locks recovery for 1 hour, the 6th for 24 hours, and after that every further failure locks it again for 24 hours until a success
   * resets the count. There is no permanent lock.
   */
  handle: {
    hourLockAt: 3,
    hourLockSeconds: 60 * 60,
    dayLockFrom: 6,
    dayLockSeconds: 24 * 60 * 60,
  },
  /** Per client address (IPv6 by its /64): 10 failures in 15 minutes lock it for 15 minutes. */
  ip: {
    shortFailures: 10,
    shortWindowSeconds: 15 * 60,
    shortLockSeconds: 15 * 60,
  },
} as const;

/** recovery_throttles.subject_kind. */
export const RECOVERY_THROTTLE_SUBJECTS = ['handle', 'ip'] as const;
export type RecoveryThrottleSubject = (typeof RECOVERY_THROTTLE_SUBJECTS)[number];

/**
 * recovery_events.kind (FR-ADMIN-005). After `reset_verified` the outcome is exactly one of `reset_completed`,
 * `reset_admin_failed`, `reset_revoke_failed` and `reset_email_mismatch` (the account's current Auth email is not the
 * request's). `handle_released` (the account lost its email handle to a newer claim) and `handle_rekeyed` (the account's
 * handle was moved to its token's email) record how the handle changes hands. F2.0 (FR-AUTH-005, S-01/S-16):
 * `takeover_cleared`, `password_set_forced` and `first_password_set` are bound to the transaction's subject; the four
 * `password_change*` kinds record the change after two answers. Migration 20261016100000 lists the same values.
 */
export const RECOVERY_EVENT_KINDS = [
  'answers_saved',
  'answers_changed',
  'change_failed',
  'change_limited',
  'reset_verified',
  'reset_completed',
  'reset_failed',
  'reset_limited',
  'reset_admin_failed',
  'reset_revoke_failed',
  'reset_email_mismatch',
  'handle_released',
  'handle_rekeyed',
  'takeover_cleared',
  'password_set_forced',
  'first_password_set',
  'password_changed',
  'password_change_failed',
  'password_change_limited',
  'password_change_auth_failed',
] as const;
export type RecoveryEventKind = (typeof RECOVERY_EVENT_KINDS)[number];

/**
 * identity_link_checks.verdict (F2.0, FR-AUTH-005): `affected` when the Auth user's email identity is older than its google
 * identity (someone registered the email with a password before the owner signed in with Google).
 */
export const IDENTITY_LINK_VERDICTS = ['unaffected', 'affected'] as const;
export type IdentityLinkVerdict = (typeof IDENTITY_LINK_VERDICTS)[number];
