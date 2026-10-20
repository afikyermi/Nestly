// The image approval queue (I5; Afik 20.10.2026, decisions-in-force.md §2; §3.2 CONTENT_MODERATE, the Admin always). The caller is
// authenticated; each call is one identity transaction. Who sees the queue and who decides is the database's (media_assets_select_staff,
// media_assets_update_staff, media_assets_update_guard); the decision is audited by the database in the same transaction (rule 18). A read
// address is signed only for the queued images the caller's own read returned.

import { BLOCKING_LABELS, type MediaDecision, type MediaQueueItem } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import type { MediaStorage } from '../media/storage-admin.js';
import { canModerateContent, decideImage, readQueue } from '../repositories/media-repository.js';

const QUEUE_PAGE = 50;

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
  const rows = await inIdentityTransaction(database, identity, async (tx) => ((await canModerateContent(tx)) ? readQueue(tx, QUEUE_PAGE) : undefined));
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
  return inIdentityTransaction(database, identity, async (tx) => ((await decideImage(tx, id, decision, isChild)) ? { kind: 'decided' } : { kind: 'not_found' }));
}
