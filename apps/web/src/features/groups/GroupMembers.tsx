import { useCallback, useEffect, useState } from 'react';
import { groupRoleRank, type GroupDetail, type GroupEnforcementBody, type GroupMember, type GroupRole } from '@nestly/shared';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MoreActionsMenu, type MoreActionsItem } from '@/components/ui/more-actions-menu';
import { enforceMember, listMembers, setMemberRole } from '@/services/api/groups';
import { GroupEnforcementSheet } from './GroupEnforcementSheet';
import {
  ACTION_FAILED_TEXT,
  BLOCK_MEMBER,
  CANCEL_LABEL,
  GROUP_LOADING_TEXT,
  MAKE_ADMIN,
  MAKE_MEMBER,
  MAKE_MODERATOR,
  MAKE_OWNER,
  MEMBER_MENU_LABEL,
  MEMBERS_ONLY_TEXT,
  NO_NAME,
  REMOVED_STATUS,
  RETRY_LABEL,
  ROLE_CHANGED_STATUS,
  ROLE_LABEL,
  ROLE_NOT_ALLOWED_TEXT,
  TRANSFER_DESCRIPTION,
  TRANSFER_TITLE,
  WARN_MEMBER,
  WARNED_STATUS,
  YOU_LABEL,
} from './groups-texts';
import { useGroupsCall } from './use-groups-call';

type Confirm = { kind: 'owner'; member: GroupMember; saving: boolean } | null;
type Enforce = { kind: 'warn_mute' | 'remove_block'; member: GroupMember; saving: boolean; failure: string | null } | null;

const ROLE_ACTIONS: { role: Exclude<GroupRole, 'owner'>; label: string }[] = [
  { role: 'admin', label: MAKE_ADMIN },
  { role: 'moderator', label: MAKE_MODERATOR },
  { role: 'member', label: MAKE_MEMBER },
];

