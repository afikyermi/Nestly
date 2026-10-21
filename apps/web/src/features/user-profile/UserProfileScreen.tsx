import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { RelationshipState } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { useBackCloses } from '@/hooks/use-back-closes';
import { reportSheetProps, useReport, type ReportResult } from '@/hooks/use-report';
import { useSessionAccount } from '@/hooks/use-session-account';
import { ALREADY_REPORTED_STATUS, REPORT_RECEIVED_STATUS, REPORT_UNAVAILABLE_STATUS } from '@/lib/report-texts';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { ACTION_FAILED_TEXT, FRIEND_GONE_TEXT, GONE_TEXT, RATE_LIMITED_TEXT } from '@/lib/friend-texts';
import { actOnFriend, sendFriendRequest, type FriendAction, type FriendsOutcome } from '@/services/api/friends';
import { blockUser } from '@/services/api/blocks';
import { BLOCK_FAILED_TEXT, BLOCK_LIMIT_TEXT } from '@/lib/block-texts';
import { fetchUserProfile, type ProfileViewOutcome } from '@/services/api/profile-view';
import { UserProfileContent, type UserProfileFocus, type UserProfileView } from './UserProfileContent';
import {
  ACCEPTED_STATUS,
  CANCELLED_STATUS,
  DECLINED_STATUS,
  LOAD_FAILED_TEXT,
  REMOVED_STATUS,
  SENT_STATUS,
} from './user-profile-texts';

type Loaded = Extract<UserProfileView, { kind: 'loaded' }>;
type Action = 'send' | FriendAction;

const STATUS_OF: Record<Action, string> = {
  send: SENT_STATUS,
  cancel: CANCELLED_STATUS,
  decline: DECLINED_STATUS,
  accept: ACCEPTED_STATUS,
  remove: REMOVED_STATUS,
};

/** F3.7 c13: a profile report changes nothing on the screen (Afik 18.10): what happened is said, and focus goes back to the button. */
const REPORT_STATUS: Record<ReportResult, string> = {
  received: REPORT_RECEIVED_STATUS,
  'already-reported': ALREADY_REPORTED_STATUS,
  unavailable: REPORT_UNAVAILABLE_STATUS,
};

/** The state a done action moves to without asking the server. Accept and remove are not here: they fetch the profile again (c28). */
const MOVES_TO: Partial<Record<Action, RelationshipState>> = { send: 'sent', cancel: 'none', decline: 'none' };

