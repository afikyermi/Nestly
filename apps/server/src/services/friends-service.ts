// Friend Requests and Friendships (I2 F2.4a; FR-REL-001, VAL-017, BR-029, AC-034). The caller is already authenticated; each call is
// one identity transaction. The database decides: who may see a row (RLS), which move is legal and by whom (friendships_transition),
// and a duplicate (the partial unique indexes). This layer only names the outcome. The actor is classified first, in the same
// transaction, so a stopped account and a Professional, Moderator or Admin get their 403 whatever the target is (c10); a target that
// is not an active Regular account is one outcome for every reason (c2, ERR-016: no row, one body). The words declined, cancelled,
// suspended and banned never leave here: a request's status is never returned (DR-3 A, c11).

import type { FriendLists } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { readOwnAccounts } from '../repositories/account-state-repository.js';
import {
  cancelRequest,
  insertRequest,
  liftCancel,
  readListedRows,
  readPair,
  readVisibleNames,
  removeFriendship,
  reopenDeclined,
  respondToRequest,
  type PairRow,
} from '../repositories/friends-repository.js';

/** Why a send is refused although the target is fine: ERR-016's three cases for a pair that already has a live row. */
export type SendConflict = 'request_exists' | 'already_friends' | 'incoming_pending';

/** The caller cannot act: a stopped account (ERR-037), or an account that is not a Regular parent's (BR-016). */
export type ActorRefusal = { readonly kind: 'stopped' } | { readonly kind: 'forbidden' };

export type SendOutcome =
  | { readonly kind: 'sent' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'conflict'; readonly reason: SendConflict }
  | ActorRefusal;

export type ActionOutcome =
  | { readonly kind: 'done' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'gone' }
  | ActorRefusal;

export type ListsOutcome = { readonly kind: 'lists'; readonly lists: FriendLists } | ActorRefusal;

/** More than one own users row cannot happen with the primary key; seeing them means a policy is wrong. */
export class FriendsFault extends Error {
  constructor(what: string) {
    super(what);
    this.name = 'FriendsFault';
  }
}

/** Who the caller is. Fails closed: no account row (an Auth user who never registered) or a non-Regular type is `forbidden`. */
async function classifyActor(tx: IdentityTx): Promise<ActorRefusal | undefined> {
  const accounts = await readOwnAccounts(tx);
  if (accounts.length > 1) throw new FriendsFault('more than one own users row');
  const [account] = accounts;
  if (account === undefined) return { kind: 'forbidden' };
  if (account.status !== 'active') return { kind: 'stopped' };
  return account.accountType === 'regular' ? undefined : { kind: 'forbidden' };
}

/** A failed statement the database answered with a refusal that is an outcome, not a fault. Anything else is rethrown. */
function refusalOf(error: unknown): ActorRefusal | { readonly kind: 'unavailable' } | undefined {
  const code = readDatabaseFault(error)?.code;
  if (code === '23503') return { kind: 'unavailable' }; // the target is not an active Regular account (the FKs), or the actor stopped between
  if (code === '42501') return { kind: 'stopped' }; // the policy refused: the caller stopped after the actor check
  return undefined;
}

/** The conflict a refused insert means, from the rows between the pair. `undefined`: the pair holds nothing the caller may read. */
function conflictOf(rows: readonly PairRow[], me: string): SendConflict | 'lift_cancel' | undefined {
  if (rows.some((row) => row.status === 'accepted')) return 'already_friends';
  const own = rows.filter((row) => row.requesterId === me && !row.isCancelled && (row.status === 'pending' || row.status === 'declined'));
  if (own.length > 0) return 'request_exists';
  if (rows.some((row) => row.requesterId === me && row.status === 'declined' && row.isCancelled)) return 'lift_cancel';
  if (rows.some((row) => row.requesterId !== me && row.status === 'pending' && !row.isCancelled)) return 'incoming_pending';
  return undefined;
}

const SEND_ATTEMPTS = 3;

async function send(tx: IdentityTx, me: string, targetId: string): Promise<SendOutcome> {
  const refusal = await classifyActor(tx);
  if (refusal !== undefined) return refusal;
  // DR-7 A: when the caller had declined the target's earlier request, that request stands declined; the caller's send reopens it, so
  // the caller may accept it (409 incoming_pending, no second row). If its sender had withdrawn it, it is retired instead and the
  // caller's own request is created below.
  const [reopened] = await reopenDeclined(tx, targetId);
  if (reopened !== undefined && !reopened.isCancelled) return { kind: 'conflict', reason: 'incoming_pending' };
  // A live row for the pair may hold the place (VAL-017): say which, from what the caller may read. A concurrent send, response or
  // withdrawal can move the pair between the insert, the read and the lift, so the three are retried a bounded number of times; the
  // answer is `unavailable` only if the caller reads nothing of the pair on the last pass (a decline stays as silent as a pending).
  for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt += 1) {
    const [inserted] = await insertRequest(tx, targetId);
    if (inserted !== undefined) return { kind: 'sent' };
    const conflict = conflictOf(await readPair(tx, targetId), me);
    if (conflict === undefined) continue;
    if (conflict !== 'lift_cancel') return { kind: 'conflict', reason: conflict };
    const [lifted] = await liftCancel(tx, targetId);
    if (lifted !== undefined) return { kind: 'sent' };
  }
  return { kind: 'unavailable' };
}

