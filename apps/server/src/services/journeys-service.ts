// The caller's own journeys and children (I2 F2.2a, F2.2b; FR-PROFILE-002, PG-012): read them, add, edit or remove a child, add a
// pregnancy (ending planning when confirmed), edit its due date, end it, record its birth. The caller is already authenticated; each
// call is one identity transaction at READ COMMITTED (the Drizzle default; the slot pick depends on each statement seeing new
// commits). Before any read or write the account itself is read in the same transaction: none (an Auth user who never registered)
// or not a Regular account → no_profile, nothing created; not active (suspended or banned) → unavailable, one answer, as GET
// /api/me gives. The words suspended and banned never leave here. Every write that inserts or deletes a child or a journey then
// locks the caller's own profile row (schema.md F2.2b), so two such writes of one parent run one after the other and has_child
// exists if and only if a child does (DR-4 A, c19).

import { JOURNEY_STAGES, MAX_CHILDREN, type OwnJourneys, type RegistrationChild } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readOwnAccounts } from '../repositories/account-state-repository.js';
import {
  deleteOwnChild,
  deleteOwnJourney,
  deleteOwnJourneyOfStage,
  hasOwnChild,
  insertChildInSlot,
  insertHasChildJourney,
  insertPregnantJourney,
  lockOwnProfile,
  readOwnChildren,
  readOwnJourneys,
  readOwnSlots,
  updateOwnChild,
  updateOwnDueDate,
} from '../repositories/journeys-repository.js';

export type JourneysOutcome =
  | { readonly kind: 'journeys'; readonly journeys: OwnJourneys }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'no_profile' }
  | { readonly kind: 'too_many' }
  | { readonly kind: 'stage_conflict' }
  | { readonly kind: 'not_found' };

/** More than one own users row cannot happen with the primary key and the policy; seeing them means a policy is wrong. */
export class JourneysFault extends Error {
  constructor(what: string) {
    super(what);
    this.name = 'JourneysFault';
  }
}

/** Thrown inside the add transaction so that it rolls back, the has_child insert included (c6, c7). */
class ChildrenFull extends Error {
  constructor() {
    super('all child slots are taken');
    this.name = 'ChildrenFull';
  }
}

/** Thrown inside the pregnancy add when the insert stored nothing, so that the transaction rolls back, a planning delete included (c15, c23). */
class StageConflict extends Error {
  constructor() {
    super('a pregnant or planning journey exists');
    this.name = 'StageConflict';
  }
}

/** Rounds of the slot pick before giving up: each lost round means a concurrent add committed, and there are only ten slots. */
const SLOT_PICK_ROUNDS = 10;

type Gate = 'open' | 'unavailable' | 'no_profile';

/** Whether the caller may see or change journeys. Fails closed: only an active Regular account opens. */
async function gate(tx: IdentityTx): Promise<Gate> {
  const rows = await readOwnAccounts(tx);
  if (rows.length > 1) throw new JourneysFault('more than one own users row');
  const [account] = rows;
  if (account === undefined) return 'no_profile';
  if (account.status !== 'active') return 'unavailable';
  return account.accountType === 'regular' ? 'open' : 'no_profile';
}

/**
 * The gate, then the lock on the caller's own profile row for a write that inserts or deletes a child or a journey. An open gate
 * with no profile row to lock cannot happen (registration writes both); seeing it means a policy is wrong.
 */
async function gateAndLock(tx: IdentityTx): Promise<Gate> {
  const state = await gate(tx);
  if (state !== 'open') return state;
  if ((await lockOwnProfile(tx)) !== 1) throw new JourneysFault('not exactly one own profile row to lock');
  return state;
}

async function readAll(tx: IdentityTx): Promise<JourneysOutcome> {
  const journeys = await readOwnJourneys(tx);
  const children = await readOwnChildren(tx);
  // The order of JOURNEY_STAGES (planning, pregnant, has_child), the order registration offers them.
  const ordered = [...journeys].sort((a, b) => JOURNEY_STAGES.indexOf(a.stage) - JOURNEY_STAGES.indexOf(b.stage));
  return { kind: 'journeys', journeys: { journeys: ordered, children } };
}

/** The lowest of 1..MAX_CHILDREN not taken, or undefined when all are. */
function lowestFreeSlot(taken: readonly number[]): number | undefined {
  for (let slot = 1; slot <= MAX_CHILDREN; slot += 1) if (!taken.includes(slot)) return slot;
  return undefined;
}

export async function readOwnJourneysAndChildren(database: Database, identity: Identity): Promise<JourneysOutcome> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const state = await gate(tx);
    return state === 'open' ? readAll(tx) : { kind: state };
  });
}

/**
 * Adds a child in the lowest free slot (VAL-040, AC-090) and, in the same transaction, the has_child journey when it is missing
 * (DR-4 A, c7). A lost slot (a concurrent add committed it) re-reads and retries; all ten taken → too_many, nothing written.
 */
export async function addOwnChild(database: Database, identity: Identity, child: RegistrationChild): Promise<JourneysOutcome> {
  try {
    return await inIdentityTransaction(database, identity, async (tx) => {
      const state = await gateAndLock(tx);
      if (state !== 'open') return { kind: state };
      await addChildRounds(tx, child);
      return readAll(tx);
    });
  } catch (error) {
    if (error instanceof ChildrenFull) return { kind: 'too_many' };
    throw error;
  }
}

