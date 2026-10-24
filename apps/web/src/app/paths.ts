import { CONVERSATION_PATTERN, SUPPORT_THREAD_PATTERN } from '@/lib/chat-link';
import { POST_PATTERN } from '@/lib/post-link';
import { USER_PROFILE_PATTERN } from '@/lib/profile-link';
import {
  FOLLOWING_PATH,
  HELP_REQUESTS_PATH,
  OFFERS_PATH,
  PRO_ARTICLES_PATH,
  PRO_BILLING_PATH,
  PRO_PROFILE_PATH,
  PRO_PROMOTION_PATH,
  PROFESSIONAL_PAGE_PATTERN,
  SERVICES_PATH,
} from '@/lib/professional-link';
import { TRACKER_PATTERN } from '@/lib/tracker-link';
import { EDIT_LISTING_PATTERN, LISTING_PATTERN, MARKETPLACE_PATH, MY_LISTINGS_PATH, NEW_LISTING_PATH } from '@/lib/marketplace-link';
import { GROUP_PATTERN } from '@/lib/group-link';

// The route table (F1.2, Q2). Guest paths are the allow-list: every other path is protected (deny by default).
export const PATHS = {
  welcome: '/',
  login: '/login',
  register: '/register',
  googleEntry: '/auth/google',
  recovery: '/recovery',
  // Placeholders until I9 (the consent documents); registration step 2 links to them (F1.4).
  terms: '/terms',
  privacy: '/privacy',
  home: '/home',
  feed: '/feed',
  profile: '/profile',
  settings: '/settings',
  /** F2.4b: the Friends page (PG-036), from the side menu. */
  friends: '/friends',
  /** I10: the Groups page (PG-033: my Groups, discovery, create) from the side menu, and one Group's page `/groups/<id>` (PG-034, PG-035), protected by pattern. */
  groups: '/groups',
  group: GROUP_PATTERN,
  /** F3.1b: `/posts/new` is only a redirect to the feed with the composer open (feed-composer); one post is `/posts/<post id>` (protected by pattern, see `postIdOfPath`). */
  newPost: '/posts/new',
  post: POST_PATTERN,
  /** F2.4c2: another person's profile, `/u/<user id>` (FR-PRIV-001 "Profile/Deep Link"). Protected by pattern: see `userIdOfProfilePath`. */
  userProfile: USER_PROFILE_PATTERN,
  /** FR-NOTIF-001 (PG-018): the notifications page, from the bell. */
  notifications: '/notifications',
  /** FR-SEARCH-001 (PG-017): the search results, `/search`; the text rides in the history state, never in the address. */
  search: '/search',
  /** F1.6: save the recovery questions (held there while missing) or change them. */
  recoveryQuestions: '/recovery-questions',
  /** F2.0 c14: set a new password after a takeover clear. Opens only while the session is held there. */
  setNewPassword: '/set-new-password',
  /** F2.0 c15: change the password with the two recovery answers, from the menu. */
  changePassword: '/change-password',
  /** F3.8: the medical hotlines page (PG-047, FR-MENU-002), from the side menu; BR-075 rule 2 links here (PG-049, its own part). */
  medicalHotlines: '/medical-hotlines',
  /** I4: the admin shell and its screens (FR-MOD-003, FR-ADMIN-005, PG-028); the server tells staff from the rest. */
  admin: '/admin',
  adminReports: '/admin/reports',
  adminUsers: '/admin/users',
  adminAudit: '/admin/audit',
  /** I8: the Support inbox (FR-ADMIN-002), SUPPORT_VIEW. */
  adminSupport: '/admin/support',
  /** I8: the Chat Center (FR-CHAT-001), from the Top Bar; one conversation is `/chat/<id>` (protected by pattern, see `conversationIdOfPath`). */
  chat: '/chat',
  conversation: CONVERSATION_PATTERN,
  /** I8: the Support form and the caller's requests (FR-ADMIN-001), from the side menu; one request is `/support/<id>` (`supportIdOfPath`). */
  support: '/support',
  supportThread: SUPPORT_THREAD_PATTERN,
  /** I5: the image approval queue (CONTENT_MODERATE). */
  adminMedia: '/admin/media',
  /** F3.7: the community rules page (PG-049, BR-075, Q2: signed-in only), from the side menu and the report window. */
  communityRules: '/community-rules',
  /** I6: one tracker page, `/trackers/<kind>` (the eight child trackers and `cycle`). Protected by pattern: see `trackerPageOfPath`. */
  tracker: TRACKER_PATTERN,
  /** I6: the Admin's guide management (FR-ADMIN-012). The server lets only an Admin read it; the shell links to it. */
  adminGuides: '/admin/guides',
  /** I14: the Moderators team (FR-ADMIN-004, Admin only), the community settings (FR-ADMIN-007), System Announcements (FR-ADMIN-008) and the
   *  analytics (FR-ADMIN-010); the server decides who reads each. */
  adminTeam: '/admin/team',
  adminCommunity: '/admin/community',
  adminAnnouncements: '/admin/announcements',
  adminAnalytics: '/admin/analytics',
  /** I14 completion: children's tracker data as trends only (CHILD_DATA_VIEW, §9.2). */
  adminChildData: '/admin/child-data',
  /** I14: joining the team with an invitation link (the one-time code rides in the fragment). Open to a Guest, and to an Auth session with no
   *  Nestly account yet (the person has just signed up there). */
  joinTeam: '/team/join',
  /** I11: the directory (FR-SERV-001), one Professional's page `/pros/<id>` (FR-SERV-003; by pattern, see `professionalIdOfPath`), the owner's
   *  profile and articles (FR-PRO-003), and Offer Help (FR-SERV-005/006). */
  services: SERVICES_PATH,
  professional: PROFESSIONAL_PAGE_PATTERN,
  proProfile: PRO_PROFILE_PATH,
  proArticles: PRO_ARTICLES_PATH,
  offers: OFFERS_PATH,
  /** I12: the Marketplace (PG-010, from the bottom navigation "חנות"), the caller's listings, a new listing, one listing `/marketplace/<id>`
   *  (PG-019) and its edit `/marketplace/<id>/edit` (both by pattern, see `listingIdOfPath`). */
  marketplace: MARKETPLACE_PATH,
  myListings: MY_LISTINGS_PATH,
  newListing: NEW_LISTING_PATH,
  listing: LISTING_PATTERN,
  editListing: EDIT_LISTING_PATTERN,
  /** I12: the staff's Marketplace listings (MARKETPLACE_MODERATE) and Sponsored Products (FR-ADMIN-009, Admin only). */
  adminMarketplace: '/admin/marketplace',
  adminSponsored: '/admin/sponsored',
  adminPromotions: '/admin/promotions',
  /** I11 follow-ups (Afik 21.10.2026, §9.8): the Professionals one follows (PG-039), a Professional's help-requests page, and its promotion and
   *  billing pages (I13 fills them). */
  following: FOLLOWING_PATH,
  helpRequests: HELP_REQUESTS_PATH,
  proPromotion: PRO_PROMOTION_PATH,
  proBilling: PRO_BILLING_PATH,
} as const;

