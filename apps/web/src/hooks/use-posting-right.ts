import { useEffect, useState } from 'react';
import { fetchOwnProfile } from '@/services/api/profile';
import { useSessionAccount } from './use-session-account';

/**
 * checking · allowed: a parent profile exists (every option) · everyone-only: the account has none (a Professional, professional-posting
 * D1): a named post for everyone, no tag, no name notice · unknown: the check did not answer.
 */
export type PostingRight = 'checking' | 'allowed' | 'everyone-only' | 'unknown';

export interface PostingProfile {
  right: PostingRight;
  /** The own full name from the same answer, for a card shown at once after posting; null when there is none. */
  fullName: string | null;
}

// Which composer the signed-in account gets (FR-FEED-002: Regular and Professional; Afik 19.10 DR-2, DR-3). It asks the own-profile call,
// which answers 404 no_profile for any account without a parent profile; no account-type signal exists, so that is read as a Professional
// (D1). Presentation only: the database refuses whatever this shows (403), and an unanswered check hides the composer but never blocks the server.
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
      else setResult({ right: outcome.kind === 'no-profile' ? 'everyone-only' : 'unknown', fullName: null });
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
