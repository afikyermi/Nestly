import { POST_PATTERN } from '@/lib/post-link';
import { USER_PROFILE_PATTERN } from '@/lib/profile-link';
import { TRACKER_PATTERN } from '@/lib/tracker-link';

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
  /** F3.1b: `/posts/new` is only a redirect to the feed with the composer open (feed-composer); one post is `/posts/<post id>` (protected by pattern, see `postIdOfPath`). */
  newPost: '/posts/new',
  post: POST_PATTERN,
  /** F2.4c2: another person's profile, `/u/<user id>` (FR-PRIV-001 "Profile/Deep Link"). Protected by pattern: see `userIdOfProfilePath`. */
  userProfile: USER_PROFILE_PATTERN,
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
  /** F3.7: the community rules page (PG-049, BR-075, Q2: signed-in only), from the side menu and the report window. */
  communityRules: '/community-rules',
  /** I6: one tracker page, `/trackers/<kind>` (the eight child trackers and `cycle`). Protected by pattern: see `trackerPageOfPath`. */
  tracker: TRACKER_PATTERN,
  /** I6: the Admin's guide management (FR-ADMIN-012). The server lets only an Admin read it; the shell links to it. */
  adminGuides: '/admin/guides',
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
];

/** The screens a signed-in user may open. Any other path sends them to SIGNED_IN_LANDING. */
export const PROTECTED_PATHS: readonly string[] = [
  PATHS.home,
  PATHS.feed,
  PATHS.profile,
  PATHS.settings,
  PATHS.friends,
  PATHS.newPost,
  PATHS.recoveryQuestions,
  PATHS.changePassword,
  PATHS.medicalHotlines,
  PATHS.communityRules,
  PATHS.admin,
  PATHS.adminReports,
  PATHS.adminUsers,
  PATHS.adminAudit,
  PATHS.adminGuides,
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
