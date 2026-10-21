import { useStaffAccess } from '@/hooks/use-staff-access';
import { STAFF_REVIEW_NOTE } from '@/lib/staff-review-texts';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { GroupInvitation, GroupSummary } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SheetDescription, SheetPanel, SheetTitle } from '@/components/ui/dialog';
import { TextInput } from '@/components/ui/text-input';
import { useBackCloses } from '@/hooks/use-back-closes';
import { groupPath } from '@/lib/group-link';
import { answerInvitation, createGroup, joinGroup, leaveGroup, listGroups, listInvitations } from '@/services/api/groups';
import { GroupForm, type GroupFieldErrors } from './GroupForm';
import {
  ACCEPT_LABEL,
  ACTION_FAILED_TEXT,
  CANCEL_REQUEST_LABEL,
  CLOSE_LABEL,
  CREATE_DESCRIPTION,
  CREATE_LABEL,
  CREATE_SUBMIT,
  CREATE_TITLE,
  CREATING_TEXT,
  DECLINE_LABEL,
  DECLINED_STATUS,
  DISCOVER_TAB,
  FIELD_ERRORS,
  INVITATIONS_TITLE,
  invitedBy,
  JOIN_LABEL,
  JOINED_STATUS,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  MEMBER_LABEL,
  membersCount,
  MY_GROUPS_TAB,
  NO_GROUPS_TEXT,
  NO_MY_GROUPS_TEXT,
  PRIVACY_LABEL,
  REQUEST_CANCELLED_STATUS,
  REQUEST_LABEL,
  REQUESTED_LABEL,
  REQUESTED_STATUS,
  RETRY_LABEL,
  ROLE_LABEL,
  SEARCH_HINT,
  SEARCH_LABEL,
  TABS_LABEL,
  BLOCKED_TEXT,
} from './groups-texts';
import { useGroupsCall } from './use-groups-call';

type Scope = 'mine' | 'discover';
type ListState = { phase: 'loading' } | { phase: 'failed' } | { phase: 'ready'; groups: GroupSummary[] };

