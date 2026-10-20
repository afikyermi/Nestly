// Trackers, cycle and status guides (FR-TRACK-001/002, FR-HOME-003/004, OP-007, OP-008). The value lists live once here; the
// database holds the same lists in CHECK constraints.

/** The eight Trackers of a child, in the order of the home grid (FR-HOME-003). */
export const TRACKER_KINDS = ['breastfeeding', 'bottle', 'sleep', 'diaper', 'medicine', 'growth', 'vaccine', 'bath'] as const;
export type TrackerKind = (typeof TRACKER_KINDS)[number];

/** Breastfeeding: the side (FR-TRACK-002). */
export const BREASTFEEDING_SIDES = ['left', 'right'] as const;
export type BreastfeedingSide = (typeof BREASTFEEDING_SIDES)[number];

/** Diaper: wet or dirty (FR-TRACK-001). */
export const DIAPER_KINDS = ['wet', 'dirty'] as const;
export type DiaperKind = (typeof DIAPER_KINDS)[number];

/** The cycle tracker has its own page next to the eight child trackers. */
export const CYCLE_TRACKER = 'cycle';

/** Bounds of the values (the database repeats them). */
export const TRACKER_LIMITS = {
  bottleMl: { min: 1, max: 1000 },
  weightKg: { min: 0.3, max: 300 },
  heightCm: { min: 20, max: 250 },
  headCm: { min: 15, max: 80 },
  noteMaxLength: 500,
  nameMaxLength: 80,
  dosageMaxLength: 60,
  cycleLengthDays: { min: 15, max: 60 },
  /** How far ahead of the server clock an event may be, in minutes (a device clock a little ahead is not refused). */
  futureToleranceMinutes: 10,
  /** The longest period a chart or a history query covers, in days. */
  maxPeriodDays: 366,
} as const;

/** The product's time zone for days (the database stores UTC instants; days are Israeli days). */
export const TRACKER_TIME_ZONE = 'Asia/Jerusalem';

/** Status guides (FR-HOME-004, FR-ADMIN-012, BR-070). */
export const GUIDE_STAGE_KINDS = ['planning', 'pregnancy', 'parenting'] as const;
export type GuideStageKind = (typeof GUIDE_STAGE_KINDS)[number];

export const GUIDE_STATUSES = ['draft', 'published', 'hidden'] as const;
export type GuideStatus = (typeof GUIDE_STATUSES)[number];

/** Shown with every guide (FR-HOME-004, AC-095, BR-012). */
export const GUIDE_DISCLAIMER = 'המידע אינו מחליף ייעוץ רפואי';
