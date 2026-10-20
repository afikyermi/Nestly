import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoriesResponse } from '@nestly/shared';
import { useSessionAccount } from '@/hooks/use-session-account';
import { fetchStories } from '@/services/api/media';

export type StoriesState = { kind: 'loading' } | { kind: 'ready'; data: StoriesResponse } | { kind: 'failed' };

// The live Stories the caller may see (FR-FEED-008; GET /api/stories): loaded with the feed, again after a publish. The server decides who
// sees what (the audience, the check, the 24 hours).
export function useStories(): { state: StoriesState; reload: () => Promise<void> } {
  const account = useSessionAccount();
  const [state, setState] = useState<StoriesState>({ kind: 'loading' });
  const runs = useRef(0);
  const reload = useCallback(async () => {
    const run = (runs.current += 1);
    const token = account === null ? null : await account.getAccessToken().catch(() => null);
    const outcome = token === null ? null : await fetchStories(token);
    if (run !== runs.current) return;
    if (outcome?.kind === 'ok') setState({ kind: 'ready', data: outcome.value });
    else {
      if (outcome?.kind === 'unauthenticated' || outcome?.kind === 'account-unavailable') void account?.recheck();
      setState((now) => (now.kind === 'ready' ? now : { kind: 'failed' }));
    }
  }, [account]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { state, reload };
}
