import { checkDateParts, israelDay, israelDayStart, type TrackerEventDto, type TrackerKind } from '@nestly/shared';
import type { DateParts } from '@/components/shared/date-input';
import { ERROR_TEXT } from '@/lib/tracker-texts';
import type { EventBody } from '@/services/api/trackers';

// The form of one tracker event as the user types it (FR-TRACK-001/002): texts only. formToBody turns it into the body the server checks
// again; the shared checkTrackerEventWrite is the rule, this only refuses what cannot even be read.
export interface DateTimeText {
  date: DateParts;
  time: string;
}

export interface EventForm {
  childId: string;
  start: DateTimeText;
  end: DateTimeText;
  amountMl: string;
  choice: string;
  name: string;
  dosage: string;
  weightKg: string;
  heightCm: string;
  headCm: string;
  note: string;
}

const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** The Israeli date and time of an instant, as the form's texts. */
export function dateTimeOf(at: Date): DateTimeText {
  const [year = '', month = '', day = ''] = israelDay(at).split('-');
  return { date: { day: String(Number(day)), month: String(Number(month)), year }, time: timeFormat.format(at) };
}

export function newForm(childId: string, now: Date): EventForm {
  const at = dateTimeOf(now);
  return { childId, start: at, end: at, amountMl: '', choice: '', name: '', dosage: '', weightKg: '', heightCm: '', headCm: '', note: '' };
}

const text = (value: number | null): string => (value === null ? '' : String(value));

export function formFromEvent(event: TrackerEventDto): EventForm {
  const start = dateTimeOf(new Date(event.occurredAt));
  return {
    childId: event.childId,
    start,
    end: event.endedAt === null ? start : dateTimeOf(new Date(event.endedAt)),
    amountMl: text(event.amountMl),
    choice: event.choice ?? '',
    name: event.name ?? '',
    dosage: event.dosage ?? '',
    weightKg: text(event.weightKg),
    heightCm: text(event.heightCm),
    headCm: text(event.headCm),
    note: event.note ?? '',
  };
}

/** The instant (ISO) of a date and a time in Israel, or null when either cannot be read. */
export function toInstant(value: DateTimeText): string | null {
  const day = checkDateParts(value.date);
  const time = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.time.trim());
  if (day.kind !== 'date' || time === null) return null;
  const minutes = Number(time[1]) * 60 + Number(time[2]);
  return new Date(israelDayStart(day.iso).getTime() + minutes * 60_000).toISOString();
}

/** A typed number (a comma is a decimal point), or null when empty; NaN when it is not a number. */
function number(value: string): number | null {
  const t = value.trim().replace(',', '.');
  if (t === '') return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}

export type BodyResult = { ok: true; body: EventBody } | { ok: false; error: string };

const fail = (error: string): BodyResult => ({ ok: false, error });

export function formToBody(kind: TrackerKind, form: EventForm, create: boolean): BodyResult {
  if (create && form.childId === '') return fail(ERROR_TEXT.child);
  const occurredAt = toInstant(form.start);
  if (occurredAt === null) return fail(ERROR_TEXT.time);
  const body: EventBody = { kind, occurredAt, ...(create ? { childId: form.childId } : {}) };
  const note = form.note.trim();
  if (note !== '') body.note = note;
  if (kind === 'breastfeeding' || kind === 'sleep') {
    const endedAt = toInstant(form.end);
    if (endedAt === null) return fail(ERROR_TEXT.time);
    if (Date.parse(endedAt) < Date.parse(occurredAt)) return fail(ERROR_TEXT.endBeforeStart); // ERR-015, VAL-015
    body.endedAt = endedAt;
  }
  if (kind === 'breastfeeding' || kind === 'diaper') {
    if (form.choice === '') return fail(ERROR_TEXT.required);
    body.choice = form.choice;
  }
  if (kind === 'bottle') {
    const amount = number(form.amountMl);
    if (amount === null || Number.isNaN(amount)) return fail(ERROR_TEXT.value);
    body.amountMl = amount;
  }
  if (kind === 'medicine') {
    if (form.name.trim() === '' || form.dosage.trim() === '') return fail(ERROR_TEXT.required);
    body.name = form.name.trim();
    body.dosage = form.dosage.trim();
  }
  if (kind === 'vaccine') {
    if (form.name.trim() === '') return fail(ERROR_TEXT.required);
    body.name = form.name.trim();
  }
  if (kind === 'growth') {
    const measures = { weightKg: number(form.weightKg), heightCm: number(form.heightCm), headCm: number(form.headCm) };
    const given = Object.entries(measures).filter(([, v]) => v !== null);
    if (given.length === 0 || given.some(([, v]) => Number.isNaN(v))) return fail(ERROR_TEXT.value);
    for (const [key, value] of given) body[key] = value;
  }
  return { ok: true, body };
}

/** The text for a reason the server gave (the form is checked first, so this is rare: another device's clock, a race). */
export function reasonText(reason: string): string {
  const known: Record<string, string> = {
    time_invalid: ERROR_TEXT.time,
    end_before_start: ERROR_TEXT.endBeforeStart,
    value_invalid: ERROR_TEXT.value,
    text_invalid: ERROR_TEXT.required,
  };
  return known[reason] ?? ERROR_TEXT.failed;
}
