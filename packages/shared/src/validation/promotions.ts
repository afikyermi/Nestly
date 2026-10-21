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
 * POST /api/promotions (FR-SERV-010, FR-MKT-004; VAL-047): a plan and the caller's own target of the plan's kind. Who owns the target, whether
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

/** The Admin's view of promotions and payments (PG-059, BILLING_FINANCE_MANAGE, Admin Only): read only, counts only. */
export const adminPromotionItem = z.strictObject({
  id: uuid,
  ownerName: z.string().nullable(),
  ownerKind: z.enum(['regular', 'professional']),
  targetKind: kind,
  planKey: z.enum(PROMOTION_PLAN_KEYS),
  state: z.enum(PROMOTION_STATES),
  startsAt: at,
  endsAt: at,
  amountIls: z.number().int().positive(),
  impressions: count,
  clicks: count,
});
export type AdminPromotionItem = z.infer<typeof adminPromotionItem>;
export const adminPromotionsResponse = z.strictObject({
  totals: z.strictObject({ running: count, stopped: count, ended: count, payments: count, sampleRevenueIls: count, impressions: count, clicks: count }),
  promotions: z.array(adminPromotionItem),
});
export type AdminPromotions = z.infer<typeof adminPromotionsResponse>;

/** A promoted unit's handle on a surface: the promotion it was served for (a click is reported with it). */
export const promotionRef = z.strictObject({ promotionId: uuid });
