// The assistant's message count (BR-092; migration 20261028100000). Runs inside the caller's identity transaction and nowhere else. Who may
// count is the database's (assistant_message_counts_*_own: an active Regular or Professional account, its own row); a refusal propagates (42501).

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

const lockedRow = z.array(z.object({ times: z.array(z.string()), now: z.string() })).length(1);

/** The caller's counted instants and the database's clock, with the caller's row locked until the transaction ends (created when absent). */
export async function lockAssistantCount(tx: IdentityTx): Promise<{ instants: Date[]; now: Date }> {
  const [row] = lockedRow.parse(
    await tx.execute(sql`
      insert into nestly.assistant_message_counts as c (user_id) values ((select auth.uid()))
      on conflict (user_id) do update set sent_at = c.sent_at
      returning array(select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') from unnest(c.sent_at) t) as times,
                to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as now`),
  );
  if (row === undefined) throw new Error('the assistant count returned no row');
  return { instants: row.times.map((time) => new Date(time)), now: new Date(row.now) };
}

/** Replaces the caller's counted instants (the last 24 hours, pruned by the caller). */
export async function writeAssistantCount(tx: IdentityTx, instants: readonly Date[]): Promise<void> {
  const values = instants.map((instant) => instant.toISOString());
  await tx.execute(sql`update nestly.assistant_message_counts set sent_at = ${sql.param(values)}::timestamptz[] where user_id = (select auth.uid())`);
}
