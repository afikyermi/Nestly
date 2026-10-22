import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { groupRoleRank, type GroupDetail, type GroupEnforcementRecord, type GroupPendingInvitation, type GroupPerson } from '@nestly/shared';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  decideInvitation,
  decideRequest,
  deleteGroup,
  editGroup,
  listAwaitingInvitations,
  listBans,
  listEnforcements,
  listRequests,
  unblock,
} from '@/services/api/groups';
import { formatPostTime } from '@/lib/format-post-time';
import { GroupForm, type GroupFieldErrors, type GroupFormValues } from './GroupForm';
import {
  ACTION_FAILED_TEXT,
  APPROVE_LABEL,
  APPROVED_STATUS,
  AWAITING_TITLE,
  BANS_TITLE,
  CANCEL_LABEL,
  DELETE_DESCRIPTION,
  DELETE_GROUP_LABEL,
  DELETE_TITLE,
  FIELD_ERRORS,
  HISTORY_KIND,
  HISTORY_TITLE,
  INVITATION_APPROVED_STATUS,
  INVITATION_GONE_TEXT,
  INVITATION_REJECTED_STATUS,
  invitedByLine,
  muteUntilLine,
  NO_AWAITING_TEXT,
  NO_BANS_TEXT,
  NO_HISTORY_TEXT,
  NO_NAME,
  NO_REQUESTS_TEXT,
  REJECT_LABEL,
  REJECTED_STATUS,
  REASON_LABEL,
  REQUESTS_TITLE,
  ROLE_NOT_ALLOWED_TEXT,
  SAVE_LABEL,
  SAVED_STATUS,
  SAVING_TEXT,
  SETTINGS_TITLE,
  UNBLOCK_LABEL,
  UNBLOCKED_STATUS,
} from './groups-texts';
import { useGroupsCall } from './use-groups-call';

export interface GroupManageProps {
  group: GroupDetail;
  onUpdated: (group: GroupDetail, status: string) => void;
  onDeleted: () => void;
  /** A request was approved: the member count changed. */
  onChanged: () => void;
}

