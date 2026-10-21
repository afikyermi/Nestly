// A reporter's own reports (I3 F3.7; FR-MOD-001). Runs inside the caller's identity transaction and nowhere else. The only module that writes
// nestly.reports, and it never reads one back: nothing in the product reads, changes or withdraws a report (S-35; I4 builds the queue).
// Who may report what is the database's: reports_insert_reporter (an active account, reporter = auth.uid(), status open), reports_insert_check
// (a post or comment the reporter can read and did not write: 42501), reports_self_check (not their own account: 23514), the target foreign
// keys (an unknown id: 23503) and the one-report-per-person-and-target keys (23505). No statement carries the reporter: reporter_id defaults
// to auth.uid() and is never granted.

import { sql } from 'drizzle-orm';
import type { ReportWrite } from '@nestly/shared';
import type { IdentityTx } from '../db/identity-transaction.js';

/** Files the report: the target goes into the one column its kind names, the others stay null. A refusal propagates with its SQLSTATE. */
export async function insertReport(tx: IdentityTx, report: ReportWrite): Promise<void> {
  const target = report.targetId;
  const postId = report.targetKind === 'post' ? target : null;
  const commentId = report.targetKind === 'comment' ? target : null;
  const userId = report.targetKind === 'user' ? target : null;
  const messageId = report.targetKind === 'message' ? target : null;
  const listingId = report.targetKind === 'listing' ? target : null;
  const reviewId = report.targetKind === 'review' ? target : null;
  const articleId = report.targetKind === 'article' ? target : null;
  await tx.execute(
    sql`insert into nestly.reports (target_kind, post_id, comment_id, reported_user_id, message_id, listing_id, review_id, article_id, reason, details)
        values (${report.targetKind}, ${postId}::uuid, ${commentId}::uuid, ${userId}::uuid, ${messageId}::uuid, ${listingId}::uuid, ${reviewId}::uuid,
                ${articleId}::uuid, ${report.reason}, ${report.details})`,
  );
}
