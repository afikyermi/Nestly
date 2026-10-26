// The timings of the per-run cleanup (performance plan E, 25.10: deletes took 19-25 s and waited on the Audit table lock): pure
// formatting, split from tools/preview-e2e-cleanup.ts (line budget). Counts and milliseconds only: never an id, an email or a URL.

/** One user's delete: the whole transaction, and the Audit table lock (null when the user had no Audit entries or failed first). */
export interface UserTiming {
  own: boolean;
  ok: boolean;
  transactionMs: number;
  auditLockMs: number | null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

/**
 * The timing lines of the cleanup's output (the Audit lock wait and the transaction time of each user): one line per delete attempt
 * (a retried user has two) in the order they ended, then the medians and maxima.
 */
export function formatTimings(timings: readonly UserTiming[]): { perUser: string[]; totals: string[] } {
  const ms = (n: number): number => Math.max(0, Math.round(n));
  const perUser = timings.map(
    (t, i) =>
      `attempt ${i + 1} of ${timings.length} (${t.own ? 'this run' : 'leftover'}${t.ok ? '' : ', failed'}): transaction ${ms(t.transactionMs)} ms; ` +
      (t.auditLockMs === null ? 'no Audit lock' : `Audit lock ${ms(t.auditLockMs)} ms`),
  );
  if (timings.length === 0) return { perUser, totals: [] };
  const tx = timings.map((t) => ms(t.transactionMs));
  const locks = timings.flatMap((t) => (t.auditLockMs === null ? [] : [ms(t.auditLockMs)]));
  const totals = [
    `transactions: ${tx.length}; median ${median(tx)} ms, max ${Math.max(...tx)} ms`,
    locks.length === 0
      ? 'Audit lock: taken by no user'
      : `Audit lock: taken by ${locks.length} user(s); median ${median(locks)} ms, max ${Math.max(...locks)} ms`,
  ];
  return { perUser, totals };
}