// The Group's management (PG-035; FR-GRP-002/003): Join Requests and invitations waiting for approval (the Owner and Admins: approve or
// reject; I10-C §11.15), the users blocked from the Group (a Group Moderator or higher: unblock), the enforcement history (Moderators and
// higher; never who acted; §11.16), the Highlights rule of the Group (FR-ALG-010) and its details (the Owner and Admins; Public/Private and
// deletion are the Owner's).
export function GroupManage({ group, onUpdated, onDeleted, onChanged }: GroupManageProps) {
  const call = useGroupsCall();
  const ids = useId();
  const rank = groupRoleRank(group.myRole);
  const [requests, setRequests] = useState<GroupPerson[] | null>(null);
  const [bans, setBans] = useState<GroupPerson[] | null>(null);
  const [awaiting, setAwaiting] = useState<GroupPendingInvitation[] | null>(null);
  const [history, setHistory] = useState<GroupEnforcementRecord[] | null>(null);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ saving: boolean; failure: string | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (rank >= 3) {
      const r = await call((token) => listRequests(token, group.id));
      setRequests(r.kind === 'ok' ? r.value : []);
      const i = await call((token) => listAwaitingInvitations(token, group.id));
      setAwaiting(i.kind === 'ok' ? i.value : []);
    }
    const b = await call((token) => listBans(token, group.id));
    setBans(b.kind === 'ok' ? b.value : []);
    const h = await call((token) => listEnforcements(token, group.id));
    setHistory(h.kind === 'ok' ? h.value : []);
  }, [call, group.id, rank]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(person: GroupPerson, decision: 'approve' | 'reject') {
    setBusyId(person.userId);
    const result = await call((token) => decideRequest(token, group.id, person.userId, decision));
    setBusyId(null);
    if (result.kind !== 'ok') {
      setStatus(ACTION_FAILED_TEXT);
      return;
    }
    setRequests((now) => (now ?? []).filter((p) => p.userId !== person.userId));
    setStatus(decision === 'approve' ? APPROVED_STATUS : REJECTED_STATUS);
    if (decision === 'approve') onChanged();
  }

  async function decideInvite(invitation: GroupPendingInvitation, decision: 'approve' | 'reject') {
    setBusyId(invitation.id);
    const result = await call((token) => decideInvitation(token, group.id, invitation.id, decision));
    setBusyId(null);
    if (result.kind !== 'ok') {
      setStatus(result.error === 'invitation_unavailable' ? INVITATION_GONE_TEXT : ACTION_FAILED_TEXT);
      if (result.error !== 'invitation_unavailable') return;
    } else setStatus(decision === 'approve' ? INVITATION_APPROVED_STATUS : INVITATION_REJECTED_STATUS);
    setAwaiting((now) => (now ?? []).filter((i) => i.id !== invitation.id));
  }

  async function lift(person: GroupPerson) {
    setBusyId(person.userId);
    const result = await call((token) => unblock(token, group.id, person.userId));
    setBusyId(null);
    if (result.kind !== 'ok') {
      setStatus(result.kind === 'error' && result.error === 'role_not_allowed' ? ROLE_NOT_ALLOWED_TEXT : ACTION_FAILED_TEXT);
      return;
    }
    setBans((now) => (now ?? []).filter((p) => p.userId !== person.userId));
    setStatus(UNBLOCKED_STATUS);
    const h = await call((token) => listEnforcements(token, group.id));
    if (h.kind === 'ok') setHistory(h.value);
  }

  async function save(values: GroupFormValues): Promise<GroupFieldErrors | null> {
    setFailure(null);
    const body = {
      name: values.name.trim(),
      description: values.description.trim() === '' ? null : values.description.trim(),
      rules: values.rules.trim() === '' ? null : values.rules.trim(),
      ...(rank === 4 ? { privacy: values.privacy } : {}),
    };
    const result = await call((token) => editGroup(token, group.id, body));
    if (result.kind === 'ok') {
      onUpdated(result.value, SAVED_STATUS);
      return null;
    }
    const { error } = result;
    if (error === 'name_too_short' || error === 'name_too_long') return { name: FIELD_ERRORS[error] };
    if (error === 'description_too_long') return { description: FIELD_ERRORS[error] };
    if (error === 'rules_too_long') return { rules: FIELD_ERRORS[error] };
    setFailure(error === 'role_not_allowed' ? ROLE_NOT_ALLOWED_TEXT : ACTION_FAILED_TEXT);
    return {};
  }

  async function remove() {
    setDeleting({ saving: true, failure: null });
    const result = await call((token) => deleteGroup(token, group.id));
    if (result.kind === 'ok') {
      setDeleting(null);
      onDeleted();
    } else setDeleting({ saving: false, failure: ACTION_FAILED_TEXT });
  }

  const people = (list: GroupPerson[], empty: string, actions: (p: GroupPerson) => ReactNode) =>
    list.length === 0 ? (
      <p className="text-body text-muted-foreground">{empty}</p>
    ) : (
      <ul className="flex flex-col gap-2">
        {list.map((p) => (
          <li key={p.userId} className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-body">{p.fullName ?? NO_NAME}</span>
            <div className="flex gap-2">{actions(p)}</div>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="flex flex-col gap-5">
      <p role="status" className="sr-only">
        {status}
      </p>
      {rank >= 3 ? (
        <section aria-labelledby={`${ids}-requests`} className="flex flex-col gap-3 rounded-lg bg-card p-4 shadow-card">
          <h2 id={`${ids}-requests`} className="text-h3">
            {REQUESTS_TITLE}
          </h2>
          {requests === null
            ? null
            : people(requests, NO_REQUESTS_TEXT, (p) => (
                <>
                  <Button pending={busyId === p.userId} onClick={() => void decide(p, 'approve')}>
                    {APPROVE_LABEL}
                  </Button>
                  <Button variant="text" onClick={() => void decide(p, 'reject')}>
                    {REJECT_LABEL}
                  </Button>
                </>
              ))}
        </section>
      ) : null}
      {rank >= 3 ? (
        <section aria-labelledby={`${ids}-awaiting`} className="flex flex-col gap-3 rounded-lg bg-card p-4 shadow-card">
          <h2 id={`${ids}-awaiting`} className="text-h3">
            {AWAITING_TITLE}
          </h2>
          {awaiting === null ? null : awaiting.length === 0 ? (
            <p className="text-body text-muted-foreground">{NO_AWAITING_TEXT}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {awaiting.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-body">{invitedByLine(i.inviter.fullName ?? NO_NAME, i.invitee.fullName ?? NO_NAME)}</span>
                    <span className="text-small text-muted-foreground">{formatPostTime(i.createdAt)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button pending={busyId === i.id} onClick={() => void decideInvite(i, 'approve')}>
                      {APPROVE_LABEL}
                    </Button>
                    <Button variant="text" onClick={() => void decideInvite(i, 'reject')}>
                      {REJECT_LABEL}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      <section aria-labelledby={`${ids}-bans`} className="flex flex-col gap-3 rounded-lg bg-card p-4 shadow-card">
        <h2 id={`${ids}-bans`} className="text-h3">
          {BANS_TITLE}
        </h2>
        {bans === null
          ? null
          : people(bans, NO_BANS_TEXT, (p) => (
              <Button variant="soft" pending={busyId === p.userId} onClick={() => void lift(p)}>
                {UNBLOCK_LABEL}
              </Button>
            ))}
      </section>
      <section aria-labelledby={`${ids}-history`} className="flex flex-col gap-3 rounded-lg bg-card p-4 shadow-card">
        <h2 id={`${ids}-history`} className="text-h3">
          {HISTORY_TITLE}
        </h2>
        {history === null ? null : history.length === 0 ? (
          <p className="text-body text-muted-foreground">{NO_HISTORY_TEXT}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((r) => (
              <li key={r.id} className="flex flex-col">
                <span className="text-body">{`${HISTORY_KIND[r.kind]} · ${r.fullName ?? NO_NAME}`}</span>
                <span className="text-small text-muted-foreground">
                  {[
                    r.reason === null ? null : r.reason === 'other' && r.reasonText !== null ? r.reasonText : REASON_LABEL[r.reason],
                    r.muteUntil === null ? null : muteUntilLine(formatPostTime(r.muteUntil)),
                    formatPostTime(r.createdAt),
                  ]
                    .filter((x) => x !== null)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {rank >= 3 ? (
        <section aria-labelledby={`${ids}-settings`} className="flex flex-col gap-3 rounded-lg bg-card p-4 shadow-card">
          <h2 id={`${ids}-settings`} className="text-h3">
            {SETTINGS_TITLE}
          </h2>
          <GroupForm
            key={`${group.name}|${group.privacy}`}
            initial={{ name: group.name, description: group.description ?? '', rules: group.rules ?? '', privacy: group.privacy }}
            privacyEditable={rank === 4}
            submitLabel={SAVE_LABEL}
            pendingLabel={SAVING_TEXT}
            failure={failure}
            onSubmit={save}
          />
          {rank === 4 ? (
            <Button variant="text" onClick={() => setDeleting({ saving: false, failure: null })} className="self-start">
              {DELETE_GROUP_LABEL}
            </Button>
          ) : null}
        </section>
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={DELETE_TITLE}
        description={DELETE_DESCRIPTION}
        confirmLabel={DELETE_GROUP_LABEL}
        cancelLabel={CANCEL_LABEL}
        pending={deleting?.saving === true}
        failure={deleting?.failure ?? null}
        onConfirm={() => void remove()}
        onCancel={() => {
          if (deleting?.saving !== true) setDeleting(null);
        }}
      />
    </div>
  );
}
