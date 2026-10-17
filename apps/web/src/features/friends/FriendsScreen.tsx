import { useCallback, useEffect, useRef, useState } from 'react';
import type { FriendLists } from '@nestly/shared';
import { useSessionAccount } from '@/hooks/use-session-account';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { actOnFriend, fetchFriendLists, type FriendAction, type FriendsOutcome } from '@/services/api/friends';
import { FriendsContent, type FriendsFocus, type FriendsView } from './FriendsContent';
import {
  ACCEPTED_STATUS,
  ACTION_FAILED_TEXT,
  CANCELLED_STATUS,
  DECLINED_STATUS,
  FRIEND_GONE_TEXT,
  GONE_TEXT,
  LOAD_FAILED_TEXT,
  REMOVED_STATUS,
} from './friends-texts';

type Loaded = Extract<FriendsView, { kind: 'loaded' }>;

const STATUS_OF: Record<FriendAction, string> = {
  accept: ACCEPTED_STATUS,
  decline: DECLINED_STATUS,
  cancel: CANCELLED_STATUS,
  remove: REMOVED_STATUS,
};

/** The lists after `action` took effect on `userId`, without asking the server again: an accepted request becomes a Friend. */
function applied(lists: FriendLists, action: FriendAction, userId: string): FriendLists {
  const without = <T extends { userId: string }>(entries: T[]) => entries.filter((entry) => entry.userId !== userId);
  switch (action) {
    case 'accept': {
      const accepted = lists.incoming.find((entry) => entry.userId === userId);
      return {
        incoming: without(lists.incoming),
        sent: lists.sent,
        friends: accepted === undefined ? lists.friends : [...lists.friends, { userId: accepted.userId, fullName: accepted.fullName }],
      };
    }
    case 'decline':
      return { ...lists, incoming: without(lists.incoming) };
    case 'cancel':
      return { ...lists, sent: without(lists.sent) };
    case 'remove':
      return { ...lists, friends: without(lists.friends) };
  }
}

const FOCUS_AFTER: Record<FriendAction, FriendsFocus['target']> = {
  accept: 'friends',
  decline: 'incoming',
  cancel: 'sent',
  remove: 'friends',
};

