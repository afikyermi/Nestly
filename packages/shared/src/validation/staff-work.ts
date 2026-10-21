// The staff's work (I14 completion, Afik 21.10.2026): the Moderator's "my work", the Admin's home, the queue's time targets, escalation to the
// Admin, the Audit Log filters, and children's tracker data as trends only (CHILD_DATA_VIEW). The web checks what it sends and the server checks
// again, by the same rules. Every body is strict. Who may do what is the database's (RLS, the Permission Keys and child_tracker_trends()).
import { z } from 'zod';
import { PERMISSION_KEYS, REPORT_TARGET_KINDS } from '../constants/index.js';
import { codePointLength } from './text.js';

// ---- the queue's time targets (§9.9) ---------------------------------------------------------------------------------------------
/** Hours to handle an item: child safety (priority 1) within an hour, every other report within 24 hours (as are images in the queue). */
export const TIME_TARGET_HOURS = { childSafety: 1, other: 24 } as const;

/** The time target of a queue item, by its priority (1 = child safety). */
export function timeTargetHours(priority: number): number {
  return priority === 1 ? TIME_TARGET_HOURS.childSafety : TIME_TARGET_HOURS.other;
}

/** Whether an item waiting since `since` is past its time target at `now`. */
export function isPastTarget(since: string, targetHours: number, now: Date): boolean {
  const start = Date.parse(since);
  return Number.isFinite(start) && now.getTime() - start > targetHours * 3_600_000;
}

// ---- escalation to the Admin (§9.9) ----------------------------------------------------------------------------------------------
export const ESCALATION_NOTE_MIN = 2;
export const ESCALATION_NOTE_MAX = 500;
/** POST /api/admin/reports/escalate: a Moderator asks the Admin to decide on a target's open reports. */
export const escalateSchema = z.strictObject({
  targetKind: z.enum(REPORT_TARGET_KINDS),
  targetId: z.guid().transform((value) => value.toLowerCase()),
  note: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => !value.includes('\u0000') && codePointLength(value) >= ESCALATION_NOTE_MIN && codePointLength(value) <= ESCALATION_NOTE_MAX, 'invalid'),
});
export type EscalateRequest = z.infer<typeof escalateSchema>;

// ---- children's tracker data, trends only (§9.2) -------------------------------------------------------------------------------
/** The closed lists of child_tracker_trends() (the database refuses anything else). */
export const CHILD_TREND_METRICS = ['breastfeeding', 'bottle', 'sleep', 'diaper', 'medicine', 'growth', 'vaccine', 'bath'] as const;
export type ChildTrendMetric = (typeof CHILD_TREND_METRICS)[number];
export const CHILD_TREND_FIELDS = ['events_per_day', 'duration_minutes', 'amount_ml', 'weight_kg', 'height_cm', 'head_cm'] as const;
export type ChildTrendField = (typeof CHILD_TREND_FIELDS)[number];
export const CHILD_TREND_DIMENSIONS = ['child_age', 'child_sex', 'week', 'month'] as const;
export type ChildTrendDimension = (typeof CHILD_TREND_DIMENSIONS)[number];
export const CHILD_TREND_PERIODS = [30, 90, 365] as const;
export type ChildTrendPeriod = (typeof CHILD_TREND_PERIODS)[number];
/** A cell is shown only with at least this many children, of at least this many families (OP-052). */
export const CHILD_TREND_MIN_CHILDREN = 10;

/** The fields each metric offers (events per day for every one). */
export const CHILD_TREND_FIELDS_BY_METRIC: Readonly<Record<ChildTrendMetric, readonly ChildTrendField[]>> = {
  breastfeeding: ['events_per_day', 'duration_minutes'],
  bottle: ['events_per_day', 'amount_ml'],
  sleep: ['events_per_day', 'duration_minutes'],
  diaper: ['events_per_day'],
  medicine: ['events_per_day'],
  growth: ['events_per_day', 'weight_kg', 'height_cm', 'head_cm'],
  vaccine: ['events_per_day'],
  bath: ['events_per_day'],
};

