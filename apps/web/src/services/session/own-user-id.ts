import { userIdOfAccessToken } from '@/lib/access-token';
import type { SessionAccount } from './session-source';

// The caller's own user id for the two presentation uses of F2.4c2 (the link to copy, and telling the own link from another's):
// Auth's own answer for the held session first, else the `sub` of the access token. Never throws, never rejects; null when neither
// tells. Nothing is allowed or hidden because of it: the server decides by the verified token.
export async function readOwnUserId(account: SessionAccount | null): Promise<string | null> {
  if (account === null) return null;
  try {
    const fromAuth = account.getUserId === undefined ? null : await account.getUserId();
    if (fromAuth !== null) return fromAuth;
    const token = await account.getAccessToken();
    return token === null ? null : userIdOfAccessToken(token);
  } catch {
    return null;
  }
}
