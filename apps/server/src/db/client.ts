// The database client of one server instance (I1 F1.1 part c, criterion 27; data-model rule 5).
//
// It connects as app_server through Supabase's pooler in transaction mode (port 6543). That mode keeps no session
// state between transactions, so prepared statements are off, and every identity setting is transaction-local
// (identity-transaction.ts). One connection per function instance keeps the pooler's client count at the number of
// live instances. Nothing here runs a query outside an identity transaction: use `inIdentityTransaction`.

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

/** postgres-js connects lazily: creating the client opens nothing until the first query. */
export function createDatabase(url: string): Database {
  const clock = new ConnectionClock();
  // onclose tells the clock the connection is gone, so the next wait counts a new connection's opening; it reads only the time.
  const client = postgres(url, { max: 1, prepare: false, onclose: () => clock.closed(performance.now()) });
  return {
    // The logger marks each statement for Server-Timing (lib/server-timing.ts) as the request's code sends it; it reads neither the text
    // nor the parameters. (postgres-js's own debug hook may run from the socket's callback, outside the request.)
    db: drizzle({ client, logger: { logQuery: () => markStatement() } }),
    client,
    clock,
    close: () => client.end(),
  };
}