// Another person's profile flow (FR-PRIV-001, FR-REL-001; F2.4c2): open the profile, show it, act on the relationship. The server and
// RLS decide what this viewer may see and whose rows an action touches; this screen sends the other person's user id in the path
// (or the send's body) and never its own. Every open asks the server again and keeps nothing: the profile lives in this component's
// memory only, so it is gone when the screen is (sign-out included, c27). A refused token (401) or a stopped account (403) asks the
// session for the account state again, and the session guard ends the session with its notice (ERR-038, ERR-037).
export function UserProfileScreen({ userId, chatAction }: { userId: string; chatAction?: (name: string) => ReactNode }) {
  const account = useSessionAccount();
  const [view, setView] = useState<UserProfileView>({ kind: 'loading' });
  const [focus, setFocus] = useState<UserProfileFocus>({ target: 'action', tick: 0 });
  // Set synchronously when an action starts, so a second press before the next render sends nothing (c28).
  const acting = useRef(false);
  const loads = useRef(0);

  const focusOn = (target: UserProfileFocus['target']) => setFocus((current) => ({ target, tick: current.tick + 1 }));

  // F3.7: the report window over the profile; Back closes it and stays here (direction.md).
  const report = useReport((_target, result) =>
    setView((latest) => (latest.kind === 'loaded' ? { ...latest, failure: null, status: REPORT_STATUS[result] } : latest)),
  );
  // The remove-friend confirmation shares the one entry (ux-polish-b c4). Back while the report or the removal is in flight keeps the window
  // (the hook adds its entry again).
  const latestView = useRef(view);
  latestView.current = view;
  const removing = view.kind === 'loaded' && view.confirm !== null;
  const blocking = view.kind === 'loaded' && view.block !== undefined && view.block !== null;
  useBackCloses(report.draft !== null || removing || blocking, () => {
    const now = latestView.current;
    if (report.draft?.sending === true || (now.kind === 'loaded' && (now.confirm?.saving === true || now.block?.saving === true))) return false;
    setView((latest) => (latest.kind === 'loaded' && (latest.confirm !== null || (latest.block ?? null) !== null) ? { ...latest, confirm: null, block: null } : latest));
    report.cancel();
    return true;
  });

  // What a refused answer means beyond this screen: the session guard is told to look again.
  const refused = useCallback(
    (outcome: { kind: string }): string | null => {
      if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
      return outcome.kind === 'account-unavailable' ? STOPPED_TEXT : null;
    },
    [account],
  );

  const token = useCallback(async (): Promise<string | null> => (account === null ? null : await account.getAccessToken().catch(() => null)), [account]);

  // One open of the profile. `keep`: draw over the profile already shown instead of the loading state (after an action).
  const open = useCallback(
    async (keep: { failure: string | null; status: string } | null, afterRetry = false) => {
      const run = (loads.current += 1);
      if (keep === null) setView({ kind: 'loading' });
      const accessToken = await token();
      const outcome: ProfileViewOutcome = accessToken === null ? { kind: 'failed' } : await fetchUserProfile(accessToken, userId);
      if (run !== loads.current) return;
      if (outcome.kind === 'profile') {
        setView({ kind: 'loaded', profile: outcome.profile, busy: null, failure: keep?.failure ?? null, status: keep?.status ?? '', confirm: null });
        if (keep !== null) focusOn(keep.failure === null ? 'action' : 'message');
        else if (afterRetry) focusOn('action');
        return;
      }
      if (outcome.kind === 'unavailable') setView({ kind: 'unavailable' });
      else if (outcome.kind === 'rate-limited') setView({ kind: 'rate-limited' });
      else setView({ kind: 'load-failed', message: refused(outcome) ?? LOAD_FAILED_TEXT });
      if (keep !== null || afterRetry) focusOn('message');
    },
    [token, refused, userId],
  );

  useEffect(() => {
    void open(null);
    return () => {
      loads.current += 1;
    };
  }, [open]);

  async function act(current: Loaded, action: Action): Promise<void> {
    if (acting.current) return;
    acting.current = true;
    const removing = action === 'remove';
    if (action === 'remove') {
      setView({ ...current, failure: null, status: '', confirm: current.confirm === null ? null : { ...current.confirm, saving: true, failure: null } });
    } else {
      setView({ ...current, failure: null, status: '', busy: action });
    }
    try {
      const accessToken = await token();
      const outcome: FriendsOutcome =
        accessToken === null
          ? { kind: 'failed' }
          : action === 'send'
            ? await sendFriendRequest(accessToken, userId)
            : await actOnFriend(accessToken, action, userId);
      if (outcome.kind === 'done') {
        const moved = MOVES_TO[action];
        if (moved === undefined) {
          // Accept and remove: the profile changes (the Friend view appears or goes), so it is opened again (one open).
          await open({ failure: null, status: STATUS_OF[action] });
          return;
        }
        setView((latest) =>
          latest.kind === 'loaded'
            ? { ...latest, profile: { ...latest.profile, relationship: moved }, busy: null, failure: null, status: STATUS_OF[action], confirm: null }
            : latest,
        );
        focusOn('action');
        return;
      }
      // 409 / 404: what the screen showed is out of date. The profile is opened again and says so (F2.4b c14).
      if (outcome.kind === 'gone' || outcome.kind === 'conflict') {
        await open({ failure: removing ? FRIEND_GONE_TEXT : GONE_TEXT, status: '' });
        return;
      }
      const failure = outcome.kind === 'rate-limited' ? RATE_LIMITED_TEXT : (refused(outcome) ?? ACTION_FAILED_TEXT);
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

  // FR-REL-002: the block, from its dialog. Done: the profile is no longer shown (the database hides it both ways from now on).
  async function block(current: Loaded): Promise<void> {
    if (acting.current) return;
    acting.current = true;
    setView({ ...current, failure: null, status: '', block: { saving: true, failure: null } });
    try {
      const accessToken = await token();
      const outcome = accessToken === null ? ({ kind: 'failed' } as const) : await blockUser(accessToken, userId);
      if (outcome.kind === 'done') {
        loads.current += 1;
        setView({ kind: 'blocked' });
        focusOn('message');
        return;
      }
      if (outcome.kind === 'gone') {
        setView({ kind: 'unavailable' });
        return;
      }
      const failure = outcome.kind === 'rate-limited' ? BLOCK_LIMIT_TEXT : (refused(outcome) ?? BLOCK_FAILED_TEXT);
      setView((latest) => (latest.kind === 'loaded' ? { ...latest, block: { saving: false, failure } } : latest));
    } finally {
      acting.current = false;
    }
  }

  const loaded = view.kind === 'loaded' ? view : null;
  const actions =
    loaded === null
      ? {}
      : {
          onSend: () => void act(loaded, 'send'),
          onCancelRequest: () => void act(loaded, 'cancel'),
          onAccept: () => void act(loaded, 'accept'),
          onDecline: () => void act(loaded, 'decline'),
          onRemove: () => {
            if (acting.current) return;
            setView({ ...loaded, failure: null, status: '', confirm: { saving: false, failure: null } });
          },
          onConfirmRemove: () => void act(loaded, 'remove'),
          onBlock: () => {
            if (acting.current) return;
            setView({ ...loaded, failure: null, status: '', block: { saving: false, failure: null } });
          },
          onConfirmBlock: () => void block(loaded),
          onCancelBlock: () => {
            if (acting.current) return;
            setView({ ...loaded, block: null });
          },
          onReport: () => {
            if (acting.current) return;
            setView({ ...loaded, status: '' });
            report.start({ kind: 'user', id: userId });
          },
          onCancelRemove: () => {
            // Nothing is sent. The dialog stays while the removal is in flight.
            if (acting.current) return;
            setView({ ...loaded, confirm: null });
          },
        };

  return (
    <UserProfileContent
      view={view}
      focus={focus}
      {...(chatAction === undefined ? {} : { chatAction })}
      onRetry={() => void open(null, true)}
      {...actions}
      report={report.draft === null ? null : reportSheetProps(report, report.draft, PATHS.communityRules)}
    />
  );
}
