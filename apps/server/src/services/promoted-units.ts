// Promoted units on the Directory, the Marketplace and the feed (I13; FR-ALG-007, BR-003, BR-004, BR-005, BR-053, BR-054, AC-062, AC-063,
// AC-068, VAL-012, VAL-030, ERR-028). The pipeline, per surface and page view:
//   1. eligibility — a running promotion of another account (no user block), its target still eligible (the viewer policy and the candidate
//      query), and matching the page: the surface's own filters (Directory, Marketplace) or, in the feed, the viewer's search topics
//      (Afik, 23.10.2026: Stage targeting deferred);
//   2. paid ranking — among the eligible paid candidates only: matching search topics (the feed), then the fewest impressions this
//      viewer had today (rotation), ties at random;
//   3. the frequency cap — a promotion this viewer already saw `dailyCap` times today is skipped (FR-ALG-007; the database counts no more);
//      the Marketplace has no cap (§11.3: every promoted listing that matches the search and the filters is shown at the top);
//   4. placement and label — Directory: up to `directoryUnitsPerPage` above the list; Marketplace: all matching, at the top; feed: a promoted
//      post after every 4 to 7 organic posts, by the last 48 hours' volume (§11.2). Always marked: "ממומן" for a Professional's profile or post,
//      "מודעה מקודמת" for a listing (§11.5).
// The organic list is read exactly as without promotions and is never re-ordered (BR-004, AC-062). The only targeting inputs are the surface,
// its query or category, the viewer's search topics, the promotion and the target (BR-053, AC-068): never a child, a pregnancy, a tracker, a
// chat, Support or a private Group. A skipped candidate is reported by reason only (ERR-028), never by id.

import { feedPromotionGap, type DirectoryQuery, type MarketplaceQuery, type ProfessionalCard, type UsageEventKind } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, SessionRefused, type IdentityTx } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readMarketplace, type ListingRow } from '../repositories/marketplace-repository.js';
import { readDirectory, readOwnAccountType } from '../repositories/professionals-repository.js';
import {
  insertExposureBatch,
  insertProfessionalView,
  insertPromotionEvent,
  insertUsageEvent,
  readMatchingPosts,
  readPromotedCandidates,
  readPromotionConfig,
  readRecentPostCount,
  readTodayImpressions,
  type ExposureBatch,
  type PromotedCandidate,
  type PromotionConfig,
} from '../repositories/promotions-repository.js';

/** Why an eligible-looking candidate was not shown (ERR-028): its frequency cap for this viewer, or it did not match the page. */
export type SkipReason = 'cap' | 'not_matching' | 'seen_today';
export type OnSkip = (reason: SkipReason, count: number) => void;

// ERR-028: where a skipped candidate's reason is recorded (the server's log, set once at start; by reason and count, never by id)
let skipLog: OnSkip = () => undefined;
export function onPromotionSkip(log: OnSkip): void {
  skipLog = log;
}

/** Only a Regular or a Professional is shown promoted units; a staff account (and no account) never. */
async function viewerSeesAds(tx: IdentityTx): Promise<boolean> {
  const type = await readOwnAccountType(tx);
  return type === 'regular' || type === 'professional';
}

/** Steps 2 and 3: the open candidates (under the cap) ranked by this viewer's impressions today, then at random; at most `limit`. */
export async function rankPaid(
  tx: IdentityTx,
  candidates: readonly PromotedCandidate[],
  config: PromotionConfig,
  limit: number,
  onSkip?: OnSkip,
  options: { readonly capped?: boolean; readonly relevance?: ReadonlyMap<string, number> } = {},
): Promise<PromotedCandidate[]> {
  if (candidates.length === 0 || limit <= 0) return [];
  const seen = await readTodayImpressions(tx, candidates.map((c) => c.promotionId));
  const open = options.capped === false ? [...candidates] : candidates.filter((c) => (seen.get(c.promotionId) ?? 0) < config.dailyCap);
  if (open.length < candidates.length) onSkip?.('cap', candidates.length - open.length);
  const relevance = (c: PromotedCandidate) => options.relevance?.get(c.targetId) ?? 0;
  return open
    .map((c) => ({ c, rel: relevance(c), key: seen.get(c.promotionId) ?? 0, tie: Math.random() }))
    .sort((a, b) => b.rel - a.rel || a.key - b.key || a.tie - b.tie)
    .slice(0, limit)
    .map(({ c }) => c);
}

