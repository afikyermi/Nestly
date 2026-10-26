// The account deletion step of the daily job (I9; BR-073, FR-SET-002; decisions-in-force §22.6, Afik 26.10.2026). Runs in the job's
// function on its own connection, each statement as app_jobs (`set local role app_jobs` in its transaction: data-model rule 6; the job's
// login role must be granted app_jobs, SET only, by bootstrap step 1 — until then every step here fails closed and reports
// `unavailable`). Two steps:
//   1. execute_account_deletions(): every account past its due date is deleted (the database decides which, BR-080 holds some back).
//   2. The Auth user of each executed account is removed (§22.6): one execute row at a time is claimed (FOR UPDATE SKIP LOCKED, so two
//      runs never call Auth for the same account), Auth gets ONE DELETE for it (recovery/auth-admin.ts, deleteAuthUser), and the row is
//      stamped (auth_removed_at) in the same transaction. A failed call leaves the row unstamped: the next daily run tries again.
// The account id comes from the deletion record only. Nothing is logged here; the run answers counts.

import type { Sql, TransactionSql } from 'postgres';
import { z } from 'zod';
import type { AuthUserRemoval } from '../recovery/auth-admin.js';

/** Accounts removed from Auth per run at most (one call each, five-second timeout): well inside the function's budget. */
export const AUTH_REMOVALS_PER_RUN = 20;
/** The time a removal needs before the budget ends: the call's own timeout plus the database round trips. */
const REMOVAL_MARGIN_MS = 8_000;

export interface AccountDeletionDb {
  /** Runs the execution; its three counts. */
  executeDue(): Promise<{ executed: number; waiting: number; failed: number }>;
  /**
   * Claims one executed account whose Auth user is not yet removed, runs `remove` for it, and stamps it when `remove` answers removed —
   * all in one transaction holding the row. Undefined when no account is waiting (or every waiting one is held by another run).
   */
  removeNextAuthUser(remove: (accountId: string) => Promise<AuthUserRemoval>): Promise<AuthUserRemoval | undefined>;
}

export interface AccountDeletionReport {
  readonly executed: number;
  readonly waiting: number;
  readonly failed: number;
  readonly authRemoved: number;
  readonly authFailed: number;
}

const executeRow = z.object({
  executed: z.number().int(),
  waiting: z.number().int(),
  failed: z.number().int(),
});
const accountRow = z.object({ account_id: z.guid() });

export function createAccountDeletionDb(sql: Sql): AccountDeletionDb {
  const asJobs = (tx: TransactionSql): PromiseLike<unknown> => tx`set local role app_jobs`;
  return {
    async executeDue() {
      return sql.begin(async (tx) => {
        await asJobs(tx);
        const [row] = z.array(executeRow).parse(await tx`select executed, waiting, failed from nestly.execute_account_deletions()`);
        return row ?? { executed: 0, waiting: 0, failed: 0 };
      });
    },
    async removeNextAuthUser(remove) {
      return sql.begin(async (tx) => {
        await asJobs(tx);
        const [row] = z.array(accountRow).parse(
          await tx`
          select account_id from nestly.account_deletion_events
          where kind = 'execute' and auth_removed_at is null
          order by created_at, id limit 1 for update skip locked`,
        );
        if (row === undefined) return undefined;
        const outcome = await remove(row.account_id);
        if (outcome === 'removed') {
          await tx`update nestly.account_deletion_events set auth_removed_at = now()
                   where account_id = ${row.account_id} and kind = 'execute' and auth_removed_at is null`;
        }
        return outcome;
      });
    },
  };
}

export interface AccountDeletionDependencies {
  readonly db: AccountDeletionDb;
  readonly removeAuthUser: (accountId: string) => Promise<AuthUserRemoval>;
  readonly timeLeft: () => number;
}

/** The step. Throws only when the database refuses the job (not bootstrapped): the handler reports `unavailable`. */
export async function runAccountDeletion(deps: AccountDeletionDependencies): Promise<AccountDeletionReport> {
  const execution = await deps.db.executeDue();
  let authRemoved = 0;
  let authFailed = 0;
  // a failed account stays claimable, so a run stops at its first failure rather than calling Auth for it twice in one run
  while (authRemoved + authFailed < AUTH_REMOVALS_PER_RUN && deps.timeLeft() > REMOVAL_MARGIN_MS) {
    const outcome = await deps.db.removeNextAuthUser(deps.removeAuthUser);
    if (outcome === undefined) break;
    if (outcome === 'removed') {
      authRemoved += 1;
    } else {
      authFailed += 1;
      break;
    }
  }
  return { ...execution, authRemoved, authFailed };
}
