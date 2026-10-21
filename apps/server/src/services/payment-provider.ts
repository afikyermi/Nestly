// The one payment interface (NFR-SEC-007, AC-098): every purchase goes through it, and a real payment provider replaces the simulated one here,
// with no change to any feature. The request names the plan only — never a card, an account, an address or an amount: the price is the sample
// list's ("מחיר לדוגמה", OP-030), copied by the database. The simulated provider moves no money and always succeeds.

import type { PromotionPlanKey } from '@nestly/shared';
import type { IdentityTx } from '../db/identity-transaction.js';
import { insertSimulatedPayment } from '../repositories/promotions-repository.js';

/** What a purchase asks the provider for: the plan, and nothing else. */
export interface PaymentRequest {
  readonly planKey: PromotionPlanKey;
}

/** What the provider answers: the payment row, its reference, the amount charged and whether it was simulated. */
export interface PaymentReceipt {
  readonly paymentId: string;
  readonly reference: string;
  readonly amountIls: number;
  readonly isSimulated: true;
}

export interface PaymentProvider {
  readonly name: 'simulated';
  /** Pays inside the caller's transaction, so the payment and the promotion it buys commit together or not at all. */
  pay(tx: IdentityTx, request: PaymentRequest): Promise<PaymentReceipt>;
}

/** The simulated provider: records a simulated payment of the plan's sample price; no money moves. */
export const simulatedPayments: PaymentProvider = {
  name: 'simulated',
  async pay(tx, request) {
    const row = await insertSimulatedPayment(tx, request.planKey);
    return { paymentId: row.id, reference: row.reference, amountIls: row.amountIls, isSimulated: true };
  },
};