/** The slot pick, the has_child insert and the child insert, in the caller's transaction. All ten seats taken → ChildrenFull thrown. */
async function addChildRounds(tx: IdentityTx, child: RegistrationChild): Promise<void> {
  for (let round = 0; round < SLOT_PICK_ROUNDS; round += 1) {
    const slot = lowestFreeSlot(await readOwnSlots(tx));
    if (slot === undefined) throw new ChildrenFull();
    await insertHasChildJourney(tx);
    if (await insertChildInSlot(tx, slot, child)) return;
  }
  throw new JourneysFault('no free child slot after the last round');
}

/** Edits child `id` (DR-5 A: name, sex, birth date). Last write wins (Q2). Not the caller's, or no such row → not_found. */
export async function editOwnChild(
  database: Database,
  identity: Identity,
  id: string,
  child: RegistrationChild,
): Promise<JourneysOutcome> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const state = await gate(tx);
    if (state !== 'open') return { kind: state };
    const updated = await updateOwnChild(tx, id, child);
    if (updated > 1) throw new JourneysFault('more than one child row updated by id');
    return updated === 0 ? { kind: 'not_found' } : readAll(tx);
  });
}

/**
 * Adds the pregnant journey (VAL-039, AC-089; F2.2b c15) with its due date or none. With `endPlanning` (the confirmation of c16,
 * DR-3 A) the planning journey is deleted first, in the same transaction (c23). A pregnant journey already there, a planning one
 * not confirmed, or a concurrent add that committed first → stage_conflict, nothing written.
 */
export async function addOwnPregnancy(
  database: Database,
  identity: Identity,
  dueDate: string | null,
  endPlanning: boolean,
): Promise<JourneysOutcome> {
  try {
    return await inIdentityTransaction(database, identity, async (tx) => {
      const state = await gateAndLock(tx);
      if (state !== 'open') return { kind: state };
      if (endPlanning) await deleteOwnJourneyOfStage(tx, 'planning');
      if (!(await insertPregnantJourney(tx, dueDate))) throw new StageConflict();
      return readAll(tx);
    });
  } catch (error) {
    if (error instanceof StageConflict) return { kind: 'stage_conflict' };
    throw error;
  }
}

/** Sets the due date of pregnancy `id` (DR-5 A, VAL-044; F2.2b c14). Last write wins (Q2). Not the caller's pregnancy → not_found. */
export async function editOwnDueDate(
  database: Database,
  identity: Identity,
  id: string,
  dueDate: string | null,
): Promise<JourneysOutcome> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const state = await gate(tx);
    if (state !== 'open') return { kind: state };
    const updated = await updateOwnDueDate(tx, id, dueDate);
    if (updated > 1) throw new JourneysFault('more than one journey row updated by id');
    return updated === 0 ? { kind: 'not_found' } : readAll(tx);
  });
}

/**
 * Removes child `id` (DR-1 A: hard delete; F2.2b c17). The last child's removal deletes has_child in the same transaction (DR-4 A,
 * c19); then the parent may have no journey at all (DR-6 A, c21). Not the caller's, or no such row → not_found, nothing changes.
 */
export async function removeOwnChild(database: Database, identity: Identity, id: string): Promise<JourneysOutcome> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const state = await gateAndLock(tx);
    if (state !== 'open') return { kind: state };
    const deleted = await deleteOwnChild(tx, id);
    if (deleted > 1) throw new JourneysFault('more than one child row deleted by id');
    if (deleted === 0) return { kind: 'not_found' };
    if (!(await hasOwnChild(tx))) await deleteOwnJourneyOfStage(tx, 'has_child');
    return readAll(tx);
  });
}

/**
 * Ends pregnancy `id` (DR-1 A, DR-2r: hard delete, no reason; F2.2b c20). It may be the last journey (DR-6 A). Not the caller's,
 * not a pregnancy (planning and has_child end only as c23 and c19 do), or no such row → not_found, nothing changes.
 */
export async function endOwnPregnancy(database: Database, identity: Identity, id: string): Promise<JourneysOutcome> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const state = await gateAndLock(tx);
    if (state !== 'open') return { kind: state };
    const deleted = await deleteOwnJourney(tx, id, 'pregnant');
    if (deleted > 1) throw new JourneysFault('more than one journey row deleted by id');
    return deleted === 0 ? { kind: 'not_found' } : readAll(tx);
  });
}

/**
 * The birth of pregnancy `id` (DR-2 A; F2.2b c22): deletes the pregnancy, then adds the child as addOwnChild does (with has_child
 * when missing), in one transaction. Not the caller's pregnancy → not_found, no child; ten children → too_many, the pregnancy kept.
 */
export async function recordOwnBirth(
  database: Database,
  identity: Identity,
  id: string,
  child: RegistrationChild,
): Promise<JourneysOutcome> {
  try {
    return await inIdentityTransaction(database, identity, async (tx) => {
      const state = await gateAndLock(tx);
      if (state !== 'open') return { kind: state };
      const deleted = await deleteOwnJourney(tx, id, 'pregnant');
      if (deleted > 1) throw new JourneysFault('more than one journey row deleted by id');
      if (deleted === 0) return { kind: 'not_found' };
      await addChildRounds(tx, child);
      return readAll(tx);
    });
  } catch (error) {
    if (error instanceof ChildrenFull) return { kind: 'too_many' };
    throw error;
  }
}
