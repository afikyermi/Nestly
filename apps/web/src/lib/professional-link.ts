import { checkUserId } from '@nestly/shared';

// The address of a Professional's page (FR-SERV-003): `/pros/<user id>` and nothing else in it; opening it always asks the server again.
export const PROFESSIONAL_PAGE_PATTERN = '/pros/:professionalId';

export const professionalPagePath = (userId: string): string => `/pros/${userId}`;

/** The user id of a `/pros/<id>` path (any trailing slash already removed), else null: only a uuid counts. */
export function professionalIdOfPath(path: string): string | null {
  const match = /^\/pros\/([^/]+)$/.exec(path);
  const checked = checkUserId(match?.[1]);
  return checked.ok ? checked.userId : null;
}

/** I11 screens: the directory (FR-SERV-001), the owner's profile edit and articles (FR-PRO-003), and the Offer Help list (FR-SERV-006). */
export const SERVICES_PATH = '/services';
export const PRO_PROFILE_PATH = '/pro/profile';
export const PRO_ARTICLES_PATH = '/pro/articles';
export const OFFERS_PATH = '/offers';
/** I11 follow-ups (Afik 21.10.2026, §9.8): the Professionals one follows (PG-039), the posts that ask for help (a Professional's bottom navigation),
 * and the promotion and billing pages, which I13 fills (until then they say so). */
export const FOLLOWING_PATH = '/following';
export const HELP_REQUESTS_PATH = '/help-requests';
export const PRO_PROMOTION_PATH = '/pro/promotion';
export const PRO_BILLING_PATH = '/pro/billing';
