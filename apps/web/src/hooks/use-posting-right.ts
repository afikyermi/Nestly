import { useEffect, useState } from 'react';
import { fetchOwnProfile } from '@/services/api/profile';
import { useSessionAccount } from './use-session-account';

/** checking · allowed: a parent profile exists · not-allowed: the account has none (a Professional) · unknown: the check did not answer. */
export type PostingRight = 'checking' | 'allowed' | 'not-allowed' | 'unknown';

// Whether the signed-in account is one that writes posts (FR-FEED-002: Regular only), to show or hide the button and the composer. It
// asks the own-profile call, which answers 404 no_profile for any account without a parent profile. Presentation only: the database
// refuses a post by anyone else whatever this says (403), and an unanswered check hides the button but never blocks the server.
export function usePostingRight(): PostingRight {
  const account = useSessionAccount();
  const [right, setRight] = useState<PostingRight>('checking');
  useEffect(() => {
    let current = true;
    void (async () => {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      const outcome = token === null ? ({ kind: 'failed' } as const) : await fetchOwnProfile(token);
      if (!current) return;
      if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
      setRight(outcome.kind === 'profile' ? 'allowed' : outcome.kind === 'no-profile' ? 'not-allowed' : 'unknown');
    })();
    return () => {
      current = false;
    };
  }, [account]);
  return right;
}
