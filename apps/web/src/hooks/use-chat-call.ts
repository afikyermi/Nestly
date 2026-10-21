import { useCallback } from 'react';
import { useSessionAccount } from '@/hooks/use-session-account';
import type { ChatResult } from '@/services/api/chat';

/**
 * Runs one chat or Support call with the session's token. A refused token (401) or a stopped account (403) asks the session for the account state
 * again (ERR-038, ERR-037); the result goes back to the screen all the same. Without a session source the call fails.
 */
export function useChatCall() {
  const account = useSessionAccount();
  return useCallback(
    async <T,>(run: (token: string) => Promise<ChatResult<T>>): Promise<ChatResult<T>> => {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      if (token === null) return { kind: 'failed' };
      const result = await run(token);
      if (result.kind === 'unauthenticated' || result.kind === 'account-unavailable') void account?.recheck();
      return result;
    },
    [account],
  );
}
