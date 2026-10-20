// The admin core's reads and writes (FR-MOD-002, FR-MOD-003, FR-ADMIN-005; migrations 20261020300000, 20261020400000). Runs inside the caller's
// identity transaction and nowhere else. Permission is the database's: the staff policies show a Permission-Key holder the rows it may read,
// the triggers decide every move (content_hold, users_status_guard, reports_handle_guard) and write the Audit entry. An id in a `where`
// below names the row, a key and never a filter for permission. `nestly.audit_reason` (rule 18) carries the Actor's reason to the trigger.

import {
  PERMISSION_KEYS,
  ladderSuggestion,
  violationWeight,
  type AuditEntry,
  type EnforceRequest,
  type EnforcementRow,
  type ModerationStatus,
  type PermissionKey,
  type QueueItem,
  type ReportResolution,
  type ReportTargetKind,
  type TargetUser,
  type UserList,
} from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);
const isoUs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`);
const keyList = sql.join(
  PERMISSION_KEYS.map((key) => sql`${key}`),
  sql`, `,
);

/** The caller's staff role and the Permission Keys it holds (has_permission answers for the caller only). */
export async function readStaffAccess(tx: IdentityTx): Promise<{ role: 'admin' | 'moderator'; permissions: PermissionKey[] } | undefined> {
  const roleRows = z.array(z.object({ role: z.enum(['admin', 'moderator']).nullable() })).parse(await tx.execute(sql`select nestly.caller_staff_role() as role`));
  const role = roleRows[0]?.role ?? null;
  if (role === null) return undefined;
  const rows = z
    .array(z.object({ key: z.enum(PERMISSION_KEYS) }))
    .parse(await tx.execute(sql`select k as key from unnest(array[${keyList}]::text[]) as k where nestly.has_permission(k) order by k`));
  return { role, permissions: rows.map((row) => row.key) };
}

/** One page of the Audit Log, newest first; `before` is the (time, id) key of the last entry of the previous page, so entries written in one
 * transaction (one time) are never skipped. */
export async function readAuditPage(tx: IdentityTx, before: { at: string; id: string } | undefined, limit: number): Promise<{ entries: AuditEntry[]; cursors: string[] }> {
  const rows = z
    .array(
      z.object({
        id: z.guid(),
        occurredAt: z.string(),
        cursor: z.string(),
        actorRole: z.enum(['admin', 'moderator']),
        actorId: z.guid(),
        action: z.string(),
        targetKind: z.string(),
        targetId: z.guid().nullable(),
        reason: z.string().nullable(),
      }),
    )
    .parse(
      await tx.execute(sql`
        select a.id, to_char(a.occurred_at at time zone 'UTC', ${isoMs}) as "occurredAt", to_char(a.occurred_at at time zone 'UTC', ${isoUs}) as cursor,
               a.actor_role as "actorRole", a.actor_id as "actorId", a.action, a.target_kind as "targetKind", a.target_id as "targetId", a.reason
        from nestly.audit_log a
        where ${before === undefined ? sql`true` : sql`(a.occurred_at, a.id) < (${before.at}::timestamptz, ${before.id}::uuid)`}
        order by a.occurred_at desc, a.id desc
        limit ${limit}`),
    );
  return {
    entries: rows.map((row) => ({ id: row.id, occurredAt: row.occurredAt, actorRole: row.actorRole, actorId: row.actorId, action: row.action, targetKind: row.targetKind, targetId: row.targetId, reason: row.reason })),
    cursors: rows.map((row) => `${row.cursor}|${row.id}`),
  };
}

/**
 * The moderation queue (FR-MOD-003, BR-074): one item per open target. Priority is the best (lowest) priority among its reasons; a post with 3
 * reports or more rises one level, never above priority 2, and stays visible (the count is people: one report per person and target). Child safety
 * is priority 1 and always first; ties go to the oldest report.
 */
export async function readQueue(tx: IdentityTx): Promise<QueueItem[]> {
  const rows = z
    .array(
      z.object({
        targetKind: z.enum(['post', 'comment', 'user']),
        targetId: z.guid(),
        reportCount: z.number().int(),
        basePriority: z.number().int(),
        topReasonLabel: z.string(),
        firstReportedAt: z.string(),
      }),
    )
    .parse(
      await tx.execute(sql`
        select r.target_kind as "targetKind", coalesce(r.post_id, r.comment_id, r.reported_user_id) as "targetId",
               count(*)::int as "reportCount", min(rr.priority)::int as "basePriority",
               (array_agg(rr.label order by rr.priority, r.created_at))[1] as "topReasonLabel",
               to_char(min(r.created_at) at time zone 'UTC', ${isoMs}) as "firstReportedAt"
        from nestly.reports r
        join nestly.report_reasons rr on rr.key = r.reason
        where r.status = 'open' and coalesce(r.post_id, r.comment_id, r.reported_user_id) is not null
        group by r.target_kind, coalesce(r.post_id, r.comment_id, r.reported_user_id)
        order by case when min(rr.priority) = 1 then 1
                      else greatest(2, min(rr.priority) - case when r.target_kind = 'post' and count(*) >= 3 then 1 else 0 end) end,
                 min(r.created_at), 2`),
    );
  return rows
    .map((row) => {
      // Rising never reaches priority 1: that level is child safety's alone (AC-106).
      const isRising = row.targetKind === 'post' && row.reportCount >= 3 && row.basePriority > 2;
      return {
        targetKind: row.targetKind,
        targetId: row.targetId,
        reportCount: row.reportCount,
        priority: isRising ? row.basePriority - 1 : row.basePriority,
        topReasonLabel: row.topReasonLabel,
        isRising,
        firstReportedAt: row.firstReportedAt,
      };
    });
}

export interface ReportRow {
  id: string;
  status: 'open' | 'handled' | 'expired';
  reason: string;
  reasonLabel: string;
  details: string | null;
  copiedText: string | null;
  createdAt: string;
}

/** Every report (open or closed) on one target, oldest first. */
export async function readReportsOn(tx: IdentityTx, kind: ReportTargetKind, targetId: string): Promise<ReportRow[]> {
  const column = kind === 'post' ? sql`r.post_id` : kind === 'comment' ? sql`r.comment_id` : sql`r.reported_user_id`;
  return z
    .array(
      z.object({
        id: z.guid(),
        status: z.enum(['open', 'handled', 'expired']),
        reason: z.string(),
        reasonLabel: z.string(),
        details: z.string().nullable(),
        copiedText: z.string().nullable(),
        createdAt: z.string(),
      }),
    )
    .parse(
      await tx.execute(sql`
        select r.id, r.status, r.reason, rr.label as "reasonLabel", r.details, r.target_text as "copiedText",
               to_char(r.created_at at time zone 'UTC', ${isoMs}) as "createdAt"
        from nestly.reports r join nestly.report_reasons rr on rr.key = r.reason
        where ${column} = ${targetId}::uuid
        order by r.created_at, r.id`),
    );
}

export interface ContentRow {
  text: string | null;
  status: string;
  isAnonymous: boolean;
  authorId: string | null;
}

/** The reported post or comment as staff may read it (a report must exist on it). */
export async function readContent(tx: IdentityTx, kind: 'post' | 'comment', id: string): Promise<ContentRow | undefined> {
  const query =
    kind === 'post'
      ? sql`select p.body as text, p.status, p.is_anonymous as "isAnonymous", p.author_id as "authorId" from nestly.posts p where p.id = ${id}::uuid`
      : sql`select c.body as text, c.status, (c.author_id is null) as "isAnonymous", c.author_id as "authorId" from nestly.comments c where c.id = ${id}::uuid`;
  const rows = z
    .array(z.object({ text: z.string().nullable(), status: z.string(), isAnonymous: z.boolean(), authorId: z.guid().nullable() }))
    .parse(await tx.execute(query));
  return rows[0];
}

/** An account as staff with USER_VIEW may read it: type, status, name, and its enforcement history (newest first). */
export async function readTargetUser(tx: IdentityTx, userId: string): Promise<TargetUser | undefined> {
  await enableStaffView(tx);
  const users = z
    .array(
      z.object({
        accountType: z.enum(['regular', 'professional', 'admin', 'moderator']),
        status: z.enum(['active', 'suspended', 'banned']),
        suspendedUntil: z.string().nullable(),
        fullName: z.string().nullable(),
      }),
    )
    .parse(
      await tx.execute(sql`
        select u.account_type as "accountType", u.status, to_char(u.suspended_until at time zone 'UTC', ${isoMs}) as "suspendedUntil", n.full_name as "fullName"
        from nestly.users u left join nestly.regular_names n on n.user_id = u.id
        where u.id = ${userId}::uuid`),
    );
  const user = users[0];
  if (user === undefined) return undefined;
  const history = z
    .array(z.object({ kind: z.enum(['warning', 'suspension', 'reinstate', 'ban', 'unban']), reason: z.string(), createdAt: z.string(), stepSkipped: z.boolean(), recent: z.boolean() }))
    .parse(
      await tx.execute(sql`
        select e.kind, e.reason, to_char(e.created_at at time zone 'UTC', ${isoMs}) as "createdAt", e.is_step_skipped as "stepSkipped",
               (e.created_at > now() - interval '12 months') as recent
        from nestly.user_enforcements e
        where e.user_id = ${userId}::uuid
        order by e.created_at desc, e.id desc`),
    );
  const violations = history.filter((row) => row.recent).reduce((sum, row) => sum + violationWeight(row.kind), 0);
  const rows: EnforcementRow[] = history.map((row) => ({ kind: row.kind, reason: row.reason, createdAt: row.createdAt, stepSkipped: row.stepSkipped }));
  return { userId, ...user, history: rows, suggestion: ladderSuggestion(violations) };
}

/** Accounts for the user list: newest first, optionally by a part of the name (Regular accounts have one). */
export async function readUsers(tx: IdentityTx, search: string): Promise<UserList['users']> {
  await enableStaffView(tx);
  return z
    .array(
      z.object({
        userId: z.guid(),
        accountType: z.enum(['regular', 'professional', 'admin', 'moderator']),
        status: z.enum(['active', 'suspended', 'banned']),
        fullName: z.string().nullable(),
      }),
    )
    .parse(
      await tx.execute(sql`
        select u.id as "userId", u.account_type as "accountType", u.status, n.full_name as "fullName"
        from nestly.users u left join nestly.regular_names n on n.user_id = u.id
        where n.full_name ilike ${'%' + search.replace(/[%_\\]/g, '\\$&') + '%'}
        order by u.created_at desc, u.id
        limit 50`),
    );
}

/** Names the purpose of the admin screens (nestly.staff_view): only then do the staff policies show accounts and names to a Permission-Key holder. */
export async function enableStaffView(tx: IdentityTx): Promise<void> {
  await tx.execute(sql`select set_config('nestly.staff_view', 'on', true)`);
}

/** Sets the Actor's reason for the audit trigger (transaction-local, rule 18). */
export async function setAuditReason(tx: IdentityTx, reason: string): Promise<void> {
  await tx.execute(sql`select set_config('nestly.audit_reason', ${reason}, true)`);
}

/** Moves a reported post or comment. Returns the rows moved: 0 when the policies show the caller no such reported row. */
export async function moveContent(tx: IdentityTx, kind: 'post' | 'comment', id: string, status: ModerationStatus): Promise<number> {
  const rows =
    kind === 'post'
      ? await tx.execute(sql`update nestly.posts set status = ${status} where id = ${id}::uuid returning id`)
      : await tx.execute(sql`update nestly.comments set status = ${status} where id = ${id}::uuid returning id`);
  return rows.length;
}

/** Closes every open report on one target. Returns the number closed. */
export async function closeReports(
  tx: IdentityTx,
  kind: ReportTargetKind,
  targetId: string,
  resolution: ReportResolution,
  note: string | undefined,
): Promise<number> {
  const column = kind === 'post' ? sql`post_id` : kind === 'comment' ? sql`comment_id` : sql`reported_user_id`;
  const rows = await tx.execute(
    sql`update nestly.reports set status = 'handled', resolution = ${resolution}, handler_note = ${note ?? null}
        where ${column} = ${targetId}::uuid and status = 'open' returning id`,
  );
  return rows.length;
}

/** Whether the caller can see an open report on the target (REPORTS_VIEW reads reports): tells a refused move from a missing target. */
export async function hasOpenReports(tx: IdentityTx, kind: ReportTargetKind, targetId: string): Promise<boolean> {
  const column = kind === 'post' ? sql`r.post_id` : kind === 'comment' ? sql`r.comment_id` : sql`r.reported_user_id`;
  const rows = z
    .array(z.object({ found: z.boolean() }))
    .parse(await tx.execute(sql`select exists (select 1 from nestly.reports r where ${column} = ${targetId}::uuid and r.status = 'open') as found`));
  return rows[0]?.found ?? false;
}

/** The audited reveal of an anonymous post's author (rule 19). */
export async function revealAuthor(tx: IdentityTx, postId: string): Promise<{ userId: string; fullName: string | null }> {
  const rows = z
    .array(z.object({ userId: z.guid(), fullName: z.string().nullable() }))
    .parse(await tx.execute(sql`select user_id as "userId", full_name as "fullName" from nestly.reveal_post_author(${postId}::uuid)`));
  const row = rows[0];
  if (row === undefined) throw new Error('reveal returned no row');
  return row;
}

/** FR-ADMIN-013: records a release of the account's recovery lock; the policy allows the Admin only, and the audit trigger writes the entry. */
export async function insertRecoveryRelease(tx: IdentityTx, userId: string, reason: string | undefined): Promise<void> {
  await tx.execute(sql`insert into nestly.recovery_lock_releases (user_id, reason) values (${userId}::uuid, ${reason ?? null})`);
}

/** Records one enforcement action; the triggers apply the status change and write the Audit entry. */
export async function insertEnforcement(tx: IdentityTx, request: EnforceRequest): Promise<void> {
  await enableStaffView(tx);
  await tx.execute(
    sql`insert into nestly.user_enforcements (user_id, kind, reason, duration_hours, report_id, is_child_safety)
        values (${request.userId}::uuid, ${request.kind}, ${request.reason}, ${request.durationHours ?? null}, ${request.reportId ?? null}::uuid, ${request.childSafety ?? false})`,
  );
}