// The members of a Group (PG-035; FR-GRP-003, BR-041, AC-038): fellow members only, highest Role first. A Role acts only on a lower one: the
// Owner appoints and removes Admins and Group Moderators and may transfer ownership; an Admin manages Group Moderators and members; a Group
// Moderator or higher warns and mutes, or removes and blocks, a lower Role (I10-C §11.16: no plain removal). The menu offers only what the
// caller's Role allows; the database decides (ERR-019).
export function GroupMembers({ group, onChanged }: { group: GroupDetail; onChanged: () => void }) {
  const call = useGroupsCall();
  const [members, setMembers] = useState<GroupMember[] | null | 'failed'>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [enforce, setEnforce] = useState<Enforce>(null);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const myRank = groupRoleRank(group.myRole);

  const load = useCallback(async () => {
    const result = await call((token) => listMembers(token, group.id));
    setMembers(result.kind === 'ok' ? result.value : 'failed');
  }, [call, group.id]);

  useEffect(() => {
    if (group.myRole !== null) void load();
  }, [load, group.myRole]);

  if (group.myRole === null) return <p className="text-body text-muted-foreground">{MEMBERS_ONLY_TEXT}</p>;
  if (members === null) return <p className="text-body text-muted-foreground">{GROUP_LOADING_TEXT}</p>;
  if (members === 'failed')
    return (
      <div className="flex flex-col items-start gap-2">
        <InlineAlert>{ACTION_FAILED_TEXT}</InlineAlert>
        <Button variant="soft" onClick={() => void load()}>
          {RETRY_LABEL}
        </Button>
      </div>
    );

  async function changeRole(member: GroupMember, role: GroupRole) {
    setFailure(null);
    const result = await call((token) => setMemberRole(token, group.id, member.userId, role));
    if (result.kind === 'ok') {
      setMembers(result.value);
      setStatus(ROLE_CHANGED_STATUS);
      if (role === 'owner') onChanged();
    } else setFailure(result.error === 'role_not_allowed' ? ROLE_NOT_ALLOWED_TEXT : ACTION_FAILED_TEXT);
  }

  async function confirmed() {
    if (confirm === null || confirm.saving) return;
    setConfirm({ ...confirm, saving: true });
    await changeRole(confirm.member, 'owner');
    setConfirm(null);
  }

  async function enforced(body: GroupEnforcementBody) {
    if (enforce === null || enforce.saving) return;
    const { member } = enforce;
    setEnforce({ ...enforce, saving: true, failure: null });
    const result = await call((token) => enforceMember(token, group.id, body));
    if (result.kind !== 'ok') {
      setEnforce((now) => (now === null ? now : { ...now, saving: false, failure: result.error === 'role_not_allowed' ? ROLE_NOT_ALLOWED_TEXT : ACTION_FAILED_TEXT }));
      return;
    }
    setEnforce(null);
    if (body.kind === 'remove_block') {
      setMembers((now) => (Array.isArray(now) ? now.filter((m) => m.userId !== member.userId) : now));
      setStatus(REMOVED_STATUS);
      onChanged();
    } else setStatus(WARNED_STATUS);
  }

  const actionsFor = (member: GroupMember): MoreActionsItem[] => {
    const theirs = groupRoleRank(member.role);
    if (member.isMe || theirs >= myRank) return [];
    const roles =
      myRank >= 3
        ? ROLE_ACTIONS.filter((a) => a.role !== member.role && groupRoleRank(a.role) < myRank).map((a) => ({
            key: a.role,
            label: a.label,
            onSelect: () => void changeRole(member, a.role),
          }))
        : [];
    return [
      ...roles,
      ...(myRank === 4 ? [{ key: 'owner', label: MAKE_OWNER, onSelect: () => setConfirm({ kind: 'owner', member, saving: false }) }] : []),
      ...(myRank >= 2
        ? [
            { key: 'warn', label: WARN_MEMBER, onSelect: () => setEnforce({ kind: 'warn_mute', member, saving: false, failure: null }) },
            { key: 'block', label: BLOCK_MEMBER, onSelect: () => setEnforce({ kind: 'remove_block', member, saving: false, failure: null }) },
          ]
        : []),
    ];
  };

  return (
    <section className="flex flex-col gap-3">
      <p role="status" className="sr-only">
        {status}
      </p>
      {failure !== null ? <InlineAlert>{failure}</InlineAlert> : null}
      <ul className="flex flex-col gap-2 rounded-lg bg-card p-4 shadow-card">
        {members.map((member) => {
          const items = actionsFor(member);
          const name = member.fullName ?? NO_NAME;
          return (
            <li key={member.userId} className="flex min-h-12 items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={member.fullName ?? ''} decorative />
                <div className="flex flex-col">
                  <span className="text-body">
                    {name}
                    {member.isMe ? ` ${YOU_LABEL}` : ''}
                  </span>
                  <span className="text-small text-muted-foreground">{ROLE_LABEL[member.role]}</span>
                </div>
              </div>
              {items.length > 0 ? <MoreActionsMenu label={MEMBER_MENU_LABEL(name)} menuLabel={MEMBER_MENU_LABEL(name)} items={items} /> : null}
            </li>
          );
        })}
      </ul>
      <GroupEnforcementSheet
        target={enforce === null ? null : { kind: enforce.kind, userId: enforce.member.userId, name: enforce.member.fullName ?? NO_NAME }}
        pending={enforce?.saving === true}
        failure={enforce?.failure ?? null}
        onSubmit={(body) => void enforced(body)}
        onClose={() => setEnforce(null)}
      />
      <ConfirmDialog
        open={confirm !== null}
        title={TRANSFER_TITLE}
        description={TRANSFER_DESCRIPTION}
        confirmLabel={MAKE_OWNER}
        cancelLabel={CANCEL_LABEL}
        pending={confirm?.saving === true}
        onConfirm={() => void confirmed()}
        onCancel={() => {
          if (confirm?.saving !== true) setConfirm(null);
        }}
      />
    </section>
  );
}
