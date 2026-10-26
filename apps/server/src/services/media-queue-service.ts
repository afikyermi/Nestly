// The image approval queue (I5; Afik 20.10.2026, decisions-in-force.md §2; §3.2 CONTENT_MODERATE, the Admin always). The caller is
// authenticated; each call is one identity transaction. Who sees the queue and who decides is the database's (media_assets_select_staff,
// media_assets_update_staff, media_assets_update_guard); the decision is audited by the database in the same transaction (rule 18). A read
// address is signed only for the queued images the caller's own read returned, fresh on every read (never reused: these are images under
// review, and staff addresses are not kept).

import { BLOCKING_LABELS, MEDIA_QUEUE_PAGE, type MediaDecision, type MediaQueueItem, type MatchDecision } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import type { MediaStorage } from '../media/storage-admin.js';
import { DecisionNotApplied, canModerateContent, canRemoveCheckedImage, decideImage, readQueue, removeCheckedImage, decideMatch } from '../repositories/media-repository.js';

export type QueueOutcome = { readonly kind: 'queue'; readonly items: MediaQueueItem[] } | { readonly kind: 'forbidden' };

function topOf(scores: Readonly<Record<string, number>> | null): { topLabel: string | null; topScore: number | null } {
  if (scores === null) return { topLabel: null, topScore: null };
  let best: { topLabel: string | null; topScore: number | null } = { topLabel: null, topScore: null };
  for (const label of BLOCKING_LABELS) {
    const score = scores[label];
    if (score !== undefined && (best.topScore === null || score > best.topScore)) best = { topLabel: label, topScore: Math.min(1, Math.max(0, score)) };
  }
  return best;
}

export async function readMediaQueue(database: Database, identity: Identity, storage: MediaStorage): Promise<QueueOutcome> {
  const rows = await inIdentityTransaction(database, identity, async (tx) => ((await canModerateContent(tx)) ? readQueue(tx, MEDIA_QUEUE_PAGE) : undefined));
  if (rows === undefined) return { kind: 'forbidden' };
  const urls = await storage.signedUrls(
    rows.map((row) => row.id),
    600,
  );
  return {
    kind: 'queue',
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      queueReason: row.queueReason,
      ...topOf(row.scores),
      isChild: row.isChild,
      createdAt: row.createdAt,
      url: urls.get(row.id) ?? null,
      width: row.width,
      height: row.height,
    })),
  };
}

export type DecideOutcome = { readonly kind: 'decided' } | { readonly kind: 'not_found' };

/** One decision; `not_found` when the database did not apply it (not queued any more, not the caller's to decide, or gone). */
export async function decideQueuedImage(database: Database, identity: Identity, id: string, decision: MediaDecision, isChild: boolean): Promise<DecideOutcome> {
  try {
    return await inIdentityTransaction(database, identity, async (tx) => ((await decideImage(tx, id, decision, isChild)) ? { kind: 'decided' } : { kind: 'not_found' }));
  } catch (error) {
    if (error instanceof DecisionNotApplied) return { kind: 'not_found' };
    throw error;
  }
}

/** I14 completion B (Afik 21.10.2026): staff decide a block-list match (CONTENT_MODERATE); `not_found` when nothing was decided. */
export async function decideBlockListMatch(database: Database, identity: Identity, id: string, decision: MatchDecision): Promise<DecideOutcome> {
  return inIdentityTransaction(database, identity, async (tx) => ((await decideMatch(tx, id, decision)) ? { kind: 'decided' } : { kind: 'not_found' }));
}

export type RemovalOutcome = { readonly kind: 'removed' } | { readonly kind: 'forbidden' } | { readonly kind: 'not_found' };

/** A checked image removed after a report, or as a suspicion (M6). `not_found` when the database did not apply it (not checked, no report
 *  and no suspicion, not readable by the caller, or gone). */
export async function removeImageAfterReport(database: Database, identity: Identity, id: string, suspected: boolean): Promise<RemovalOutcome> {
  try {
    return await inIdentityTransaction(database, identity, async (tx): Promise<RemovalOutcome> => {
      if (!(await canRemoveCheckedImage(tx))) return { kind: 'forbidden' };
      return (await removeCheckedImage(tx, id, suspected)) ? { kind: 'removed' } : { kind: 'not_found' };
    });
  } catch (error) {
    if (error instanceof DecisionNotApplied) return { kind: 'not_found' };
    throw error;
  }
}
