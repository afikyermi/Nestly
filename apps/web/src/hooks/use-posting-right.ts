import { useEffect, useState } from 'react';
import { fetchOwnProfile } from '@/services/api/profile';
import { useSessionAccount } from './use-session-account';

/** checking · allowed: a parent profile exists · not-allowed: the account has none (a Professional) · unknown: the check did not answer. */
export type PostingRight = 'checking' | 'allowed' | 'not-allowed' | 'unknown';

export interface PostingProfile {
  right: PostingRight;
  /** The own full name from the same answer, for a card shown at once after posting; null when there is none. */
  fullName: string | null;
}

// Whether the signed-in account is one that writes posts (FR-FEED-002: Regular only), to show or hide the button and the composer. It
// asks the own-profile call, which answers 404 no_profile for any account without a parent profile. Presentation only: the database
// refuses a post by anyone else whatever this says (403), and an unanswered check hides the button but never blocks the server.
export function usePostingProfile(): PostingProfile {
  const account = useSessionAccount();
  const [result, setResult] = useState<PostingProfile>({ right: 'checking', fullName: null });
  useEffect(() => {
    let current = true;
    void (async () => {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      const outcome = token === null ? ({ kind: 'failed' } as const) : await fetchOwnProfile(token);
      if (!current) return;
      if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
      if (outcome.kind === 'profile') setResult({ right: 'allowed', fullName: outcome.profile.fullName.trim() === '' ? null : outcome.profile.fullName });
      else setResult({ right: outcome.kind === 'no-profile' ? 'not-allowed' : 'unknown', fullName: null });
    })();
    return () => {
      current = false;
    };
  }, [account]);
  return result;
}

export function usePostingRight(): PostingRight {
  return usePostingProfile().right;
}
