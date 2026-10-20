// The ovulation window (FR-TRACK-001): computed from the latest cycle start and the average length, never stored. An estimate
// only, never a diagnosis (BR-012). Ovulation is taken 14 days before the next cycle starts; the window runs from 5 days before
// it to 1 day after (the days a conception is most likely).
import { addDaysIso } from '../validation/dates.js';

export interface OvulationWindow {
  /** The cycle the window belongs to starts on this day. */
  cycleStart: string;
  /** The estimated ovulation day. */
  ovulationDay: string;
  windowStart: string;
  windowEnd: string;
  /** The day the next cycle is expected to start. */
  nextCycleStart: string;
}

/** The window of one cycle that starts on `start` and lasts `lengthDays`. */
export function windowOfCycle(start: string, lengthDays: number): OvulationWindow {
  const ovulationDay = addDaysIso(start, lengthDays - 14);
  return {
    cycleStart: start,
    ovulationDay,
    windowStart: addDaysIso(ovulationDay, -5),
    windowEnd: addDaysIso(ovulationDay, 1),
    nextCycleStart: addDaysIso(start, lengthDays),
  };
}

/**
 * The window the user should look at on `today`: the latest entry's cycle, moved forward by whole cycles until its window has
 * not ended yet. `null` when there is no entry.
 */
export function currentWindow(latestStart: string | null, lengthDays: number | null, today: string): OvulationWindow | null {
  if (latestStart === null || lengthDays === null) return null;
  let cycleStart = latestStart;
  let window = windowOfCycle(cycleStart, lengthDays);
  // Bounded: an entry years old is projected forward, never looped without end.
  for (let i = 0; i < 400 && window.windowEnd < today; i += 1) {
    cycleStart = window.nextCycleStart;
    window = windowOfCycle(cycleStart, lengthDays);
  }
  return window;
}
