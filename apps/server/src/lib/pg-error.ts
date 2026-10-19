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

/** The constraint of F3.1 criterion 6: a post's text is at most POST_BODY_MAX code points. */
const POST_BODY_LENGTH_CONSTRAINT = 'posts_body_length_check';

export interface PostFaultReply {
  readonly status: 403 | 422 | 500;
  readonly error: 'not_allowed' | 'body_too_long' | 'server_error';
}

/**
 * What a post write the database refused answers (F3.1 criterion 7). 23514 on the body-length CHECK is 422; 42501 (policy or privilege) and
 * 23503 (a foreign key: not a Regular account) are 403; any other database error is 500. Never the message, constraint or table name.
 * `undefined`: the failure did not come from the database (the caller handles it).
 */
export function postFaultReply(error: unknown): PostFaultReply | undefined {
  const fault = readDatabaseFault(error);
  if (fault === undefined) return undefined;
  if (fault.code === '23514' && fault.constraint === POST_BODY_LENGTH_CONSTRAINT) return { status: 422, error: 'body_too_long' };
  if (fault.code === '42501' || fault.code === '23503') return { status: 403, error: 'not_allowed' };
  return { status: 500, error: 'server_error' };
}

/** The constraint of F3.3 criterion 1: a comment's or reply's text is at most COMMENT_BODY_MAX code points. */
const COMMENT_BODY_LENGTH_CONSTRAINT = 'comments_body_length_check';

export interface CommentFaultReply {
  readonly status: 403 | 404 | 422 | 500;
  readonly error: 'not_allowed' | 'post_unavailable' | 'body_too_long' | 'server_error';
}

/**
 * What a comment write the database refused answers (F3.3 criteria 2-5). 23514 on the body-length CHECK is 422; 42501 (policy, privilege or an
 * unusable parent) is 403; 23503 (a foreign key: the post or the parent went away since the check) is 404; any other database error is 500.
 * Never the message, constraint or table name. `undefined`: the failure did not come from the database (the caller handles it).
 */
export function commentFaultReply(error: unknown): CommentFaultReply | undefined {
  const fault = readDatabaseFault(error);
  if (fault === undefined) return undefined;
  if (fault.code === '23514' && fault.constraint === COMMENT_BODY_LENGTH_CONSTRAINT) return { status: 422, error: 'body_too_long' };
  if (fault.code === '42501') return { status: 403, error: 'not_allowed' };
  if (fault.code === '23503') return { status: 404, error: 'post_unavailable' };
  return { status: 500, error: 'server_error' };
}

/** SQLSTATE class 23 (a constraint) and 42501 (a privilege or policy): the same input fails the same way again. */
function isDeterministicFault(code: string): boolean {
  return code.startsWith('23') || code === '42501';
}

/**
 * Whether a retry with the same session may pass: the connection failed, or the database answered with a fault that is
 * not tied to the input (serialization, timeout, resource limits). Anything else — a refused constraint, a bug, an error
 * that is not the database's at all — fails the same way again.
 */
export function isTransientFailure(error: unknown): boolean {
  const fault = readDatabaseFault(error);
  if (fault !== undefined) return !isDeterministicFault(fault.code);
  return isConnectionFailure(error);
}
