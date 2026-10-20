// Tracker events and cycle entries (FR-TRACK-001/002, OP-008; AC-007, AC-023). The body is strict: any key besides the ones of the
// kind, such as a user id or an id, is refused (data-model rules 12, 14). Judged against the server's clock, not the device's.
import { z } from 'zod';
import {
  BREASTFEEDING_SIDES,
  CYCLE_TRACKER,
  DIAPER_KINDS,
  GUIDE_STAGE_KINDS,
  TRACKER_KINDS,
  TRACKER_LIMITS,
  type TrackerKind,
} from '../constants/trackers.js';
import { isIsoDay } from '../tracking/time.js';

export const TRACKER_WRITE_REASONS = ['invalid_body', 'time_invalid', 'end_before_start', 'value_invalid', 'text_invalid'] as const;
export type TrackerWriteReason = (typeof TRACKER_WRITE_REASONS)[number];

const isReason = (message: string): message is TrackerWriteReason => TRACKER_WRITE_REASONS.some((r) => r === message);

const instant = z.iso.datetime({ offset: true, message: 'time_invalid' });
const note = z.string('text_invalid').max(TRACKER_LIMITS.noteMaxLength * 2, 'text_invalid').nullish();
const text = (max: number) => z.string('text_invalid').max(max * 2, 'text_invalid');
const range = (min: number, max: number) => z.number('value_invalid').min(min, 'value_invalid').max(max, 'value_invalid');
const optionalRange = (min: number, max: number) => range(min, max).nullish();

function eventSchema(withChild: boolean) {
  const base = { occurredAt: instant, note };
  const child = withChild ? { childId: z.guid('invalid_body') } : {};
  const make = <K extends TrackerKind, S extends z.core.$ZodLooseShape>(kind: K, shape: S) =>
    z.strictObject({ kind: z.literal(kind), ...child, ...base, ...shape });
  return z.discriminatedUnion('kind', [
    make('breastfeeding', { endedAt: instant, choice: z.enum(BREASTFEEDING_SIDES, 'value_invalid') }),
    make('sleep', { endedAt: instant }),
    make('bottle', { amountMl: z.number('value_invalid').int('value_invalid').min(TRACKER_LIMITS.bottleMl.min, 'value_invalid').max(TRACKER_LIMITS.bottleMl.max, 'value_invalid') }),
    make('diaper', { choice: z.enum(DIAPER_KINDS, 'value_invalid') }),
    make('medicine', { name: text(TRACKER_LIMITS.nameMaxLength), dosage: text(TRACKER_LIMITS.dosageMaxLength) }),
    make('growth', {
      weightKg: optionalRange(TRACKER_LIMITS.weightKg.min, TRACKER_LIMITS.weightKg.max),
      heightCm: optionalRange(TRACKER_LIMITS.heightCm.min, TRACKER_LIMITS.heightCm.max),
      headCm: optionalRange(TRACKER_LIMITS.headCm.min, TRACKER_LIMITS.headCm.max),
    }),
    make('vaccine', { name: text(TRACKER_LIMITS.nameMaxLength) }),
    make('bath', {}),
  ]);
}

const createSchema = eventSchema(true);
const updateSchema = eventSchema(false);

/** An event as stored: every column of the kind, the others null. */
export interface TrackerEventValue {
  kind: TrackerKind;
  occurredAt: Date;
  endedAt: Date | null;
  amountMl: number | null;
  choice: string | null;
  name: string | null;
  dosage: string | null;
  weightKg: number | null;
  heightCm: number | null;
  headCm: number | null;
  note: string | null;
}

export type TrackerEventCheck =
  | { ok: true; value: TrackerEventValue; childId: string | null }
  | { ok: false; reason: TrackerWriteReason };

const EARLIEST = Date.parse('2000-01-01T00:00:00Z');

function firstReason(error: z.ZodError): TrackerWriteReason {
  const [first] = error.issues;
  // An unknown key, a missing field or a wrong shape refuses the body; a bound failure carries its code.
  return first !== undefined && isReason(first.message) ? first.message : 'invalid_body';
}

const trimmed = (value: string | null | undefined): string | null => {
  const t = (value ?? '').trim();
  return t === '' ? null : t;
};
const round = (value: number | null | undefined, places: number): number | null =>
  value === null || value === undefined ? null : Math.round(value * 10 ** places) / 10 ** places;

/**
 * POST /api/trackers/events (`create`, the body names the child) and PUT /api/trackers/events/:id (the body names the kind; the child
 * is fixed). Times are ISO instants. An end before its start is `end_before_start` (AC-023). A time before 2000 or more than ten
 * minutes ahead of `now` is `time_invalid`.
 */
