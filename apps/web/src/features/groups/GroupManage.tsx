import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { groupRoleRank, type GroupDetail, type GroupPerson } from '@nestly/shared';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { decideRequest, deleteGroup, editGroup, listBans, listRequests, unblock } from '@/services/api/groups';
import { GroupForm, type GroupFieldErrors, type GroupFormValues } from './GroupForm';
import {
  ACTION_FAILED_TEXT,
  APPROVE_LABEL,
  APPROVED_STATUS,
  BANS_TITLE,
  CANCEL_LABEL,
  DELETE_DESCRIPTION,
  DELETE_GROUP_LABEL,
  DELETE_TITLE,
  FIELD_ERRORS,
  NO_BANS_TEXT,
  NO_NAME,
  NO_REQUESTS_TEXT,
  REJECT_LABEL,
  REJECTED_STATUS,
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

// The Group's management (PG-035; FR-GRP-002/003): Join Requests (the Owner and Admins: approve or reject), the users blocked from the
// Group (a Group Moderator or higher: unblock), the Group's details (the Owner and Admins; Public/Private and deletion are the Owner's).
export function GroupManage({ group, onUpdated, onDeleted, onChanged }: GroupManageProps) {
  const call = useGroupsCall();
  const ids = useId();
  const rank = groupRoleRank(group.myRole);
  const [requests, setRequests] = useState<GroupPerson[] | null>(null);
  const [bans, setBans] = useState<GroupPerson[] | null>(null);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ saving: boolean; failure: string | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (rank >= 3) {
      const r = await call((token) => listRequests(token, group.id));
      setRequests(r.kind === 'ok' ? r.value : []);
    }
    const b = await call((token) => listBans(token, group.id));
    setBans(b.kind === 'ok' ? b.value : []);
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
