// Hide a post for oneself and undo it (I3 F3.9; FR-ALG-009 — the Hide action only; Afik 8א: for me only, not a matching signal). The caller is
// already authenticated; each call is one identity transaction. The database decides which posts may be hidden and whose row is removed. This
// layer tells a stopped or non-Regular account apart first (403 for both calls, so an undo by a suspended account is refused rather than a
// silent no-op), and leaves every other refusal to the database's SQLSTATE, which the route maps (NS004 404, NS003 409, 42501 403).
// A hide changes nothing but the caller's own row: no event, no count, no ranking input, and no log line names a post or a user.

import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readOwnAccounts } from '../repositories/account-state-repository.js';
import { deleteHide, insertHide } from '../repositories/post-hides-repository.js';

export type HideOutcome = { readonly kind: 'done' } | { readonly kind: 'not_allowed' };

/** More than one own users row cannot happen with the primary key; seeing them means a policy is wrong. */
export class PostHidesFault extends Error {
  constructor(what: string) {
    super(what);
    this.name = 'PostHidesFault';
  }
}

/** True when the caller is an active Regular account (F3.9 c7: a Professional or a suspended account may not hide or undo). */
async function mayHide(tx: IdentityTx): Promise<boolean> {
  const accounts = await readOwnAccounts(tx);
  if (accounts.length > 1) throw new PostHidesFault('more than one own users row');
  const [account] = accounts;
  return account !== undefined && account.status === 'active' && account.accountType === 'regular';
}

/** PUT: the caller hides a post they can read and did not write; a repeat leaves one row. A refused post throws with its SQLSTATE. */
export async function hidePost(database: Database, identity: Identity, postId: string): Promise<HideOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<HideOutcome> => {
    if (!(await mayHide(tx))) return { kind: 'not_allowed' };
    await insertHide(tx, postId);
    return { kind: 'done' };
  });
}

/** DELETE: removes the caller's own hide; no row, a post never hidden or one the caller cannot read is the same answer (no oracle). */
export async function unhidePost(database: Database, identity: Identity, postId: string): Promise<HideOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<HideOutcome> => {
    if (!(await mayHide(tx))) return { kind: 'not_allowed' };
    await deleteHide(tx, postId);
    return { kind: 'done' };
  });
}
