// Account deletion (I9 part 1; FR-SET-002, BR-073, PG-050; decisions-in-force §16.4). Every statement runs in the caller's identity
// transaction. What may change is the database's: users_update_own_deletion_request / _cancel and users_status_guard() let only a
// Regular or Professional account move ITSELF active -> deletion_scheduled (the guard sets the date, request + 30 days; a Group Owner is
// refused with NS030, ERR-026) and back before the date; account_deletion_record() writes the deletion record in the same transaction.
// The `id = auth.uid()` below only aims the statement at the caller's own row (staff hold update policies on other accounts); it
// authorizes nothing. The deletion record is read through its policies: the Admin reads it all, an account only its own execute row.

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);

const dueRows = z.array(z.object({ dueAt: z.string() }));

/** The caller's own row: its status and, while scheduled, the date (users_select_own, any status). Undefined: no account row. */
export async function readOwnDeletion(tx: IdentityTx): Promise<{ status: string; dueAt: string | null } | undefined> {
  const rows = z
    .array(z.object({ status: z.string(), dueAt: z.string().nullable() }))
    .parse(
      await tx.execute(sql`
        select u.status, to_char(u.deletion_due_at at time zone 'UTC', ${isoMs}) as "dueAt"
        from nestly.users u where u.id = (select auth.uid())`),
    );
  return rows[0];
}

/** Schedules the caller's deletion. The date is the database's. Undefined when no row moved (staff, not active). */
export async function scheduleOwnDeletion(tx: IdentityTx): Promise<string | undefined> {
  const rows = dueRows.parse(
    await tx.execute(sql`
      update nestly.users set status = 'deletion_scheduled'
      where id = (select auth.uid()) and status = 'active'
      returning to_char(deletion_due_at at time zone 'UTC', ${isoMs}) as "dueAt"`),
  );
  return rows[0]?.dueAt;
}

/** Cancels the caller's scheduled deletion (PG-050). False when nothing was scheduled, or the date has passed (the policy). */
export async function cancelOwnDeletion(tx: IdentityTx): Promise<boolean> {
  const rows = await tx.execute(sql`
    update nestly.users set status = 'active'
    where id = (select auth.uid()) and status = 'deletion_scheduled'
    returning id`);
  return rows.length > 0;
}

/** True when the caller's identity has an executed deletion (its own execute row, account_deletion_events_select_own_execute). */
export async function hasOwnExecutedDeletion(tx: IdentityTx): Promise<boolean> {
  const rows = z
    .array(z.object({ found: z.boolean() }))
    .parse(await tx.execute(sql`select exists (select 1 from nestly.account_deletion_events e where e.kind = 'execute') as found`));
  return rows[0]?.found === true;
}

/**
 * The Admin's counts (§16.4): requests that no cancel or execution has closed, and those of them whose date has passed. A cancel and an
 * execution carry the date of the request they close, so a request is matched exactly. Read through the Admin's policy: anyone else
 * counts nothing.
 */
export async function countPendingDeletions(tx: IdentityTx): Promise<{ pending: number; overdue: number }> {
  const rows = z
    .array(z.object({ pending: z.coerce.number().int(), overdue: z.coerce.number().int() }))
    .parse(
      await tx.execute(sql`
        select count(*) as pending, count(*) filter (where r.due_at <= now()) as overdue
        from nestly.account_deletion_events r
        where r.kind = 'request'
          and not exists (select 1 from nestly.account_deletion_events c
                           where c.account_id = r.account_id and c.due_at = r.due_at and c.kind in ('cancel', 'execute'))`),
    );
  return rows[0] ?? { pending: 0, overdue: 0 };
}
