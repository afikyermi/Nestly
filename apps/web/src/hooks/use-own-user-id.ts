import { useEffect, useState } from 'react';
import { userIdOfAccessToken } from '@/lib/access-token';
import { useSessionAccount } from './use-session-account';

/** `loading` until the token is read; then the caller's user id, or null when it cannot be told. */
export type OwnUserId = { kind: 'loading' } | { kind: 'known'; userId: string | null };

// The caller's own user id, to tell the caller's own profile link from another person's (F2.4c2 c27, DR-O). Presentation only.
export function useOwnUserId(): OwnUserId {
  const account = useSessionAccount();
  const [own, setOwn] = useState<OwnUserId>({ kind: 'loading' });
  useEffect(() => {
    let current = true;
    void (async () => {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      if (current) setOwn({ kind: 'known', userId: token === null ? null : userIdOfAccessToken(token) });
    })();
    return () => {
      current = false;
    };
  }, [account]);
  return own;
}
