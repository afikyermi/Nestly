// The staff's work (I14 completion, Afik 21.10.2026; migration 20261022800000): escalations, openings, the report's context, the counts of
// "my work" and the Admin's home, the Audit Log filters and children's tracker trends. Runs inside the caller's identity transaction and nowhere
// else. Permission is the database's: every count below reads through the caller's own policies (a key it lacks shows it nothing), the trends
// come from child_tracker_trends() alone (CHILD_DATA_VIEW, closed lists, cells of at least 10 children of 10 families, audited), and an id in a
// `where` names a row, never a filter for permission.

import {
  SENSITIVE_AUDIT_ACTIONS,
  type AuditEntry,
  type AuditFilters,
  type ChildTrendCell,
  type ChildTrendsQuery,
  type ReportContext,
  type ReportTargetKind,
} from '@nestly/shared';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);
const isoUs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`);
const count = z.coerce.number().int();
const COLUMNS: Readonly<Record<ReportTargetKind, string>> = {
  post: 'post_id',
  comment: 'comment_id',
  user: 'reported_user_id',
  message: 'message_id',
  review: 'review_id',
  article: 'article_id',
  listing: 'listing_id',
};
const column = (kind: ReportTargetKind) => sql.raw(`r.${COLUMNS[kind]}`);
const targetOf = sql.raw('coalesce(r.post_id, r.comment_id, r.reported_user_id, r.message_id, r.review_id, r.article_id, r.listing_id)');

async function one(tx: IdentityTx, statement: SQL): Promise<number> {
  const rows = z.array(z.object({ n: count })).parse(await tx.execute(statement));
  return rows[0]?.n ?? 0;
}

// ---- escalations and openings --------------------------------------------------------------------------------------------------

/** Escalates the oldest open report on a target to the Admin (report_escalations_insert_moderator decides who may). Returns whether one was. */
export async function insertEscalation(tx: IdentityTx, kind: ReportTargetKind, targetId: string, note: string): Promise<boolean> {
  const rows = await tx.execute(sql`
    insert into nestly.report_escalations (report_id, note)
    select r.id, ${note} from nestly.reports r where ${column(kind)} = ${targetId}::uuid and r.status = 'open' order by r.created_at, r.id limit 1
    returning id`);
  return rows.length > 0;
}

/** Records that the caller opened the open reports on a target (once each; report_openings_insert_staff decides who may). */
export async function recordOpenings(tx: IdentityTx, kind: ReportTargetKind, targetId: string): Promise<void> {
  await tx.execute(sql`
    insert into nestly.report_openings (report_id)
    select r.id from nestly.reports r where ${column(kind)} = ${targetId}::uuid and r.status = 'open'
    on conflict do nothing`);
}

export interface HandlingRows {
  openings: Array<{ label: string | null; isMe: boolean; at: string }>;
  escalation: { note: string; at: string; label: string | null; isMe: boolean } | null;
}

/** Who opened the target's reports and its escalation, with the Moderator's invitation note where the caller (the Admin) reads it. */
export async function readHandling(tx: IdentityTx, kind: ReportTargetKind, targetId: string): Promise<HandlingRows> {
  const openings = z
    .array(z.object({ label: z.string().nullable(), isMe: z.boolean(), at: z.string() }))
    .parse(
      await tx.execute(sql`
        select i.note as label, (o.opened_by = auth.uid()) as "isMe", to_char(min(o.opened_at) at time zone 'UTC', ${isoMs}) as at
        from nestly.report_openings o
        join nestly.reports r on r.id = o.report_id
        left join nestly.moderator_invitations i on i.accepted_by = o.opened_by
        where ${column(kind)} = ${targetId}::uuid and r.status = 'open'
        group by o.opened_by, i.note
        order by min(o.opened_at)`),
    );
  const escalations = z
    .array(z.object({ note: z.string(), at: z.string(), label: z.string().nullable(), isMe: z.boolean() }))
    .parse(
      await tx.execute(sql`
        select e.note, to_char(e.created_at at time zone 'UTC', ${isoMs}) as at, i.note as label, (e.escalated_by = auth.uid()) as "isMe"
        from nestly.report_escalations e
        join nestly.reports r on r.id = e.report_id
        left join nestly.moderator_invitations i on i.accepted_by = e.escalated_by
        where ${column(kind)} = ${targetId}::uuid and r.status = 'open'
        order by e.created_at desc limit 1`),
    );
  return { openings, escalation: escalations[0] ?? null };
}

/** Per open target: whether it is escalated and how many staff members opened it (the queue's handling marks). */
export async function readQueueMarks(tx: IdentityTx): Promise<Map<string, { escalated: boolean; openedBy: number }>> {
  const rows = z
    .array(z.object({ target: z.guid(), escalated: z.boolean(), openedBy: count }))
    .parse(
      await tx.execute(sql`
        with open_reports as (
          select r.id, ${targetOf} as target from nestly.reports r where r.status = 'open' and ${targetOf} is not null
        )
        select t.target,
               bool_or(exists (select 1 from nestly.report_escalations e where e.report_id = t.id)) as escalated,
               count(distinct o.opened_by) as "openedBy"
        from open_reports t
        left join nestly.report_openings o on o.report_id = t.id
        group by t.target`),
    );
  return new Map(rows.map((row) => [row.target, { escalated: row.escalated, openedBy: row.openedBy }]));
}

// ---- the report's context (§9.7) ----------------------------------------------------------------------------------------------

const CONTEXT_COMMENTS = 100;

/**
 * The context of a reported post as the caller's policies show it: its thread (oldest first, the reported comments marked). A reported comment
 * or chat message has no context: staff see only the reported item, also after its report closed (Afik 21.10.2026, decision 10.9, AC-161).
 */
export async function readReportContext(tx: IdentityTx, postId: string): Promise<ReportContext> {
  const comments = z
    .array(z.object({ id: z.guid(), parentId: z.guid().nullable(), text: z.string().nullable(), status: z.string(), isAnonymous: z.boolean(), createdAt: z.string(), isReported: z.boolean() }))
    .parse(
      await tx.execute(sql`
        select c.id, c.parent_id as "parentId", c.body as text, c.status, (c.author_id is null) as "isAnonymous",
               to_char(c.created_at at time zone 'UTC', ${isoMs}) as "createdAt",
               exists (select 1 from nestly.reports r where r.comment_id = c.id) as "isReported"
        from nestly.comments c
        where c.post_id = ${postId}::uuid and c.status <> 'deleted'
        order by c.created_at, c.id
        limit ${CONTEXT_COMMENTS}`),
    );
  return { post: null, comments };
}

/** The author card's extra facts (USER_VIEW, on the admin screens): the account's age in days and its enforcement steps of the last 12 months. */
export async function readAuthorFacts(tx: IdentityTx, userId: string): Promise<{ accountAgeDays: number; enforcementsLastYear: number } | undefined> {
  await tx.execute(sql`select set_config('nestly.staff_view', 'on', true)`);
  const rows = z
    .array(z.object({ days: count, recent: count }))
    .parse(
      await tx.execute(sql`
        select floor(extract(epoch from now() - u.created_at) / 86400)::int as days,
               (select count(*) from nestly.user_enforcements e
                 where e.user_id = u.id and e.kind in ('warning', 'suspension', 'ban') and e.created_at > now() - interval '12 months') as recent
        from nestly.users u where u.id = ${userId}::uuid`),
    );
  const row = rows[0];
  return row === undefined ? undefined : { accountAgeDays: row.days, enforcementsLastYear: row.recent };
}

// ---- the counts (my work, the Admin's home) ----------------------------------------------------------------------------------

/** Open targets whose best reason is child safety (priority 1). */
export async function countChildSafetyTargets(tx: IdentityTx): Promise<number> {
  return one(tx, sql`select count(distinct ${targetOf}) as n from nestly.reports r join nestly.report_reasons rr on rr.key = r.reason
                     where r.status = 'open' and rr.priority = 1 and ${targetOf} is not null`);
}

/** Open targets with an escalation on an open report. */
export async function countEscalatedTargets(tx: IdentityTx): Promise<number> {
  return one(tx, sql`select count(distinct ${targetOf}) as n from nestly.reports r
                     where r.status = 'open' and exists (select 1 from nestly.report_escalations e where e.report_id = r.id)`);
}

export async function countQueuedImages(tx: IdentityTx): Promise<number> {
  return one(tx, sql`select count(*) as n from nestly.media_assets where status = 'queued'`);
}

/** Open or in-progress Support requests (SUPPORT_VIEW reads them on the admin screens only). */
export async function countOpenSupport(tx: IdentityTx): Promise<number> {
  await tx.execute(sql`select set_config('nestly.staff_view', 'on', true)`);
  return one(tx, sql`select count(*) as n from nestly.support_requests where status in ('open', 'in_progress')`);
}

/** The Admin's open invitations (the "expiring" card was cancelled, Afik 21.10.2026 §11.8). */
export async function countOpenInvitations(tx: IdentityTx): Promise<number> {
  return one(tx, sql`select count(*) as n from nestly.moderator_invitations where accepted_by is null and revoked_at is null and expires_at > now()`);
}

/** The Admin's guides that wait: drafts to approve only (OP-057 closed, Afik 21.10.2026 §11.8: no source-recheck rule). */
export async function countDraftGuides(tx: IdentityTx): Promise<number> {
  return one(tx, sql`select count(*) as n from nestly.status_guides where status = 'draft'`);
}

/** Reports filed in the last 24 hours, and in the 7 days before them. */
export async function readReportPace(tx: IdentityTx): Promise<{ lastDay: number; weekBefore: number }> {
  const rows = z
    .array(z.object({ lastDay: count, weekBefore: count }))
    .parse(
      await tx.execute(sql`
        select count(*) filter (where created_at > now() - interval '1 day') as "lastDay",
               count(*) filter (where created_at <= now() - interval '1 day' and created_at > now() - interval '8 days') as "weekBefore"
        from nestly.reports where created_at > now() - interval '8 days'`),
    );
  return rows[0] ?? { lastDay: 0, weekBefore: 0 };
}

/** The Admin's metrics row: this week against the week before (counts only, on the analytics reads: nestly.analytics_view). */
export async function readWeekMetrics(tx: IdentityTx): Promise<Array<{ key: 'registrations' | 'posts' | 'comments' | 'reports' | 'enforcements' | 'support'; current: number; previous: number }>> {
  await tx.execute(sql`select set_config('nestly.analytics_view', 'on', true)`);
  const pair = (table: string, extra = '') =>
    sql.raw(`select count(*) filter (where created_at > now() - interval '7 days') as current,
                    count(*) filter (where created_at <= now() - interval '7 days' and created_at > now() - interval '14 days') as previous
             from nestly.${table} where created_at > now() - interval '14 days' ${extra === '' ? '' : `and ${extra}`}`);
  const read = async (statement: SQL) => z.array(z.object({ current: count, previous: count })).parse(await tx.execute(statement))[0] ?? { current: 0, previous: 0 };
  const result = [
    { key: 'registrations' as const, ...(await read(pair('users', "account_type in ('regular', 'professional')"))) },
    { key: 'posts' as const, ...(await read(pair('posts'))) },
    { key: 'comments' as const, ...(await read(pair('comments'))) },
    { key: 'reports' as const, ...(await read(pair('reports'))) },
    { key: 'enforcements' as const, ...(await read(pair('user_enforcements', "kind in ('warning', 'suspension', 'ban')"))) },
    { key: 'support' as const, ...(await read(pair('support_requests'))) },
  ];
  await tx.execute(sql`select set_config('nestly.analytics_view', '', true)`);
  return result;
}

/** The team's recent work, from the Audit Log the Admin reads: each staff member's last action and its actions in the last 7 days. */
export async function readTeamActivity(tx: IdentityTx): Promise<Map<string, { lastActionAt: string; actionsThisWeek: number }>> {
  const rows = z
    .array(z.object({ actorId: z.guid(), lastActionAt: z.string(), actionsThisWeek: count }))
    .parse(
      await tx.execute(sql`
        select a.actor_id as "actorId", to_char(max(a.occurred_at) at time zone 'UTC', ${isoMs}) as "lastActionAt",
               count(*) filter (where a.occurred_at > now() - interval '7 days') as "actionsThisWeek"
        from nestly.audit_log a where a.actor_role = 'moderator' group by a.actor_id`),
    );
  return new Map(rows.map((row) => [row.actorId, { lastActionAt: row.lastActionAt, actionsThisWeek: row.actionsThisWeek }]));
}

// ---- the Audit Log, filtered (§9.10) -----------------------------------------------------------------------------------------

/** One page of the Audit Log with the filters, newest first (the same cursor as the unfiltered page). */
export async function readAuditFiltered(
  tx: IdentityTx,
  filters: AuditFilters,
  before: { at: string; id: string } | undefined,
  limit: number,
): Promise<{ entries: AuditEntry[]; cursors: string[] }> {
  const where: SQL[] = [sql`true`];
  if (before !== undefined) where.push(sql`(a.occurred_at, a.id) < (${before.at}::timestamptz, ${before.id}::uuid)`);
  if (filters.action !== undefined) where.push(sql`a.action = ${filters.action}`);
  if (filters.role !== undefined) where.push(sql`a.actor_role = ${filters.role}`);
  if (filters.targetKind !== undefined) where.push(sql`a.target_kind = ${filters.targetKind}`);
  if (filters.from !== undefined) where.push(sql`a.occurred_at >= (${filters.from}::date::timestamp at time zone 'Asia/Jerusalem')`);
  if (filters.to !== undefined) where.push(sql`a.occurred_at < ((${filters.to}::date + 1)::timestamp at time zone 'Asia/Jerusalem')`);
  if (filters.sensitive !== undefined) where.push(sql`a.action = any(${sql.param([...SENSITIVE_AUDIT_ACTIONS])}::text[])`);
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
        where ${sql.join(where, sql` and `)}
        order by a.occurred_at desc, a.id desc
        limit ${limit}`),
    );
  return {
    entries: rows.map((row) => ({ id: row.id, occurredAt: row.occurredAt, actorRole: row.actorRole, actorId: row.actorId, action: row.action, targetKind: row.targetKind, targetId: row.targetId, reason: row.reason })),
    cursors: rows.map((row) => `${row.cursor}|${row.id}`),
  };
}

// ---- children's tracker trends (§9.2) ----------------------------------------------------------------------------------------

/** The trends of one question, from child_tracker_trends() alone (it checks CHILD_DATA_VIEW, the lists, suppresses and audits). */
export async function readChildTrends(tx: IdentityTx, query: ChildTrendsQuery): Promise<ChildTrendCell[]> {
  const rows = z
    .array(z.object({ bucket: z.string(), order: z.number().int(), children: z.number().int().nullable(), value: z.coerce.number().nullable(), suppressed: z.boolean() }))
    .parse(
      await tx.execute(sql`
        select bucket, bucket_order as "order", children, value, is_suppressed as suppressed
        from nestly.child_tracker_trends(${query.metric}, ${query.field}, ${query.dimension}, ${query.period}::text)`),
    );
  return rows;
}
