// The admin core's requests and answers (FR-MOD-002, FR-MOD-003, FR-ADMIN-005; BR-074). The web checks what it sends and the server checks again, by
// the same rules. Every body is strict. Who may do what is the database's (RLS and the Permission Keys); nothing here decides it.
import { z } from 'zod';
import { mediaImage } from '../media/index.js';
import {
  ENFORCEMENT_KINDS,
  MODERATION_STATUSES,
  PERMISSION_KEYS,
  REPORT_RESOLUTIONS,
  REPORT_TARGET_KINDS,
  STAFF_REASON_MAX,
  SUSPENSION_EXTRA_HOURS,
  SUSPENSION_LADDER_HOURS,
  type EnforcementKind,
} from '../constants/index.js';
import { codePointLength } from './text.js';

/** A staff reason or note: trimmed, not blank, no NUL, at most STAFF_REASON_MAX code points. */
const staffText = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value !== '' && !value.includes('\u0000') && codePointLength(value) <= STAFF_REASON_MAX, 'invalid');

/** The suspension lengths staff may choose: the ladder's and the extra one (BR-074). */
const SUSPENSION_DURATIONS_HOURS: readonly number[] = [...SUSPENSION_LADDER_HOURS, SUSPENSION_EXTRA_HOURS];

const uuid = z.guid().transform((value) => value.toLowerCase());

/** POST /api/admin/reports/handle: close every open report on one target, optionally moving the content in the same step. */
export const handleReportsSchema = z.strictObject({
  targetKind: z.enum(REPORT_TARGET_KINDS),
  targetId: uuid,
  resolution: z.enum(REPORT_RESOLUTIONS),
  note: staffText.optional(),
  moderation: z.strictObject({ status: z.enum(MODERATION_STATUSES), reason: staffText }).optional(),
});
export type HandleReportsRequest = z.infer<typeof handleReportsSchema>;

/** POST /api/admin/content/moderate: move a reported post or comment among active, hidden and removed. */
export const moderateContentSchema = z.strictObject({
  targetKind: z.enum(['post', 'comment']),
  targetId: uuid,
  status: z.enum(MODERATION_STATUSES),
  reason: staffText,
});
export type ModerateContentRequest = z.infer<typeof moderateContentSchema>;

/** The report an enforcement cites: for the child-safety ban the child-safety report (an open one first), otherwise an open report (else the first). */
export function enforcementReport(reports: ReadonlyArray<{ id: string; status: string; reason: string }>): { id: string; isChildSafety: boolean } | undefined {
  const child = reports.filter((report) => report.reason === 'child_safety');
  const pick = (list: ReadonlyArray<{ id: string; status: string }>) => list.find((report) => report.status === 'open') ?? list[0];
  const chosen = child.length > 0 ? pick(child) : pick(reports);
  return chosen === undefined ? undefined : { id: chosen.id, isChildSafety: child.length > 0 };
}

/** POST /api/admin/reports/reveal: the real author of a reported anonymous post. */
export const revealAuthorSchema = z.strictObject({ postId: uuid });

/** POST /api/admin/enforcements. `durationHours` belongs to a suspension only; `childSafety` to a ban only. */
export const enforceSchema = z
  .strictObject({
    userId: uuid,
    kind: z.enum(ENFORCEMENT_KINDS),
    reason: staffText,
    durationHours: z
      .number()
      .int()
      .refine((hours) => SUSPENSION_DURATIONS_HOURS.includes(hours), 'duration')
      .optional(),
    reportId: uuid.optional(),
    childSafety: z.boolean().optional(),
  })
  .refine((v) => (v.kind === 'suspension') === (v.durationHours !== undefined), 'duration')
  .refine((v) => v.childSafety !== true || v.kind === 'ban', 'child_safety');
export type EnforceRequest = z.infer<typeof enforceSchema>;

/** GET /api/admin/audit?before=<ISO time>|<entry id>: the page after that entry (newest first); the cursor is the `next` of the previous page. */
export const auditQuerySchema = z.strictObject({
  before: z
    .string()
    .transform((value, ctx) => {
      const [at = '', entryId = '', ...rest] = value.split('|');
      if (rest.length > 0 || !z.iso.datetime({ offset: true }).safeParse(at).success || !z.guid().safeParse(entryId).success) {
        ctx.addIssue({ code: 'custom', message: 'invalid' });
        return z.NEVER;
      }
      return { at, id: entryId.toLowerCase() };
    })
    .optional(),
});

export type AdminCheck<T> = { ok: true; value: T } | { ok: false };

function check<T>(schema: z.ZodType<T>, input: unknown): AdminCheck<T> {
  const result = schema.safeParse(input);
  return result.success ? { ok: true, value: result.data } : { ok: false };
}
export const checkHandleReports = (input: unknown) => check(handleReportsSchema, input);
export const checkModerateContent = (input: unknown) => check(moderateContentSchema, input);
export const checkRevealAuthor = (input: unknown) => check(revealAuthorSchema, input);
export const checkEnforce = (input: unknown) => check(enforceSchema, input);
export const checkAuditQuery = (input: unknown) => check(auditQuerySchema, input);

