import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { PATHS } from '@/app/paths';
import { useSessionAccount } from '@/hooks/use-session-account';
import type { ApiResult } from '@/services/api/trackers';

/**
 * Runs an API call with the session's access token. A refused token (401) or a stopped account (403) asks the session for the account
 * state again, and the session guard ends the session with its notice (ERR-038, ERR-037). No token: the call counts as failed. A
 * 404 no_profile (the account is not a Regular parent, e.g. a Professional, who has no home tracking) sends the user to the feed.
 */
export function useAuthedCall() {
  const account = useSessionAccount();
  const navigate = useNavigate();
  return useCallback(
    async <T>(run: (token: string) => Promise<ApiResult<T>>): Promise<ApiResult<T>> => {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      if (token === null) return { kind: 'failed' };
      const result = await run(token);
      if (result.kind === 'unauthenticated' || result.kind === 'account-unavailable') void account?.recheck();
      if (result.kind === 'no-profile') void navigate(PATHS.feed, { replace: true });
      return result;
    },
    [account, navigate],
  );
}
