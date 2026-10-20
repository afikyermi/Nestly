import { useCallback, useEffect, useId, useState } from 'react';
import { INVITATION_NOTE_MAX, INVITATION_NOTE_MIN, PERMISSION_KEYS, PERMISSION_REQUIRES, codePointLength, withRequiredKeys, type PermissionKey, type TeamMember, type TeamView } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { TextArea } from '@/components/ui/text-area';
import { TextInput } from '@/components/ui/text-input';
import { useAdminCall } from '@/hooks/use-admin-call';
import { enforceUser, type AdminOutcome } from '@/services/api/admin';
import { fetchTeam, inviteModerator, revokeInvitation, saveModeratorKeys } from '@/services/api/team';
import { formatAdminTime } from './admin-format';
import { ACTION_FAILED_TEXT, FORBIDDEN_TEXT, LOAD_FAILED_TEXT, LOADING_TEXT, NOT_FOUND_TEXT, REASON_REQUIRED_TEXT, RETRY_LABEL } from './admin-texts';
import {
  PERMISSION_LABELS,
  TEAM_DEACTIVATE,
  TEAM_DEACTIVATE_REASON,
  TEAM_DEACTIVATED,
  TEAM_EMPTY_TEXT,
  TEAM_INVITATION_STATE,
  TEAM_INVITATION_UNTIL,
  TEAM_INVITATIONS_EMPTY,
  TEAM_INVITATIONS_HEADING,
  TEAM_INVITE_COPIED,
  TEAM_INVITE_COPY,
  TEAM_INVITE_HEADING,
  TEAM_INVITE_LINK,
  TEAM_INVITE_NOTE,
  TEAM_INVITE_NOTE_ERROR,
  TEAM_INVITE_NOTE_HINT,
  TEAM_INVITE_READY,
  TEAM_INVITE_SEND,
  TEAM_JOINED,
  TEAM_KEYS_HINT,
  TEAM_KEYS_LEGEND,
  TEAM_KEYS_SAVED,
  TEAM_MODERATORS_HEADING,
  TEAM_REACTIVATE,
  TEAM_REACTIVATE_REASON,
  TEAM_REACTIVATED,
  TEAM_REVOKE,
  TEAM_REVOKED,
  TEAM_SAVE_KEYS,
  TEAM_STATUS,
  TEAM_UNNAMED,
} from './team-texts';

type View = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; team: TeamView };

const failureText = (outcome: AdminOutcome<unknown>): string =>
  outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : outcome.kind === 'not-found' ? NOT_FOUND_TEXT : outcome.kind === 'reason-required' ? REASON_REQUIRED_TEXT : ACTION_FAILED_TEXT;

/** Choosing a key adds the key it needs; leaving a key out leaves out the keys that need it (BR-028). */
export function toggleKey(current: readonly PermissionKey[], key: PermissionKey, on: boolean): PermissionKey[] {
  if (on) return withRequiredKeys([...current, key]);
  return current.filter((k) => k !== key && PERMISSION_REQUIRES[k] !== key);
}

