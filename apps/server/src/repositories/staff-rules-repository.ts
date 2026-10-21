// The staff's rules, second completion (I14 completion B; Afik 21.10.2026 (b), migration 20261023500000). Runs inside the caller's identity
// transaction. The database decides every one of these: a staff member deletes reported content only in the transaction that closed a report on
// it as justified (`*_delete_staff`), and the deletion writes its enforcement record and Audit entry itself (content_staff_delete); the openings
// of a reported comment and of a profile are recorded, and audited, by the database (reported_comment_views, profile_staff_views); the hides after
// ten identical reports are readable to REPORTS_VIEW only as an item and an end time. An id in a `where` below names the row, never a filter for
// permission.

import type { ContentDecision, ReportTargetKind } from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';

const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);

/** The kinds a justified report deletes (FR-MOD-003, OP-053): a user or a chat message is never deleted here (an enforcement acts on the account). */
export type DeletableKind = Extract<ReportTargetKind, 'post' | 'comment' | 'listing' | 'review' | 'article'>;
export const isDeletableKind = (kind: ReportTargetKind): kind is DeletableKind =>
  kind === 'post' || kind === 'comment' || kind === 'listing' || kind === 'review' || kind === 'article';

/**
 * Deletes reported content after its report was closed as justified in this transaction. A post is first moved to removed and a listing hidden,
 * as before, so that the images the model passed become training candidates by their existing triggers (BR-076), then the row goes. Returns the
 * rows deleted: 0 when the policies refuse (no justified report of this caller in this transaction, or no key).
 */
export async function deleteReportedContent(tx: IdentityTx, kind: DeletableKind, id: string): Promise<number> {
  if (kind === 'post') await tx.execute(sql`update nestly.posts set status = 'removed' where id = ${id}::uuid and status in ('active', 'hidden')`);
  if (kind === 'listing') await tx.execute(sql`update nestly.marketplace_listings set is_hidden = true where id = ${id}::uuid and not is_hidden`);
  const statement = {
    post: sql`delete from nestly.posts where id = ${id}::uuid returning id`,
    comment: sql`delete from nestly.comments where id = ${id}::uuid returning id`,
    listing: sql`delete from nestly.marketplace_listings where id = ${id}::uuid returning id`,
    review: sql`delete from nestly.professional_reviews where id = ${id}::uuid returning id`,
    article: sql`delete from nestly.professional_articles where id = ${id}::uuid returning id`,
  }[kind];
  return (await tx.execute(statement)).length;
}

/** Records one opening of a reported comment (audited: reported_comment_viewed), also after its report closed (Afik 21.10.2026). */
export async function recordCommentOpening(tx: IdentityTx, commentId: string): Promise<void> {
  await tx.execute(sql`
    insert into nestly.reported_comment_views (report_id)
    select r.id from nestly.reports r where r.comment_id = ${commentId}::uuid order by r.created_at, r.id limit 1`);
}

/** Records a staff member's opening of a profile (audited: staff_profile_viewed); in this transaction profile_view() shows it in full (BR-081). */
export async function recordProfileOpening(tx: IdentityTx, userId: string): Promise<void> {
  // a savepoint: an id that names no account (23503) records nothing and the open goes on (profile_view answers it as unavailable)
  try {
    await tx.transaction(async (sp) => {
      await sp.execute(sql`insert into nestly.profile_staff_views (target_id) values (${userId}::uuid)`);
    });
  } catch (error) {
    if (readDatabaseFault(error)?.code !== '23503') throw error;
  }
}

/** The account's enforcement history of reported content (USER_VIEW; the policies show it), newest first. */
export async function readContentDecisions(tx: IdentityTx, userId: string): Promise<ContentDecision[]> {
  return z
    .array(
      z.object({
        targetKind: z.enum(['post', 'comment', 'listing', 'review', 'article']),
        rule: z.string(),
        ruleLabel: z.string(),
        excerpt: z.string(),
        decidedAt: z.string(),
      }),
    )
    .parse(
      await tx.execute(sql`
        select e.target_kind as "targetKind", e.rule, rr.label as "ruleLabel", e.excerpt,
               to_char(e.decided_at at time zone 'UTC', ${isoMs}) as "decidedAt"
        from nestly.enforcement_records e join nestly.report_reasons rr on rr.key = e.rule
        where e.user_id = ${userId}::uuid
        order by e.decided_at desc, e.id desc
        limit 50`),
    );
}

/** The items hidden now after ten identical reports (BR-074), as REPORTS_VIEW reads them: the target ids. */
export async function readAutoHidden(tx: IdentityTx): Promise<Set<string>> {
  const rows = z
    .array(z.object({ target: z.guid() }))
    .parse(
      await tx.execute(sql`
        select coalesce(h.post_id, h.comment_id, h.listing_id, h.review_id, h.article_id) as target
        from nestly.report_auto_hides h where h.hidden_until > now()`),
    );
  return new Set(rows.map((row) => row.target));
}