/** The Directory's promoted Professionals (above the organic list, up to `directoryUnitsPerPage`), matching the page's filters. */
export async function promotedProfessionals(tx: IdentityTx, query: DirectoryQuery, onSkip: OnSkip = skipLog): Promise<{ promotionId: string; card: ProfessionalCard }[]> {
  if (!(await viewerSeesAds(tx))) return [];
  const candidates = await readPromotedCandidates(tx, 'profile');
  if (candidates.length === 0) return [];
  const config = await readPromotionConfig(tx);
  const cards = new Map((await readDirectory(tx, { ...query, sort: 'rating' }, [], candidates.map((c) => c.targetId))).map((card) => [card.id, card]));
  const matching = candidates.filter((c) => cards.has(c.targetId));
  if (matching.length < candidates.length) onSkip('not_matching', candidates.length - matching.length);
  return (await rankPaid(tx, matching, config, config.directoryUnitsPerPage, onSkip)).flatMap((c) => {
    const card = cards.get(c.targetId);
    return card === undefined ? [] : [{ promotionId: c.promotionId, card }];
  });
}

/** The Marketplace's promoted listings (§11.3): at the top, every one that matches the search and the filters, no cap; apart from the sponsored products. */
export async function promotedListings(tx: IdentityTx, query: MarketplaceQuery, onSkip: OnSkip = skipLog): Promise<{ promotionId: string; row: ListingRow }[]> {
  if (!(await viewerSeesAds(tx))) return [];
  const candidates = await readPromotedCandidates(tx, 'listing');
  if (candidates.length === 0) return [];
  const config = await readPromotionConfig(tx);
  const rows = new Map((await readMarketplace(tx, { ...query, sort: 'new' }, [], candidates.map((c) => c.targetId))).map((row) => [row.id, row]));
  const matching = candidates.filter((c) => rows.has(c.targetId));
  if (matching.length < candidates.length) onSkip('not_matching', candidates.length - matching.length);
  return (await rankPaid(tx, matching, config, matching.length, onSkip, { capped: false })).flatMap((c) => {
    const row = rows.get(c.targetId);
    return row === undefined ? [] : [{ promotionId: c.promotionId, row }];
  });
}

/**
 * The feed's promoted posts (§11.2): relevant to the viewer's search topics (Afik, 23.10.2026; Stage targeting deferred), not already on the page; one after every `gap`
 * organic posts, `gap` from 4 to 7 by the last 48 hours' volume. No matching topic, no promoted post; no Stage data is read. `seesAds`: the
 * caller already read the viewer's own account type in this transaction (the feed: a Regular or a Professional), so it is not read again.
 */
