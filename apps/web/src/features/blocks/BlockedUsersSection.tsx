import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessionAccount } from '@/hooks/use-session-account';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { BLOCKED_LOAD_FAILED_TEXT, UNBLOCK_FAILED_TEXT, UNBLOCKED_STATUS } from '@/lib/block-texts';
import { fetchBlocked, unblockUser, type BlocksOutcome } from '@/services/api/blocks';
import { BlockedUsersContent, type BlockedUsersView } from './BlockedUsersContent';

// The blocked list's flow (FR-REL-002): load the accounts the signed-in person blocked, and lift a block. The server and RLS decide whose
// blocks these are; this section sends the other account's id in the path only. A refused token (401) or a stopped account (403) asks the
// session for the account state again (ERR-038, ERR-037).
export function BlockedUsersSection() {
  const account = useSessionAccount();
  const [view, setView] = useState<BlockedUsersView>({ kind: 'loading' });
  const acting = useRef(false);
  const loads = useRef(0);

  const refused = useCallback(
    (outcome: BlocksOutcome): string | null => {
      if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
      return outcome.kind === 'account-unavailable' ? STOPPED_TEXT : null;
    },
    [account],
  );
  const token = useCallback(async (): Promise<string | null> => (account === null ? null : await account.getAccessToken().catch(() => null)), [account]);

  const load = useCallback(async () => {
    const run = (loads.current += 1);
    setView({ kind: 'loading' });
    const accessToken = await token();
    const outcome: BlocksOutcome = accessToken === null ? { kind: 'failed' } : await fetchBlocked(accessToken);
    if (run !== loads.current) return;
    if (outcome.kind === 'list') setView({ kind: 'list', blocked: outcome.blocked, busy: null, failure: null, status: '' });
    else setView({ kind: 'load-failed', message: refused(outcome) ?? BLOCKED_LOAD_FAILED_TEXT });
  }, [token, refused]);

  useEffect(() => {
    void load();
    return () => {
      loads.current += 1;
    };
  }, [load]);

  async function unblock(userId: string) {
    if (acting.current || view.kind !== 'list') return;
    acting.current = true;
    setView({ ...view, busy: userId, failure: null, status: '' });
    try {
      const accessToken = await token();
      const outcome: BlocksOutcome = accessToken === null ? { kind: 'failed' } : await unblockUser(accessToken, userId);
      setView((latest) => {
        if (latest.kind !== 'list') return latest;
        if (outcome.kind === 'done' || outcome.kind === 'gone') {
          return { ...latest, blocked: latest.blocked.filter((b) => b.userId !== userId), busy: null, status: UNBLOCKED_STATUS };
        }
        return { ...latest, busy: null, failure: refused(outcome) ?? UNBLOCK_FAILED_TEXT };
      });
    } finally {
      acting.current = false;
    }
  }

  return <BlockedUsersContent view={view} onRetry={() => void load()} onUnblock={(userId) => void unblock(userId)} />;
}
