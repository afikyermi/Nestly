// The account state GET /api/me reports (I1 F1.5 part a; FR-AUTH-002, BR-024). The caller is already authenticated. The
// state is read in a new identity transaction on every call, so a status change is seen by the next request. The words
// suspended and banned never leave this layer: both are `unavailable`. For an active account the same transaction also says
// whether recovery answers are saved (F1.6, criterion 6): `set` or `missing`.

import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readOwnStatuses } from '../repositories/account-state-repository.js';
import { hasOwnAnswers } from '../repositories/recovery-repository.js';

export type AccountState =
  | { readonly state: 'active'; readonly recoveryQuestions: 'set' | 'missing' }
  | { readonly state: 'unavailable' }
  | { readonly state: 'unregistered' };

/** Several own rows cannot happen with the primary key and the policy; seeing them means the policy is wrong. */
export class AccountStateFault extends Error {
  constructor() {
    super('more than one own users row');
    this.name = 'AccountStateFault';
  }
}

export function readAccountState(database: Database, identity: Identity): Promise<AccountState> {
  return inIdentityTransaction(database, identity, async (tx): Promise<AccountState> => {
    const [status, ...others] = await readOwnStatuses(tx);
    if (others.length > 0) throw new AccountStateFault();
    if (status === undefined) return { state: 'unregistered' };
    // Fail closed: only the exact word `active` opens the account.
    if (status !== 'active') return { state: 'unavailable' };
    return { state: 'active', recoveryQuestions: (await hasOwnAnswers(tx)) ? 'set' : 'missing' };
  });
}