export async function promotedPosts(
  tx: IdentityTx,
  patterns: readonly string[],
  onPage: ReadonlySet<string>,
  organicCount: number,
  laterPage: boolean,
  onSkip: OnSkip = skipLog,
  known: { readonly seesAds?: boolean } = {},
): Promise<{ promotionId: string; postId: string; afterIndex: number }[]> {
  if (organicCount === 0 || !(known.seesAds ?? (await viewerSeesAds(tx)))) return [];
  const candidates = (await readPromotedCandidates(tx, 'post')).filter((c) => !onPage.has(c.targetId));
  if (candidates.length === 0) return [];
  if (patterns.length === 0) {
    onSkip('not_matching', candidates.length);
    return [];
  }
  const config = await readPromotionConfig(tx);
  const gap = feedPromotionGap(config, await readRecentPostCount(tx));
  const slots = Math.floor(organicCount / gap);
  if (slots === 0) return [];
  const relevance = await readMatchingPosts(tx, candidates.map((c) => c.targetId), patterns);
  // a later page of the same scroll never repeats a promotion the viewer already saw today (it would be dropped as a duplicate on screen)
  const seenToday = laterPage ? await readTodayImpressions(tx, candidates.map((c) => c.promotionId)) : new Map<string, number>();
  const relevant = candidates.filter((c) => relevance.has(c.targetId));
  if (relevant.length < candidates.length) onSkip('not_matching', candidates.length - relevant.length);
  const matching = relevant.filter((c) => (seenToday.get(c.promotionId) ?? 0) === 0);
  if (matching.length < relevant.length) onSkip('seen_today', relevant.length - matching.length);
  const chosen = await rankPaid(tx, matching, config, slots, onSkip, { relevance });
  return chosen.map((c, i) => ({ promotionId: c.promotionId, postId: c.targetId, afterIndex: gap * (i + 1) }));
}

/**
 * What one page view showed: the promoted units served, the usage event (`usageTimes` of it: one per post a feed page shows; default one), and
 * the Professionals whose profile or posts were seen (`times`: how many of their posts; default one).
 */
export interface Exposure {
  readonly impressions?: readonly string[];
  readonly usage?: UsageEventKind;
  readonly usageTimes?: number;
  readonly professionalViews?: readonly { readonly professionalId: string; readonly kind: 'profile_view' | 'post_view'; readonly times?: number }[];
}

/**
 * Records a page view's exposure in its own transaction, after the page was read (the feed reads at REPEATABLE READ; a counter written there
 * could meet a concurrent one). All rows go in one statement (insertExposureBatch: one round trip after the identity, instead of a savepoint,
 * a statement and a release per write). Should that statement be refused (a row a guard refuses), the rows are recorded again one by one,
 * each in its own savepoint, as before: a refusal records nothing for that row and never fails the page. Faults are swallowed too:
 * recording is never a reason for a page to fail. Answers whether every row was accepted and committed (a row the database drops silently,
 * such as a staff caller's, counts as accepted; a row refused in the one-by-one fallback answers false).
 */
export async function recordExposure(database: Database, identity: Identity, exposure: Exposure): Promise<boolean> {
  const batch: ExposureBatch = {
    impressions: exposure.impressions ?? [],
    ...(exposure.usage === undefined || (exposure.usageTimes ?? 1) < 1 ? {} : { usage: { kind: exposure.usage, times: exposure.usageTimes ?? 1 } }),
    views: (exposure.professionalViews ?? []).map((view) => ({ professionalId: view.professionalId, kind: view.kind, times: view.times ?? 1 })),
  };
  if (batch.impressions.length === 0 && batch.usage === undefined && batch.views.every((view) => view.times < 1)) return true;
  try {
    await inIdentityTransaction(database, identity, (tx) => insertExposureBatch(tx, batch));
    return true;
  } catch (error) {
    if (error instanceof SessionRefused) return false;
  }
  const writes: ((tx: IdentityTx) => Promise<void>)[] = [
    ...batch.impressions.map((id) => (tx: IdentityTx) => insertPromotionEvent(tx, id, 'impression')),
    ...(batch.usage === undefined ? [] : [(tx: IdentityTx) => insertUsageEvent(tx, batch.usage?.kind ?? 'post_view', batch.usage?.times ?? 1)]),
    ...batch.views.map((view) => (tx: IdentityTx) => insertProfessionalView(tx, view.professionalId, view.kind, view.times)),
  ];
  let refused = false;
  try {
    await inIdentityTransaction(database, identity, async (tx) => {
      for (const write of writes)
        await tx.transaction((savepoint) => write(savepoint)).catch(() => {
          refused = true;
        });
    });
    return !refused;
  } catch {
    // recording is best effort: the page has already been answered from its own transaction
    return false;
  }
}
