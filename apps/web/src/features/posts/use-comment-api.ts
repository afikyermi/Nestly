import { useCallback } from 'react';
import { useSessionAccount } from '@/hooks/use-session-account';
import { STOPPED_TEXT } from '@/lib/auth-texts';

export interface CommentApi {
  /** The current access token, or null when there is none. */
  token: () => Promise<string | null>;
  /**
   * What a refused answer means beyond the call: a refused token (401) or a stopped account (403) asks the session for the account
   * state again, and the session guard ends the session with its notice (ERR-038, ERR-037). Returns the stopped-account text for 403,
   * else null.
   */
  refused: (outcome: { kind: string }) => string | null;
}

export function useCommentApi(): CommentApi {
  const account = useSessionAccount();
  const token = useCallback(async (): Promise<string | null> => (account === null ? null : await account.getAccessToken().catch(() => null)), [account]);
  const refused = useCallback(
    (outcome: { kind: string }): string | null => {
      if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
      return outcome.kind === 'account-unavailable' ? STOPPED_TEXT : null;
    },
    [account],
  );
  return { token, refused };
}
