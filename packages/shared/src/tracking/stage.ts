// "My Stage" for the home (FR-ALG-004, stage part; BR-050): the contexts the parent is in, each with what the guides are matched
// by. Stage is a strong signal for guidance, never a hard filter for the feed. Tracker data plays no part here (BR-053, AC-069):
// without an approved mapping the signal is ignored.
import type { GuideStageKind } from '../constants/trackers.js';
import { daysBetweenIso } from '../validation/dates.js';

export type StageContext =
  | { kind: 'planning' }
  | { kind: 'pregnancy'; dueDate: string | null; week: number | null; trimester: 1 | 2 | 3 | null }
  | { kind: 'parenting'; childId: string; childName: string; ageMonths: number };

export interface StageJourney {
  stage: 'planning' | 'pregnant' | 'has_child';
  dueDate: string | null;
}

export interface StageChild {
  id: string;
  name: string;
  birthDate: string;
}

/** The pregnancy week (1..42) on `today` from the due date at week 40; null without a due date. */
export function pregnancyWeek(dueDate: string | null, today: string): number | null {
  if (dueDate === null) return null;
  const daysToDue = daysBetweenIso(today, dueDate);
  const week = 40 - Math.ceil(daysToDue / 7);
  return Math.min(42, Math.max(1, week));
}

export function trimesterOfWeek(week: number): 1 | 2 | 3 {
  if (week <= 13) return 1;
  return week <= 27 ? 2 : 3;
}

/** A child's completed months on `today` (0 or more). */
export function ageInMonths(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const months = ((ty ?? 0) - (by ?? 0)) * 12 + ((tm ?? 0) - (bm ?? 0)) - ((td ?? 0) < (bd ?? 0) ? 1 : 0);
  return Math.max(0, months);
}

/**
 * The contexts of a parent, in the order the home shows them: pregnancy, children (as added), planning. All are shown; which one
 * comes first in the home is an open point, so none is picked over the others.
 */
export function stageContexts(journeys: readonly StageJourney[], children: readonly StageChild[], today: string): StageContext[] {
  const out: StageContext[] = [];
  const pregnant = journeys.find((j) => j.stage === 'pregnant');
  if (pregnant !== undefined) {
    const week = pregnancyWeek(pregnant.dueDate, today);
    out.push({ kind: 'pregnancy', dueDate: pregnant.dueDate, week, trimester: week === null ? null : trimesterOfWeek(week) });
  }
  for (const child of children) {
    out.push({ kind: 'parenting', childId: child.id, childName: child.name, ageMonths: ageInMonths(child.birthDate, today) });
  }
  if (journeys.some((j) => j.stage === 'planning')) out.push({ kind: 'planning' });
  return out;
}

export interface GuideRow {
  id: string;
  stageKind: GuideStageKind;
  rangeFrom: number | null;
  rangeTo: number | null;
  title: string;
  body: string;
  source: string;
}

function matches(context: StageContext, guide: GuideRow): boolean {
  if (context.kind === 'planning') return guide.stageKind === 'planning';
  if (guide.rangeFrom === null || guide.rangeTo === null) return false;
  if (context.kind === 'pregnancy') {
    return guide.stageKind === 'pregnancy' && context.week !== null && context.week >= guide.rangeFrom && context.week <= guide.rangeTo;
  }
  return guide.stageKind === 'parenting' && context.ageMonths >= guide.rangeFrom && context.ageMonths <= guide.rangeTo;
}

/** The guides for the contexts, each once, in the order of the contexts. Only the stage decides (AC-069). */
export function matchGuides(contexts: readonly StageContext[], guides: readonly GuideRow[]): GuideRow[] {
  const seen = new Set<string>();
  const out: GuideRow[] = [];
  for (const context of contexts) {
    for (const guide of guides) {
      if (seen.has(guide.id) || !matches(context, guide)) continue;
      seen.add(guide.id);
      out.push(guide);
    }
  }
  return out;
}
