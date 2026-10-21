// A staff review of a Private Group's page (I14 completion, §9.7, BR-040; migration 20261022800000). Runs inside the caller's identity
// transaction. The database decides: the row is written only for PRIVATE_GROUP_MODERATE (the Admin always) and an active Private Group
// (group_staff_views_insert_staff), audited in the same transaction (private_group_viewed); the Group's content is readable to that viewer inside
// this transaction only. Without the key or for a Public Group the statement writes nothing (its WHERE asks first, so nothing is refused).

import { sql } from 'drizzle-orm';
import type { IdentityTx } from '../db/identity-transaction.js';

/** Opens a Private Group's content for review in this transaction; returns whether it did. */
export async function openPrivateGroupForReview(tx: IdentityTx, groupId: string): Promise<boolean> {
  const rows = await tx.execute(sql`
    insert into nestly.group_staff_views (group_id)
    select g.id from nestly.groups g
    where g.id = ${groupId}::uuid and g.status = 'active' and g.privacy = 'private' and nestly.has_permission('PRIVATE_GROUP_MODERATE')
    returning id`);
  return rows.length > 0;
}
