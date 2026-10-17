import { useEffect, useState } from 'react';
import { readOwnUserId } from '@/services/session/own-user-id';
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
      const userId = await readOwnUserId(account);
      if (current) setOwn({ kind: 'known', userId });
    })();
    return () => {
      current = false;
    };
  }, [account]);
  return own;
}
