// The database client of one server instance (I1 F1.1 part c, criterion 27; data-model rule 5).
//
// It connects as app_server through Supabase's pooler in transaction mode (port 6543). That mode keeps no session
// state between transactions, so prepared statements are off, and every identity setting is transaction-local
// (identity-transaction.ts). One connection per function instance keeps the pooler's client count at the number of
// live instances. Nothing here runs a query outside an identity transaction: use `inIdentityTransaction`.

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { markStatement } from '../lib/server-timing.js';

export interface Database {
  readonly db: PostgresJsDatabase;
  /** The underlying postgres-js client. Exposed so the owner can inspect the one connection; never for queries. */
  readonly client: Sql;
  close(): Promise<void>;
}

/** postgres-js connects lazily: creating the client opens nothing until the first query. */
export function createDatabase(url: string): Database {
  // debug: marks each statement for Server-Timing (lib/server-timing.ts); it reads neither the text nor the parameters
  const client = postgres(url, { max: 1, prepare: false, debug: () => markStatement() });
  return {
    db: drizzle({ client }),
    client,
    close: () => client.end(),
  };
}
