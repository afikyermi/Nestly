// Group enforcement and invitations awaiting approval (I10 completion C, Afik 21.10.2026 §11.15, §11.16; migration 20261023800000). Runs
// inside the caller's identity transaction. Who may warn, mute, remove and block, unblock, read the history or decide an invitation is the
// database's (group_member_enforcements and group_invitations policies, their triggers): a refused write raises its SQLSTATE, a row the
// caller may not read is simply not there. No statement carries the caller's id as a value; the actor is auth.uid() in the database.

import { GROUP_ENFORCEMENT_KINDS, GROUP_ENFORCEMENT_REASONS, type GroupEnforcementReason } from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);

export interface EnforcementWrite {
  readonly userId: string;
  readonly kind: 'warn_mute' | 'remove_block' | 'unblock';
  readonly reason: GroupEnforcementReason | null;
  readonly reasonText: string | null;
  readonly muteHours: 24 | 168 | null;
}

/** One enforcement record; the action itself (the block, its lifting) follows in the same statement (group_member_enforcements_apply). */
export async function insertEnforcement(tx: IdentityTx, groupId: string, write: EnforcementWrite): Promise<void> {
  await tx.execute(sql`
    insert into nestly.group_member_enforcements (group_id, user_id, kind, reason_key, reason_text, mute_hours)
    values (${groupId}::uuid, ${write.userId}::uuid, ${write.kind}, ${write.reason}, ${write.reasonText}, ${write.muteHours}::integer)`);
}

const recordRow = z.object({
  id: z.guid(),
  userId: z.guid(),
  fullName: z.string().nullable(),
  kind: z.enum(GROUP_ENFORCEMENT_KINDS),
  reason: z.enum(GROUP_ENFORCEMENT_REASONS).nullable(),
  reasonText: z.string().nullable(),
  muteUntil: z.string().nullable(),
  createdAt: z.string(),
});

/**
 * The Group's enforcement history the caller may read (its Moderators and higher read all of it; anyone reads the records about them),
 * newest first; never who acted. `mine`: only the records about the caller (OP-070: the member's own history, also after a mute ended
 * or a removal).
 */
export async function readEnforcements(tx: IdentityTx, groupId: string, limit: number, mine = false): Promise<z.infer<typeof recordRow>[]> {
  const own = mine ? sql`and e.user_id = (select auth.uid())` : sql``;
  const rows = await tx.execute(sql`
    select e.id, e.user_id as "userId", n.full_name as "fullName", e.kind, e.reason_key as reason, e.reason_text as "reasonText",
           to_char(e.mute_until at time zone 'UTC', ${isoMs}) as "muteUntil", to_char(e.created_at at time zone 'UTC', ${isoMs}) as "createdAt"
    from nestly.group_member_enforcements e
    left join nestly.regular_names n on n.user_id = e.user_id
    where e.group_id = ${groupId}::uuid ${own}
    order by e.created_at desc, e.id
    limit ${limit}`);
  return z.array(recordRow).parse(rows);
}

const pendingRow = z.object({
  id: z.guid(),
  inviterId: z.guid(),
  inviterName: z.string().nullable(),
  inviteeId: z.guid(),
  inviteeName: z.string().nullable(),
  createdAt: z.string(),
});

/** Invitations of the Group waiting for approval, oldest first (the Owner and Admins read them; anyone else reads none of another's). */
export async function readAwaitingInvitations(tx: IdentityTx, groupId: string, limit: number): Promise<z.infer<typeof pendingRow>[]> {
  const rows = await tx.execute(sql`
    select i.id, i.inviter_id as "inviterId", ni.full_name as "inviterName", i.invitee_id as "inviteeId", nv.full_name as "inviteeName",
           to_char(i.created_at at time zone 'UTC', ${isoMs}) as "createdAt"
    from nestly.group_invitations i
    left join nestly.regular_names ni on ni.user_id = i.inviter_id
    left join nestly.regular_names nv on nv.user_id = i.invitee_id
    where i.group_id = ${groupId}::uuid and i.status = 'awaiting_approval' and i.inviter_id <> (select auth.uid())
    order by i.created_at, i.id
    limit ${limit}`);
  return z.array(pendingRow).parse(rows);
}

/** Approve (the invitee is invited now) or reject an invitation that waits. Returns the rows changed (0: not one the caller may decide). */
export async function decideAwaitingInvitation(tx: IdentityTx, groupId: string, invitationId: string, status: 'pending' | 'rejected'): Promise<number> {
  const rows = await tx.execute(sql`
    update nestly.group_invitations set status = ${status}
    where id = ${invitationId}::uuid and group_id = ${groupId}::uuid and status = 'awaiting_approval' returning id`);
  return rows.length;
}
