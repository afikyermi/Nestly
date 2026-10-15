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

// postgres-js marks its own connection failures with a `code` such as CONNECTION_CLOSED, CONNECTION_ENDED,
// CONNECTION_DESTROYED or CONNECT_TIMEOUT; Node's socket errors carry ECONNRESET, ETIMEDOUT and the like.
const CONNECTION_CODE = /^(CONNECTION_|CONNECT_TIMEOUT|ECONN|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH)/;

/** True when the failure is the connection to the database, not a statement it answered (a retry may pass). */
export function isConnectionFailure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const code: unknown = Reflect.get(current, 'code');
    if (typeof code === 'string' && CONNECTION_CODE.test(code)) return true;
    current = current.cause;
  }
  return false;
}
