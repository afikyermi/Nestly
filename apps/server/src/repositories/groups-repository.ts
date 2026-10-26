// Groups (I10; FR-GRP-001..004, FR-ALG-010; migration 20261022300000). Runs inside the caller's identity transaction and nowhere else. Who
// reads a Group, its members, requests, invitations and blocks, and who may change any of them, is the database's (the group policies, the
// RESTRICTIVE group policies on posts and comments, and the guard triggers). An id in a `where` names the row, never a filter for
// permission: a row the caller may not touch is simply not there (0 rows), and a refused write raises its SQLSTATE (42501, NS026-NS028).
// No statement carries the caller's id as a value: ownership, membership and decisions default to auth.uid() in the database.

import {
  GROUP_ENFORCEMENT_REASONS,
  GROUP_NOTIFICATION_MODES,
  GROUP_PRIVACIES,
  GROUP_ROLES,
  type GroupNotificationMode,
  type GroupPostView,
  type GroupPrivacy,
  type GroupRole,
} from '@nestly/shared';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { groupActivityScore } from './group-activity-repository.js';

const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);
const isoUs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`);

const summaryRow = z.object({
  id: z.guid(),
  name: z.string(),
  description: z.string().nullable(),
  privacy: z.enum(GROUP_PRIVACIES),
  memberRows: z.number(),
  myRole: z.enum(GROUP_ROLES).nullable(),
  requested: z.boolean(),
  invitationId: z.guid().nullable(),
  blocked: z.boolean(),
});
export type GroupSummaryRow = z.infer<typeof summaryRow>;

const detailRow = summaryRow.extend({
  rules: z.string().nullable(),
  pinnedPostId: z.guid().nullable(),
  mode: z.enum(GROUP_NOTIFICATION_MODES).nullable(),
  createdAt: z.string(),
  muteUntil: z.string().nullable(),
  muteReason: z.enum(GROUP_ENFORCEMENT_REASONS).nullable(),
  muteReasonText: z.string().nullable(),
  highlightThreshold: z.number().nullable(),
  /** A Group Moderator or Admin whose management the database pauses while they are muted (their rank answers a member's: OP-070). */
  managementPaused: z.boolean(),
});
export type GroupDetailRow = z.infer<typeof detailRow>;

/** `%`, `_` and `\` in the text are characters, not patterns. */
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The columns of a Group as a list shows it, with the caller's own relation: the Role from the caller's own access copy, a pending request,
 * a pending invitation and a block, all read under the caller's own-row policies. `memberRows` counts the member rows the caller may read
 * (all of a Public Group; of a Private Group only when the caller belongs to it).
 */
function summaryColumns(): SQL {
  return sql`g.id, g.name, g.description, g.privacy,
    (select count(*) from nestly.group_members m where m.group_id = g.id)::int as "memberRows",
    a.role as "myRole",
    exists (select 1 from nestly.group_join_requests r where r.group_id = g.id and r.user_id = (select auth.uid()) and r.status = 'pending') as requested,
    (select i.id from nestly.group_invitations i where i.group_id = g.id and i.invitee_id = (select auth.uid()) and i.status = 'pending'
      order by i.created_at desc limit 1) as "invitationId",
    exists (select 1 from nestly.group_bans b where b.group_id = g.id and b.user_id = (select auth.uid())) as blocked`;
}

/**
 * Discovery (every active Group the caller may read, the most active first, then the newest; or those matching `q`, name matches first,
 * then activity: §11.14) or the caller's own Groups (by name).
 */
export async function readGroupSummaries(tx: IdentityTx, scope: 'mine' | 'discover', q: string | null, limit: number): Promise<GroupSummaryRow[]> {
  const like = q === null ? null : `%${escapeLike(q.toLowerCase())}%`;
  const rows = await tx.execute(sql`
    select ${summaryColumns()}
    from nestly.groups g
    left join nestly.group_access a on a.group_id = g.id and a.user_id = (select auth.uid())
    where g.status = 'active'
      ${scope === 'mine' ? sql`and a.role is not null` : sql``}
      ${like === null ? sql`` : sql`and (lower(g.name) like ${like} or lower(coalesce(g.description, '')) like ${like})`}
    order by ${scope === 'mine' ? sql`g.name, g.id` : like === null ? sql`${groupActivityScore()} desc, g.created_at desc, g.id desc` : sql`(lower(g.name) like ${like}) desc, ${groupActivityScore()} desc, g.created_at desc, g.id desc`}
    limit ${limit}`);
  return z.array(summaryRow).parse(rows);
}

/** One Group with its rules, pin and the caller's notification mode, or none when the caller cannot read it (missing or deleted alike). */
export async function readGroupDetail(tx: IdentityTx, id: string): Promise<GroupDetailRow | undefined> {
  const rows = await tx.execute(sql`
    select ${summaryColumns()}, g.rules, g.pinned_post_id as "pinnedPostId",
           (select p.mode from nestly.group_notification_preferences p where p.group_id = g.id and p.user_id = (select auth.uid())) as mode,
           to_char(g.created_at at time zone 'UTC', ${isoMs}) as "createdAt",
           to_char(mu.mute_until at time zone 'UTC', ${isoMs}) as "muteUntil", mu.reason_key as "muteReason", mu.reason_text as "muteReasonText",
           case when a.role is null then null
                else nestly.group_highlight_threshold((select count(*) from nestly.group_members m where m.group_id = g.id and m.member_status = 'active')::int)
           end as "highlightThreshold",
           coalesce(a.role in ('admin', 'moderator') and nestly.my_group_rank(g.id) < nestly.group_role_rank(a.role), false) as "managementPaused"
    from nestly.groups g
    left join lateral (
      select e.mute_until, e.reason_key, e.reason_text from nestly.group_member_enforcements e
      where e.group_id = g.id and e.user_id = (select auth.uid()) and e.kind = 'warn_mute' and e.mute_until > now()
      order by e.mute_until desc limit 1
    ) mu on true
    left join nestly.group_access a on a.group_id = g.id and a.user_id = (select auth.uid())
    where g.id = ${id}::uuid and g.status = 'active'`);
  return z.array(detailRow).max(1).parse(rows)[0];
}

/** Creates a Group in the caller's name; the Owner row follows by trigger. */
export async function insertGroup(
  tx: IdentityTx,
  values: { name: string; description: string | null; rules: string | null; privacy: GroupPrivacy },
): Promise<string> {
  const rows = await tx.execute(sql`
    insert into nestly.groups (name, description, rules, privacy)
    values (${values.name}, ${values.description}, ${values.rules}, ${values.privacy})
    returning id`);
  const [row] = z.array(z.object({ id: z.guid() })).length(1).parse(rows);
  if (row === undefined) throw new Error('no group row');
  return row.id;
}

/** Changes the named fields; the database decides who may (rows 0 when the caller is no Owner or Admin; NS027 for privacy by a non-Owner). */
export async function updateGroup(
  tx: IdentityTx,
  id: string,
  changes: { name?: string | undefined; description?: string | null | undefined; rules?: string | null | undefined; privacy?: GroupPrivacy | undefined; status?: 'deleted'; pinnedPostId?: string | null },
): Promise<number> {
  const sets: SQL[] = [];
  if (changes.name !== undefined) sets.push(sql`name = ${changes.name}`);
  if (changes.description !== undefined) sets.push(sql`description = ${changes.description}`);
  if (changes.rules !== undefined) sets.push(sql`rules = ${changes.rules}`);
  if (changes.privacy !== undefined) sets.push(sql`privacy = ${changes.privacy}`);
  if (changes.status !== undefined) sets.push(sql`status = ${changes.status}`);
  if (changes.pinnedPostId !== undefined) sets.push(sql`pinned_post_id = ${changes.pinnedPostId}::uuid`);
  if (sets.length === 0) return 0;
  const rows = await tx.execute(sql`update nestly.groups set ${sql.join(sets, sql`, `)} where id = ${id}::uuid returning id`);
  return rows.length;
}

/** Join a Public Group (or one whose invitation the caller accepted in this transaction): the caller's own member row. */
export async function insertOwnMembership(tx: IdentityTx, groupId: string): Promise<void> {
  await tx.execute(sql`insert into nestly.group_members (group_id) values (${groupId}::uuid)`);
}

/** Ask to join a Private Group. */
export async function insertJoinRequest(tx: IdentityTx, groupId: string): Promise<void> {
  await tx.execute(sql`insert into nestly.group_join_requests (group_id) values (${groupId}::uuid)`);
}

/** Cancel the caller's own pending request (0 when there is none). */
export async function cancelOwnRequest(tx: IdentityTx, groupId: string): Promise<number> {
  const rows = await tx.execute(sql`
    update nestly.group_join_requests set status = 'cancelled'
    where group_id = ${groupId}::uuid and user_id = (select auth.uid()) and status = 'pending' returning id`);
  return rows.length;
}

/** Leave: the caller's own member row (the Owner is refused, NS026). */
export async function deleteOwnMembership(tx: IdentityTx, groupId: string): Promise<number> {
  const rows = await tx.execute(sql`delete from nestly.group_members where group_id = ${groupId}::uuid and user_id = (select auth.uid()) returning user_id`);
  return rows.length;
}

const memberRow = z.object({ userId: z.guid(), fullName: z.string().nullable(), role: z.enum(GROUP_ROLES), isMe: z.boolean(), joinedAt: z.string() });

/** The members the caller may read with the names the database shows (fellow members): highest Role first, then by name. */
export async function readMembers(tx: IdentityTx, groupId: string, limit: number): Promise<z.infer<typeof memberRow>[]> {
  const rows = await tx.execute(sql`
    select m.user_id as "userId", n.full_name as "fullName", m.role, m.user_id = (select auth.uid()) as "isMe",
           to_char(m.created_at at time zone 'UTC', ${isoMs}) as "joinedAt"
    from nestly.group_members m
    left join nestly.regular_names n on n.user_id = m.user_id
    where m.group_id = ${groupId}::uuid
    order by nestly.group_role_rank(m.role) desc, n.full_name nulls last, m.user_id
    limit ${limit}`);
  return z.array(memberRow).parse(rows);
}

/** One member's Role, as the caller may read it, or none. */
export async function readMemberRole(tx: IdentityTx, groupId: string, userId: string): Promise<GroupRole | undefined> {
  const rows = await tx.execute(sql`select m.role from nestly.group_members m where m.group_id = ${groupId}::uuid and m.user_id = ${userId}::uuid`);
  return z.array(z.object({ role: z.enum(GROUP_ROLES) })).max(1).parse(rows)[0]?.role;
}

/** Sets a member's Role (the database checks the hierarchy). Returns the rows changed. */
export async function updateMemberRole(tx: IdentityTx, groupId: string, userId: string, role: GroupRole): Promise<number> {
  const rows = await tx.execute(sql`
    update nestly.group_members set role = ${role} where group_id = ${groupId}::uuid and user_id = ${userId}::uuid returning user_id`);
  return rows.length;
}

/** The caller steps down from Owner to Admin (only after making someone else Owner in this transaction). */
export async function stepDownOwner(tx: IdentityTx, groupId: string): Promise<number> {
  const rows = await tx.execute(sql`
    update nestly.group_members set role = 'admin' where group_id = ${groupId}::uuid and user_id = (select auth.uid()) returning user_id`);
  return rows.length;
}

/** Whether the user is blocked from the Group, as the caller may read it (Moderators and higher, or the user). */
export async function readBanned(tx: IdentityTx, groupId: string, userId: string): Promise<boolean> {
  const rows = await tx.execute(sql`select 1 from nestly.group_bans b where b.group_id = ${groupId}::uuid and b.user_id = ${userId}::uuid`);
  return rows.length > 0;
}

const personRow = z.object({ userId: z.guid(), fullName: z.string().nullable(), at: z.string() });

/** Pending Join Requests the caller may read (the Owner and Admins), oldest first. */
export async function readPendingRequests(tx: IdentityTx, groupId: string, limit: number): Promise<z.infer<typeof personRow>[]> {
  const rows = await tx.execute(sql`
    select r.user_id as "userId", n.full_name as "fullName", to_char(r.created_at at time zone 'UTC', ${isoMs}) as at
    from nestly.group_join_requests r left join nestly.regular_names n on n.user_id = r.user_id
    where r.group_id = ${groupId}::uuid and r.status = 'pending' and r.user_id <> (select auth.uid())
    order by r.created_at, r.id
    limit ${limit}`);
  return z.array(personRow).parse(rows);
}

/** Approve or reject a pending request (an approval admits the requester in the same statement). */
export async function decideRequest(tx: IdentityTx, groupId: string, userId: string, status: 'approved' | 'rejected'): Promise<number> {
  const rows = await tx.execute(sql`
    update nestly.group_join_requests set status = ${status}
    where group_id = ${groupId}::uuid and user_id = ${userId}::uuid and status = 'pending' returning id`);
  return rows.length;
}

/** Users blocked from the Group (Moderators and higher), newest first. */
export async function readBans(tx: IdentityTx, groupId: string, limit: number): Promise<z.infer<typeof personRow>[]> {
  const rows = await tx.execute(sql`
    select b.user_id as "userId", n.full_name as "fullName", to_char(b.created_at at time zone 'UTC', ${isoMs}) as at
    from nestly.group_bans b left join nestly.regular_names n on n.user_id = b.user_id
    where b.group_id = ${groupId}::uuid and b.user_id <> (select auth.uid())
    order by b.created_at desc, b.user_id
    limit ${limit}`);
  return z.array(personRow).parse(rows);
}

/** Invites a Friend; the database decides whether it waits for approval (a member's invitation to a Private Group, §11.15). */
export async function insertInvitation(tx: IdentityTx, groupId: string, inviteeId: string): Promise<'sent' | 'awaiting_approval'> {
  const rows = await tx.execute(sql`
    insert into nestly.group_invitations (group_id, invitee_id) values (${groupId}::uuid, ${inviteeId}::uuid) returning status`);
  const [row] = z.array(z.object({ status: z.enum(['pending', 'awaiting_approval']) })).length(1).parse(rows);
  return row?.status === 'awaiting_approval' ? 'awaiting_approval' : 'sent';
}

const invitationRow = z.object({
  id: z.guid(),
  groupId: z.guid(),
  groupName: z.string(),
  privacy: z.enum(GROUP_PRIVACIES),
  inviterName: z.string().nullable(),
  createdAt: z.string(),
});

/** The caller's pending invitations to active Groups, newest first. */
export async function readOwnInvitations(tx: IdentityTx, limit: number): Promise<z.infer<typeof invitationRow>[]> {
  const rows = await tx.execute(sql`
    select i.id, g.id as "groupId", g.name as "groupName", g.privacy, n.full_name as "inviterName",
           to_char(i.created_at at time zone 'UTC', ${isoMs}) as "createdAt"
    from nestly.group_invitations i
    join nestly.groups g on g.id = i.group_id and g.status = 'active'
    left join nestly.regular_names n on n.user_id = i.inviter_id
    where i.invitee_id = (select auth.uid()) and i.status = 'pending'
    order by i.created_at desc, i.id
    limit ${limit}`);
  return z.array(invitationRow).parse(rows);
}

/** Accept (become a member in the same statement) or decline an invitation addressed to the caller. Returns its Group id, or none. */
export async function answerInvitation(tx: IdentityTx, id: string, status: 'accepted' | 'declined'): Promise<string | undefined> {
  const rows = await tx.execute(sql`
    update nestly.group_invitations set status = ${status}
    where id = ${id}::uuid and invitee_id = (select auth.uid()) and status = 'pending' returning group_id as "groupId"`);
  return z.array(z.object({ groupId: z.guid() })).max(1).parse(rows)[0]?.groupId;
}

/** Recommend a Group to a Friend; a repeat is the same answer (once per Group, sender and recipient). */
export async function insertRecommendation(tx: IdentityTx, groupId: string, recipientId: string): Promise<void> {
  await tx.execute(sql`
    insert into nestly.group_suggestions (group_id, recipient_id) values (${groupId}::uuid, ${recipientId}::uuid)
    on conflict on constraint group_suggestions_once_key do nothing`);
}

const flagsRow = z.object({ userId: z.guid(), isMember: z.boolean(), isInvited: z.boolean(), isAwaitingApproval: z.boolean(), isRecommended: z.boolean() });

/** For each of `userIds` (the caller's Friends): a member row the caller can see, a pending invitation it can see, its own recommendation. */
export async function readFriendFlags(tx: IdentityTx, groupId: string, userIds: readonly string[]): Promise<z.infer<typeof flagsRow>[]> {
  if (userIds.length === 0) return [];
  const rows = await tx.execute(sql`
    select u.id as "userId",
           exists (select 1 from nestly.group_members m where m.group_id = ${groupId}::uuid and m.user_id = u.id) as "isMember",
           exists (select 1 from nestly.group_invitations i where i.group_id = ${groupId}::uuid and i.invitee_id = u.id and i.status = 'pending') as "isInvited",
           exists (select 1 from nestly.group_invitations i where i.group_id = ${groupId}::uuid and i.invitee_id = u.id
                     and i.status = 'awaiting_approval') as "isAwaitingApproval",
           exists (select 1 from nestly.group_suggestions r where r.group_id = ${groupId}::uuid and r.recipient_id = u.id
                     and r.sender_id = (select auth.uid())) as "isRecommended"
    from unnest(${sql.param([...userIds])}::uuid[]) as u(id)`);
  return z.array(flagsRow).parse(rows);
}

/** The caller's notification mode for a Group they belong to (the foreign key refuses a non-member, 23503). */
export async function upsertMode(tx: IdentityTx, groupId: string, mode: GroupNotificationMode): Promise<void> {
  await tx.execute(sql`
    insert into nestly.group_notification_preferences (group_id, mode) values (${groupId}::uuid, ${mode})
    on conflict (group_id, user_id) do update set mode = excluded.mode`);
}

const feedRow = z.object({ id: z.guid(), createdAt: z.string() });

/**
 * A page of the Group's posts the caller may read, newest first, after the keyset `(createdAt, id)`; `exclude` (the pinned post) is left out.
 * The RESTRICTIVE posts_group_hide decides whether the caller reads them at all.
 */
export async function readGroupPostIds(
  tx: IdentityTx,
  groupId: string,
  after: { at: string; id: string } | null,
  exclude: string | null,
  limit: number,
  view: GroupPostView = 'all',
): Promise<z.infer<typeof feedRow>[]> {
  const rows = await tx.execute(sql`
    select p.id, to_char(p.created_at at time zone 'UTC', ${isoUs}) as "createdAt"
    from nestly.posts p
    where p.group_id = ${groupId}::uuid
      ${view === 'highlights' ? sql`and exists (select 1 from nestly.group_highlights h where h.post_id = p.id)` : sql``}
      ${exclude === null ? sql`` : sql`and p.id <> ${exclude}::uuid`}
      ${after === null ? sql`` : sql`and (p.created_at, p.id) < (${after.at}::timestamptz, ${after.id}::uuid)`}
    order by p.created_at desc, p.id desc
    limit ${limit}`);
  return z.array(feedRow).parse(rows);
}

/** Whether the post is readable to the caller and belongs to the Group (the pin's check before showing it). */
export async function readGroupPostExists(tx: IdentityTx, groupId: string, postId: string): Promise<boolean> {
  const rows = await tx.execute(sql`select 1 from nestly.posts p where p.id = ${postId}::uuid and p.group_id = ${groupId}::uuid`);
  return rows.length > 0;
}

/** The names of Groups the caller can read, by id (notification targets). */
export async function readGroupNames(tx: IdentityTx, ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.execute(sql`select g.id, g.name from nestly.groups g where g.id = any(${sql.param([...ids])}::uuid[]) and g.status = 'active'`);
  return new Map(z.array(z.object({ id: z.guid(), name: z.string() })).parse(rows).map((row) => [row.id, row.name]));
}

/** Search (FR-SEARCH-001): active Groups whose name or description matches, name matches first, then the most active (§11.14). */
export async function searchGroups(tx: IdentityTx, text: string, limit: number): Promise<{ id: string; name: string; privacy: GroupPrivacy }[]> {
  const like = `%${escapeLike(text.toLowerCase())}%`;
  const rows = await tx.execute(sql`
    select g.id, g.name, g.privacy from nestly.groups g
    where g.status = 'active' and (lower(g.name) like ${like} or lower(coalesce(g.description, '')) like ${like})
    order by (lower(g.name) like ${like}) desc, ${groupActivityScore()} desc, g.name, g.id
    limit ${limit}`);
  return z.array(z.object({ id: z.guid(), name: z.string(), privacy: z.enum(GROUP_PRIVACIES) })).parse(rows);
}
