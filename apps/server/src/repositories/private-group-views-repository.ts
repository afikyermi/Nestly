// Staff and Private Group content (I10; NFR-PRIV-002, BR-040, ERR-024; migration 20261022300000). Runs inside the staff member's identity
// transaction. A report on Private Group content keeps no copy of the text, and the content itself is readable to staff only inside a
// transaction that recorded a view of a report on it (private_group_content_views, audited as private_group_content_viewed). Who may record
// one (PRIVATE_GROUP_MODERATE with REPORTS_VIEW; the Admin always) is the database's.

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';

type ContentKind = 'post' | 'comment';

const column = (kind: ContentKind) => (kind === 'post' ? sql`r.post_id` : sql`r.comment_id`);

/** Whether the reports on this target (as the staff member may read them) say it is Private Group content. */
export async function isPrivateGroupTarget(tx: IdentityTx, kind: ContentKind, id: string): Promise<boolean> {
  const rows = await tx.execute(sql`select 1 from nestly.reports r where ${column(kind)} = ${id}::uuid and r.is_private_group limit 1`);
  return rows.length > 0;
}

/**
 * Opens the reported Private Group content for this transaction: one audited view of the newest report on it. False when the database refuses
 * (no PRIVATE_GROUP_MODERATE: ERR-024) or there is no such report; the refusal is caught in a savepoint so the transaction goes on.
 */
export async function openPrivateGroupContent(tx: IdentityTx, kind: ContentKind, id: string): Promise<boolean> {
  const reports = z
    .array(z.object({ id: z.guid() }))
    .parse(await tx.execute(sql`select r.id from nestly.reports r where ${column(kind)} = ${id}::uuid and r.is_private_group order by r.created_at desc, r.id limit 1`));
  const [report] = reports;
  if (report === undefined) return false;
  try {
    await tx.transaction(async (savepoint) => {
      await savepoint.execute(sql`insert into nestly.private_group_content_views (report_id) values (${report.id}::uuid)`);
    });
    return true;
  } catch (error) {
    if (readDatabaseFault(error)?.code === '42501') return false;
    throw error;
  }
}
