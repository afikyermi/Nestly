// The caller's own journeys and children (I2 F2.2a, F2.2b; FR-PROFILE-002, PG-012): read them, add a child, edit a child, add a
// pregnancy, edit its due date. The caller is
// already authenticated; each call is one identity transaction at READ COMMITTED (the Drizzle default; the slot pick depends on
// each statement seeing new commits). Before any read or write the account itself is read in the same transaction: none (an Auth
// user who never registered) or not a Regular account → no_profile, nothing created; not active (suspended or banned) →
// unavailable, one answer, as GET /api/me gives. The words suspended and banned never leave here.

import { JOURNEY_STAGES, MAX_CHILDREN, type OwnJourneys, type RegistrationChild } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readOwnAccounts } from '../repositories/account-state-repository.js';
import {
  insertChildInSlot,
  insertHasChildJourney,
  insertPregnantJourney,
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

/** Thrown inside the pregnancy add when the insert stored nothing, so that the transaction rolls back (c15; c23 in F2.2b2). */
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
      const state = await gate(tx);
      if (state !== 'open') return { kind: state };
      for (let round = 0; round < SLOT_PICK_ROUNDS; round += 1) {
        const slot = lowestFreeSlot(await readOwnSlots(tx));
        if (slot === undefined) throw new ChildrenFull();
        await insertHasChildJourney(tx);
        if (await insertChildInSlot(tx, slot, child)) return readAll(tx);
      }
      throw new JourneysFault('no free child slot after the last round');
    });
  } catch (error) {
    if (error instanceof ChildrenFull) return { kind: 'too_many' };
    throw error;
  }
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
 * Adds the pregnant journey (VAL-039, AC-089; F2.2b c15) with its due date or none. A pregnant or a planning journey already
 * there, or a concurrent add that committed first → stage_conflict, nothing written.
 */
export async function addOwnPregnancy(database: Database, identity: Identity, dueDate: string | null): Promise<JourneysOutcome> {
  try {
    return await inIdentityTransaction(database, identity, async (tx) => {
      const state = await gate(tx);
      if (state !== 'open') return { kind: state };
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
