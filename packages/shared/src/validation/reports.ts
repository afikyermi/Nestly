// File a report (I3 F3.7; FR-MOD-001, UC-26, AC-106). The web checks what it sends and the server checks again, by the same rule. The body is
// strict: `reporterId`, `status`, `postId` and every other key are refused, because the reporter is the caller's by the database and a report
// has no state a client may set. Nothing about a report is ever read back: the answer to a filed one is `{ received: true }` and no more.
import { z } from 'zod';
import { CUSTOM_REPORT_REASON, REPORT_DETAILS_MAX, REPORT_REASONS, REPORT_TARGET_KINDS, type ReportReason, type ReportTargetKind } from '../constants/index.js';
import { codePointLength } from './text.js';

/** What is wrong with a report text, by the rule the server applies to the trimmed text: a NUL (Postgres text cannot hold it), or too long. */
export function reportDetailsProblem(text: string): 'invalid' | 'long' | null {
  const value = text.trim();
  if (value.includes('\u0000')) return 'invalid';
  return codePointLength(value) > REPORT_DETAILS_MAX ? 'long' : null;
}

/** Trimmed; blank is null (reports_details_check); no NUL; at most REPORT_DETAILS_MAX code points. */
const reportDetails = z
  .string()
  .refine((value) => reportDetailsProblem(value) === null, 'invalid')
  .transform((value) => {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });

/** POST /api/reports: `{ targetKind, targetId, reason, details? }` and nothing else. `targetId` is a post, comment or user id by the kind. */
export const createReportSchema = z.strictObject({
  targetKind: z.enum(REPORT_TARGET_KINDS),
  targetId: z.guid(),
  // a core reason, or one the community settings added (FR-ADMIN-007); the database refuses an unknown or switched-off one
  reason: z.union([z.enum(REPORT_REASONS), z.custom<`custom_${string}`>((value) => typeof value === 'string' && CUSTOM_REPORT_REASON.test(value))]),
  details: reportDetails.optional(),
});

export interface ReportWrite {
  readonly targetKind: ReportTargetKind;
  /** Lower case. */
  readonly targetId: string;
  readonly reason: ReportReason;
  /** Trimmed, or null when absent or blank. */
  readonly details: string | null;
}

/** `invalid`: a shape, key, reason or text problem (400). `details_required`: the reason is `other` and there is no text (400). */
export type ReportWriteCheck = { ok: true; value: ReportWrite } | { ok: false; reason: 'invalid' | 'details_required' };

export function checkCreateReport(input: unknown): ReportWriteCheck {
  const result = createReportSchema.safeParse(input);
  if (!result.success) return { ok: false, reason: 'invalid' };
  const { targetKind, targetId, reason, details = null } = result.data;
  if (reason === 'other' && details === null) return { ok: false, reason: 'details_required' };
  return { ok: true, value: { targetKind, targetId: targetId.toLowerCase(), reason, details } };
}

/**
 * What a refused report answers: 400 `invalid` | `details_required`, 404 `unavailable` (a post or comment the reporter cannot read or wrote,
 * an unknown id, their own account: one body for every reason), 409 `already_reported` (the same reporter and target again).
 */
export const REPORT_ERROR_CODES = ['invalid', 'details_required', 'unavailable', 'already_reported'] as const;
export type ReportErrorCode = (typeof REPORT_ERROR_CODES)[number];

/** The body of a refused report, as the web reads it. Any other code (the session guard's included) is not one of these. */
export const reportErrorBody = z.object({ error: z.enum(REPORT_ERROR_CODES) });

/** The body of a filed report (201): this, and nothing else. */
export const reportReceivedBody = z.strictObject({ received: z.literal(true) });
