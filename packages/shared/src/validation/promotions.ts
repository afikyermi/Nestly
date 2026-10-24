// Monetization (I13; FR-SERV-010, FR-MKT-004, FR-PRO-002, FR-ALG-007, NFR-SEC-007, BR-047, BR-057, VAL-012, VAL-032). What the client may send
// and what the server answers; the web checks every answer with these. No card, account or address field exists anywhere (AC-098): the payment is
// simulated and its price is a sample ("מחיר לדוגמה", OP-030).
import { z } from 'zod';
import { PROMOTION_PLAN_KEYS, PROMOTION_STATES, PROMOTION_TARGET_KINDS, type PromotionPlanKey, type PromotionTargetKind } from '../constants/promotions.js';

const uuid = z.guid();
const at = z.iso.datetime();
const count = z.number().int().nonnegative();
const kind = z.enum(PROMOTION_TARGET_KINDS);

/** The kind of target a plan is sold for (the plan's key starts with it). */
export function planTargetKind(plan: PromotionPlanKey): PromotionTargetKind {
  return plan.startsWith('profile') ? 'profile' : plan.startsWith('post') ? 'post' : 'listing';
}

/**
 * POST /api/promotions (FR-SERV-010, FR-MKT-004; VAL-051): a plan and the caller's own target of the plan's kind. Who owns the target, whether
 * it is still eligible and whether it is already promoted is the database's answer (ERR-047).
 */
export const promotionPurchaseSchema = z
  .strictObject({
    planKey: z.enum(PROMOTION_PLAN_KEYS),
    target: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('profile') }),
      z.strictObject({ kind: z.literal('post'), postId: uuid }),
      z.strictObject({ kind: z.literal('listing'), listingId: uuid }),
    ]),
  })
  .refine((value) => planTargetKind(value.planKey) === value.target.kind, { message: 'plan_kind', path: ['planKey'] });
export type PromotionPurchase = z.output<typeof promotionPurchaseSchema>;
export type PromotionPurchaseInput = z.input<typeof promotionPurchaseSchema>;

export const promotionIdParams = z.object({ id: uuid });

// ---- answers ---------------------------------------------------------------------------------------------------------------------------------

/** A sample plan: always shown with "מחיר לדוגמה" (OP-030). */
export const promotionPlan = z.strictObject({ key: z.enum(PROMOTION_PLAN_KEYS), targetKind: kind, days: z.number().int().positive(), samplePriceIls: z.number().int().positive() });
export type PromotionPlan = z.infer<typeof promotionPlan>;

/** The paid events of one promotion as counts (BR-057, AC-072: never who). */
export const paidCounts = z.strictObject({ impressions: count, clicks: count, follows: count, chatStarts: count });
export type PaidCounts = z.infer<typeof paidCounts>;

/** One of the caller's promotions (FR-SERV-010, FR-MKT-004). `targetLabel`: the post's opening words or the listing's title. */
export const promotionItem = z.strictObject({
  id: uuid,
  targetKind: kind,
  planKey: z.enum(PROMOTION_PLAN_KEYS),
  state: z.enum(PROMOTION_STATES),
  startsAt: at,
  endsAt: at,
  stoppedAt: at.nullable(),
  /** §11.1: who stopped it — the owner, or staff (the screen says "הקידום הופסק"; no refund). */
  stoppedBy: z.enum(['owner', 'staff']).nullable(),
  postId: uuid.nullable(),
  listingId: uuid.nullable(),
  targetLabel: z.string().nullable(),
  counts: paidCounts,
});
export type PromotionItem = z.infer<typeof promotionItem>;

/** A post the Professional may promote: its own, active, to everyone, not in a Group, not a share. */
export const promotablePost = z.strictObject({ id: uuid, excerpt: z.string() });
export type PromotablePost = z.infer<typeof promotablePost>;

/**
 * FR-PRO-002, BR-057, VAL-032: the Professional's own account, aggregates only, organic and paid apart. Derived cost (⭐): the sample price paid
 * over the paid clicks, "לדוגמה"; null with no click.
 */
export const professionalAnalytics = z.strictObject({
  days: z.number().int().positive(),
  organic: z.strictObject({
    profileViews: count,
    profileViewers: count,
    postViews: count,
    postReach: count,
    followers: count,
    engagement: count,
    chatStarts: count,
  }),
  paid: paidCounts.extend({ profileVisits: count, sampleSpentIls: count, costPerClickIls: z.number().nonnegative().nullable() }),
});
export type ProfessionalAnalytics = z.infer<typeof professionalAnalytics>;

/** GET /api/promotions: the plans for the caller's kind of account, its promotions, the posts it may promote and (a Professional) its analytics. */
export const promotionOverview = z.strictObject({
  plans: z.array(promotionPlan),
  promotions: z.array(promotionItem),
  posts: z.array(promotablePost),
  analytics: professionalAnalytics.nullable(),
});
export type PromotionOverview = z.infer<typeof promotionOverview>;

/** The simulated payment's receipt (NFR-SEC-007, AC-098): a reference, the sample amount, and that it was simulated. */
export const simulatedReceipt = z.strictObject({ reference: uuid, amountIls: z.number().int().positive(), isSimulated: z.literal(true) });
export const promotionPurchaseResponse = z.strictObject({ promotionId: uuid, receipt: simulatedReceipt });
export type PromotionPurchaseResult = z.infer<typeof promotionPurchaseResponse>;

