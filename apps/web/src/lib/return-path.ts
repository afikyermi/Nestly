import { postIdOfPath } from './post-link';
import { userIdOfProfilePath } from './profile-link';

// The links a Guest is led back to after signing in (F2.4c2 c27, F3.6 c8, c9): a profile `/u/<uuid>` or a post `/posts/<uuid>`, exactly, and
// nothing else. Anything that only looks like one (another origin, `//host`, an encoded or backslash form, a dot segment, a non-uuid id) is
// not followed: the open-redirect allow-list. The caller removes trailing slashes first (normalizePath).
export function isReturnPath(path: string): boolean {
  return userIdOfProfilePath(path) !== null || postIdOfPath(path) !== null;
}
