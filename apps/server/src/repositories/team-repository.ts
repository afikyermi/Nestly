// The Moderators team's SQL (I14; migration 20261021900000). Every read and write goes through the caller's policies: the Admin's team and
// invitations (caller_staff_role() = 'admin'), the holder of an invitation code (nestly.moderator_invite), SYSTEM_ANNOUNCEMENTS, COMMUNITY_CONFIG,
// ANALYTICS_VIEW on the analytics screen (nestly.analytics_view). A `where` names the rows a step works on; the policy is the limit.

import {
  FEED_ANNOUNCEMENTS_MAX,
  PERMISSION_KEYS,
  type AnalyticsPeriod,
  type AnalyticsView,
  type Announcement,
  type PermissionKey,
  type PublishedAnnouncement,
  type ReportReasonCreate,
  type ReportReasonRow,
  type ReportReasonUpdate,
  type StaffInbox,
  type TeamInvitation,
  type TeamMember,
} from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);
const idRow = z.object({ id: z.guid() });
const count = z.coerce.number().int();

// ---- the team (FR-ADMIN-004) --------------------------------------------------------------------------------------------------

/** The Moderators the Admin reads (users_select_staff with nestly.staff_view), with their keys and the note of their invitation. */
export async function readModerators(tx: IdentityTx): Promise<TeamMember[]> {
  await tx.execute(sql`select set_config('nestly.staff_view', 'on', true)`);
  const rows = z
    .array(
      z.object({
        userId: z.guid(),
        label: z.string().nullable(),
        status: z.enum(['active', 'suspended', 'banned']),
        permissions: z.array(z.string()).nullable(),
        joinedAt: z.string(),
      }),
    )
    .parse(
      await tx.execute(sql`
        select u.id as "userId", i.note as label, u.status,
               (select array_agg(mp.permission_key order by mp.permission_key) from nestly.moderator_permissions mp where mp.user_id = u.id) as permissions,
               to_char(u.created_at at time zone 'UTC', ${isoMs}) as "joinedAt"
        from nestly.users u left join nestly.moderator_invitations i on i.accepted_by = u.id
        where u.account_type = 'moderator'
        order by u.created_at, u.id`),
    );
  return rows.map((row) => ({ ...row, permissions: PERMISSION_KEYS.filter((key) => (row.permissions ?? []).includes(key)) }));
}

/** Every invitation the Admin issued, newest first, with its state now. */
export async function readInvitations(tx: IdentityTx): Promise<TeamInvitation[]> {
  return z
    .array(z.object({ id: z.guid(), note: z.string(), createdAt: z.string(), expiresAt: z.string(), state: z.enum(['open', 'expired', 'revoked', 'accepted']) }))
    .parse(
      await tx.execute(sql`
        select id, note, to_char(created_at at time zone 'UTC', ${isoMs}) as "createdAt", to_char(expires_at at time zone 'UTC', ${isoMs}) as "expiresAt",
               case when accepted_by is not null then 'accepted' when revoked_at is not null then 'revoked'
                    when expires_at <= now() then 'expired' else 'open' end as state
        from nestly.moderator_invitations
        order by created_at desc, id
        limit 100`),
    );
}

/** Issues an invitation for the code's hash; undefined when the policy refused (the caller is not the Admin). */
export async function insertInvitation(tx: IdentityTx, codeHash: string, note: string): Promise<{ id: string; expiresAt: string } | undefined> {
  const rows = z
    .array(z.object({ id: z.guid(), expiresAt: z.string() }))
    .parse(
      await tx.execute(sql`
        insert into nestly.moderator_invitations (code_hash, note) values (${codeHash}, ${note})
        returning id, to_char(expires_at at time zone 'UTC', ${isoMs}) as "expiresAt"`),
    );
  return rows[0];
}

