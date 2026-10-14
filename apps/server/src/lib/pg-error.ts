// What a failed statement says, read from the database's error and nothing else. Drizzle wraps the driver's error in
// its own and keeps the original as `cause`; the SQLSTATE and the constraint name are on the driver's. Neither is ever
// sent to a caller: they let the server tell "already registered" from a real failure.

import postgres from 'postgres';

export interface DatabaseFault {
  /** SQLSTATE, e.g. `23505`. */
  readonly code: string;
  /** The violated constraint or index, when the database names one. */
  readonly constraint: string | undefined;
}

/** The first driver error in the cause chain, or undefined when the failure did not come from the database. */
export function readDatabaseFault(error: unknown): DatabaseFault | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (current instanceof postgres.PostgresError) {
      return { code: current.code, constraint: current.constraint_name };
    }
    current = current.cause;
  }
  return undefined;
}