/** GET /api/admin/child-trends?metric=&field=&dimension=&days= */
export const childTrendsQuerySchema = z
  .strictObject({
    metric: z.enum(CHILD_TREND_METRICS),
    field: z.enum(CHILD_TREND_FIELDS),
    dimension: z.enum(CHILD_TREND_DIMENSIONS),
    days: z.enum(['30', '90', '365']).transform((value): ChildTrendPeriod => (value === '30' ? 30 : value === '90' ? 90 : 365)),
  })
  .refine((value) => CHILD_TREND_FIELDS_BY_METRIC[value.metric].includes(value.field), 'field');
export type ChildTrendsQuery = z.infer<typeof childTrendsQuerySchema>;

export const childTrendCell = z.strictObject({
  bucket: z.string(),
  order: z.number().int(),
  /** NULL when suppressed (fewer than 10 children or 10 families). */
  children: z.number().int().nullable(),
  value: z.number().nullable(),
  suppressed: z.boolean(),
});
export type ChildTrendCell = z.infer<typeof childTrendCell>;
export const childTrendsBody = z.strictObject({
  metric: z.enum(CHILD_TREND_METRICS),
  field: z.enum(CHILD_TREND_FIELDS),
  dimension: z.enum(CHILD_TREND_DIMENSIONS),
  days: z.union([z.literal(30), z.literal(90), z.literal(365)]),
  cells: z.array(childTrendCell),
});
export type ChildTrends = z.infer<typeof childTrendsBody>;

// ---- the Audit Log filters (§9.10) -----------------------------------------------------------------------------------------------
/** The sensitive events: reveals and openings of private content, children's data, permissions, the gravest enforcement, suspicions. */
export const SENSITIVE_AUDIT_ACTIONS = [
  'author_revealed',
  'private_group_content_viewed',
  'private_group_viewed',
  'reported_message_viewed',
  'child_data_queried',
  'permission_granted',
  'permission_revoked',
  'moderator_invited',
  'moderator_invitation_revoked',
  'moderator_joined',
  'user_ban',
  'user_unban',
  'media_suspected',
  'report_escalated',
] as const;
export const AUDIT_ROLES = ['admin', 'moderator'] as const;
const auditDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'invalid');
/** The filters of GET /api/admin/audit (with `before`, the page cursor of admin.ts). */
export const auditFiltersSchema = z.strictObject({
  action: z.string().regex(/^[a-z][a-z_]{2,59}$/).optional(),
  role: z.enum(AUDIT_ROLES).optional(),
  targetKind: z.string().regex(/^[a-z][a-z_]{1,39}$/).optional(),
  from: auditDay.optional(),
  to: auditDay.optional(),
  sensitive: z.enum(['true']).optional(),
});
export type AuditFilters = z.infer<typeof auditFiltersSchema>;

// ---- answers -------------------------------------------------------------------------------------------------------------------
export const workItem = z.strictObject({
  targetKind: z.enum(REPORT_TARGET_KINDS),
  targetId: z.guid(),
  priority: z.number().int(),
  waitingSince: z.string(),
  timeTargetHours: z.number().int(),
  pastTarget: z.boolean(),
});
export type WorkItem = z.infer<typeof workItem>;

/** GET /api/admin/my-work: the counts of the areas the keys cover (an area it cannot see is absent), and the oldest waiting report. */
export const myWorkBody = z.strictObject({
  permissions: z.array(z.enum(PERMISSION_KEYS)),
  counters: z.strictObject({
    openReports: z.number().int().optional(),
    childSafetyReports: z.number().int().optional(),
    pastTargetReports: z.number().int().optional(),
    escalatedReports: z.number().int().optional(),
    queuedImages: z.number().int().optional(),
    openSupport: z.number().int().optional(),
  }),
  oldest: workItem.nullable(),
  next: workItem.nullable(),
});
export type MyWork = z.infer<typeof myWorkBody>;