/** Revokes an open invitation; false when there was none to revoke (used, revoked, unknown, or not the Admin). */
export async function revokeInvitation(tx: IdentityTx, id: string): Promise<boolean> {
  const rows = await tx.execute(sql`update nestly.moderator_invitations set revoked_at = now() where id = ${id}::uuid and accepted_by is null and revoked_at is null and expires_at > now() returning id`);
  return z.array(idRow).parse(rows).length === 1;
}

/** The caller's role in the database's eyes: 'admin', 'moderator' or null. */
export async function callerStaffRole(tx: IdentityTx): Promise<'admin' | 'moderator' | null> {
  const rows = z.array(z.object({ role: z.enum(['admin', 'moderator']).nullable() })).parse(await tx.execute(sql`select nestly.caller_staff_role() as role`));
  return rows[0]?.role ?? null;
}

/** Whether the account is a Moderator the Admin reads. */
export async function isModerator(tx: IdentityTx, userId: string): Promise<boolean> {
  await tx.execute(sql`select set_config('nestly.staff_view', 'on', true)`);
  const rows = await tx.execute(sql`select id from nestly.users where id = ${userId}::uuid and account_type = 'moderator'`);
  return z.array(idRow).parse(rows).length === 1;
}

/** Sets a Moderator's keys to exactly `keys` (each grant and revocation is audited by the database). */
export async function replaceKeys(tx: IdentityTx, userId: string, keys: readonly PermissionKey[]): Promise<void> {
  await tx.execute(sql`delete from nestly.moderator_permissions where user_id = ${userId}::uuid and not (permission_key = any(${sql.param([...keys])}::text[]))`);
  if (keys.length > 0) {
    await tx.execute(sql`
      insert into nestly.moderator_permissions (user_id, permission_key)
      select ${userId}::uuid, k from unnest(${sql.param([...keys])}::text[]) as k
      on conflict (user_id, permission_key) do nothing`);
  }
}

// ---- joining with an invitation ----------------------------------------------------------------------------------------------

/** Names the code's hash for this transaction (nestly.moderator_invite): only then does its invitation open to the caller. */
export async function nameInvitation(tx: IdentityTx, codeHash: string): Promise<void> {
  await tx.execute(sql`select set_config('nestly.moderator_invite', ${codeHash}, true)`);
}

/** Marks the named invitation as the caller's; false when it is not open (used, revoked, expired, unknown) or the caller may not. */
export async function markInvitation(tx: IdentityTx, codeHash: string): Promise<boolean> {
  const rows = await tx.execute(sql`
    update nestly.moderator_invitations set accepted_by = (select auth.uid())
    where code_hash = ${codeHash} and accepted_by is null and revoked_at is null and expires_at > now()
    returning id`);
  return z.array(idRow).parse(rows).length === 1;
}

/** Creates the caller's account as a Moderator (the policy requires the invitation the caller just marked). */
export async function insertModeratorAccount(tx: IdentityTx): Promise<void> {
  await tx.execute(sql`insert into nestly.users (account_type, status) values ('moderator', 'active')`);
}

/** Whether the caller already has a Nestly account (any status). */
export async function hasOwnAccount(tx: IdentityTx): Promise<boolean> {
  return (await tx.execute(sql`select 1 as one from nestly.users where id = (select auth.uid())`)).length > 0;
}

// ---- System Announcements (FR-ADMIN-008) -------------------------------------------------------------------------------------

const announcementRow = z.object({
  id: z.guid(),
  title: z.string(),
  body: z.string(),
  status: z.enum(['draft', 'published', 'removed']),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable(),
});
const announcementColumns = sql`id, title, body, status, to_char(created_at at time zone 'UTC', ${isoMs}) as "createdAt",
  to_char(updated_at at time zone 'UTC', ${isoMs}) as "updatedAt", to_char(published_at at time zone 'UTC', ${isoMs}) as "publishedAt"`;

/** Every announcement the key holder reads, drafts first then newest. */
export async function readAnnouncements(tx: IdentityTx): Promise<Announcement[]> {
  return z.array(announcementRow).parse(
    await tx.execute(sql`
      select ${announcementColumns} from nestly.system_announcements
      order by case status when 'draft' then 0 when 'published' then 1 else 2 end, created_at desc, id
      limit 100`),
  );
}