/** The only paths a Guest may open. */
export const GUEST_PATHS: readonly string[] = [
  PATHS.welcome,
  PATHS.login,
  PATHS.register,
  PATHS.googleEntry,
  PATHS.recovery,
  PATHS.terms,
  PATHS.privacy,
  PATHS.joinTeam,
];

/** The screens a signed-in user may open. Any other path sends them to SIGNED_IN_LANDING. */
export const PROTECTED_PATHS: readonly string[] = [
  PATHS.home,
  PATHS.feed,
  PATHS.profile,
  PATHS.settings,
  PATHS.friends,
  PATHS.groups,
  PATHS.notifications,
  PATHS.search,
  PATHS.newPost,
  PATHS.recoveryQuestions,
  PATHS.changePassword,
  PATHS.medicalHotlines,
  PATHS.communityRules,
  PATHS.admin,
  PATHS.adminReports,
  PATHS.adminUsers,
  PATHS.adminAudit,
  PATHS.adminSupport,
  PATHS.chat,
  PATHS.support,
  PATHS.adminGuides,
  PATHS.adminMedia,
  PATHS.adminTeam,
  PATHS.adminCommunity,
  PATHS.adminAnnouncements,
  PATHS.adminAnalytics,
  PATHS.adminChildData,
  PATHS.services,
  PATHS.proProfile,
  PATHS.proArticles,
  PATHS.offers,
  PATHS.marketplace,
  PATHS.myListings,
  PATHS.newListing,
  PATHS.adminMarketplace,
  PATHS.adminSponsored,
  PATHS.adminPromotions,
  PATHS.following,
  PATHS.helpRequests,
  PATHS.proPromotion,
  PATHS.proBilling,
];

/** Where a Guest goes from a protected path (ERR-012, Q3): Welcome. The requested path is not kept. */
export const GUEST_LANDING = PATHS.welcome;

/** Where a signed-in user goes from a Guest path or an unknown one (FR-AUTH-002, DR-1). */
export const SIGNED_IN_LANDING = PATHS.feed;

/** The path without trailing slashes, so `/feed/` is `/feed`, as the router matches it. */
export function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}
