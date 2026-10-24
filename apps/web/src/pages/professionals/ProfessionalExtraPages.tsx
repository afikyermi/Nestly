import { FollowingScreen } from '@/features/professionals/FollowingScreen';
import { HelpRequestsScreen } from '@/features/professionals/HelpRequestsScreen';
import { BillingScreen } from '@/features/promotions/BillingScreen';
import { PromotionScreen } from '@/features/promotions/PromotionScreen';
import { documentTitle } from '@/lib/document-title';
import { BILLING_TITLE, FOLLOWING_TITLE, HELP_REQUESTS_TITLE, PROMOTION_TITLE } from '@/lib/professional-texts';

/** PG-039: the Professionals the caller follows, from the side menu (I11 follow-ups). */
export function FollowingPage() {
  return (
    <>
      <title>{documentTitle(FOLLOWING_TITLE)}</title>
      <h1 className="text-h2">{FOLLOWING_TITLE}</h1>
      <div className="mt-5">
        <FollowingScreen />
      </div>
    </>
  );
}

/** The posts that ask for help: a Professional's bottom navigation item (Afik 21.10.2026, §9.8). */
export function HelpRequestsPage() {
  return (
    <>
      <title>{documentTitle(HELP_REQUESTS_TITLE)}</title>
      <h1 className="text-h2">{HELP_REQUESTS_TITLE}</h1>
      <div className="mt-5">
        <HelpRequestsScreen />
      </div>
    </>
  );
}

/** PG-041: promotion and its results (FR-SERV-010, FR-PRO-002; I13). */
export function PromotionPage() {
  return (
    <>
      <title>{documentTitle(PROMOTION_TITLE)}</title>
      <h1 className="text-h2">{PROMOTION_TITLE}</h1>
      <div className="mt-5">
        <PromotionScreen />
      </div>
    </>
  );
}

/** PG-042: billing (FR-SERV-010, NFR-SEC-007; I13): the simulated payments. */
export function BillingPage() {
  return (
    <>
      <title>{documentTitle(BILLING_TITLE)}</title>
      <h1 className="text-h2">{BILLING_TITLE}</h1>
      <div className="mt-5">
        <BillingScreen />
      </div>
    </>
  );
}