export function checkTrackerEventWrite(body: unknown, now: Date, create: boolean): TrackerEventCheck {
  const parsed = (create ? createSchema : updateSchema).safeParse(body);
  if (!parsed.success) return { ok: false, reason: firstReason(parsed.error) };
  const data: Record<string, unknown> = { ...parsed.data };
  const occurredAt = new Date(parsed.data.occurredAt);
  const endedAt = 'endedAt' in parsed.data ? new Date(parsed.data.endedAt) : null;
  const latest = now.getTime() + TRACKER_LIMITS.futureToleranceMinutes * 60_000;
  for (const at of [occurredAt, endedAt]) {
    if (at !== null && (at.getTime() < EARLIEST || at.getTime() > latest)) return { ok: false, reason: 'time_invalid' };
  }
  if (endedAt !== null && endedAt.getTime() < occurredAt.getTime()) return { ok: false, reason: 'end_before_start' };
  const name = 'name' in parsed.data ? trimmed(parsed.data.name) : null;
  const dosage = 'dosage' in parsed.data ? trimmed(parsed.data.dosage) : null;
  const noteText = trimmed(parsed.data.note);
  if (name !== null && name.length > TRACKER_LIMITS.nameMaxLength) return { ok: false, reason: 'text_invalid' };
  if (dosage !== null && dosage.length > TRACKER_LIMITS.dosageMaxLength) return { ok: false, reason: 'text_invalid' };
  if (noteText !== null && noteText.length > TRACKER_LIMITS.noteMaxLength) return { ok: false, reason: 'text_invalid' };
  if ((parsed.data.kind === 'medicine' && (name === null || dosage === null)) || (parsed.data.kind === 'vaccine' && name === null)) {
    return { ok: false, reason: 'text_invalid' };
  }
  const weightKg = round('weightKg' in parsed.data ? parsed.data.weightKg : null, 2);
  const heightCm = round('heightCm' in parsed.data ? parsed.data.heightCm : null, 1);
  const headCm = round('headCm' in parsed.data ? parsed.data.headCm : null, 1);
  if (parsed.data.kind === 'growth' && weightKg === null && heightCm === null && headCm === null) return { ok: false, reason: 'value_invalid' };
  return {
    ok: true,
    childId: typeof data.childId === 'string' ? data.childId : null,
    value: {
      kind: parsed.data.kind,
      occurredAt,
      endedAt,
      amountMl: 'amountMl' in parsed.data ? parsed.data.amountMl : null,
      choice: 'choice' in parsed.data ? parsed.data.choice : null,
      name,
      dosage,
      weightKg,
      heightCm,
      headCm,
      note: noteText,
    },
  };
}

/** The path of PUT and DELETE on one event or one cycle entry: a uuid's text form, else 404 before any query. */
export const trackerPathParams = z.object({ id: z.guid() });

/** GET /api/trackers/events?kind&childId&from&to: the period is Israeli days, at most 366. */
export const trackerEventsQuery = z.strictObject({
  kind: z.enum(TRACKER_KINDS),
  childId: z.guid().optional(),
  from: z.string().refine(isIsoDay),
  to: z.string().refine(isIsoDay),
});

export const CYCLE_WRITE_REASONS = ['invalid_body', 'date_invalid', 'length_invalid'] as const;
export type CycleWriteReason = (typeof CYCLE_WRITE_REASONS)[number];

const cycleSchema = z.strictObject({
  startDate: z.string('date_invalid').refine(isIsoDay, 'date_invalid'),
  cycleLengthDays: z
    .number('length_invalid')
    .int('length_invalid')
    .min(TRACKER_LIMITS.cycleLengthDays.min, 'length_invalid')
    .max(TRACKER_LIMITS.cycleLengthDays.max, 'length_invalid'),
});

export type CycleWriteCheck =
  | { ok: true; value: { startDate: string; cycleLengthDays: number } }
  | { ok: false; reason: CycleWriteReason };

/** POST and PUT of a cycle entry: a start date not after `today` (YYYY-MM-DD, the server's tolerant date) and an average length. */
export function checkCycleWrite(body: unknown, today: string): CycleWriteCheck {
  const parsed = cycleSchema.safeParse(body);
  if (!parsed.success) {
    const [first] = parsed.error.issues;
    const reason = first?.message === 'date_invalid' || first?.message === 'length_invalid' ? first.message : 'invalid_body';
    return { ok: false, reason };
  }
  if (parsed.data.startDate < '2000-01-01' || parsed.data.startDate > today) return { ok: false, reason: 'date_invalid' };
  return { ok: true, value: parsed.data };
}

// ---- responses (the web checks every answer before using it) --------------------------------------------------------------

export const trackerEventDto = z.object({
  id: z.string(),
  childId: z.string(),
  kind: z.enum(TRACKER_KINDS),
  occurredAt: z.string(),
  endedAt: z.string().nullable(),
  amountMl: z.number().nullable(),
  choice: z.string().nullable(),
  name: z.string().nullable(),
  dosage: z.string().nullable(),
  weightKg: z.number().nullable(),
  heightCm: z.number().nullable(),
  headCm: z.number().nullable(),
  note: z.string().nullable(),
});
export type TrackerEventDto = z.infer<typeof trackerEventDto>;
export const trackerEventsResponse = z.object({ events: z.array(trackerEventDto) });

export const cycleEntryDto = z.object({ id: z.string(), startDate: z.string(), cycleLengthDays: z.number() });
export type CycleEntryDto = z.infer<typeof cycleEntryDto>;

const ovulationWindowDto = z.object({
  cycleStart: z.string(),
  ovulationDay: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
  nextCycleStart: z.string(),
});
export const cycleResponse = z.object({ entries: z.array(cycleEntryDto), window: ovulationWindowDto.nullable() });
export type CycleResponse = z.infer<typeof cycleResponse>;

const stageContextDto = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('planning') }),
  z.object({
    kind: z.literal('pregnancy'),
    dueDate: z.string().nullable(),
    week: z.number().nullable(),
    trimester: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  }),
  z.object({ kind: z.literal('parenting'), childId: z.string(), childName: z.string(), ageMonths: z.number() }),
]);

/** GET /api/home: the contexts, the published guides that match them, and the current ovulation window when a cycle is tracked. */
export const homeResponse = z.object({
  contexts: z.array(stageContextDto),
  guides: z.array(z.object({ id: z.string(), stageKind: z.enum(GUIDE_STAGE_KINDS), title: z.string(), body: z.string(), source: z.string() })),
  cycle: ovulationWindowDto.nullable(),
});
export type HomeResponse = z.infer<typeof homeResponse>;

/** The tracker pages: the eight kinds and the cycle. */
export const TRACKER_PAGES = [...TRACKER_KINDS, CYCLE_TRACKER] as const;
export type TrackerPage = (typeof TRACKER_PAGES)[number];
