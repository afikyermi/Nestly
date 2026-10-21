// Monetization (I13; FR-SERV-010, FR-MKT-004, FR-PRO-002, NFR-SEC-007, BR-003, BR-004, BR-020, BR-047, BR-057, AC-057, AC-072, AC-098, ERR-047).
// The caller is authenticated; each call is one identity transaction. The database decides who may buy which promotion of which target (the
// I13 policies and triggers); this layer orders one purchase — the simulated payment through the one payment interface, then the promotion
// it buys, together — and names a database refusal by its SQLSTATE: 23505 the target already runs a promotion and 42501 the target is not the
// caller's or no longer eligible (both ERR-047), 23503 no such plan or target. A promotion buys reach only: nothing here writes an organic row.

import {
  PROMOTION_ANALYTICS_DAYS,
  type AdminPromotions,
  type BillingItem,
  type ProfessionalAnalytics,
  type PromotionOverview,
  type PromotionPurchase,
  type PromotionPurchaseResult,
  type PromotionTargetKind,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { readStaffAccess } from '../repositories/admin-repository.js';
import { readDashboard, readOwnAccountType } from '../repositories/professionals-repository.js';
import {
  insertPromotion,
  insertPromotionEvent,
  readAdminPromotions,
  readOwnAnalyticsCounts,
  readOwnPayments,
  readOwnPromotions,
  readPlans,
  readPromotablePosts,
  stopPromotion,
} from '../repositories/promotions-repository.js';
import { simulatedPayments, type PaymentProvider } from './payment-provider.js';

export type PromotionRefusal =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'not_allowed' }
  | { readonly kind: 'already_promoted' }
  | { readonly kind: 'forbidden' };
export type PromotionOutcome<T> = ({ readonly kind: 'ok' } & T) | PromotionRefusal;

/** ERR-047 and the rest, by SQLSTATE; undefined for anything else (a fault, rethrown). */
function refusalOf(error: unknown): PromotionRefusal | undefined {
  switch (readDatabaseFault(error)?.code) {
    case '23505':
      return { kind: 'already_promoted' };
    case '42501':
      return { kind: 'not_allowed' };
    case '23503':
      return { kind: 'unavailable' };
    case '23514':
    case '22P02':
      return { kind: 'invalid' };
    default:
      return undefined;
  }
}

async function guarded<T>(work: () => Promise<PromotionOutcome<T>>): Promise<PromotionOutcome<T>> {
  try {
    return await work();
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal === undefined) throw error;
    return refusal;
  }
}

/** Which targets an account may promote (BR-047: a Professional its profile and posts; BR-020: a Regular its listings). */
function kindsFor(accountType: string | undefined): PromotionTargetKind[] {
  if (accountType === 'professional') return ['profile', 'post'];
  if (accountType === 'regular') return ['listing'];
  return [];
}

/**
 * POST /api/promotions (FR-SERV-010, FR-MKT-004): pays through the one payment interface and creates the promotion in the same transaction;
 * any refusal rolls both back (no payment without its promotion).
 */
export async function buyPromotion(
  database: Database,
  identity: Identity,
  purchase: PromotionPurchase,
  payments: PaymentProvider = simulatedPayments,
): Promise<PromotionOutcome<PromotionPurchaseResult>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<PromotionOutcome<PromotionPurchaseResult>> => {
      const { target } = purchase;
      const receipt = await payments.pay(tx, { planKey: purchase.planKey });
      const promotionId = await insertPromotion(tx, {
        targetKind: target.kind,
        planKey: purchase.planKey,
        paymentId: receipt.paymentId,
        postId: target.kind === 'post' ? target.postId : null,
        listingId: target.kind === 'listing' ? target.listingId : null,
      });
      return { kind: 'ok', promotionId, receipt: { reference: receipt.reference, amountIls: receipt.amountIls, isSimulated: receipt.isSimulated } };
    }),
  );
}

/** POST /api/promotions/:id/stop: the owner stops its running promotion early; `unavailable` when it is not the caller's or not running. */
export async function stopOwnPromotion(database: Database, identity: Identity, id: string): Promise<PromotionOutcome<object>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<PromotionOutcome<object>> => ((await stopPromotion(tx, id)) === 0 ? { kind: 'unavailable' } : { kind: 'ok' })),
  );
}

/** FR-PRO-002 (⭐ 9): the derived cost — the sample price paid over the paid clicks, one decimal; null with no click. */
export function costPerClick(spentIls: number, clicks: number): number | null {
  return clicks > 0 ? Math.round((spentIls / clicks) * 10) / 10 : null;
}

/** GET /api/promotions (PG-041, FR-SERV-010, FR-PRO-002): the plans, the caller's promotions, its promotable posts and its own analytics. */
export async function readOverview(database: Database, identity: Identity): Promise<PromotionOverview> {
  return inIdentityTransaction(database, identity, async (tx): Promise<PromotionOverview> => {
    const accountType = await readOwnAccountType(tx);
    const kinds = kindsFor(accountType);
    const plans = await readPlans(tx, kinds);
    const promotions = kinds.length === 0 ? [] : await readOwnPromotions(tx);
    if (accountType !== 'professional') return { plans, promotions, posts: [], analytics: null };
    const posts = await readPromotablePosts(tx);
    const counts = await readOwnAnalyticsCounts(tx, PROMOTION_ANALYTICS_DAYS);
    const dashboard = await readDashboard(tx);
    const analytics: ProfessionalAnalytics = {
      days: PROMOTION_ANALYTICS_DAYS,
      organic: {
        profileViews: counts.profileViews,
        profileViewers: counts.profileViewers,
        postViews: counts.postViews,
        postReach: counts.postReach,
        followers: dashboard?.followers ?? 0,
        engagement: dashboard?.engagement30d ?? 0,
        chatStarts: dashboard?.chatStarts30d ?? 0,
      },
      paid: {
        impressions: counts.impressions,
        clicks: counts.clicks,
        profileVisits: counts.profileVisits,
        follows: counts.follows,
        chatStarts: counts.chatStarts,
        sampleSpentIls: counts.spent,
        costPerClickIls: costPerClick(counts.spent, counts.clicks),
      },
    };
    return { plans, promotions, posts, analytics };
  });
}

/** GET /api/promotions/billing (PG-042): the caller's simulated payments. */
export async function readBilling(database: Database, identity: Identity): Promise<BillingItem[]> {
  return inIdentityTransaction(database, identity, (tx) => readOwnPayments(tx));
}

/** POST /api/promotions/:id/click: the viewer opened a promoted unit (a paid click; the owner's own and staff's are refused by the database). */
export async function recordClick(database: Database, identity: Identity, id: string): Promise<PromotionOutcome<object>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<PromotionOutcome<object>> => {
      await insertPromotionEvent(tx, id, 'click');
      return { kind: 'ok' };
    }),
  );
}

/** GET /api/admin/promotions (PG-059, ⭐ 1): every promotion and payment, read only; BILLING_FINANCE_MANAGE (Admin Only), else forbidden. */
export async function readAdminView(database: Database, identity: Identity): Promise<PromotionOutcome<{ view: AdminPromotions }>> {
  return inIdentityTransaction(database, identity, async (tx): Promise<PromotionOutcome<{ view: AdminPromotions }>> => {
    const access = await readStaffAccess(tx);
    // BILLING_FINANCE_MANAGE is Admin Only (§3.2): no Moderator holds it, so the Admin's role is the check; the finance policies decide the rows
    if (access?.role !== 'admin') return { kind: 'forbidden' };
    return { kind: 'ok', view: await readAdminPromotions(tx) };
  });
}