export async function insertAnnouncement(tx: IdentityTx, title: string, body: string): Promise<Announcement | undefined> {
  return z.array(announcementRow).parse(await tx.execute(sql`insert into nestly.system_announcements (title, body) values (${title}, ${body}) returning ${announcementColumns}`))[0];
}

/** Edits a draft or published announcement; undefined when nothing was written (removed, unknown, not allowed, or no change). */
export async function updateAnnouncement(tx: IdentityTx, id: string, title: string, body: string): Promise<Announcement | undefined> {
  return z
    .array(announcementRow)
    .parse(await tx.execute(sql`update nestly.system_announcements set title = ${title}, body = ${body} where id = ${id}::uuid returning ${announcementColumns}`))[0];
}

export async function setAnnouncementStatus(tx: IdentityTx, id: string, status: 'published' | 'removed'): Promise<Announcement | undefined> {
  return z
    .array(announcementRow)
    .parse(await tx.execute(sql`update nestly.system_announcements set status = ${status} where id = ${id}::uuid and status <> ${status} returning ${announcementColumns}`))[0];
}

/** One announcement the caller reads, or none. */
export async function readAnnouncement(tx: IdentityTx, id: string): Promise<Announcement | undefined> {
  return z.array(announcementRow).max(1).parse(await tx.execute(sql`select ${announcementColumns} from nestly.system_announcements where id = ${id}::uuid`))[0];
}

/** Whether the caller holds one Permission Key now (the Admin holds every key). */
export async function holdsKey(tx: IdentityTx, key: PermissionKey): Promise<boolean> {
  const rows = z.array(z.object({ ok: z.boolean().nullable() })).parse(await tx.execute(sql`select nestly.has_permission(${key}) as ok`));
  return rows[0]?.ok === true;
}

/** Whether an announcement with this id is readable to the caller at all (to tell 404 from 409). */
export async function announcementExists(tx: IdentityTx, id: string): Promise<boolean> {
  return (await tx.execute(sql`select 1 as one from nestly.system_announcements where id = ${id}::uuid`)).length > 0;
}

/** The published announcements a user reads, newest first. */
export async function readPublishedAnnouncements(tx: IdentityTx): Promise<PublishedAnnouncement[]> {
  return z
    .array(z.object({ id: z.guid(), title: z.string(), body: z.string(), publishedAt: z.string() }))
    .parse(
      await tx.execute(sql`
        select id, title, body, to_char(published_at at time zone 'UTC', ${isoMs}) as "publishedAt"
        from nestly.system_announcements where status = 'published'
        order by published_at desc, id
        limit ${FEED_ANNOUNCEMENTS_MAX}`),
    );
}

// ---- report reasons (FR-ADMIN-007) -------------------------------------------------------------------------------------------

const reasonRow = z.object({ key: z.string(), label: z.string(), priority: z.number().int(), sortOrder: z.number().int(), isActive: z.boolean(), isCore: z.boolean() });

export async function readReportReasons(tx: IdentityTx, activeOnly: boolean): Promise<ReportReasonRow[]> {
  return z.array(reasonRow).parse(
    await tx.execute(sql`
      select key, label, priority, sort_order as "sortOrder", is_active as "isActive", is_core as "isCore"
      from nestly.report_reasons ${activeOnly ? sql`where is_active` : sql``}
      order by sort_order, key`),
  );
}

export async function updateReportReason(tx: IdentityTx, key: string, change: ReportReasonUpdate): Promise<ReportReasonRow | undefined> {
  return z.array(reasonRow).parse(
    await tx.execute(sql`
      update nestly.report_reasons set label = ${change.label}, priority = ${change.priority}, sort_order = ${change.sortOrder}, is_active = ${change.isActive}
      where key = ${key}
      returning key, label, priority, sort_order as "sortOrder", is_active as "isActive", is_core as "isCore"`),
  )[0];
}

