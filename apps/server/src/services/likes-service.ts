// Like and unlike a post or a comment (I3 F3.3 b2; FR-FEED-001; Afik 6ב). The caller is already authenticated; each call is one identity
// transaction. The database decides who may like what (the insert policy: the target must be readable) and whose like is removed (the delete
// policy: the caller's own). This layer tells a stopped, Admin or Moderator account apart first (403, as the comments do), names "unavailable" for a
// target that is missing or not readable (one outcome, so the answer never tells them apart), and makes both calls idempotent.

import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readOwnAccounts } from '../repositories/account-state-repository.js';
import {
  deleteLike,
  insertLike,
  readReadableComment,
  readReadablePost,
  type LikeTarget,
} from '../repositories/likes-repository.js';

/** The caller cannot like: a stopped account (ERR-037), or an Admin or Moderator account (DR-1: a Professional may). */
export type LikeRefusal = { readonly kind: 'stopped' } | { readonly kind: 'forbidden' };

export type LikeOutcome = { readonly kind: 'done' } | { readonly kind: 'not_found' } | LikeRefusal;

/** More than one own users row cannot happen with the primary key; seeing them means a policy is wrong. */
export class LikesFault extends Error {
  constructor(what: string) {
    super(what);
    this.name = 'LikesFault';
  }
}

async function classifyViewer(tx: IdentityTx): Promise<LikeRefusal | undefined> {
  const accounts = await readOwnAccounts(tx);
  if (accounts.length > 1) throw new LikesFault('more than one own users row');
  const [account] = accounts;
  if (account === undefined) return { kind: 'forbidden' };
  if (account.status !== 'active') return { kind: 'stopped' };
  // Admin and Moderator are refused here (their writes also by RLS; their reads only here, security-privacy-open). A Regular or a
  // Professional account passes (DR-1): what each may write and read is the database's.
  return account.accountType === 'admin' || account.accountType === 'moderator' ? { kind: 'forbidden' } : undefined;
}

async function isReadable(tx: IdentityTx, target: LikeTarget, id: string): Promise<boolean> {
  return (target === 'post' ? await readReadablePost(tx, id) : await readReadableComment(tx, id)).length > 0;
}

/** PUT: the caller likes a readable target; a repeat leaves one like. */
export async function likeTarget(database: Database, identity: Identity, target: LikeTarget, id: string): Promise<LikeOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<LikeOutcome> => {
    const refusal = await classifyViewer(tx);
    if (refusal !== undefined) return refusal;
    if (!(await isReadable(tx, target, id))) return { kind: 'not_found' };
    await insertLike(tx, target, id);
    return { kind: 'done' };
  });
}

/** DELETE: removes the caller's own like on a readable target; none to remove is the same answer. */
export async function unlikeTarget(database: Database, identity: Identity, target: LikeTarget, id: string): Promise<LikeOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<LikeOutcome> => {
    const refusal = await classifyViewer(tx);
    if (refusal !== undefined) return refusal;
    if (!(await isReadable(tx, target, id))) return { kind: 'not_found' };
    await deleteLike(tx, id);
    return { kind: 'done' };
  });
}
