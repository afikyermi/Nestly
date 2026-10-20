import { useCallback } from 'react';
import { useSessionAccount } from '@/hooks/use-session-account';
import type { AdminOutcome } from '@/services/api/admin';

/**
 * Runs one admin call with the session's token. A refused token (401) or a stopped account (403) asks the session for the account state again
 * (ERR-038, ERR-037); the outcome is returned to the screen all the same. Without a session source the call fails.
 */
export function useAdminCall() {
  const account = useSessionAccount();
  return useCallback(
    async <T,>(run: (token: string) => Promise<AdminOutcome<T>>): Promise<AdminOutcome<T>> => {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      if (token === null) return { kind: 'failed' };
      const outcome = await run(token);
      if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
      return outcome;
    },
    [account],
  );
}
