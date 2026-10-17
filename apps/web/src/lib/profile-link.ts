import { checkUserId } from '@nestly/shared';

// The address of a person's profile (FR-PRIV-001 "Profile/Deep Link", F2.4c2): `/u/<user id>` and nothing else in it. No name, token
// or other parameter ever goes into it (NFR-SEC-006 (4)); opening it always asks the server again.
export const USER_PROFILE_PATTERN = '/u/:userId';

export const userProfilePath = (userId: string): string => `/u/${userId}`;

/** The user id of a `/u/<id>` path (any trailing slash already removed), else null: only a uuid counts. */
export function userIdOfProfilePath(path: string): string | null {
  const match = /^\/u\/([^/]+)$/.exec(path);
  const checked = checkUserId(match?.[1]);
  return checked.ok ? checked.userId : null;
}
