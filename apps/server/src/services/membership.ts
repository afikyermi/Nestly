// Who may use the social features that belong to Regular and Professional accounts (FR-NOTIF-002, FR-SEARCH-001): the caller's own account,
// classified in the same transaction as the work. Fails closed: no account row, or an Admin or Moderator, is `forbidden`; a stopped account is
// `stopped` (ERR-037).

import type { IdentityTx } from '../db/identity-transaction.js';
import { readOwnAccounts } from '../repositories/account-state-repository.js';

export type MemberRefusal = { readonly kind: 'stopped' } | { readonly kind: 'forbidden' };
export type MemberKind = 'regular' | 'professional';

/** The caller's account kind, or why it is refused. More than one own row cannot happen with the primary key: it is a fault. */
export async function classifyMember(tx: IdentityTx): Promise<{ readonly kind: MemberKind } | MemberRefusal> {
  const accounts = await readOwnAccounts(tx);
  if (accounts.length > 1) throw new Error('more than one own users row');
  const [account] = accounts;
  if (account === undefined) return { kind: 'forbidden' };
  if (account.status !== 'active') return { kind: 'stopped' };
  return account.accountType === 'regular' || account.accountType === 'professional' ? { kind: account.accountType } : { kind: 'forbidden' };
}

export const isRefusal = (result: { readonly kind: string }): result is MemberRefusal => result.kind === 'stopped' || result.kind === 'forbidden';
