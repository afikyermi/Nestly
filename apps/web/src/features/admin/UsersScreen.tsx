import { useCallback, useRef, useState } from 'react';
import type { EnforceRequest, PermissionKey, TargetUser, UserList } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/text-input';
import { useAdminCall } from '@/hooks/use-admin-call';
import { enforceUser, fetchUser, fetchUsers, releaseRecoveryLock } from '@/services/api/admin';
import { EnforcementPanel } from './EnforcementPanel';
import { RecoveryLockPanel } from './RecoveryLockPanel';
import {
  ACCOUNT_TYPE_LABELS,
  ACTION_FAILED_TEXT,
  BACK_TO_LIST_LABEL,
  ENFORCED_TEXT,
  FORBIDDEN_TEXT,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  NO_NAME_TEXT,
  NOT_APPLICABLE_TEXT,
  NOT_FOUND_TEXT,
  OPEN_USER_LABEL,
  openUserRest,
  REASON_REQUIRED_TEXT,
  RECOVERY_RELEASED_TEXT,
  SEARCH_BUTTON_LABEL,
  SEARCH_LABEL,
  STATUS_LABELS,
  USERS_EMPTY_TEXT,
  USERS_HINT,
} from './admin-texts';

type Users = { kind: 'idle' } | { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; users: UserList['users'] };

// The accounts screen (PG-028, FR-MOD-002, NFR-SEC-006 (2)): a search by name, never a list of everyone, and the enforcement panel of one account. The
// accounts and names it shows are the ones the database lets a USER_VIEW holder read on this screen.
export function UsersScreen({ permissions, role }: { permissions: readonly PermissionKey[]; role: 'admin' | 'moderator' }) {
  const call = useAdminCall();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<Users>({ kind: 'idle' });
  const [user, setUser] = useState<TargetUser | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [releasing, setReleasing] = useState(false);
  const [releaseFailure, setReleaseFailure] = useState<string | null>(null);
  const busy = useRef(false);

  const find = useCallback(
    async (text: string) => {
      setUsers({ kind: 'loading' });
      const outcome = await call((token) => fetchUsers(token, text));
      setUsers(outcome.kind === 'ok' ? { kind: 'loaded', users: outcome.value.users } : { kind: 'failed' });
    },
    [call],
  );

  // keepStatus: the reload after an action keeps its "done" message.
  async function open(userId: string, keepStatus = false) {
    setFailure(null);
    if (!keepStatus) setStatus('');
    const outcome = await call((token) => fetchUser(token, userId));
    if (outcome.kind === 'ok') setUser(outcome.value);
    else setFailure(outcome.kind === 'not-found' ? NOT_FOUND_TEXT : LOAD_FAILED_TEXT);
  }

  async function enforce(request: Omit<EnforceRequest, 'userId'>) {
    if (user === null || busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure(null);
    try {
      const outcome = await call((token) => enforceUser(token, { ...request, userId: user.userId }));
      if (outcome.kind !== 'ok') {
        setFailure(
          outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : outcome.kind === 'not-applicable' ? NOT_APPLICABLE_TEXT : outcome.kind === 'reason-required' ? REASON_REQUIRED_TEXT : ACTION_FAILED_TEXT,
        );
        return;
      }
      setStatus(ENFORCED_TEXT);
      await open(user.userId, true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  // FR-ADMIN-013: the Admin releases the account's recovery lock. The database allows the Admin only and writes the audit entry.
  async function release(reason: string | undefined) {
    if (user === null || busy.current) return;
    busy.current = true;
    setReleasing(true);
    setReleaseFailure(null);
    setStatus('');
    try {
      const outcome = await call((token) => releaseRecoveryLock(token, { userId: user.userId, ...(reason === undefined ? {} : { reason }) }));
      if (outcome.kind === 'ok') setStatus(RECOVERY_RELEASED_TEXT);
      else setReleaseFailure(outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : outcome.kind === 'not-found' ? NOT_FOUND_TEXT : ACTION_FAILED_TEXT);
    } finally {
      busy.current = false;
      setReleasing(false);
    }
  }

  if (user !== null) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <Button
            variant="text"
            onClick={() => {
              setUser(null);
              setStatus('');
              setFailure(null);
              setReleaseFailure(null);
              if (search.trim() !== '') void find(search.trim());
            }}
          >
            {BACK_TO_LIST_LABEL}
          </Button>
        </div>
        {status === '' ? null : <p role="status">{status}</p>}
        <EnforcementPanel user={user} permissions={permissions} pending={pending} failure={failure} onSubmit={(request) => void enforce(request)} />
        {role === 'admin' ? <RecoveryLockPanel pending={releasing} failure={releaseFailure} onRelease={(reason) => void release(reason)} /> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (search.trim() !== '') void find(search.trim());
        }}
      >
        <FormField label={SEARCH_LABEL} hint={USERS_HINT} className="min-w-64 flex-1">
          {(control) => <TextInput {...control} value={search} onChange={(event) => setSearch(event.target.value)} />}
        </FormField>
        <Button type="submit">{SEARCH_BUTTON_LABEL}</Button>
      </form>
      {failure === null ? null : <InlineAlert>{failure}</InlineAlert>}
      {users.kind === 'loading' ? <p role="status">{LOADING_TEXT}</p> : null}
      {users.kind === 'failed' ? <InlineAlert>{LOAD_FAILED_TEXT}</InlineAlert> : null}
      {users.kind === 'loaded' && users.users.length === 0 ? <p>{USERS_EMPTY_TEXT}</p> : null}
      {users.kind === 'loaded' && users.users.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {users.users.map((row) => (
            <li key={row.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
              <p>
                {row.fullName ?? NO_NAME_TEXT} · {ACCOUNT_TYPE_LABELS[row.accountType]} · {STATUS_LABELS[row.status]}
              </p>
              <Button variant="soft" onClick={() => void open(row.userId)}>
                {OPEN_USER_LABEL}
                <span className="sr-only"> {openUserRest(row.fullName ?? NO_NAME_TEXT)}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
