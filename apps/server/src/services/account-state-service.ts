// The account state GET /api/me reports (I1 F1.5 part a; FR-AUTH-002, BR-024). The caller is already authenticated. The
// state is read in a new identity transaction on every call, so a status change is seen by the next request. The words
// suspended and banned never leave this layer: both are `unavailable`.

import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readOwnStatuses } from '../repositories/account-state-repository.js';

export type AccountState = 'active' | 'unavailable' | 'unregistered';

/** Several own rows cannot happen with the primary key and the policy; seeing them means the policy is wrong. */
export class AccountStateFault extends Error {
  constructor() {
    super('more than one own users row');
    this.name = 'AccountStateFault';
  }
}

export async function readAccountState(database: Database, identity: Identity): Promise<AccountState> {
  const statuses = await inIdentityTransaction(database, identity, readOwnStatuses);
  const [status, ...others] = statuses;
  if (others.length > 0) throw new AccountStateFault();
  if (status === undefined) return 'unregistered';
  // Fail closed: only the exact word `active` opens the account.
  return status === 'active' ? 'active' : 'unavailable';
}