export async function insertReportReason(tx: IdentityTx, key: string, reason: ReportReasonCreate): Promise<ReportReasonRow | undefined> {
  return z.array(reasonRow).parse(
    await tx.execute(sql`
      insert into nestly.report_reasons (key, label, priority, sort_order, is_active) values (${key}, ${reason.label}, ${reason.priority}, ${reason.sortOrder}, true)
      returning key, label, priority, sort_order as "sortOrder", is_active as "isActive", is_core as "isCore"`),
  )[0];
}

// ---- the analytics (FR-ADMIN-010, BR-058): numbers only --------------------------------------------------------------------------

/** Names the analytics screen for this transaction (nestly.analytics_view): only then do the ANALYTICS_VIEW policies open. */
export async function nameAnalytics(tx: IdentityTx): Promise<void> {
  await tx.execute(sql`select set_config('nestly.analytics_view', 'on', true)`);
}

const dayCounts = z.array(z.object({ day: z.string(), count }));

export async function readAnalytics(tx: IdentityTx, days: AnalyticsPeriod): Promise<AnalyticsView> {
  // the period's days in Israel (the UI's zone), as timestamps for generate_series
  const firstDay = sql`(((now() at time zone 'Asia/Jerusalem')::date - ${days - 1}::int)::timestamp)`;
  const lastDay = sql`((now() at time zone 'Asia/Jerusalem')::date::timestamp)`;
  const since = sql`(date_trunc('day', now() at time zone 'Asia/Jerusalem') - make_interval(days => ${days - 1}::int)) at time zone 'Asia/Jerusalem'`;
  const series = (table: string) => sql`
    select to_char(g.day, 'YYYY-MM-DD') as day, coalesce(c.n, 0) as count
    from generate_series(${firstDay}, ${lastDay}, interval '1 day') as g(day)
    left join (select (created_at at time zone 'Asia/Jerusalem')::date as d, count(*) as n from ${sql.raw(`nestly.${table}`)}
               where created_at >= ${since} group by 1) c on c.d = g.day::date
    order by g.day`;

  const types = z
    .array(z.object({ type: z.string(), n: count }))
    .parse(await tx.execute(sql`select account_type as type, count(*) as n from nestly.users group by account_type`));
  const statuses = z.array(z.object({ status: z.string(), n: count })).parse(await tx.execute(sql`select status, count(*) as n from nestly.users group by status`));
  const registrations = z
    .array(z.object({ day: z.string(), regular: count, professional: count }))
    .parse(
      await tx.execute(sql`
        select to_char(g.day, 'YYYY-MM-DD') as day,
               count(u.id) filter (where u.account_type = 'regular') as regular,
               count(u.id) filter (where u.account_type = 'professional') as professional
        from generate_series(${firstDay}, ${lastDay}, interval '1 day') as g(day)
        left join nestly.users u on (u.created_at at time zone 'Asia/Jerusalem')::date = g.day::date
        group by g.day order by g.day`),
    );
  const posts = dayCounts.parse(await tx.execute(series('posts')));
  const comments = dayCounts.parse(await tx.execute(series('comments')));
  const likes = dayCounts.parse(await tx.execute(series('reactions')));
  const reports = dayCounts.parse(await tx.execute(series('reports')));
  const perAuthor = z
    .array(z.object({ bucket: z.enum(['1', '2-5', '6-20', '21+']), accounts: count }))
    .parse(
      await tx.execute(sql`
        select b.bucket, count(*) as accounts from (
          select case when n = 1 then '1' when n <= 5 then '2-5' when n <= 20 then '6-20' else '21+' end as bucket
          from (select author_id, count(*) as n from nestly.posts where author_id is not null and created_at >= ${since} group by author_id) per
        ) b group by b.bucket`),
    );
  const friends = z
    .array(z.object({ requested: count, accepted: count }))
    .parse(
      await tx.execute(sql`
        select count(*) filter (where requested_at >= ${since}) as requested,
               count(*) filter (where status = 'accepted' and responded_at >= ${since}) as accepted
        from nestly.friendships`),
    )[0] ?? { requested: 0, accepted: 0 };
  const byReason = z
    .array(z.object({ label: z.string(), count }))
    .parse(
      await tx.execute(sql`
        select rr.label, count(*) as count from nestly.reports r join nestly.report_reasons rr on rr.key = r.reason
        where r.created_at >= ${since} group by rr.label, rr.sort_order order by count(*) desc, rr.sort_order`),
    );
  const outcome = z
    .array(z.object({ open: count, actionTaken: count, dismissed: count, median: z.coerce.number().nullable() }))
    .parse(
      await tx.execute(sql`
        select count(*) filter (where status = 'open') as open,
               count(*) filter (where resolution = 'action_taken' and closed_at >= ${since}) as "actionTaken",
               count(*) filter (where resolution = 'dismissed' and closed_at >= ${since}) as dismissed,
               percentile_cont(0.5) within group (order by extract(epoch from (closed_at - created_at)) / 3600)
                 filter (where status = 'handled' and closed_at >= ${since}) as median
        from nestly.reports`),
    )[0] ?? { open: 0, actionTaken: 0, dismissed: 0, median: null };
  const steps = z
    .array(z.object({ kind: z.string(), n: count }))
    .parse(await tx.execute(sql`select kind, count(*) as n from nestly.user_enforcements where created_at >= ${since} group by kind`));

  const pick = <T extends { n: number }>(rows: ReadonlyArray<T & Record<string, unknown>>, field: string, value: string) =>
    rows.find((row) => row[field] === value)?.n ?? 0;
  const order = ['1', '2-5', '6-20', '21+'] as const;
  return {
    days,
    accounts: {
      byType: { regular: pick(types, 'type', 'regular'), professional: pick(types, 'type', 'professional'), moderator: pick(types, 'type', 'moderator'), admin: pick(types, 'type', 'admin') },
      byStatus: { active: pick(statuses, 'status', 'active'), suspended: pick(statuses, 'status', 'suspended'), banned: pick(statuses, 'status', 'banned') },
      registrations,
    },
    content: { posts, comments, likes, postsPerAuthor: order.map((bucket) => ({ bucket, accounts: perAuthor.find((row) => row.bucket === bucket)?.accounts ?? 0 })) },
    friendships: friends,
    moderation: {
      reports,
      byReason,
      open: outcome.open,
      actionTaken: outcome.actionTaken,
      dismissed: outcome.dismissed,
      medianHoursToClose: outcome.median === null ? null : Math.round(outcome.median * 10) / 10,
      enforcements: { warning: pick(steps, 'kind', 'warning'), suspension: pick(steps, 'kind', 'suspension'), ban: pick(steps, 'kind', 'ban') },
    },
  };
}

// ---- the staff inbox (AC-044) ---------------------------------------------------------------------------------------------------

/** Counts of what waits for the staff member, only for the keys it holds (the counts read through its own policies). */
export async function readInbox(tx: IdentityTx, keys: readonly PermissionKey[]): Promise<StaffInbox> {
  const inbox: { openReports?: number; queuedImages?: number } = {};
  if (keys.includes('REPORTS_VIEW')) {
    const rows = z.array(z.object({ n: count })).parse(await tx.execute(sql`select count(distinct coalesce(post_id, comment_id, reported_user_id)) as n from nestly.reports where status = 'open'`));
    inbox.openReports = rows[0]?.n ?? 0;
  }
  if (keys.includes('CONTENT_MODERATE')) {
    const rows = z.array(z.object({ n: count })).parse(await tx.execute(sql`select count(*) as n from nestly.media_assets where status = 'queued'`));
    inbox.queuedImages = rows[0]?.n ?? 0;
  }
  return inbox;
}
