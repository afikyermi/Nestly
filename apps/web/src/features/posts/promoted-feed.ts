// I13 (FR-PRO-002, FR-ALG-007): which promotion each promoted feed unit was served for, so opening it reports a paid click. Kept for the
// session's feed only; a unit id appears here only while the feed shows it as promoted.
const served = new Map<string, string>();

export function rememberPromoted(unitId: string, promotionId: string): void {
  served.set(unitId, promotionId);
}

export function promotionOf(unitId: string): string | undefined {
  return served.get(unitId);
}