// The Groups page (PG-033, FR-GRP-001/002/004): the invitations waiting for an answer, then two lists, my Groups and discovery (every Group,
// Public and Private, newest first, or those matching a search), each card with its one main action (Join, Request to Join, the request's
// state). "יצירת קבוצה" opens the form in place (PG-043); the new Group's page opens when it is made. The server decides everything.
export function GroupsScreen() {
  const call = useGroupsCall();
  // I14 completion (§9.7): a staff account reviews the Groups read-only — no create, join, request or invitation answer; it is a member of
  // nothing, so it opens on "discover". Until the access answer comes no action is offered (the database refuses staff writes either way).
  const access = useStaffAccess().kind;
  const reviewing = access === 'staff';
  const actionsShown = access === 'none';
  const navigate = useNavigate();
  const ids = useId();
  const [scope, setScope] = useState<Scope>('mine');
  const [query, setQuery] = useState('');
  const [list, setList] = useState<ListState>({ phase: 'loading' });
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [status, setStatus] = useState('');
  const [pageAlert, setPageAlert] = useState('');
  const [creating, setCreating] = useState(false);
  const [createFailure, setCreateFailure] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const runs = useRef(0);

  const load = useCallback(
    async (nextScope: Scope, q: string) => {
      const run = (runs.current += 1);
      setList({ phase: 'loading' });
      const result = await call((token) => listGroups(token, nextScope, q));
      if (run !== runs.current) return;
      setList(result.kind === 'ok' ? { phase: 'ready', groups: result.value } : { phase: 'failed' });
    },
    [call],
  );

  useEffect(() => {
    if (reviewing) setScope('discover');
  }, [reviewing]);

  useEffect(() => {
    const timer = setTimeout(() => void load(scope, scope === 'discover' ? query : ''), scope === 'discover' && query !== '' ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, scope, query]);

  useEffect(() => {
    void (async () => {
      const result = await call((token) => listInvitations(token));
      if (result.kind === 'ok') setInvitations(result.value);
    })();
  }, [call]);

  const { leaveTo } = useBackCloses(creating, () => {
    setCreating(false);
    return true;
  });

  const replaceGroup = (next: GroupSummary) =>
    setList((current) => (current.phase === 'ready' ? { ...current, groups: current.groups.map((g) => (g.id === next.id ? { ...g, ...next } : g)) } : current));

  async function act(group: GroupSummary) {
    if (busyId !== null) return;
    setBusyId(group.id);
    setPageAlert('');
    const cancelling = group.state === 'requested';
    const result = await call((token) => (cancelling ? leaveGroup(token, group.id) : joinGroup(token, group.id)));
    setBusyId(null);
    if (result.kind !== 'ok') {
      setPageAlert(result.error === 'blocked_from_group' ? BLOCKED_TEXT : ACTION_FAILED_TEXT);
      return;
    }
    replaceGroup({ ...group, state: result.value.state, myRole: result.value.myRole, memberCount: result.value.memberCount });
    setStatus(cancelling ? REQUEST_CANCELLED_STATUS : result.value.state === 'member' ? JOINED_STATUS : REQUESTED_STATUS);
  }

  async function answer(invitation: GroupInvitation, accept: boolean) {
    if (busyId !== null) return;
    setBusyId(invitation.id);
    const result = await call((token) => answerInvitation(token, invitation.id, accept ? 'accept' : 'decline'));
    setBusyId(null);
    if (result.kind !== 'ok') {
      setPageAlert(ACTION_FAILED_TEXT);
      return;
    }
    setInvitations((current) => current.filter((i) => i.id !== invitation.id));
    if (accept) void navigate(groupPath(invitation.group.id));
    else setStatus(DECLINED_STATUS);
  }

  async function create(values: Parameters<typeof checkValues>[0]): Promise<GroupFieldErrors | null> {
    setCreateFailure(null);
    const body = checkValues(values);
    const result = await call((token) => createGroup(token, body));
    if (result.kind === 'ok') {
      setCreating(false);
      leaveTo(groupPath(result.value.id));
      return null;
    }
    const { error } = result;
    if (error === 'name_too_short' || error === 'name_too_long') return { name: FIELD_ERRORS[error] };
    if (error === 'description_too_long') return { description: FIELD_ERRORS[error] };
    if (error === 'rules_too_long') return { rules: FIELD_ERRORS[error] };
    setCreateFailure(ACTION_FAILED_TEXT);
    return {};
  }

  const tab = (value: Scope, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={scope === value}
      className={
        scope === value
          ? 'min-h-11 rounded-full bg-primary-soft px-4 text-label font-semibold text-primary-strong'
          : 'min-h-11 rounded-full px-4 text-label text-muted-foreground hover:bg-muted'
      }
      onClick={() => setScope(value)}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <p role="status" className="sr-only">
        {status}
      </p>
      {reviewing ? (
        <p className="rounded-md bg-muted p-3 text-small">{STAFF_REVIEW_NOTE}</p>
      ) : actionsShown ? (
        <div>
          <Button onClick={() => setCreating(true)}>{CREATE_LABEL}</Button>
        </div>
      ) : null}
      {pageAlert !== '' ? <InlineAlert>{pageAlert}</InlineAlert> : null}
      {actionsShown && invitations.length > 0 ? (
        <section aria-labelledby={`${ids}-invitations`} className="rounded-lg bg-card p-4 shadow-card">
          <h2 id={`${ids}-invitations`} className="text-h3">
            {INVITATIONS_TITLE}
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col">
                  <Link to={groupPath(invitation.group.id)} className="text-body font-semibold text-foreground">
                    {invitation.group.name}
                  </Link>
                  <span className="text-small text-muted-foreground">
                    {invitedBy(invitation.inviterName)} · {PRIVACY_LABEL[invitation.group.privacy]}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button pending={busyId === invitation.id} onClick={() => void answer(invitation, true)}>
                    {ACCEPT_LABEL}
                  </Button>
                  <Button variant="text" onClick={() => void answer(invitation, false)}>
                    {DECLINE_LABEL}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div role="tablist" aria-label={TABS_LABEL} className="flex gap-2">
        {tab('mine', MY_GROUPS_TAB)}
        {tab('discover', DISCOVER_TAB)}
      </div>
      {scope === 'discover' ? (
        <div className="flex max-w-md flex-col gap-1.5">
          <label htmlFor={`${ids}-search`} className="text-label">
            {SEARCH_LABEL}
          </label>
          <TextInput id={`${ids}-search`} value={query} onChange={(event) => setQuery(event.target.value)} />
          <span className="text-small text-muted-foreground">{SEARCH_HINT}</span>
        </div>
      ) : null}
      <div role="tabpanel" aria-busy={list.phase === 'loading'}>
        {list.phase === 'loading' ? <p className="text-body text-muted-foreground">{LOADING_TEXT}</p> : null}
        {list.phase === 'failed' ? (
          <div className="flex flex-col items-start gap-2">
            <InlineAlert>{LOAD_FAILED_TEXT}</InlineAlert>
            <Button variant="soft" onClick={() => void load(scope, scope === 'discover' ? query : '')}>
              {RETRY_LABEL}
            </Button>
          </div>
        ) : null}
        {list.phase === 'ready' && list.groups.length === 0 ? (
          <p className="text-body text-muted-foreground">{scope === 'mine' ? NO_MY_GROUPS_TEXT : NO_GROUPS_TEXT}</p>
        ) : null}
        {list.phase === 'ready' && list.groups.length > 0 ? (
          <ul className="flex flex-col gap-3" aria-label={scope === 'mine' ? MY_GROUPS_TAB : DISCOVER_TAB}>
            {list.groups.map((group) => (
              <li key={group.id}>
                <GroupCard group={group} actionsShown={actionsShown} busy={busyId === group.id} onAct={() => void act(group)} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <SheetPanel open={creating} onOpenChange={(open) => (open ? undefined : setCreating(false))}>
        <SheetTitle>{CREATE_TITLE}</SheetTitle>
        <SheetDescription>{CREATE_DESCRIPTION}</SheetDescription>
        <GroupForm
          initial={{ name: '', description: '', rules: '', privacy: 'public' }}
          privacyEditable
          submitLabel={CREATE_SUBMIT}
          pendingLabel={CREATING_TEXT}
          failure={createFailure}
          onSubmit={create}
        />
        <Button variant="text" onClick={() => setCreating(false)} className="self-center">
          {CLOSE_LABEL}
        </Button>
      </SheetPanel>
    </div>
  );
}

function checkValues(values: { name: string; description: string; rules: string; privacy: 'public' | 'private' }) {
  const description = values.description.trim();
  const rules = values.rules.trim();
  return { name: values.name.trim(), privacy: values.privacy, ...(description === '' ? {} : { description }), ...(rules === '' ? {} : { rules }) };
}

interface GroupCardProps {
  group: GroupSummary;
  /** False for a staff account (and until the access answer comes): the card offers no action. */
  actionsShown: boolean;
  busy: boolean;
  onAct: () => void;
}

// One Group in a list: its name (the link to its page), Public or Private, the member count when the caller may count them, the
// description's start, and one action by the caller's relation.
function GroupCard({ group, actionsShown, busy, onAct }: GroupCardProps) {
  const action =
    !actionsShown || group.state === 'member' ? null : group.state === 'blocked' ? null : group.state === 'requested' ? CANCEL_REQUEST_LABEL : group.privacy === 'public' ? JOIN_LABEL : REQUEST_LABEL;
  return (
    <article className="flex flex-col gap-2 rounded-lg bg-card p-4 shadow-card">
      <Link to={groupPath(group.id)} className="text-h3 text-foreground no-underline hover:underline">
        {group.name}
      </Link>
      <p className="text-small text-muted-foreground">
        {PRIVACY_LABEL[group.privacy]}
        {group.memberCount === null ? '' : ` · ${membersCount(group.memberCount)}`}
        {group.myRole === null ? '' : ` · ${MEMBER_LABEL}: ${ROLE_LABEL[group.myRole]}`}
      </p>
      {group.description !== null ? <p className="line-clamp-2 text-body">{group.description}</p> : null}
      {group.state === 'requested' ? <p className="text-small text-muted-foreground">{REQUESTED_LABEL}</p> : null}
      {action !== null ? (
        <div>
          <Button variant={group.state === 'requested' ? 'text' : 'soft'} pending={busy} onClick={onAct}>
            {action}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