export const teamSnapshotRow = z.strictObject({
  userId: z.guid(),
  label: z.string().nullable(),
  status: z.enum(['active', 'suspended', 'banned']),
  keyCount: z.number().int(),
  lastActionAt: z.string().nullable(),
  actionsThisWeek: z.number().int(),
});
export const metricPair = z.strictObject({
  key: z.enum(['registrations', 'posts', 'comments', 'reports', 'enforcements', 'support']),
  current: z.number().int(),
  previous: z.number().int(),
});
/** GET /api/admin/overview (the Admin): what needs attention now, the week against the week before, and the team. */
export const adminOverviewBody = z.strictObject({
  childSafetyOpen: z.number().int(),
  attention: z.strictObject({
    openReports: z.number().int(),
    pastTargetReports: z.number().int(),
    escalatedReports: z.number().int(),
    queuedImages: z.number().int(),
    openSupport: z.number().int(),
    openInvitations: z.number().int(),
    expiringInvitations: z.number().int(),
    guidesToRecheck: z.number().int(),
    reportSpike: z.strictObject({ lastDay: z.number().int(), dailyAverage: z.number(), isSpike: z.boolean() }),
  }),
  metrics: z.array(metricPair),
  team: z.array(teamSnapshotRow),
});
export type AdminOverview = z.infer<typeof adminOverviewBody>;
/** A spike: the last 24 hours hold at least this many reports and at least twice the daily average of the 7 days before (OP-052). */
export const REPORT_SPIKE_MIN = 5;
/** A published guide whose sources were last checked this many months ago or more is due for a recheck (OP-052). */
export const GUIDE_RECHECK_MONTHS = 12;
/** An open invitation expiring within this many hours is "expiring". */
export const INVITATION_EXPIRING_HOURS = 12;

// ---- the report's context, author card and handling status (§9.7, §9.10) ----------------------------------------------------------
export const contextComment = z.strictObject({
  id: z.guid(),
  parentId: z.guid().nullable(),
  text: z.string().nullable(),
  status: z.string(),
  isAnonymous: z.boolean(),
  createdAt: z.string(),
  isReported: z.boolean(),
});
export const reportContextBody = z.strictObject({
  /** For a comment: its post as it is now. */
  post: z.strictObject({ id: z.guid(), text: z.string().nullable(), status: z.string(), isAnonymous: z.boolean() }).nullable(),
  /** The thread: the comments of the post (of the reported post, or of the reported comment's post), oldest first. */
  comments: z.array(contextComment),
});
export type ReportContext = z.infer<typeof reportContextBody>;
export const authorCard = z.strictObject({
  accountAgeDays: z.number().int(),
  /** Enforcement steps of the last 12 months. */
  enforcementsLastYear: z.number().int(),
});
export type AuthorCard = z.infer<typeof authorCard>;
export const handlingStatus = z.strictObject({
  /** label: the Moderator's invitation note where the caller (the Admin) reads it; isMe: the caller itself. */
  openings: z.array(z.strictObject({ label: z.string().nullable(), isMe: z.boolean(), at: z.string() })),
  escalation: z.strictObject({ note: z.string(), at: z.string(), label: z.string().nullable(), isMe: z.boolean() }).nullable(),
});
export type HandlingStatus = z.infer<typeof handlingStatus>;

export type StaffWorkCheck<T> = { ok: true; value: T } | { ok: false };
function check<T>(schema: z.ZodType<T>, input: unknown): StaffWorkCheck<T> {
  const result = schema.safeParse(input);
  return result.success ? { ok: true, value: result.data } : { ok: false };
}
export const checkEscalate = (input: unknown) => check(escalateSchema, input);
export const checkChildTrendsQuery = (input: unknown) => check(childTrendsQuerySchema, input);
export const checkAuditFilters = (input: unknown) => check(auditFiltersSchema, input);
