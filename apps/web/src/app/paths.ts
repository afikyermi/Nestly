import { POST_PATTERN } from '@/lib/post-link';
import { USER_PROFILE_PATTERN } from '@/lib/profile-link';

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
  /** F3.1b: the post composer, and one post (`/posts/<post id>`; protected by pattern, see `postIdOfPath`). */
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
