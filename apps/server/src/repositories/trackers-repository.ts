// The caller's own tracker events, cycle entries and the published guides (I6; FR-TRACK-001/002, FR-HOME-004). Runs inside the caller's
// identity transaction and nowhere else. No `where` names a user: RLS returns, inserts, updates or deletes the caller's own rows or
// nothing (tracker_events_*_own, cycle_entries_*_own, status_guides_select_published). The kind, child and period in a `where` are the
// page's query, not permission. Writes go through the write models that name exactly the granted columns (rules 12, 13).

import type { CycleEntryDto, GuideRow, TrackerEventDto, TrackerEventValue, TrackerKind } from '@nestly/shared';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import {
  cycleEntries,
  cycleEntriesInsert,
  cycleEntriesUpdate,
  statusGuides,
  trackerEvents,
  trackerEventsInsert,
  trackerEventsUpdate,
} from '../db/schema.js';
import type { IdentityTx } from '../db/identity-transaction.js';

const EVENT_LIMIT = 1000;
const CYCLE_LIMIT = 200;

const eventColumns = {
  id: trackerEvents.id,
  childId: trackerEvents.childId,
  kind: trackerEvents.kind,
  occurredAt: trackerEvents.occurredAt,
  endedAt: trackerEvents.endedAt,
  amountMl: trackerEvents.amountMl,
  choice: trackerEvents.choice,
  name: trackerEvents.name,
  dosage: trackerEvents.dosage,
  weightKg: trackerEvents.weightKg,
  heightCm: trackerEvents.heightCm,
  headCm: trackerEvents.headCm,
  note: trackerEvents.note,
};

type EventRow = {
  id: string;
  childId: string;
  kind: TrackerKind;
  occurredAt: Date;
  endedAt: Date | null;
  amountMl: number | null;
  choice: string | null;
  name: string | null;
  dosage: string | null;
  weightKg: string | null;
  heightCm: string | null;
  headCm: string | null;
  note: string | null;
};

const num = (value: string | null): number | null => (value === null ? null : Number(value));

function toDto(row: EventRow): TrackerEventDto {
  return {
    ...row,
    occurredAt: row.occurredAt.toISOString(),
    endedAt: row.endedAt === null ? null : row.endedAt.toISOString(),
    weightKg: num(row.weightKg),
    heightCm: num(row.heightCm),
    headCm: num(row.headCm),
  };
}

const numeric = (value: number | null): string | null => (value === null ? null : String(value));

function columnsOf(value: TrackerEventValue) {
  return {
    occurredAt: value.occurredAt,
    endedAt: value.endedAt,
    amountMl: value.amountMl,
    choice: value.choice,
    name: value.name,
    dosage: value.dosage,
    weightKg: numeric(value.weightKg),
    heightCm: numeric(value.heightCm),
    headCm: numeric(value.headCm),
    note: value.note,
  };
}

/** The events of a kind in [start, end), newest first, for one child or all the caller can see. */
export async function listEvents(tx: IdentityTx, kind: TrackerKind, childId: string | undefined, start: Date, end: Date): Promise<TrackerEventDto[]> {
  const conditions = [eq(trackerEvents.kind, kind), gte(trackerEvents.occurredAt, start), lt(trackerEvents.occurredAt, end)];
  if (childId !== undefined) conditions.push(eq(trackerEvents.childId, childId));
  const rows = await tx.select(eventColumns).from(trackerEvents).where(and(...conditions)).orderBy(desc(trackerEvents.occurredAt)).limit(EVENT_LIMIT);
  return rows.map(toDto);
}

/** Inserts an event for a child. A child that is not the caller's is refused by the policy (42501). */
export async function insertEvent(tx: IdentityTx, childId: string, value: TrackerEventValue): Promise<void> {
  await tx.insert(trackerEventsInsert).values({ childId, kind: value.kind, ...columnsOf(value) });
}

/** Sets the data columns of event `id` of `kind`. The id picks the target; RLS decides whether it may. The number of rows changed. */
export async function updateEvent(tx: IdentityTx, id: string, value: TrackerEventValue): Promise<number> {
  const rows = await tx
    .update(trackerEventsUpdate)
    .set(columnsOf(value))
    .where(and(eq(trackerEventsUpdate.id, id), eq(trackerEventsUpdate.kind, value.kind)))
    .returning({ id: trackerEventsUpdate.id });
  return rows.length;
}

/** Deletes event `id` (hard). The number of rows deleted. */
export async function deleteEvent(tx: IdentityTx, id: string): Promise<number> {
  const rows = await tx.delete(trackerEvents).where(eq(trackerEvents.id, id)).returning({ id: trackerEvents.id });
  return rows.length;
}

/** The caller's cycle entries, newest start first. */
export async function listCycleEntries(tx: IdentityTx): Promise<CycleEntryDto[]> {
  return tx
    .select({ id: cycleEntries.id, startDate: cycleEntries.startDate, cycleLengthDays: cycleEntries.cycleLengthDays })
    .from(cycleEntries)
    .orderBy(desc(cycleEntries.startDate))
    .limit(CYCLE_LIMIT);
}

export async function insertCycleEntry(tx: IdentityTx, value: { startDate: string; cycleLengthDays: number }): Promise<void> {
  await tx.insert(cycleEntriesInsert).values(value);
}

export async function updateCycleEntry(tx: IdentityTx, id: string, value: { startDate: string; cycleLengthDays: number }): Promise<number> {
  const rows = await tx.update(cycleEntriesUpdate).set(value).where(eq(cycleEntriesUpdate.id, id)).returning({ id: cycleEntriesUpdate.id });
  return rows.length;
}

export async function deleteCycleEntry(tx: IdentityTx, id: string): Promise<number> {
  const rows = await tx.delete(cycleEntries).where(eq(cycleEntries.id, id)).returning({ id: cycleEntries.id });
  return rows.length;
}

/** The guides a user may read: RLS returns the published ones only (AC-095). */
export async function listPublishedGuides(tx: IdentityTx): Promise<GuideRow[]> {
  return tx
    .select({
      id: statusGuides.id,
      stageKind: statusGuides.stageKind,
      rangeFrom: statusGuides.rangeFrom,
      rangeTo: statusGuides.rangeTo,
      title: statusGuides.title,
      body: statusGuides.body,
      source: statusGuides.source,
    })
    .from(statusGuides)
    .orderBy(statusGuides.stageKind, statusGuides.rangeFrom);
}
