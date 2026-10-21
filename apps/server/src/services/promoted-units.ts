// Promoted units on the Directory, the Marketplace and the feed (I13; FR-ALG-007, BR-003, BR-004, BR-005, BR-053, BR-054, AC-062, AC-063,
// AC-068, VAL-012, VAL-030, ERR-028). The pipeline, per surface and page view:
//   1. eligibility — a running promotion of another account (no user block), its target still eligible (the viewer policy and the candidate
//      query), and matching the page: the surface's own filters (Directory, Marketplace) or the viewer's search topics (the feed, ⭐ 5);
//   2. paid ranking — among the eligible paid candidates only: the fewest impressions this viewer had today first (rotation), ties at random;
//   3. the frequency cap — a promotion this viewer already saw `dailyCap` times today is skipped (P-ALG-07; the database counts no more);
//   4. the label — the surface shows the unit apart from the organic list, always marked (the web's "פרסומת" / "מודעה מקודמת").
// The organic list is read exactly as without promotions and is never re-ordered (BR-004, AC-062). The only targeting inputs are the surface,
// its query or category, the viewer's search topics, the promotion and the target (BR-053, AC-068): never a child, a pregnancy, a tracker, a
// chat, Support or a private Group. A skipped candidate is reported by reason only (ERR-028), never by id.

import type { DirectoryQuery, MarketplaceQuery, ProfessionalCard, UsageEventKind } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readMarketplace, type ListingRow } from '../repositories/marketplace-repository.js';
import { readDirectory, readOwnAccountType } from '../repositories/professionals-repository.js';
import {
  insertProfessionalView,
  insertPromotionEvent,
  insertUsageEvent,
  readMatchingPosts,
  readPromotedCandidates,
  readPromotionConfig,
  readTodayImpressions,
  type PromotedCandidate,
  type PromotionConfig,
} from '../repositories/promotions-repository.js';

/** Why an eligible-looking candidate was not shown (ERR-028): its frequency cap for this viewer, or it did not match the page. */
export type SkipReason = 'cap' | 'not_matching';
export type OnSkip = (reason: SkipReason, count: number) => void;

/** Only a Regular or a Professional is shown promoted units; a staff account (and no account) never. */
async function viewerSeesAds(tx: IdentityTx): Promise<boolean> {
  const type = await readOwnAccountType(tx);
  return type === 'regular' || type === 'professional';
}

/** Steps 2 and 3: the open candidates (under the cap) ranked by this viewer's impressions today, then at random; at most `limit`. */
export async function rankPaid(tx: IdentityTx, candidates: readonly PromotedCandidate[], config: PromotionConfig, limit: number, onSkip?: OnSkip): Promise<PromotedCandidate[]> {
  if (candidates.length === 0 || limit <= 0) return [];
  const seen = await readTodayImpressions(tx, candidates.map((c) => c.promotionId));
  const open = candidates.filter((c) => (seen.get(c.promotionId) ?? 0) < config.dailyCap);
  if (open.length < candidates.length) onSkip?.('cap', candidates.length - open.length);
  return open
    .map((c) => ({ c, key: seen.get(c.promotionId) ?? 0, tie: Math.random() }))
    .sort((a, b) => a.key - b.key || a.tie - b.tie)
    .slice(0, limit)
    .map(({ c }) => c);
}

/** The Directory's promoted Professionals (⭐ 8: one framed unit above the organic list), matching the page's filters. */
export async function promotedProfessionals(tx: IdentityTx, query: DirectoryQuery, onSkip?: OnSkip): Promise<{ promotionId: string; card: ProfessionalCard }[]> {
  if (!(await viewerSeesAds(tx))) return [];
  const candidates = await readPromotedCandidates(tx, 'profile');
  if (candidates.length === 0) return [];
  const config = await readPromotionConfig(tx);
  const cards = new Map((await readDirectory(tx, { ...query, sort: 'rating' }, [], candidates.map((c) => c.targetId))).map((card) => [card.id, card]));
  const matching = candidates.filter((c) => cards.has(c.targetId));
  if (matching.length < candidates.length) onSkip?.('not_matching', candidates.length - matching.length);
  return (await rankPaid(tx, matching, config, config.unitsPerPage, onSkip)).flatMap((c) => {
    const card = cards.get(c.targetId);
    return card === undefined ? [] : [{ promotionId: c.promotionId, card }];
  });
}

