import { useCallback } from 'react';
import { useSessionAccount } from '@/hooks/use-session-account';
import type { GroupsOutcome } from '@/services/api/groups';

/**
 * Runs a Groups API call with the session's access token. A refused token (401) or a stopped account (403) asks the session for the account
 * state again, and the session guard ends the session with its notice (ERR-038, ERR-037). No token: the call counts as failed.
 */
export function useGroupsCall() {
  const account = useSessionAccount();
  return useCallback(
    async <T>(run: (token: string) => Promise<GroupsOutcome<T>>): Promise<GroupsOutcome<T>> => {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      if (token === null) return { kind: 'error', error: 'failed' };
      const result = await run(token);
      if (result.kind === 'error' && (result.error === 'unauthenticated' || result.error === 'account-unavailable')) void account?.recheck();
      return result;
    },
    [account],
  );
}
