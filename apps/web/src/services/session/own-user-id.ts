import { userIdOfAccessToken } from '@/lib/access-token';
import type { SessionAccount } from './session-source';

// The caller's own user id for the presentation uses of F2.4c2 (the link to copy, and telling the own link from another's): the `sub` of
// the held access token, read locally (no call to Auth: a screen that needs it, such as the feed and its Stories tray, opens without one).
// Never throws, never rejects; null when it cannot tell. Nothing is allowed or hidden because of it: the server verifies the token on every
// call and decides by it.
export async function readOwnUserId(account: SessionAccount | null): Promise<string | null> {
  if (account === null) return null;
  try {
    const token = await account.getAccessToken();
    return token === null ? null : userIdOfAccessToken(token);
  } catch {
    return null;
  }
}
