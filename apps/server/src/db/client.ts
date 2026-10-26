// The database client of one server instance (I1 F1.1 part c, criterion 27; data-model rule 5).
//
// It connects as app_server through Supabase's pooler in transaction mode (port 6543). That mode keeps no session
// state between transactions, so prepared statements are off, and every identity setting is transaction-local
// (identity-transaction.ts). One connection per function instance by default keeps the pooler's client count at the number of
// live instances; DB_POOL_MAX (1–3, Afik 26.10.2026, decisions-in-force §21.2) lets an environment allow more, after the Preview
// measured that requests waited for the one connection (Server-Timing acq), not for the database. With more than one connection
// the clock's acq/conn split is approximate (it assumes one connection); dbwait itself stays exact. Nothing here runs a query outside an
// identity transaction: use `inIdentityTransaction`.

import { performance } from 'node:perf_hooks';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { ConnectionClock, markStatement } from '../lib/server-timing.js';

export interface Database {
  readonly db: PostgresJsDatabase;
  /** The underlying postgres-js client. Exposed so the owner can inspect the one connection; never for queries. */
  readonly client: Sql;
  /** What the one connection did while transactions waited for it: Server-Timing's acq, conn and begin (lib/server-timing.ts). */
  readonly clock?: ConnectionClock;
  close(): Promise<void>;
}

/** The most connections one instance holds: DB_POOL_MAX when it is 1, 2 or 3, else 1 (an unset, empty or other value changes nothing). */
export function poolMaxOf(env: Readonly<Record<string, string | undefined>>): number {
  const raw = env.DB_POOL_MAX?.trim();
  return raw === '2' ? 2 : raw === '3' ? 3 : 1;
}

/** postgres-js connects lazily: creating the client opens nothing until the first query. */
export function createDatabase(url: string, max: number = poolMaxOf(process.env)): Database {
  const clock = new ConnectionClock();
  // onclose tells the clock the connection is gone, so the next wait counts a new connection's opening; it reads only the time.
  const client = postgres(url, { max, prepare: false, onclose: () => clock.closed(performance.now()) });
  return {
    // The logger marks each statement for Server-Timing (lib/server-timing.ts) as the request's code sends it; it reads neither the text
    // nor the parameters. (postgres-js's own debug hook may run from the socket's callback, outside the request.)
    db: drizzle({ client, logger: { logQuery: () => markStatement() } }),
    client,
    clock,
    close: () => client.end(),
  };
}
