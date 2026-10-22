import { useStaffAccess } from '@/hooks/use-staff-access';
import { STAFF_REVIEW_NOTE } from '@/lib/staff-review-texts';
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { groupRoleRank, type GroupDetail, type GroupFriend, type GroupNotificationMode, type GroupPostView } from '@nestly/shared';
import { formatPostTime } from '@/lib/format-post-time';
import { ChoiceCardGroup } from '@/components/shared/choice-card-group';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SheetDescription, SheetPanel, SheetTitle } from '@/components/ui/dialog';
import { MoreActionsMenu, type MoreActionsItem } from '@/components/ui/more-actions-menu';
import { useBackCloses } from '@/hooks/use-back-closes';
import { usePostingProfile } from '@/hooks/use-posting-right';
import { PATHS } from '@/app/paths';
import {
  answerInvitation,
  fetchGroup,
  inviteFriend,
  joinGroup,
  leaveGroup,
  listGroupFriends,
  pinPost,
  recommendGroup,
  setGroupMode,
} from '@/services/api/groups';
import { GroupManage } from './GroupManage';
import { GroupMembers } from './GroupMembers';
import {
  ACCEPT_LABEL,
  ACTION_FAILED_TEXT,
  ALREADY_MEMBER,
  AWAITING_ONE,
  BACK_TO_GROUPS,
  BLOCKED_TEXT,
  CANCEL_LABEL,
  CANCEL_REQUEST_LABEL,
  CLOSE_LABEL,
  DECLINE_LABEL,
  DECLINED_STATUS,
  GROUP_LOADING_TEXT,
  GROUP_TABS_LABEL,
  GROUP_UNAVAILABLE_TEXT,
  highlightRule,
  INVITE_AWAITING_STATUS,
  INVITE_DESCRIPTION,
  INVITE_LABEL,
  INVITE_PRIVATE_DESCRIPTION,
  INVITE_ONE,
  INVITE_TITLE,
  INVITED_ONE,
  INVITED_TEXT,
  inviteFriendLabel,
  JOIN_LABEL,
  JOINED_STATUS,
  LEAVE_LABEL,
  LEAVE_PRIVATE_DESCRIPTION,
  LEAVE_TITLE,
  LEFT_STATUS,
  membersCount,
  MODE_DESCRIPTION,
  MODE_LABEL,
  MODE_OPTIONS,
  MODE_SAVED_STATUS,
  MODE_TITLE,
  MORE_LABEL,
  MORE_MENU_LABEL,
  MUTED_TEXT,
  muteBanner,
  NO_DESCRIPTION_TEXT,
  NO_FRIENDS_TEXT,
  NO_RULES_TEXT,
  OWNER_MUST_TRANSFER_TEXT,
  PINNED_STATUS,
  PRIVACY_HINT,
  PRIVACY_LABEL,
  PRIVATE_CONTENT_TEXT,
  RECOMMEND_DESCRIPTION,
  RECOMMEND_LABEL,
  RECOMMEND_ONE,
  RECOMMEND_TITLE,
  REASON_LABEL,
  RECOMMENDED_ONE,
  recommendFriendLabel,
  REQUEST_CANCELLED_STATUS,
  REQUEST_LABEL,
  REQUESTED_LABEL,
  REQUESTED_STATUS,
  RETRY_LABEL,
  ROLE_LABEL,
  RULES_LABEL,
  TAB_ABOUT,
  TAB_DISCUSSION,
  TAB_MANAGE,
  TAB_MEMBERS,
  UNPINNED_STATUS,
  DESCRIPTION_LABEL,
  VIEW_LABEL,
  VIEW_OPTIONS,
} from './groups-texts';
import { useGroupsCall } from './use-groups-call';

type Tab = 'discussion' | 'members' | 'about' | 'manage';
type Load = { phase: 'loading' } | { phase: 'failed' } | { phase: 'gone' } | { phase: 'ready'; group: GroupDetail };
type Sheet = { kind: 'invite' | 'recommend'; friends: GroupFriend[] | null; busyId: string | null } | { kind: 'mode' } | { kind: 'leave'; saving: boolean } | null;

