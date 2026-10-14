// Value lists and bounds of registration step 1 (I1 F1.3 pass a). Every bound lives here once: the Zod schemas in
// validation/ read them, and so does the web form, so changing one changes what both accept.

/** The journey stage chosen at registration (VAL-039). Planning and pregnant are never chosen together. */
export const JOURNEY_STAGES = ['planning', 'pregnant', 'has_child'] as const;
export type JourneyStage = (typeof JOURNEY_STAGES)[number];

/** A child's sex (VAL-006, OP-004 closed): boy, girl, not yet known. Required when a child is added. */
export const CHILD_SEXES = ['boy', 'girl', 'unknown'] as const;
export type ChildSex = (typeof CHILD_SEXES)[number];

/** VAL-001: the parent's full name, counted in code points after trimming spaces. Matches regular_profiles_full_name_check. */
export const FULL_NAME_MIN_LENGTH = 2;
export const FULL_NAME_MAX_LENGTH = 60;

/** DR-2: a child's name, same counting as VAL-001 but from one code point. */
export const CHILD_NAME_MIN_LENGTH = 1;
export const CHILD_NAME_MAX_LENGTH = 60;

/** VAL-040: children per user. */
export const MAX_CHILDREN = 10;

/** DR-1: the due date lies between today minus this many days and today plus this many days. */
export const DUE_DATE_DAYS_BEFORE_TODAY = 30;
export const DUE_DATE_DAYS_AFTER_TODAY = 300;

/** DR-3: a child's birth date is plausible from this day on (YYYY-MM-DD). No age floor. */
export const CHILD_BIRTH_DATE_FLOOR = '1900-01-01';

/**
 * F1.4 criterion 2: raw bounds on what a request may carry, checked on the string as received (UTF-16 units, O(1))
 * before any code-point splitting, so an oversized value is refused without being walked. Generous against the real
 * limits (60 code points a name is at most 240 units); they exist to bound work, not to validate content.
 */
export const RAW_NAME_MAX_UNITS = 600;
export const RAW_EMAIL_MAX_UNITS = 512;
export const RAW_PASSWORD_MAX_UNITS = 1024;
/** Longest short token in the step-1 body: a stage, a sex, a gender, a date part. */
export const RAW_TOKEN_MAX_UNITS = 32;

/** VAL-002: the email, in code points after trimming. */
export const EMAIL_MIN_LENGTH = 3;
export const EMAIL_MAX_LENGTH = 254;

/** VAL-003 (Afik, 14.10.2026: minimum 8). Not trimmed, no composition rule. The upper bound is F1.4 Q3, not in the SRS. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;

/**
 * Versions of the consent documents a registration records (FR-REG-004, BR-068, AC-084). Placeholders until I9
 * supplies the documents. The server reads these and the client never sends a version; each must fit the
 * legal_consents version check (1-64 characters).
 */
export const CONSENT_TERMS_VERSION = 'placeholder-0';
export const CONSENT_PRIVACY_VERSION = 'placeholder-0';