/**
 * The ladder's suggestion (BR-074) from the account's violations in the last 12 months: a warning or a suspension counts one, a ban the whole
 * ladder (the database computes the same number when the action is recorded; this is what the screen shows beforehand).
 */
export function ladderSuggestion(violations: number): { kind: Extract<EnforcementKind, 'warning' | 'suspension' | 'ban'>; hours: number | null } {
  if (violations <= 0) return { kind: 'warning', hours: null };
  if (violations <= SUSPENSION_LADDER_HOURS.length) return { kind: 'suspension', hours: SUSPENSION_LADDER_HOURS[violations - 1] ?? null };
  return { kind: 'ban', hours: null };
}

/** A violation's weight in the count above. */
export function violationWeight(kind: EnforcementKind): number {
  return kind === 'warning' || kind === 'suspension' ? 1 : kind === 'ban' ? SUSPENSION_LADDER_HOURS.length + 1 : 0;
}

// ---- answers, as the web reads them ------------------------------------------------------------------------------------------

export const adminAccess = z.object({ role: z.enum(['admin', 'moderator']), permissions: z.array(z.enum(PERMISSION_KEYS)) });
export type AdminAccess = z.infer<typeof adminAccess>;
/** GET /api/admin/access: `{ staff: false }` for every other account (200, so an ordinary account sees no error), else the role and keys. */
export const adminAccessBody = z.union([z.strictObject({ staff: z.literal(false) }), adminAccess.extend({ staff: z.literal(true) })]);
export type AdminAccessBody = z.infer<typeof adminAccessBody>;

export const auditEntry = z.object({
  id: z.guid(),
  occurredAt: z.string(),
  actorRole: z.enum(['admin', 'moderator']),
  actorId: z.guid(),
  action: z.string(),
  targetKind: z.string(),
  targetId: z.guid().nullable(),
  reason: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof auditEntry>;
export const auditPageBody = z.object({ entries: z.array(auditEntry), next: z.string().nullable() });
export type AuditPage = z.infer<typeof auditPageBody>;

export const queueItem = z.object({
  targetKind: z.enum(REPORT_TARGET_KINDS),
  targetId: z.guid(),
  reportCount: z.number().int(),
  priority: z.number().int(),
  topReasonLabel: z.string(),
  isRising: z.boolean(),
  firstReportedAt: z.string(),
});
export type QueueItem = z.infer<typeof queueItem>;
export const queueBody = z.object({ items: z.array(queueItem) });

export const enforcementRow = z.object({
  kind: z.enum(ENFORCEMENT_KINDS),
  reason: z.string(),
  createdAt: z.string(),
  stepSkipped: z.boolean(),
});
export type EnforcementRow = z.infer<typeof enforcementRow>;

export const targetUser = z.object({
  userId: z.guid(),
  accountType: z.enum(['regular', 'professional', 'admin', 'moderator']),
  status: z.enum(['active', 'suspended', 'banned']),
  suspendedUntil: z.string().nullable(),
  fullName: z.string().nullable(),
  history: z.array(enforcementRow),
  suggestion: z.object({ kind: z.enum(['warning', 'suspension', 'ban']), hours: z.number().int().nullable() }),
});
export type TargetUser = z.infer<typeof targetUser>;

export const reportDetailBody = z.object({
  targetKind: z.enum(REPORT_TARGET_KINDS),
  targetId: z.guid(),
  content: z
    .object({
      text: z.string().nullable(),
      status: z.string(),
      isAnonymous: z.boolean(),
      /** I5: a reported post's images the staff member may see (with CONTENT_MODERATE and REPORTS_VIEW one that had passed can be removed). */
      images: z.array(mediaImage).optional(),
    })
    .nullable(),
  reports: z.array(z.object({ id: z.guid(), status: z.enum(['open', 'handled', 'expired']), reasonLabel: z.string(), reason: z.string(), details: z.string().nullable(), copiedText: z.string().nullable(), createdAt: z.string() })),
  user: targetUser.nullable(),
});
export type ReportDetail = z.infer<typeof reportDetailBody>;

export const userListBody = z.object({
  users: z.array(z.object({ userId: z.guid(), accountType: z.enum(['regular', 'professional', 'admin', 'moderator']), status: z.enum(['active', 'suspended', 'banned']), fullName: z.string().nullable() })),
});
export type UserList = z.infer<typeof userListBody>;

export const revealBody = z.object({ userId: z.guid(), fullName: z.string().nullable() });
export const enforceBody = z.object({ status: z.enum(['active', 'suspended', 'banned']), suspendedUntil: z.string().nullable() });

export const ADMIN_ERROR_CODES = ['invalid', 'forbidden', 'not_found', 'not_applicable', 'reason_required'] as const;
export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number];