// The team screen (FR-ADMIN-004, UC-15, PG-027): the Admin alone. Each Moderator with the keys it holds, saved as a whole set; deactivating is the
// Admin's ban, reactivating the unban, each with a reason (both audited). New Moderators come by a one-time invitation link, shown once.
export function TeamScreen() {
  const call = useAdminCall();
  const [view, setView] = useState<View>({ kind: 'loading' });

  const load = useCallback(async () => {
    const outcome = await call((token) => fetchTeam(token));
    setView(outcome.kind === 'ok' ? { kind: 'loaded', team: outcome.value } : { kind: 'failed', message: outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  if (view.kind === 'loading') {
    return (
      <div role="status" aria-label={LOADING_TEXT} className="flex flex-col gap-3">
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  if (view.kind === 'failed') {
    return (
      <div className="flex flex-col items-start gap-3">
        <InlineAlert>{view.message}</InlineAlert>
        <Button variant="soft" onClick={() => void load()}>
          {RETRY_LABEL}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="team-moderators" className="flex flex-col gap-4">
        <h3 id="team-moderators" className="text-h4">
          {TEAM_MODERATORS_HEADING}
        </h3>
        {view.team.moderators.length === 0 ? (
          <p>{TEAM_EMPTY_TEXT}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {view.team.moderators.map((member) => (
              <li key={member.userId}>
                <MemberCard member={member} onChanged={() => void load()} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <InviteSection onChanged={() => void load()} />
      <section aria-labelledby="team-invitations" className="flex flex-col gap-3">
        <h3 id="team-invitations" className="text-h4">
          {TEAM_INVITATIONS_HEADING}
        </h3>
        {view.team.invitations.length === 0 ? (
          <p>{TEAM_INVITATIONS_EMPTY}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {view.team.invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
                <span className="text-label">{invitation.note}</span>
                <span className="text-small text-muted-foreground">{TEAM_INVITATION_STATE[invitation.state]}</span>
                {invitation.state === 'open' ? (
                  <>
                    <span className="text-small text-muted-foreground">
                      {TEAM_INVITATION_UNTIL} {formatAdminTime(invitation.expiresAt)}
                    </span>
                    <RevokeButton id={invitation.id} onChanged={() => void load()} />
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MemberCard({ member, onChanged }: { member: TeamMember; onChanged: () => void }) {
  const call = useAdminCall();
  const id = useId();
  const [keys, setKeys] = useState<PermissionKey[]>([...member.permissions]);
  const [busy, setBusy] = useState<'keys' | 'status' | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const active = member.status === 'active';
  const name = member.label ?? TEAM_UNNAMED;

  const saveKeys = async () => {
    setBusy('keys');
    setError('');
    setNotice('');
    const outcome = await call((token) => saveModeratorKeys(token, member.userId, keys));
    setBusy(null);
    if (outcome.kind === 'ok') setNotice(TEAM_KEYS_SAVED);
    else setError(failureText(outcome));
  };

  const changeStatus = async () => {
    const text = reason.trim();
    if (text === '') {
      setError(REASON_REQUIRED_TEXT);
      return;
    }
    setBusy('status');
    setError('');
    setNotice('');
    const outcome = await call((token) => enforceUser(token, { userId: member.userId, kind: active ? 'ban' : 'unban', reason: text }));
    setBusy(null);
    if (outcome.kind === 'ok') {
      setNotice(active ? TEAM_DEACTIVATED : TEAM_REACTIVATED);
      setReason('');
      onChanged();
    } else {
      setError(failureText(outcome));
    }
  };

  return (
    <article aria-labelledby={`${id}-name`} className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <header className="flex flex-wrap items-baseline gap-3">
        <h4 id={`${id}-name`} className="text-label">
          {name}
        </h4>
        <span className="text-small">{TEAM_STATUS[member.status]}</span>
        <span className="text-small text-muted-foreground">
          {TEAM_JOINED} {formatAdminTime(member.joinedAt)}
        </span>
      </header>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-label">
          {TEAM_KEYS_LEGEND} · {name}
        </legend>
        <p className="mb-2 text-small text-muted-foreground">{TEAM_KEYS_HINT}</p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          {PERMISSION_KEYS.map((key) => (
            <Checkbox key={key} checked={keys.includes(key)} disabled={busy !== null} onCheckedChange={(on) => setKeys((now) => toggleKey(now, key, on))}>
              {PERMISSION_LABELS[key]}
            </Checkbox>
          ))}
        </div>
      </fieldset>
      <div>
        <Button variant="primary" pending={busy === 'keys'} disabled={busy !== null} onClick={() => void saveKeys()}>
          {TEAM_SAVE_KEYS}
        </Button>
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <FormField label={active ? TEAM_DEACTIVATE_REASON : TEAM_REACTIVATE_REASON} htmlFor={`${id}-reason`}>
          {(control) => <TextArea {...control} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />}
        </FormField>
        <div>
          <Button variant="soft" pending={busy === 'status'} disabled={busy !== null} onClick={() => void changeStatus()}>
            {active ? TEAM_DEACTIVATE : TEAM_REACTIVATE}
          </Button>
        </div>
      </div>
      <p role="status" className="text-small">
        {notice}
      </p>
      {error === '' ? null : <InlineAlert>{error}</InlineAlert>}
    </article>
  );
}

function InviteSection({ onChanged }: { onChanged: () => void }) {
  const call = useAdminCall();
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const send = async () => {
    const text = note.trim();
    const length = codePointLength(text);
    if (length < INVITATION_NOTE_MIN || length > INVITATION_NOTE_MAX) {
      setProblem(true);
      return;
    }
    setProblem(false);
    setBusy(true);
    setError('');
    const outcome = await call((token) => inviteModerator(token, text));
    setBusy(false);
    if (outcome.kind === 'ok') {
      // the code rides in the fragment, which the browser never sends to a server
      setLink(`${window.location.origin}${PATHS.joinTeam}#${outcome.value.code}`);
      setCopied(false);
      setNote('');
      onChanged();
    } else {
      setError(failureText(outcome));
    }
  };

  return (
    <section aria-labelledby="team-invite" className="flex flex-col gap-3">
      <h3 id="team-invite" className="text-h4">
        {TEAM_INVITE_HEADING}
      </h3>
      <FormField label={TEAM_INVITE_NOTE} htmlFor="team-invite-note" hint={TEAM_INVITE_NOTE_HINT} {...(problem ? { error: TEAM_INVITE_NOTE_ERROR } : {})}>
        {(control) => <TextInput {...control} value={note} onChange={(event) => setNote(event.target.value)} />}
      </FormField>
      <div>
        <Button variant="primary" pending={busy} disabled={busy} onClick={() => void send()}>
          {TEAM_INVITE_SEND}
        </Button>
      </div>
      {error === '' ? null : <InlineAlert>{error}</InlineAlert>}
      {link === null ? null : (
        <div className="flex flex-col gap-2 rounded-lg bg-primary-soft p-4">
          <p role="status">{TEAM_INVITE_READY}</p>
          <FormField label={TEAM_INVITE_LINK} htmlFor="team-invite-link">
            {(control) => <TextInput {...control} readOnly dir="ltr" value={link} />}
          </FormField>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="soft"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(link)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              {TEAM_INVITE_COPY}
            </Button>
            <span role="status" className="text-small">
              {copied ? TEAM_INVITE_COPIED : ''}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function RevokeButton({ id, onChanged }: { id: string; onChanged: () => void }) {
  const call = useAdminCall();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <>
      <Button
        variant="text"
        pending={busy}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void call((token) => revokeInvitation(token, id)).then((outcome) => {
            setBusy(false);
            if (outcome.kind === 'ok') {
              setMessage(TEAM_REVOKED);
              onChanged();
            } else {
              setMessage(failureText(outcome));
            }
          });
        }}
      >
        {TEAM_REVOKE}
      </Button>
      <span role="status" className="text-small">
        {message}
      </span>
    </>
  );
}
