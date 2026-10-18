// The caller's own journeys and children (I2 F2.2a, F2.2b; schema.md "Server write path"). Runs inside the caller's identity transaction
// and nowhere else. No `where` names a user: RLS returns, inserts, updates, deletes or locks the caller's own rows or nothing
// (journey_contexts_*_own, children_*_own, regular_profiles_*_own, all behind is_active_account()); permission is the database's.
// Inserts and updates go through the write models that name exactly the granted columns, so ids, owners and clocks always take the
// database's defaults (rules 12, 13). A delete names no column; a stage in its `where` is targeting, not permission.

import type { ChildSex, JourneyStage, RegistrationChild } from '@nestly/shared';
import { and, asc, eq } from 'drizzle-orm';
import {
  children,
  childrenInsert,
  childrenUpdate,
  journeyContexts,
  journeyContextsInsert,
  journeyContextsUpdate,
  regularProfiles,
} from '../db/schema.js';
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

/** The distinct stages of the caller's own journeys (F3.2: the feed's Stage set). Selects `stage` and nothing else: no id, no due date. */
export async function readOwnStages(tx: IdentityTx): Promise<JourneyStage[]> {
  const rows = await tx.selectDistinct({ stage: journeyContexts.stage }).from(journeyContexts);
  return rows.map((row) => row.stage);
}

/**
 * The children the caller can see, in the order they were added (F2.2b, schema.md "Child order"): created_at, then slot, which
 * breaks registration's tie (one now(), slots in entry order). A reused seat shows last (c17).
 */
export async function readOwnChildren(tx: IdentityTx): Promise<ChildRow[]> {
  return tx
    .select({ id: children.id, name: children.name, sex: children.sex, birthDate: children.birthDate })
    .from(children)
    .orderBy(asc(children.createdAt), asc(children.slot));
}

/**
 * Locks the caller's own regular_profiles row FOR NO KEY UPDATE (F2.2b, schema.md "has_child ⇔ ≥ 1"): first in every write that
 * inserts or deletes a child or a journey, so a second such write of the same parent waits for the first one's commit and then sees
 * it. Does not block the FOR KEY SHARE of foreign-key checks. The number of rows locked: 1, or 0 when RLS shows none.
 */
export async function lockOwnProfile(tx: IdentityTx): Promise<number> {
  const rows = await tx.select({ userId: regularProfiles.userId }).from(regularProfiles).for('no key update');
  return rows.length;
}

/** Whether the caller has any child left. A fresh statement: it sees the caller's own delete before it. */
export async function hasOwnChild(tx: IdentityTx): Promise<boolean> {
  const rows = await tx.select({ id: children.id }).from(children).limit(1);
  return rows.length > 0;
}

/** Deletes child `id` (DR-1 A, hard). The id picks the target; RLS decides whether it may. The number of rows deleted. */
export async function deleteOwnChild(tx: IdentityTx, id: string): Promise<number> {
  const rows = await tx.delete(children).where(eq(children.id, id)).returning({ id: children.id });
  return rows.length;
}

/**
 * Deletes journey `id` when it is of `stage` (DR-1 A, DR-2r: hard, no reason). The id and stage pick the target; RLS decides whether
 * it may. A row of another stage is not touched. The number of rows deleted.
 */
export async function deleteOwnJourney(tx: IdentityTx, id: string, stage: JourneyStage): Promise<number> {
  const rows = await tx
    .delete(journeyContexts)
    .where(and(eq(journeyContexts.id, id), eq(journeyContexts.stage, stage)))
    .returning({ id: journeyContexts.id });
  return rows.length;
}

/** Deletes the caller's journey of `stage`, if any (has_child after the last child, DR-4 A; planning before a pregnancy, DR-3 A). */
export async function deleteOwnJourneyOfStage(tx: IdentityTx, stage: JourneyStage): Promise<void> {
  await tx.delete(journeyContexts).where(eq(journeyContexts.stage, stage));
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

/**
 * The pregnant journey (F2.2b c15), with its due date or null. True when stored; false when the caller already has a pregnant or a
 * planning journey (journey_contexts_user_id_stage_key, journey_contexts_user_id_planning_pregnant_key): ON CONFLICT DO NOTHING,
 * untargeted, so two concurrent adds store exactly one and the loser waits for its commit and then does nothing.
 */
export async function insertPregnantJourney(tx: IdentityTx, dueDate: string | null): Promise<boolean> {
  const rows = await tx
    .insert(journeyContextsInsert)
    .values({ stage: 'pregnant', dueDate })
    .onConflictDoNothing()
    .returning({ stage: journeyContextsInsert.stage });
  return rows.length > 0;
}

/**
 * Sets the due date of journey `id` (F2.2b c14; null clears it). The id picks the target; RLS decides whether it may, and admits
 * pregnant rows only. No row: not the caller's, not a pregnancy, or not active.
 */
export async function updateOwnDueDate(tx: IdentityTx, id: string, dueDate: string | null): Promise<number> {
  const rows = await tx
    .update(journeyContextsUpdate)
    .set({ dueDate })
    .where(eq(journeyContextsUpdate.id, id))
    .returning({ id: journeyContextsUpdate.id });
  return rows.length;
}