/** POST /api/friend-requests: one pending row, requester the caller's (c1-c4). `targetId` is lowercase and differs from the caller's. */
export async function sendFriendRequest(database: Database, identity: Identity, targetId: string): Promise<SendOutcome> {
  try {
    return await inIdentityTransaction(database, identity, (tx) => send(tx, identity.userId.toLowerCase(), targetId));
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal === undefined) throw error;
    return refusal;
  }
}

type Move = (tx: IdentityTx, otherId: string) => Promise<readonly unknown[]>;

/**
 * One state change on the pair with `otherId`. 0 rows changed: `gone` when the caller may read a row of the pair that the move
 * no longer fits (c9), `unavailable` when it reads none of it (c5-c8: a stranger, a stopped party, no such person). `existed`
 * says which rows of the pair count as the one the caller meant: someone who is not its party sees none, so none can say 409.
 */
async function act(
  database: Database,
  identity: Identity,
  otherId: string,
  move: Move,
  existed: (row: PairRow, me: string) => boolean,
): Promise<ActionOutcome> {
  try {
    return await inIdentityTransaction(database, identity, async (tx): Promise<ActionOutcome> => {
      const refusal = await classifyActor(tx);
      if (refusal !== undefined) return refusal;
      if ((await move(tx, otherId)).length > 0) return { kind: 'done' };
      const me = identity.userId.toLowerCase();
      return (await readPair(tx, otherId)).some((row) => existed(row, me)) ? { kind: 'gone' } : { kind: 'unavailable' };
    });
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal === undefined) throw error;
    return refusal;
  }
}

const requestedOfMe = (row: PairRow, me: string): boolean => row.addresseeId === me; // a request the other person sent the caller
const requestedByMe = (row: PairRow, me: string): boolean => row.requesterId === me; // a request the caller sent the other person
const wasFriendship = (row: PairRow): boolean => row.status === 'accepted' || row.status === 'removed';

/** c5: the addressee accepts the request `requesterId` sent. */
export const acceptFriendRequest = (database: Database, identity: Identity, requesterId: string) =>
  act(database, identity, requesterId, (tx, id) => respondToRequest(tx, id, 'accepted'), requestedOfMe);

/** c6: the addressee declines it. Silent for the requester (DR-3 A). */
export const declineFriendRequest = (database: Database, identity: Identity, requesterId: string) =>
  act(database, identity, requesterId, (tx, id) => respondToRequest(tx, id, 'declined'), requestedOfMe);

/** c7 (DR-4 A): the requester withdraws its request to `addresseeId`. */
export const cancelFriendRequest = (database: Database, identity: Identity, addresseeId: string) =>
  act(database, identity, addresseeId, cancelRequest, requestedByMe);

/** c8: either Friend ends the Friendship with `friendId`. */
export const removeFriend = (database: Database, identity: Identity, friendId: string) =>
  act(database, identity, friendId, removeFriendship, wasFriendship);

/** GET /api/friends (c11, PG-036): the caller's incoming and sent requests and Friends, each entry a user id, a name and, for a request, its time. */
export async function readFriendLists(database: Database, identity: Identity): Promise<ListsOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<ListsOutcome> => {
    const refusal = await classifyActor(tx);
    if (refusal !== undefined) return refusal;
    const me = identity.userId.toLowerCase();
    const rows = await readListedRows(tx);
    const names = await readVisibleNames(tx);
    const nameOf = new Map(names.map((name) => [name.userId, name.fullName]));
    const lists: FriendLists = { incoming: [], sent: [], friends: [] };
    for (const row of rows) {
      const otherId = row.requesterId === me ? row.addresseeId : row.requesterId;
      const fullName = nameOf.get(otherId);
      if (fullName === undefined) continue; // a name the database does not show is not listed: fail closed
      if (row.status === 'accepted') lists.friends.push({ userId: otherId, fullName });
      else if (row.addresseeId === me && row.status === 'pending') lists.incoming.push({ userId: otherId, fullName, requestedAt: row.requestedAt.toISOString() });
      else if (row.requesterId === me) lists.sent.push({ userId: otherId, fullName, requestedAt: row.requestedAt.toISOString() });
    }
    lists.friends.sort((a, b) => a.fullName.localeCompare(b.fullName) || a.userId.localeCompare(b.userId));
    return { kind: 'lists', lists };
  });
}
