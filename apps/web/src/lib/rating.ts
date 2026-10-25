// The rating's stars (§11.22, Afik 21.10.2026; FR-SERV-003, BR-072): five stars filled in quarters. ⭐ The average is rounded to the nearest
// quarter (4.3 → 4.25: four full stars and a quarter of the fifth); the number beside them keeps its one decimal.

export type StarFill = 0 | 0.25 | 0.5 | 0.75 | 1;

const FILLS: readonly StarFill[] = [0, 0.25, 0.5, 0.75, 1];

/** The fill of each of the five stars, first to last, for an average between 0 and 5 (clamped). */
export function starFills(rating: number): StarFill[] {
  const quarters = Math.round(Math.min(5, Math.max(0, rating)) * 4);
  return [0, 1, 2, 3, 4].map((star) => FILLS[Math.min(4, Math.max(0, quarters - star * 4))] ?? 0);
}
