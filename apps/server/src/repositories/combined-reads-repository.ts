// A feed page's opening read in one round trip (performance plan ט'1): the caller's own account (account-state-repository's read, unchanged),
// the snapshot clock (feed-repository's columns, unchanged) and the float precision the ranking needs. It runs inside the caller's identity
// transaction, under the same policy; nothing here adds a predicate. It names no feed table: the configuration rows stay their own statement,
// as the feed allow-list requires (F3.2-a2 c2: no statement on the feed's tables names a status).

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { OWN_ACCOUNTS_COLUMN, ownAccountsOf } from './account-state-repository.js';
import { snapshotClockColumns, snapshotClockOf } from './feed-repository.js';

export interface FeedPrelude {
  /** The rows readOwnAccounts returns. */
  readonly accounts: ReturnType<typeof ownAccountsOf>;
  /** readSnapshotClock's answer. */
  readonly clock: { readonly nowText: string; readonly isCursorUsable: boolean };
}

/**
 * One statement: the caller's own account rows, the snapshot clock, and the shortest exact float8 text for the rest of the transaction
 * (readRankedPosts's setting: the ranking's score must reach the cursor bit for bit). The setting is a sub-select of FROM, evaluated before
 * the row is produced. Three reads now follow the setting instead of preceding it: the configuration (numeric weights of few digits, the
 * same doubles at any setting), the Stage (text) and the search-topic weights (float8: the same text at any setting above 0, and the
 * server's default is 1 since PostgreSQL 12).
 */
export async function readFeedPrelude(tx: IdentityTx, cursorAsOf: string | null): Promise<FeedPrelude> {
  const [row] = z
    .array(z.object({ ownAccounts: z.unknown() }).loose())
    .length(1)
    .parse(
      await tx.execute(sql`
    select ${OWN_ACCOUNTS_COLUMN} as "ownAccounts", ${snapshotClockColumns(cursorAsOf)}
    from (select pg_catalog.set_config('extra_float_digits', '3', true) as digits offset 0) as fd`),
    );
  if (row === undefined) throw new Error('the feed prelude returned no row');
  return { accounts: ownAccountsOf(row.ownAccounts), clock: snapshotClockOf(row) };
}