/** The Marketplace's promoted listings (⭐ 8: their own strip above the list, apart from the sponsored products), matching the page's filters. */
export async function promotedListings(tx: IdentityTx, query: MarketplaceQuery, onSkip?: OnSkip): Promise<{ promotionId: string; row: ListingRow }[]> {
  if (!(await viewerSeesAds(tx))) return [];
  const candidates = await readPromotedCandidates(tx, 'listing');
  if (candidates.length === 0) return [];
  const config = await readPromotionConfig(tx);
  const rows = new Map((await readMarketplace(tx, { ...query, sort: 'new' }, [], candidates.map((c) => c.targetId))).map((row) => [row.id, row]));
  const matching = candidates.filter((c) => rows.has(c.targetId));
  if (matching.length < candidates.length) onSkip?.('not_matching', candidates.length - matching.length);
  return (await rankPaid(tx, matching, config, config.unitsPerPage, onSkip)).flatMap((c) => {
    const row = rows.get(c.targetId);
    return row === undefined ? [] : [{ promotionId: c.promotionId, row }];
  });
}

/**
 * The feed's promoted post (⭐ 5, ⭐ 8): one post whose text matches one of the viewer's search topics, not already on the page, placed after
 * `feedPosition` organic posts. No topic, no promoted post.
 */
export async function promotedPost(
  tx: IdentityTx,
  patterns: readonly string[],
  onPage: ReadonlySet<string>,
  onSkip?: OnSkip,
): Promise<{ promotionId: string; postId: string; afterIndex: number } | null> {
  if (patterns.length === 0 || !(await viewerSeesAds(tx))) return null;
  const candidates = (await readPromotedCandidates(tx, 'post')).filter((c) => !onPage.has(c.targetId));
  if (candidates.length === 0) return null;
  const config = await readPromotionConfig(tx);
  const matches = await readMatchingPosts(tx, candidates.map((c) => c.targetId), patterns);
  const matching = candidates.filter((c) => matches.has(c.targetId));
  if (matching.length < candidates.length) onSkip?.('not_matching', candidates.length - matching.length);
  const [chosen] = await rankPaid(tx, matching, config, 1, onSkip);
  return chosen === undefined ? null : { promotionId: chosen.promotionId, postId: chosen.targetId, afterIndex: config.feedPosition };
}

/** What one page view showed: the promoted units served, the usage event, and the Professionals whose profile or posts were seen. */
export interface Exposure {
  readonly impressions?: readonly string[];
  readonly usage?: UsageEventKind;
  readonly professionalViews?: readonly { readonly professionalId: string; readonly kind: 'profile_view' | 'post_view' }[];
}

/**
 * Records a page view's exposure in its own transaction, after the page was read (the feed reads at REPEATABLE READ; a counter written there
 * could meet a concurrent one). Each row in its own savepoint; a refusal (a promotion that just ended, a staff caller) records nothing and never
 * fails the page. Faults are swallowed too: recording is never a reason for a page to fail.
 */
export async function recordExposure(database: Database, identity: Identity, exposure: Exposure): Promise<void> {
  const writes: ((tx: IdentityTx) => Promise<void>)[] = [
    ...(exposure.impressions ?? []).map((id) => (tx: IdentityTx) => insertPromotionEvent(tx, id, 'impression')),
    ...(exposure.usage === undefined ? [] : [(tx: IdentityTx) => insertUsageEvent(tx, exposure.usage ?? 'post_view')]),
    ...(exposure.professionalViews ?? []).map((view) => (tx: IdentityTx) => insertProfessionalView(tx, view.professionalId, view.kind)),
  ];
  if (writes.length === 0) return;
  try {
    await inIdentityTransaction(database, identity, async (tx) => {
      for (const write of writes) await tx.transaction((savepoint) => write(savepoint)).catch(() => undefined);
    });
  } catch {
    // recording is best effort: the page has already been answered from its own transaction
  }
}
