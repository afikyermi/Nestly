// The account state GET /api/me reports (I1 F1.5 part a; FR-AUTH-002, BR-024). The caller is already authenticated. The
// state is read in a new identity transaction on every call, so a status change is seen by the next request. The words
// suspended and banned never leave this layer: both are `unavailable`. For an active account the same transaction also says
// whether recovery answers are saved (F1.6, criterion 6): `set` or `missing`, and whether the session guard holds the caller to
// a new password after a takeover clear (F2.0 c7): `mustSetPassword`.
//
// When the caller's own answers row carries a handle that is not the token's email (the user changed their Auth email) and
// the token is newer, a SEPARATE transaction re-keys the handle after the state is read (criterion 23). The state never
// depends on it: a failure is reported to the caller's `onFailure` and ignored, and a missing pepper skips it.

import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { emailHandle, ipHash } from '../recovery/hashing.js';
import type { RecoveryKeys } from '../recovery/pepper.js';
import { liftOwnExpiredSuspension, readOwnStatuses } from '../repositories/account-state-repository.js';
import { readOwnClaim, type OwnClaim } from '../repositories/recovery-repository.js';
import { needsRekey, rekeyOwnHandle } from './recovery-questions-service.js';

export type AccountState =
  | { readonly state: 'active'; readonly recoveryQuestions: 'set' | 'missing'; readonly mustSetPassword: boolean }
  | { readonly state: 'unavailable' }
  | { readonly state: 'unregistered' };

/** Several own rows cannot happen with the primary key and the policy; seeing them means the policy is wrong. */
export class AccountStateFault extends Error {
  constructor() {
    super('more than one own users row');
    this.name = 'AccountStateFault';
  }
}

/** What the re-key needs from the request: the pepper's keys, the token's email and issue time, the address key. */
export interface HandleRekey {
  readonly keys: RecoveryKeys;
  readonly email: string;
  readonly issuedAt: number;
  /** The text the IP hash covers (client-ip.ts). */
  readonly addressKey: string;
  /** Called with the SQLSTATE (when there is one) of a failed re-key; the state is returned all the same. */
  readonly onFailure: (sqlstate: string | undefined) => void;
}

interface StateRead {
  readonly account: AccountState;
  readonly own: OwnClaim | undefined;
}

export async function readAccountState(database: Database, identity: Identity, rekey?: HandleRekey): Promise<AccountState> {
  const { account, own } = await inIdentityTransaction(database, identity, async (tx, guard): Promise<StateRead> => {
    const [status, ...others] = await readOwnStatuses(tx);
    if (others.length > 0) throw new AccountStateFault();
    if (status === undefined) return { account: { state: 'unregistered' }, own: undefined };
    // Fail closed: only the exact word `active` opens the account. A suspension whose end time has passed ends here (FR-MOD-002).
    if (status !== 'active' && !(status === 'suspended' && (await liftOwnExpiredSuspension(tx)))) return { account: { state: 'unavailable' }, own: undefined };
    const claim = await readOwnClaim(tx);
    // F2.0 c7 (Q-S1): only the session that completed a takeover clear is told to set a new password.
    const mustSetPassword = guard === 'must_set';
    return { account: { state: 'active', recoveryQuestions: claim === undefined ? 'missing' : 'set', mustSetPassword }, own: claim };
  });

  if (rekey !== undefined && own !== undefined) {
    const handle = emailHandle(rekey.keys, rekey.email);
    if (needsRekey(own, handle, rekey.issuedAt)) {
      const subjects = { handle, ip: ipHash(rekey.keys, rekey.addressKey), claimedAt: new Date(rekey.issuedAt * 1000) };
      try {
        await inIdentityTransaction(database, identity, (tx) => rekeyOwnHandle(tx, identity.userId, subjects));
      } catch (error) {
        // A handle held by a newer claim, a deadlock with another account swapping emails, a dropped connection: the
        // handle stays as it was and the next request tries again.
        rekey.onFailure(readDatabaseFault(error)?.code);
      }
    }
  }
  return account;
}
