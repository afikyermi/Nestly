// The caller's own trackers, cycle and home (I6; FR-HOME-001..004, FR-TRACK-001/002, FR-ALG-004 stage part). Each call is one identity
// transaction. The account is read first: none or not a Regular account → no_profile; not active → unavailable (as GET /api/me, one
// answer). Health data about minors and women: the database lets only the owner see it (RLS), and nothing here logs a value.

import {
  currentWindow,
  matchGuides,
  periodBounds,
  stageContexts,
  type CycleResponse,
  type HomeResponse,
  type Period,
  type TrackerEventDto,
  type TrackerEventValue,
  type TrackerKind,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { readOwnAccounts } from '../repositories/account-state-repository.js';
import { readOwnChildren, readOwnJourneys } from '../repositories/journeys-repository.js';
import {
  deleteCycleEntry,
  deleteEvent,
  insertCycleEntry,
  insertEvent,
  listCycleEntries,
  listEvents,
  listPublishedGuides,
  updateCycleEntry,
  updateEvent,
} from '../repositories/trackers-repository.js';

export type Outcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'no_profile' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'duplicate_date' };

export class TrackersFault extends Error {
  constructor(what: string) {
    super(what);
    this.name = 'TrackersFault';
  }
}

async function gate(tx: IdentityTx): Promise<'open' | 'unavailable' | 'no_profile'> {
  const rows = await readOwnAccounts(tx);
  if (rows.length > 1) throw new TrackersFault('more than one own users row');
  const [account] = rows;
  if (account === undefined || account.accountType !== 'regular') return 'no_profile';
  return account.status === 'active' ? 'open' : 'unavailable';
}

/** Runs `work` for an open account; the other gates answer without touching a tracker table. */
function run<T>(database: Database, identity: Identity, work: (tx: IdentityTx) => Promise<Outcome<T>>): Promise<Outcome<T>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const state = await gate(tx);
    return state === 'open' ? work(tx) : { kind: state };
  });
}

const ok = <T>(value: T): Outcome<T> => ({ kind: 'ok', value });

export function readEvents(database: Database, identity: Identity, kind: TrackerKind, childId: string | undefined, period: Period) {
  const { start, end } = periodBounds(period);
  return run<{ events: TrackerEventDto[]; truncated: boolean }>(database, identity, async (tx) => ok(await listEvents(tx, kind, childId, start, end)));
}

/** A child that is not the caller's is refused by the policy (42501): the same answer as an unknown child. */
export function addEvent(database: Database, identity: Identity, childId: string, value: TrackerEventValue) {
  return run<true>(database, identity, async (tx) => {
    try {
      await tx.transaction(async (inner) => insertEvent(inner, childId, value));
    } catch (error) {
      if (readDatabaseFault(error)?.code === '42501') return { kind: 'not_found' };
      throw error;
    }
    return ok(true as const);
  });
}

export function editEvent(database: Database, identity: Identity, id: string, value: TrackerEventValue) {
  return run<true>(database, identity, async (tx) => ((await updateEvent(tx, id, value)) === 0 ? { kind: 'not_found' } : ok(true as const)));
}

export function removeEvent(database: Database, identity: Identity, id: string) {
  return run<true>(database, identity, async (tx) => ((await deleteEvent(tx, id)) === 0 ? { kind: 'not_found' } : ok(true as const)));
}

async function cycleView(tx: IdentityTx, today: string): Promise<CycleResponse> {
  const entries = await listCycleEntries(tx);
  const [latest] = entries;
  return { entries, window: currentWindow(latest?.startDate ?? null, latest?.cycleLengthDays ?? null, today) };
}

export function readCycle(database: Database, identity: Identity, today: string) {
  return run<CycleResponse>(database, identity, async (tx) => ok(await cycleView(tx, today)));
}

const isUniqueViolation = (error: unknown): boolean => readDatabaseFault(error)?.code === '23505';

export function addCycle(database: Database, identity: Identity, value: { startDate: string; cycleLengthDays: number }) {
  return run<true>(database, identity, async (tx) => {
    try {
      await tx.transaction(async (inner) => insertCycleEntry(inner, value));
    } catch (error) {
      if (isUniqueViolation(error)) return { kind: 'duplicate_date' };
      throw error;
    }
    return ok(true as const);
  });
}

export function editCycle(database: Database, identity: Identity, id: string, value: { startDate: string; cycleLengthDays: number }) {
  return run<true>(database, identity, async (tx) => {
    try {
      const changed = await tx.transaction(async (inner) => updateCycleEntry(inner, id, value));
      return changed === 0 ? { kind: 'not_found' } : ok(true as const);
    } catch (error) {
      if (isUniqueViolation(error)) return { kind: 'duplicate_date' };
      throw error;
    }
  });
}

export function removeCycle(database: Database, identity: Identity, id: string) {
  return run<true>(database, identity, async (tx) => ((await deleteCycleEntry(tx, id)) === 0 ? { kind: 'not_found' } : ok(true as const)));
}

/**
 * The home: the contexts of the parent (stage, FR-ALG-004), the published guides for them (FR-HOME-004), and the current ovulation
 * window when a cycle is tracked. Tracker events are not read at all: without an approved mapping the signal is ignored (AC-069).
 */
export function readHome(database: Database, identity: Identity, today: string) {
  return run<HomeResponse>(database, identity, async (tx) => {
    const journeys = await readOwnJourneys(tx);
    const children = await readOwnChildren(tx);
    const contexts = stageContexts(journeys, children, today);
    const guides = matchGuides(contexts, await listPublishedGuides(tx)).map((g) => ({
      id: g.id,
      stageKind: g.stageKind,
      title: g.title,
      body: g.body,
      source: g.source,
    }));
    const cycle = (await cycleView(tx, today)).window;
    return ok({ contexts, guides, cycle });
  });
}
