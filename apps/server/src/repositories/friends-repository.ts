// Friend Requests and Friendships (I2 F2.4a; FR-REL-001, VAL-017; schema.md "Server"). Runs inside the caller's identity transaction
// and nowhere else. Permission is the database's: the policies show a party its rows, friendships_transition() decides every move and
// its actor, and the partial unique indexes decide duplicates. An id in a `where` below names the other person, a key and never a
// filter for permission: a row the caller is not party to is invisible whatever the id says. `status` is read here only so the
// service can tell a request that is gone from one that never existed; it never leaves the service (DR-3 A, c11).

import type { FriendshipStatus } from '@nestly/shared';
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { IdentityTx } from '../db/identity-transaction.js';
import { friendships, friendshipsInsert, friendshipsUpdate, regularNames } from '../db/schema.js';

/** A row between the caller and one other person, as the caller may read it. */
export interface PairRow {
  readonly requesterId: string;
  readonly addresseeId: string;
  readonly status: FriendshipStatus;
  readonly isCancelled: boolean;
}

/** Inserts a pending request to `addresseeId` (the requester is the caller's by default). Empty when a live row for the pair exists. */
export async function insertRequest(tx: IdentityTx, addresseeId: string) {
  return tx.insert(friendshipsInsert).values({ addresseeId }).onConflictDoNothing().returning({ addresseeId: friendshipsInsert.addresseeId });
}

/** DR-7 A: reopens the request `requesterId` sent to the caller and the caller declined. Returns whether it was cancelled meanwhile. */
export async function reopenDeclined(tx: IdentityTx, requesterId: string): Promise<{ isCancelled: boolean }[]> {
  const rows = await tx
    .update(friendshipsUpdate)
    .set({ status: 'pending' })
    .where(and(eq(friendshipsUpdate.requesterId, requesterId), eq(friendshipsUpdate.status, 'declined')))
    .returning({ cancelledAt: friendshipsUpdate.cancelledAt });
  return rows.map((row) => ({ isCancelled: row.cancelledAt !== null }));
}

/** DR-3 A: the caller's own cancelled-then-declined request to `addresseeId` is sent again (the cancel is lifted). */
export async function liftCancel(tx: IdentityTx, addresseeId: string) {
  return tx
    .update(friendshipsUpdate)
    .set({ cancelledAt: null })
    .where(and(eq(friendshipsUpdate.addresseeId, addresseeId), eq(friendshipsUpdate.status, 'declined'), isNotNull(friendshipsUpdate.cancelledAt)))
    .returning({ addresseeId: friendshipsUpdate.addresseeId });
}

/** The addressee accepts or declines the open request that `requesterId` sent the caller. */
export async function respondToRequest(tx: IdentityTx, requesterId: string, status: 'accepted' | 'declined') {
  return tx
    .update(friendshipsUpdate)
    .set({ status })
    .where(and(eq(friendshipsUpdate.requesterId, requesterId), eq(friendshipsUpdate.status, 'pending'), isNull(friendshipsUpdate.cancelledAt)))
    .returning({ requesterId: friendshipsUpdate.requesterId });
}

/** DR-4 A: the requester withdraws the caller's own open (pending, or declined and not yet withdrawn) request to `addresseeId`. */
export async function cancelRequest(tx: IdentityTx, addresseeId: string) {
  return tx
    .update(friendshipsUpdate)
    .set({ cancelledAt: sql`now()` })
    .where(
      and(
        eq(friendshipsUpdate.addresseeId, addresseeId),
        inArray(friendshipsUpdate.status, ['pending', 'declined']),
        isNull(friendshipsUpdate.cancelledAt),
      ),
    )
    .returning({ addresseeId: friendshipsUpdate.addresseeId });
}

/** Either party ends the Friendship with `otherId`. */
export async function removeFriendship(tx: IdentityTx, otherId: string) {
  return tx
    .update(friendshipsUpdate)
    .set({ status: 'removed' })
    .where(and(eq(friendshipsUpdate.status, 'accepted'), or(eq(friendshipsUpdate.requesterId, otherId), eq(friendshipsUpdate.addresseeId, otherId))))
    .returning({ requesterId: friendshipsUpdate.requesterId });
}

/** Every row between the caller and `otherId` the caller may read, either direction: the service tells gone from never-existed. */
export async function readPair(tx: IdentityTx, otherId: string): Promise<PairRow[]> {
  const rows = await tx
    .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId, status: friendships.status, cancelledAt: friendships.cancelledAt })
    .from(friendships)
    .where(or(eq(friendships.requesterId, otherId), eq(friendships.addresseeId, otherId)));
  return rows.map((row) => ({ requesterId: row.requesterId, addresseeId: row.addresseeId, status: row.status, isCancelled: row.cancelledAt !== null }));
}

export interface ListedRow {
  readonly requesterId: string;
  readonly addresseeId: string;
  readonly status: FriendshipStatus;
  readonly requestedAt: Date;
}

/**
 * The live rows the caller may read, newest request first: pending or declined and not withdrawn (a request; the service tells which
 * list by who is who), and accepted (a Friendship). Removed rows and withdrawn ones are not lists.
 */
export async function readListedRows(tx: IdentityTx): Promise<ListedRow[]> {
  return tx
    .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId, status: friendships.status, requestedAt: friendships.requestedAt })
    .from(friendships)
    .where(or(eq(friendships.status, 'accepted'), and(inArray(friendships.status, ['pending', 'declined']), isNull(friendships.cancelledAt))))
    .orderBy(desc(friendships.requestedAt), desc(friendships.id));
}

/** The full names the caller may read: its own, and the other party's of each live row (regular_names_select_party). */
export async function readVisibleNames(tx: IdentityTx): Promise<{ userId: string; fullName: string }[]> {
  return tx.select({ userId: regularNames.userId, fullName: regularNames.fullName }).from(regularNames);
}
