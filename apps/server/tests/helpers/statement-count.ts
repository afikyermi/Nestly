import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Database } from '../../src/db/client.js';

/**
 * A Database on `url` (as app_server, like createDatabase) that counts every statement the code sends through drizzle: `tx.execute` and the
 * query builder alike (BEGIN and COMMIT are the driver's and are not counted). For a test that holds a read to a number of round trips.
 */
export function statementCountingDatabase(url: string): { readonly database: Database; readonly statements: () => number; readonly reset: () => void } {
  let statements = 0;
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  const database: Database = {
    db: drizzle({ client, logger: { logQuery: () => void (statements += 1) } }),
    client,
    close: () => client.end(),
  };
  return {
    database,
    statements: () => statements,
    reset: () => {
      statements = 0;
    },
  };
}
