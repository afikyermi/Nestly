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
