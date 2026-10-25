import { useEffect, useState } from 'react';
import { fetchOwnProfile, type ProfileOutcome } from '@/services/api/profile';
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
type Account = NonNullable<ReturnType<typeof useSessionAccount>>;

// The screens that mount together (the feed and its Stories tray) share one request while it is in flight, never a stored answer: a
// profile saved since is read again by the next mount (25.10: the feed asked /api/profile twice).
const inFlight = new WeakMap<Account, Promise<ProfileOutcome | { kind: 'failed' }>>();

function askOwnProfile(account: Account): Promise<ProfileOutcome | { kind: 'failed' }> {
  const pending = inFlight.get(account);
  if (pending !== undefined) return pending;
  const request = (async () => {
    const token = await account.getAccessToken().catch(() => null);
    return token === null ? ({ kind: 'failed' } as const) : await fetchOwnProfile(token);
  })().finally(() => inFlight.delete(account));
  inFlight.set(account, request);
  return request;
}

export function usePostingProfile(): PostingProfile {
  const account = useSessionAccount();
  const [result, setResult] = useState<PostingProfile>({ right: 'checking', fullName: null });
  useEffect(() => {
    let current = true;
    void (async () => {
      const outcome = account === null ? ({ kind: 'failed' } as const) : await askOwnProfile(account);
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
