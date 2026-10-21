import { useCallback } from 'react';
import { useSessionAccount } from '@/hooks/use-session-account';
import type { ProResult } from '@/services/api/professionals';

/**
 * Runs one Professionals call (I11) with the session's token. A refused token (401) or a stopped account (403) asks the session for the account
 * state again (ERR-038, ERR-037); the result goes back to the screen all the same. Without a session source the call fails.
 */
export function useProCall() {
  const account = useSessionAccount();
  return useCallback(
    async <T,>(run: (token: string) => Promise<ProResult<T>>): Promise<ProResult<T>> => {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      if (token === null) return { kind: 'failed' };
      const result = await run(token);
      if (result.kind === 'unauthenticated' || result.kind === 'account-unavailable') void account?.recheck();
      return result;
    },
    [account],
  );
}