// The Friends page's flow (PG-036, FR-REL-001; F2.4b): load the own lists, accept or decline a request, cancel one sent, remove a
// Friend after a confirmation. The server and RLS decide whose rows they are; this page sends the other person's user id in the
// path and never its own. A refused token (401) or a stopped account (403) asks the session for the account state again, and the
// session guard ends the session with its notice (ERR-038, ERR-037).
export function FriendsScreen() {
  const account = useSessionAccount();
  const [view, setView] = useState<FriendsView>({ kind: 'loading' });
  const [focus, setFocus] = useState<FriendsFocus>({ target: 'message', tick: 0 });
  // Set synchronously when an action starts, so a second press before the next render sends nothing (c14).
  const acting = useRef(false);
  const loads = useRef(0);

  const focusOn = (target: FriendsFocus['target']) => setFocus((current) => ({ target, tick: current.tick + 1 }));

  // What a refused answer means beyond this page: the session guard is told to look again.
  const refused = useCallback(
    (outcome: FriendsOutcome): string | null => {
      if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
      return outcome.kind === 'account-unavailable' ? STOPPED_TEXT : null;
    },
    [account],
  );

  const token = useCallback(async (): Promise<string | null> => (account === null ? null : await account.getAccessToken().catch(() => null)), [account]);

  const load = useCallback(
    async (afterRetry: boolean) => {
      const run = (loads.current += 1);
      setView({ kind: 'loading' });
      const accessToken = await token();
      const outcome: FriendsOutcome = accessToken === null ? { kind: 'failed' } : await fetchFriendLists(accessToken);
      if (run !== loads.current) return;
      if (outcome.kind === 'lists') {
        setView({ kind: 'loaded', lists: outcome.lists, busy: null, failure: null, status: '', confirm: null });
        // "נסו שוב" is gone with the failure: focus goes to the first list.
        if (afterRetry) focusOn('incoming');
        return;
      }
      setView({ kind: 'load-failed', message: refused(outcome) ?? LOAD_FAILED_TEXT });
      if (afterRetry) focusOn('message');
    },
    [token, refused],
  );

  useEffect(() => {
    void load(false);
    return () => {
      loads.current += 1;
    };
  }, [load]);

  // 409 request_gone (c14): what the list showed is out of date. It reloads in place, keeping the page, and says so.
  async function reloadAfterGone(message: string): Promise<void> {
    const run = (loads.current += 1);
    const accessToken = await token();
    const outcome: FriendsOutcome = accessToken === null ? { kind: 'failed' } : await fetchFriendLists(accessToken);
    if (run !== loads.current) return;
    if (outcome.kind === 'lists') {
      setView({ kind: 'loaded', lists: outcome.lists, busy: null, failure: message, status: '', confirm: null });
      focusOn('message');
      return;
    }
    setView({ kind: 'load-failed', message: refused(outcome) ?? LOAD_FAILED_TEXT });
    focusOn('message');
  }

  async function act(current: Loaded, action: FriendAction, userId: string): Promise<void> {
    if (acting.current) return;
    acting.current = true;
    const removing = action === 'remove';
    const started: Loaded =
      action !== 'remove'
        ? { ...current, failure: null, status: '', busy: { action, userId } }
        : { ...current, failure: null, status: '', confirm: current.confirm === null ? null : { ...current.confirm, saving: true, failure: null } };
    setView(started);
    try {
      const accessToken = await token();
      const outcome: FriendsOutcome = accessToken === null ? { kind: 'failed' } : await actOnFriend(accessToken, action, userId);
      if (outcome.kind === 'done') {
        setView((latest) =>
          latest.kind === 'loaded'
            ? { ...latest, lists: applied(latest.lists, action, userId), busy: null, failure: null, status: STATUS_OF[action], confirm: null }
            : latest,
        );
        focusOn(FOCUS_AFTER[action]);
        return;
      }
      if (outcome.kind === 'gone') {
        await reloadAfterGone(removing ? FRIEND_GONE_TEXT : GONE_TEXT);
        return;
      }
      // The entry stays (c14); the buttons are live again.
      const failure = refused(outcome) ?? ACTION_FAILED_TEXT;
      setView((latest) => {
        if (latest.kind !== 'loaded') return latest;
        if (removing && latest.confirm !== null) return { ...latest, busy: null, confirm: { ...latest.confirm, saving: false, failure } };
        return { ...latest, busy: null, failure };
      });
      if (!removing) focusOn('message');
    } finally {
      acting.current = false;
    }
  }

  const loaded = view.kind === 'loaded' ? view : null;
  const actions =
    loaded === null
      ? {}
      : {
          onAccept: (userId: string) => void act(loaded, 'accept', userId),
          onDecline: (userId: string) => void act(loaded, 'decline', userId),
          onCancelRequest: (userId: string) => void act(loaded, 'cancel', userId),
          onRemove: (userId: string) => {
            if (acting.current) return;
            const friend = loaded.lists.friends.find((entry) => entry.userId === userId);
            if (friend !== undefined) {
              setView({ ...loaded, failure: null, status: '', confirm: { userId, fullName: friend.fullName, saving: false, failure: null } });
            }
          },
          onConfirmRemove: () => {
            if (loaded.confirm !== null) void act(loaded, 'remove', loaded.confirm.userId);
          },
          onCancelRemove: () => {
            // Nothing is sent. The dialog stays while the removal is in flight.
            if (acting.current) return;
            setView({ ...loaded, confirm: null });
          },
        };

  return <FriendsContent view={view} focus={focus} onRetry={() => void load(true)} {...actions} />;
}
