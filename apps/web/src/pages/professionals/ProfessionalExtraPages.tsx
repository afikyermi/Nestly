import { Link } from 'react-router';
import { FollowingScreen } from '@/features/professionals/FollowingScreen';
import { HelpRequestsScreen } from '@/features/professionals/HelpRequestsScreen';
import { documentTitle } from '@/lib/document-title';
import { PRO_ARTICLES_PATH } from '@/lib/professional-link';
import {
  BILLING_NOT_YET,
  BILLING_TITLE,
  FOLLOWING_TITLE,
  HELP_REQUESTS_TITLE,
  MY_ARTICLES,
  NOT_YET_NOTE,
  PROMOTION_NOT_YET,
  PROMOTION_TITLE,
} from '@/lib/professional-texts';

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

/** Promotion and its results (FR-PRO-002, built in I13): until then the page says that paid promotion is not available yet, and nothing more. */
export function PromotionPage() {
  return (
    <>
      <title>{documentTitle(PROMOTION_TITLE)}</title>
      <h1 className="text-h2">{PROMOTION_TITLE}</h1>
      <p className="mt-4">{PROMOTION_NOT_YET}</p>
      <p className="mt-2 text-small text-muted-foreground">{NOT_YET_NOTE}</p>
      <Link to={PRO_ARTICLES_PATH} className="mt-3 inline-flex min-h-11 items-center text-label text-primary-strong underline underline-offset-4">
        {MY_ARTICLES}
      </Link>
    </>
  );
}

/** Billing (FR-SERV-010, NFR-SEC-007, built in I13): until then the page says there is nothing to pay, and nothing more. */
export function BillingPage() {
  return (
    <>
      <title>{documentTitle(BILLING_TITLE)}</title>
      <h1 className="text-h2">{BILLING_TITLE}</h1>
      <p className="mt-4">{BILLING_NOT_YET}</p>
      <p className="mt-2 text-small text-muted-foreground">{NOT_YET_NOTE}</p>
    </>
  );
}