/** PG-042: one simulated payment on the billing screen. */
export const billingItem = z.strictObject({
  id: uuid,
  planKey: z.enum(PROMOTION_PLAN_KEYS),
  targetKind: kind,
  amountIls: z.number().int().positive(),
  isSimulated: z.literal(true),
  reference: uuid,
  at,
});
export type BillingItem = z.infer<typeof billingItem>;
export const billingResponse = z.strictObject({ payments: z.array(billingItem) });

/**
 * The staff view of promotions (§11.1): the Admin sees every promotion and the payments' totals (BILLING_FINANCE_MANAGE, Admin Only); a Moderator
 * with CONTENT_MODERATE the promotions of Professionals, with MARKETPLACE_MODERATE those of listings. Counts only, never who saw them.
 */
export const adminPromotionItem = z.strictObject({
  id: uuid,
  ownerName: z.string().nullable(),
  ownerKind: z.enum(['regular', 'professional']),
  targetKind: kind,
  planKey: z.enum(PROMOTION_PLAN_KEYS),
  state: z.enum(PROMOTION_STATES),
  startsAt: at,
  endsAt: at,
  stoppedBy: z.enum(['owner', 'staff']).nullable(),
  /** The amount of the promotion's own payment; null for a Moderator, who reads no payment (BILLING_FINANCE_MANAGE). */
  amountIls: z.number().int().positive().nullable(),
  /** Paid counts; null for a Moderator, who reads no paid event (BILLING_FINANCE_MANAGE), rather than a misleading 0. */
  impressions: count.nullable(),
  clicks: count.nullable(),
});
export type AdminPromotionItem = z.infer<typeof adminPromotionItem>;
export const adminPromotionsResponse = z.strictObject({
  /** By state for everyone; the payments and the paid counts for the Admin only (null for a Moderator). */
  totals: z.strictObject({
    running: count,
    stopped: count,
    ended: count,
    payments: count.nullable(),
    sampleRevenueIls: count.nullable(),
    impressions: count.nullable(),
    clicks: count.nullable(),
  }),
  promotions: z.array(adminPromotionItem),
  /** The Admin only (BILLING_FINANCE_MANAGE): the payments' totals and the settings are shown; a Moderator sees its promotions only. */
  isFinance: z.boolean(),
});
export type AdminPromotions = z.infer<typeof adminPromotionsResponse>;

/** A promoted unit's handle on a surface: the promotion it was served for (a click is reported with it). */
export const promotionRef = z.strictObject({ promotionId: uuid });

/** POST /api/admin/promotions/:id/stop (§11.1): the reason, written to the Audit Log (1 to 500 characters after trimming). */
export const promotionStopSchema = z.strictObject({ reason: z.string().trim().min(1).max(500) });
export type PromotionStop = z.output<typeof promotionStopSchema>;

/** §11.2, FR-ALG-007, BR-059: the settings of promoted units — a new version, with a reason (BILLING_FINANCE_MANAGE). */
export const promotionSettingsWriteSchema = z
  .strictObject({
    dailyCap: z.number().int().min(1).max(100),
    directoryUnitsPerPage: z.number().int().min(1).max(3),
    feedGapMin: z.number().int().min(1).max(20),
    feedGapMax: z.number().int().min(1).max(20),
    feedLowPosts: z.number().int().min(0).max(100000),
    feedHighPosts: z.number().int().min(1).max(100000),
    reason: z.string().trim().min(1).max(500),
  })
  .refine((v) => v.feedGapMax >= v.feedGapMin, { message: 'gap_order', path: ['feedGapMax'] })
  .refine((v) => v.feedHighPosts > v.feedLowPosts, { message: 'posts_order', path: ['feedHighPosts'] });
export type PromotionSettingsWrite = z.output<typeof promotionSettingsWriteSchema>;
export type PromotionSettingsWriteInput = z.input<typeof promotionSettingsWriteSchema>;

export const promotionSettingsVersion = z.strictObject({
  version: z.number().int().positive(),
  dailyCap: z.number().int(),
  directoryUnitsPerPage: z.number().int(),
  feedGapMin: z.number().int(),
  feedGapMax: z.number().int(),
  feedLowPosts: z.number().int(),
  feedHighPosts: z.number().int(),
  /** From the version's Audit Log entry; null for v1 (the default the product started with). */
  reason: z.string().nullable(),
  at: at.nullable(),
});
export type PromotionSettingsVersion = z.infer<typeof promotionSettingsVersion>;
export const promotionSettingsResponse = z.strictObject({ versions: z.array(promotionSettingsVersion) });
export type PromotionSettingsResponse = z.infer<typeof promotionSettingsResponse>;

/**
 * §11.2: the organic posts between two promoted posts — feedGapMin when the last 48 hours had at most feedLowPosts posts, feedGapMax at or above
 * feedHighPosts, and in between by the same proportion, rounded.
 */
export function feedPromotionGap(config: { feedGapMin: number; feedGapMax: number; feedLowPosts: number; feedHighPosts: number }, recentPosts: number): number {
  if (recentPosts <= config.feedLowPosts) return config.feedGapMin;
  if (recentPosts >= config.feedHighPosts) return config.feedGapMax;
  const share = (recentPosts - config.feedLowPosts) / (config.feedHighPosts - config.feedLowPosts);
  return config.feedGapMin + Math.round((config.feedGapMax - config.feedGapMin) * share);
}
export const promotionSettingsCreated = z.strictObject({ version: z.number().int().positive() });
