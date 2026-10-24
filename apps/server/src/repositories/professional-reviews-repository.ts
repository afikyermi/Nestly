// Reviews of a Professional (I11; FR-SERV-011, BR-072, AC-093; I11 completion C §11.21: one per parent per Professional, editable and deletable
// by its writer; migration 20261024000000). Runs inside the caller's identity transaction only. Who reads, writes, edits or deletes a review is
// the database's (professional_reviews_*_reviewer, the update guard); nothing here narrows rows for permission. The writer is never readable
// (reviewer_id has no SELECT grant): the caller's own review is the one row the reviewer's update policy lets it lock, and an edit or a delete
// names the Professional only, the policy keeping it to the caller's own row.

import type { ProfessionalReviewItem, ReviewWrite } from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { isoMs } from './professionals-repository.js';

const PAGE_REVIEWS = 50;

const reviewRow = z.object({ id: z.guid(), rating: z.number().int(), text: z.string(), at: z.string(), editedAt: z.string().nullable() });

const reviewColumns = sql`r.id, r.rating, r.body as text, to_char(r.created_at at time zone 'UTC', ${isoMs}) as at,
  to_char(r.edited_at at time zone 'UTC', ${isoMs}) as "editedAt"`;

/** The Professional's active reviews the caller can read, newest first (BR-072). */
export async function readReviews(tx: IdentityTx, professionalId: string): Promise<ProfessionalReviewItem[]> {
  return z.array(reviewRow).parse(
    await tx.execute(sql`
      select ${reviewColumns}
      from nestly.professional_reviews r where r.professional_id = ${professionalId}::uuid and r.moderation = 'active'
      order by r.created_at desc, r.id limit ${PAGE_REVIEWS}`),
  );
}

/**
 * §11.21: the caller's own active review of this Professional, or undefined. A row lock (FOR UPDATE) passes only the rows the UPDATE policy's
 * USING also passes, and for a Regular that is professional_reviews_update_reviewer: its own unmoderated review (one per pair). Call it for a
 * Regular caller only (staff hold a moderation update policy of their own).
 */
export async function readOwnReview(tx: IdentityTx, professionalId: string): Promise<ProfessionalReviewItem | undefined> {
  const [row] = z.array(reviewRow).parse(
    await tx.execute(sql`
      select ${reviewColumns}
      from nestly.professional_reviews r where r.professional_id = ${professionalId}::uuid and r.moderation = 'active'
      for update`),
  );
  return row;
}

/** FR-SERV-011: one review per parent per Professional. A refusal propagates (42501 not eligible, 23505 already reviewed). */
export async function insertReview(tx: IdentityTx, professionalId: string, conversationId: string, review: ReviewWrite): Promise<void> {
  await tx.execute(sql`
    insert into nestly.professional_reviews (professional_id, conversation_id, rating, body)
    values (${professionalId}::uuid, ${conversationId}::uuid, ${review.rating}, ${review.text})`);
}

/** §11.21: the writer edits rating and text of its own review of the Professional; the row count (0: none it may edit). 42501 propagates. */
export async function updateOwnReview(tx: IdentityTx, professionalId: string, review: ReviewWrite): Promise<number> {
  const rows = await tx.execute(sql`
    update nestly.professional_reviews set rating = ${review.rating}, body = ${review.text}
    where professional_id = ${professionalId}::uuid returning 1`);
  return rows.length;
}

/** The writer deletes its own active review of the Professional; the row count (0: none it may delete). */
export async function deleteOwnReview(tx: IdentityTx, professionalId: string): Promise<number> {
  const rows = await tx.execute(sql`delete from nestly.professional_reviews where professional_id = ${professionalId}::uuid returning 1`);
  return rows.length;
}