export interface GroupScreenProps {
  groupId: string;
  /** The discussion (the feed's screen over the Group's posts), given the Group, how the screen pins a post and what it shows (I10-C). */
  discussion: (group: GroupDetail, onPin: (postId: string | null) => void, view: GroupPostView) => ReactNode;
}

// One Group's page (PG-034, PG-035; FR-GRP-001..003, FR-ALG-010): the header (name, Public or Private, the member count, the caller's Role)
// with one main action by the caller's relation (Join, Request to Join, cancel the request, accept an invitation), a "⋯" menu (invite
// Friends, recommend to Friends, the Group's notification mode, leave), and four parts: the discussion, the members, about (description and
// rules), and management for a Group Moderator or higher. The server decides every right; the screen only offers what the Role allows.
export function GroupScreen({ groupId, discussion }: GroupScreenProps) {
  const call = useGroupsCall();
  const reviewing = useStaffAccess().kind === 'staff';
  const navigate = useNavigate();
  const ids = useId();
  const { right } = usePostingProfile();
  const [load, setLoad] = useState<Load>({ phase: 'loading' });
  const [tab, setTab] = useState<Tab>('discussion');
  const [status, setStatus] = useState('');
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [view, setView] = useState<GroupPostView>('all');

  const reload = useCallback(async () => {
    const result = await call((token) => fetchGroup(token, groupId));
    if (result.kind === 'ok') setLoad({ phase: 'ready', group: result.value });
    else setLoad(result.error === 'group_unavailable' ? { phase: 'gone' } : { phase: 'failed' });
  }, [call, groupId]);

  useEffect(() => {
    setLoad({ phase: 'loading' });
    setTab('discussion');
    setView('all');
    void reload();
  }, [reload]);

  useBackCloses(sheet !== null, () => {
    if (sheet?.kind === 'leave' && sheet.saving) return false;
    setSheet(null);
    return true;
  });

  if (load.phase === 'loading') return <p className="text-body text-muted-foreground">{GROUP_LOADING_TEXT}</p>;
  if (load.phase === 'gone')
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body">{GROUP_UNAVAILABLE_TEXT}</p>
        <Link to={PATHS.groups}>{BACK_TO_GROUPS}</Link>
      </div>
    );
  if (load.phase === 'failed')
    return (
      <div className="flex flex-col items-start gap-2">
        <InlineAlert>{ACTION_FAILED_TEXT}</InlineAlert>
        <Button variant="soft" onClick={() => void reload()}>
          {RETRY_LABEL}
        </Button>
      </div>
    );

  const { group } = load;
  const rank = groupRoleRank(group.myRole);
  const isMember = group.myRole !== null;
  const canSee = group.privacy === 'public' || isMember;
  const regular = right === 'allowed';
  const muted = group.myMute !== null;

  const update = (next: GroupDetail, said: string) => {
    setLoad({ phase: 'ready', group: next });
    setStatus(said);
  };

  async function main() {
    if (busy) return;
    setBusy(true);
    setAlert('');
    const result =
      group.state === 'invited' && group.invitationId !== null
        ? await call(async (token) => {
            const answered = await answerInvitation(token, group.invitationId ?? '', 'accept');
            return answered.kind === 'ok' ? fetchGroup(token, group.id) : answered;
          })
        : group.state === 'requested'
          ? await call((token) => leaveGroup(token, group.id))
          : await call((token) => joinGroup(token, group.id));
    setBusy(false);
    if (result.kind !== 'ok') {
      setAlert(result.error === 'blocked_from_group' ? BLOCKED_TEXT : ACTION_FAILED_TEXT);
      return;
    }
    update(result.value, group.state === 'requested' ? REQUEST_CANCELLED_STATUS : result.value.state === 'member' ? JOINED_STATUS : REQUESTED_STATUS);
  }

  async function decline() {
    if (group.invitationId === null) return;
    const result = await call((token) => answerInvitation(token, group.invitationId ?? '', 'decline'));
    if (result.kind !== 'ok') setAlert(ACTION_FAILED_TEXT);
    else {
      setStatus(DECLINED_STATUS);
      void reload();
    }
  }

  async function leave() {
    setSheet({ kind: 'leave', saving: true });
    const result = await call((token) => leaveGroup(token, group.id));
    setSheet(null);
    if (result.kind !== 'ok') {
      setAlert(result.error === 'owner_must_transfer' ? OWNER_MUST_TRANSFER_TEXT : ACTION_FAILED_TEXT);
      return;
    }
    update(result.value, LEFT_STATUS);
    setTab('discussion');
  }

  async function openFriends(kind: 'invite' | 'recommend') {
    setSheet({ kind, friends: null, busyId: null });
    const result = await call((token) => listGroupFriends(token, group.id));
    setSheet((now) => (now?.kind === kind ? { ...now, friends: result.kind === 'ok' ? result.value : [] } : now));
  }

  async function sendTo(kind: 'invite' | 'recommend', friend: GroupFriend) {
    setSheet((now) => (now !== null && (now.kind === 'invite' || now.kind === 'recommend') ? { ...now, busyId: friend.userId } : now));
    const result = await call((token) => (kind === 'invite' ? inviteFriend(token, group.id, friend.userId) : recommendGroup(token, group.id, friend.userId)));
    setSheet((now) =>
      now !== null && (now.kind === 'invite' || now.kind === 'recommend')
        ? {
            ...now,
            busyId: null,
            friends: (now.friends ?? []).map((f) =>
              f.userId !== friend.userId || result.kind !== 'ok'
                ? f
                : kind === 'recommend'
                  ? { ...f, isRecommended: true }
                  : result.value === 'awaiting_approval'
                    ? { ...f, isAwaitingApproval: true }
                    : { ...f, isInvited: true },
            ),
          }
        : now,
    );
    if (result.kind !== 'ok') setStatus(result.error === 'muted' ? MUTED_TEXT : ACTION_FAILED_TEXT);
    else if (result.value === 'awaiting_approval') setStatus(INVITE_AWAITING_STATUS);
  }

  async function chooseMode(mode: GroupNotificationMode) {
    const result = await call((token) => setGroupMode(token, group.id, mode));
    if (result.kind === 'ok') update({ ...group, notificationMode: mode }, MODE_SAVED_STATUS);
    else setStatus(ACTION_FAILED_TEXT);
  }

  const pin = (postId: string | null) => {
    void (async () => {
      const result = await call((token) => pinPost(token, group.id, postId));
      if (result.kind === 'ok') update(result.value, postId === null ? UNPINNED_STATUS : PINNED_STATUS);
      else setStatus(ACTION_FAILED_TEXT);
    })();
  };

  const menu: MoreActionsItem[] = [
    // I10-C (§11.15): any member invites Friends; a muted member invites and recommends no one
    ...(isMember && regular && !muted ? [{ key: 'invite', label: INVITE_LABEL, onSelect: () => void openFriends('invite') }] : []),
    ...(regular && !muted ? [{ key: 'recommend', label: RECOMMEND_LABEL, onSelect: () => void openFriends('recommend') }] : []),
    ...(isMember ? [{ key: 'mode', label: MODE_LABEL, onSelect: () => setSheet({ kind: 'mode' }) }] : []),
    ...(isMember && group.myRole !== 'owner' ? [{ key: 'leave', label: LEAVE_LABEL, onSelect: () => setSheet({ kind: 'leave', saving: false }) }] : []),
  ];

  // I14 completion (§9.7): a staff account reviews the Group: no join, request, members list or menu (it is a member of nothing)
  const mainLabel =
    reviewing || group.state === 'member' || group.state === 'blocked'
      ? null
      : group.state === 'invited'
        ? ACCEPT_LABEL
        : group.state === 'requested'
          ? CANCEL_REQUEST_LABEL
          : group.privacy === 'public'
            ? JOIN_LABEL
            : REQUEST_LABEL;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'discussion', label: TAB_DISCUSSION },
    ...(reviewing ? [] : [{ key: 'members' as const, label: TAB_MEMBERS }]),
    { key: 'about', label: TAB_ABOUT },
    ...(rank >= 2 ? [{ key: 'manage' as const, label: TAB_MANAGE }] : []),
  ];

  const friendsSheet = sheet !== null && (sheet.kind === 'invite' || sheet.kind === 'recommend') ? sheet : null;

  return (
    <div className="flex flex-col gap-5">
      <p role="status" className="sr-only">
        {status}
      </p>
      <header className="flex flex-col gap-3 rounded-lg bg-card p-4 shadow-card md:p-5">
        <Link to={PATHS.groups} className="text-small text-muted-foreground">
          {BACK_TO_GROUPS}
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-h2">{group.name}</h1>
          {menu.length > 0 && !reviewing ? <MoreActionsMenu label={MORE_LABEL} menuLabel={MORE_MENU_LABEL} items={menu} /> : null}
        </div>
        <p className="text-small text-muted-foreground">
          {PRIVACY_LABEL[group.privacy]}
          {group.memberCount === null ? '' : ` · ${membersCount(group.memberCount)}`}
          {group.myRole === null ? '' : ` · ${ROLE_LABEL[group.myRole]}`}
        </p>
        {group.state === 'invited' ? <p className="text-body">{INVITED_TEXT}</p> : null}
        {group.state === 'requested' ? <p className="text-body">{REQUESTED_LABEL}</p> : null}
        {group.state === 'blocked' ? <p className="text-body">{BLOCKED_TEXT}</p> : null}
        {group.myMute !== null ? (
          <p role="note" className="rounded-md bg-muted p-3 text-small">
            {muteBanner(formatPostTime(group.myMute.until), group.myMute.reason === 'other' && group.myMute.reasonText !== null ? group.myMute.reasonText : REASON_LABEL[group.myMute.reason])}
          </p>
        ) : null}
        {alert !== '' ? <InlineAlert>{alert}</InlineAlert> : null}
        {reviewing ? <p className="rounded-md bg-muted p-3 text-small">{STAFF_REVIEW_NOTE}</p> : null}
        {mainLabel !== null ? (
          <div className="flex gap-2">
            <Button variant={group.state === 'requested' ? 'soft' : 'primary'} pending={busy} onClick={() => void main()}>
              {mainLabel}
            </Button>
            {group.state === 'invited' ? (
              <Button variant="text" onClick={() => void decline()}>
                {DECLINE_LABEL}
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div role="tablist" aria-label={GROUP_TABS_LABEL} className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`${ids}-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`${ids}-panel`}
            className={
              tab === t.key
                ? 'min-h-11 rounded-full bg-primary-soft px-4 text-label font-semibold text-primary-strong'
                : 'min-h-11 rounded-full px-4 text-label text-muted-foreground hover:bg-muted'
            }
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-tab-${tab}`}>
        {tab === 'discussion' ? (
          canSee ? (
            <div className="flex flex-col gap-3">
              <div role="group" aria-label={VIEW_LABEL} className="flex gap-2">
                {VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={view === option.value}
                    className={
                      view === option.value
                        ? 'min-h-11 rounded-full bg-primary-soft px-4 text-label font-semibold text-primary-strong'
                        : 'min-h-11 rounded-full px-4 text-label text-muted-foreground hover:bg-muted'
                    }
                    onClick={() => setView(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {discussion(group, pin, view)}
            </div>
          ) : (
            <p className="text-body text-muted-foreground">{PRIVATE_CONTENT_TEXT}</p>
          )
        ) : null}
        {tab === 'members' ? <GroupMembers group={group} onChanged={() => void reload()} /> : null}
        {tab === 'about' ? (
          <section className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-card">
            <div>
              <h2 className="text-h3">{DESCRIPTION_LABEL}</h2>
              <p className="mt-1 whitespace-pre-line text-body">{group.description ?? NO_DESCRIPTION_TEXT}</p>
            </div>
            <div>
              <h2 className="text-h3">{PRIVACY_LABEL[group.privacy]}</h2>
              <p className="mt-1 text-body">{PRIVACY_HINT[group.privacy]}</p>
            </div>
            <div>
              <h2 className="text-h3">{RULES_LABEL}</h2>
              <p className="mt-1 whitespace-pre-line text-body">{group.rules ?? NO_RULES_TEXT}</p>
            </div>
            {group.highlightThreshold === null ? null : <p className="text-small text-muted-foreground">{highlightRule(group.highlightThreshold)}</p>}
          </section>
        ) : null}
        {tab === 'manage' && rank >= 2 ? (
          <GroupManage
            group={group}
            onUpdated={(next, said) => update(next, said)}
            onDeleted={() => void navigate(PATHS.groups, { replace: true })}
            onChanged={() => void reload()}
          />
        ) : null}
      </div>

      <SheetPanel open={friendsSheet !== null} onOpenChange={(open) => (open ? undefined : setSheet(null))}>
        <SheetTitle>{friendsSheet?.kind === 'invite' ? INVITE_TITLE : RECOMMEND_TITLE}</SheetTitle>
        <SheetDescription>
          {friendsSheet?.kind === 'invite' ? (group.privacy === 'private' && rank < 3 ? INVITE_PRIVATE_DESCRIPTION : INVITE_DESCRIPTION) : RECOMMEND_DESCRIPTION}
        </SheetDescription>
        {friendsSheet?.friends === null ? <p className="text-body text-muted-foreground">{GROUP_LOADING_TEXT}</p> : null}
        {friendsSheet?.friends?.length === 0 ? <p className="text-body text-muted-foreground">{NO_FRIENDS_TEXT}</p> : null}
        <ul className="flex flex-col gap-2">
          {(friendsSheet?.friends ?? []).map((friend) => {
            const invite = friendsSheet?.kind === 'invite';
            const done = friend.isMember || (invite ? friend.isInvited || friend.isAwaitingApproval : friend.isRecommended);
            const doneLabel = friend.isMember ? ALREADY_MEMBER : !invite ? RECOMMENDED_ONE : friend.isAwaitingApproval ? AWAITING_ONE : INVITED_ONE;
            return (
              <li key={friend.userId} className="flex items-center justify-between gap-3">
                <span className="text-body">{friend.fullName}</span>
                {done ? (
                  <span className="text-small text-muted-foreground">{doneLabel}</span>
                ) : (
                  <Button
                    variant="soft"
                    pending={friendsSheet?.busyId === friend.userId}
                    onClick={() => void sendTo(invite ? 'invite' : 'recommend', friend)}
                  >
                    {invite ? INVITE_ONE : RECOMMEND_ONE}
                    <span className="sr-only">{` ${invite ? inviteFriendLabel(friend.fullName) : recommendFriendLabel(friend.fullName)}`}</span>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <Button variant="text" onClick={() => setSheet(null)} className="self-center">
          {CLOSE_LABEL}
        </Button>
      </SheetPanel>

      <SheetPanel open={sheet?.kind === 'mode'} onOpenChange={(open) => (open ? undefined : setSheet(null))}>
        <SheetTitle>{MODE_TITLE}</SheetTitle>
        <SheetDescription>{MODE_DESCRIPTION}</SheetDescription>
        <ChoiceCardGroup
          legend={MODE_TITLE}
          name={`${ids}-mode`}
          options={MODE_OPTIONS}
          value={group.notificationMode ?? 'highlights'}
          onChange={(value) => {
            const option = MODE_OPTIONS.find((o) => o.value === value);
            if (option !== undefined) void chooseMode(option.value);
          }}
        />
        <Button variant="text" onClick={() => setSheet(null)} className="self-center">
          {CLOSE_LABEL}
        </Button>
      </SheetPanel>

      <ConfirmDialog
        open={sheet?.kind === 'leave'}
        title={LEAVE_TITLE}
        {...(group.privacy === 'private' ? { description: LEAVE_PRIVATE_DESCRIPTION } : {})}
        confirmLabel={LEAVE_LABEL}
        cancelLabel={CANCEL_LABEL}
        pending={sheet?.kind === 'leave' && sheet.saving}
        onConfirm={() => void leave()}
        onCancel={() => {
          if (!(sheet?.kind === 'leave' && sheet.saving)) setSheet(null);
        }}
      />
    </div>
  );
}
