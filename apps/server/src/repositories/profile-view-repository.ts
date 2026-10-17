// Another Regular account's profile, and the profile-open count (I2 F2.4c1; FR-PRIV-001, NFR-SEC-006; schema.md "Server"). Runs inside the
// caller's identity transaction and nowhere else. Both reads call nestly.profile_view(text), the one SECURITY DEFINER of the product:
// the database decides what the caller may see, counts the open against the stored limit and records the Security event. Nothing here
// filters by permission, reads a threshold or touches the counter; the id is the target, a key and never a permission filter.

import { profileViewRow, PROFILE_VIEW_OUTCOMES, type ProfileViewOutcome, type ProfileViewRow } from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

const viewRows = z.array(profileViewRow);
const outcomeRows = z.array(z.strictObject({ outcome: z.enum(PROFILE_VIEW_OUTCOMES) }));

/**
 * One open of `targetId`'s profile. Zero rows: the target is unavailable (unknown, not a Regular, stopped, malformed) or the caller is
 * not an active account; the open is counted all the same. One row: `shown`, or `limited` with nothing else set. A missing or invalid
 * configuration raises SQLSTATE NS001 and rolls the transaction back.
 */
export async function openProfile(tx: IdentityTx, targetId: string): Promise<ProfileViewRow[]> {
  return viewRows.parse(await tx.execute(sql`select * from nestly.profile_view(${targetId})`));
}

/** One open counted and nothing else read: a Friend Request's send counts as an open (c24); no profile data reaches the server. */
export async function countOpen(tx: IdentityTx, targetId: string): Promise<ProfileViewOutcome | undefined> {
  const [row, ...others] = outcomeRows.parse(await tx.execute(sql`select outcome from nestly.profile_view(${targetId})`));
  if (others.length > 0) throw new Error('profile_view returned more than one row');
  return row?.outcome;
}
