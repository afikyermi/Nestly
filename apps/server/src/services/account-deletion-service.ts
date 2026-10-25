// Account deletion for the account itself (I9 part 1; FR-SET-002, BR-073, PG-050, ERR-026, VAL-052). The caller is already
// authenticated; each call is one identity transaction, and the database decides who may schedule or cancel (account-deletion-repository).
// This layer adds one check before the work: the request must come from a password sign-in made in the last few minutes (VAL-052), so
// a session left open cannot schedule the deletion. That check is authentication, not authorization.
//
// The boundary of this part: the execution at the date runs in the database's daily job (execute_account_deletions(), #109 schedules it)
// and removes every Nestly row. Removing the Auth user afterwards needs the Auth admin key, which is not approved (WORKPLAN "ממתין לך" 3):
// nothing here calls Auth. Until then an executed account that signs in is told it was deleted (account-state-service, state `deleted`).

import { ACCOUNT_DELETION_REAUTH_SECONDS, type AccountDeletionStatus } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { cancelOwnDeletion, readOwnDeletion, scheduleOwnDeletion } from '../repositories/account-deletion-repository.js';

/** users_status_guard()'s SQLSTATE for a Group Owner (ERR-026). */
const GROUP_OWNER_STATE = 'NS030';
/** A refusal of the guard or of RLS. */
const REFUSED_STATE = '42501';

export type DeletionRequestResult =
  | { readonly kind: 'scheduled'; readonly status: AccountDeletionStatus }
  | { readonly kind: 'reauth_required' }
  | { readonly kind: 'group_owner' }
  | { readonly kind: 'not_allowed' };

export type DeletionCancelResult = { readonly kind: 'cancelled' } | { readonly kind: 'not_scheduled' };

/**
 * True when the session proved the password within the window (VAL-052). `passwordAt` is the token's newest password entry; a time in
 * the future (clock skew of more than a minute) is not trusted either.
 */
export function isFreshPasswordSignIn(passwordAt: number | null, now: Date): boolean {
  if (passwordAt === null) return false;
  const seconds = Math.floor(now.getTime() / 1000);
  return passwordAt <= seconds + 60 && seconds - passwordAt <= ACCOUNT_DELETION_REAUTH_SECONDS;
}

/** GET /api/account/deletion: none, or scheduled with the date (PG-050 shows it). Undefined: no account row. */
export async function readDeletionStatus(database: Database, identity: Identity): Promise<AccountDeletionStatus | undefined> {
  const own = await inIdentityTransaction(database, identity, (tx) => readOwnDeletion(tx));
  if (own === undefined) return undefined;
  return own.status === 'deletion_scheduled' && own.dueAt !== null ? { status: 'scheduled', dueAt: own.dueAt } : { status: 'none' };
}

/** POST /api/account/deletion: schedules the caller's deletion, 30 days ahead (BR-073). */
export async function requestDeletion(
  database: Database,
  identity: Identity,
  passwordAt: number | null,
  now: Date,
): Promise<DeletionRequestResult> {
  if (!isFreshPasswordSignIn(passwordAt, now)) return { kind: 'reauth_required' };
  try {
    const dueAt = await inIdentityTransaction(database, identity, (tx) => scheduleOwnDeletion(tx));
    return dueAt === undefined ? { kind: 'not_allowed' } : { kind: 'scheduled', status: { status: 'scheduled', dueAt } };
  } catch (error) {
    const code = readDatabaseFault(error)?.code;
    if (code === GROUP_OWNER_STATE) return { kind: 'group_owner' };
    if (code === REFUSED_STATE) return { kind: 'not_allowed' };
    throw error;
  }
}

/** POST /api/account/deletion/cancel: the account is active again with all its content (PG-050, AC-108). */
export async function cancelDeletion(database: Database, identity: Identity): Promise<DeletionCancelResult> {
  try {
    const cancelled = await inIdentityTransaction(database, identity, (tx) => cancelOwnDeletion(tx));
    return cancelled ? { kind: 'cancelled' } : { kind: 'not_scheduled' };
  } catch (error) {
    if (readDatabaseFault(error)?.code === REFUSED_STATE) return { kind: 'not_scheduled' };
    throw error;
  }
}
