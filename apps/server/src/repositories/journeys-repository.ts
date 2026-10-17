// The caller's own journeys and children (I2 F2.2a; schema.md "Server write path"). Runs inside the caller's identity transaction
// and nowhere else. No `where` names a user: RLS returns, inserts or updates the caller's own rows or nothing (journey_contexts_*_own,
// children_*_own, all behind is_active_account()); permission is the database's. Writes go through the write models that name
// exactly the granted columns, so ids, owners and clocks always take the database's defaults (rules 12, 13).

import type { ChildSex, JourneyStage, RegistrationChild } from '@nestly/shared';
import { asc, eq } from 'drizzle-orm';
import { children, childrenInsert, childrenUpdate, journeyContexts, journeyContextsInsert } from '../db/schema.js';
import type { IdentityTx } from '../db/identity-transaction.js';

export interface JourneyRow {
  readonly id: string;
  readonly stage: JourneyStage;
  readonly dueDate: string | null;
}

export interface ChildRow {
  readonly id: string;
  readonly name: string;
  readonly sex: ChildSex;
  readonly birthDate: string;
}

/** The journeys the caller can see. */
export async function readOwnJourneys(tx: IdentityTx): Promise<JourneyRow[]> {
  return tx.select({ id: journeyContexts.id, stage: journeyContexts.stage, dueDate: journeyContexts.dueDate }).from(journeyContexts);
}

/** The children the caller can see, by slot. */
export async function readOwnChildren(tx: IdentityTx): Promise<ChildRow[]> {
  return tx
    .select({ id: children.id, name: children.name, sex: children.sex, birthDate: children.birthDate })
    .from(children)
    .orderBy(asc(children.slot));
}

/** The slots the caller's children take. A fresh statement: under READ COMMITTED it sees every add committed before it. */
export async function readOwnSlots(tx: IdentityTx): Promise<number[]> {
  const rows = await tx.select({ slot: children.slot }).from(children);
  return rows.map((row) => row.slot);
}

/**
 * The has_child journey, unless the caller has it already (DR-4 A): ON CONFLICT DO NOTHING, untargeted, so it is idempotent and
 * race-free without a read, and keeps working if a unique key becomes partial (schema.md "DR-1 constraint").
 */
export async function insertHasChildJourney(tx: IdentityTx): Promise<void> {
  await tx.insert(journeyContextsInsert).values({ stage: 'has_child', dueDate: null }).onConflictDoNothing();
}

/**
 * The child into `slot`. True when stored; false when a concurrent add took the slot first (this statement waited for its commit on
 * children_user_id_slot_key and then did nothing).
 */
export async function insertChildInSlot(tx: IdentityTx, slot: number, child: RegistrationChild): Promise<boolean> {
  const rows = await tx
    .insert(childrenInsert)
    .values({ slot, name: child.name, sex: child.sex, birthDate: child.birthDate })
    .onConflictDoNothing()
    .returning({ slot: childrenInsert.slot });
  return rows.length > 0;
}

/** Sets the three fields of child `id`. The id picks the target; RLS decides whether it may. No row: not the caller's, or not active. */
export async function updateOwnChild(tx: IdentityTx, id: string, child: RegistrationChild): Promise<number> {
  const rows = await tx
    .update(childrenUpdate)
    .set({ name: child.name, sex: child.sex, birthDate: child.birthDate })
    .where(eq(childrenUpdate.id, id))
    .returning({ id: childrenUpdate.id });
  return rows.length;
}
