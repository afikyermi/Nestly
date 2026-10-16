// Counts failed /recovery attempts per user. F1.6 locks a user after 5 failed attempts in 30 minutes (its criterion 12),
// and a locked test user would fail the flow for the wrong reason. A flow calls recordFailedAttempt(email) just before
// each deliberately wrong submission; the 5th call for one user throws, so no test can submit more than 4.

export const MAX_FAILED_RECOVERY_ATTEMPTS = 4;

export interface RecoveryAttempts {
  /** Returns how many failed attempts this user has made so far. Throws instead of allowing the 5th. */
  recordFailedAttempt(email: string): number;
}

export function createRecoveryAttempts(): RecoveryAttempts {
  const counts = new Map<string, number>();
  return {
    recordFailedAttempt(email) {
      const next = (counts.get(email) ?? 0) + 1;
      if (next > MAX_FAILED_RECOVERY_ATTEMPTS) {
        throw new Error('recovery-attempts: the 5th failed recovery attempt for one user is refused (F1.6 locks at 5)');
      }
      counts.set(email, next);
      return next;
    },
  };
}
