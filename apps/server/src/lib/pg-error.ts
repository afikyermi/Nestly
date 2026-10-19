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
/** The constraint of F3.4 criteria 3 and 6: an anonymous post is never friends-only (FR-FEED-005, 6א). */
const POST_AUDIENCE_CONSTRAINT = 'posts_audience_check';

export interface PostFaultReply {
  readonly status: 400 | 403 | 422 | 500;
  readonly error: 'share_not_editable' | 'not_allowed' | 'body_too_long' | 'audience_not_allowed' | 'server_error';
}

/**
 * What a post write the database refused answers (F3.1 criterion 7, F3.4 c3). 23514 on the body-length CHECK is 422 body_too_long, on the
 * anonymous-audience CHECK 422 audience_not_allowed (told apart by the constraint's name); 42501 (policy or privilege) and
 * 23503 (a foreign key: not a Regular account) are 403; NS005 (posts_update_share_guard: the edit of a share, F3.5 c8) is 400
 * share_not_editable; any other database error is 500. Never the message, constraint or table name.
 * `undefined`: the failure did not come from the database (the caller handles it).
 */
export function postFaultReply(error: unknown): PostFaultReply | undefined {
  const fault = readDatabaseFault(error);
  if (fault === undefined) return undefined;
  if (fault.code === 'NS005') return { status: 400, error: 'share_not_editable' };
  if (fault.code === '23514' && fault.constraint === POST_BODY_LENGTH_CONSTRAINT) return { status: 422, error: 'body_too_long' };
  if (fault.code === '23514' && fault.constraint === POST_AUDIENCE_CONSTRAINT) return { status: 422, error: 'audience_not_allowed' };
  if (fault.code === '42501' || fault.code === '23503') return { status: 403, error: 'not_allowed' };
  return { status: 500, error: 'server_error' };
}

export interface ShareFaultReply {
  readonly status: 403 | 422 | 500;
  readonly error: 'not_shareable' | 'not_allowed' | 'body_too_long' | 'server_error';
}

/**
 * What a share the database refused answers (F3.5 c3, c5, c6; i3-rest-schema SQLSTATE contract). NS002 (posts_insert_prepare: every
 * unshareable original, one code, no reason) is 403 not_shareable; 42501 (the trigger's caller gate, a policy or a privilege) and 23503 (a
 * foreign key) are 403 not_allowed; 23514 on the body-length CHECK is 422 body_too_long; any other database error is 500. By code only, never
 * the message. `undefined`: the failure did not come from the database (the caller handles it).
 */
export function shareFaultReply(error: unknown): ShareFaultReply | undefined {
  const fault = readDatabaseFault(error);
  if (fault === undefined) return undefined;
  if (fault.code === 'NS002') return { status: 403, error: 'not_shareable' };
  if (fault.code === '42501' || fault.code === '23503') return { status: 403, error: 'not_allowed' };
  if (fault.code === '23514' && fault.constraint === POST_BODY_LENGTH_CONSTRAINT) return { status: 422, error: 'body_too_long' };
  return { status: 500, error: 'server_error' };
}

/** The constraint of F3.3 criterion 1: a comment's or reply's text is at most COMMENT_BODY_MAX code points. */
const COMMENT_BODY_LENGTH_CONSTRAINT = 'comments_body_length_check';

export interface CommentFaultReply {
  readonly status: 400 | 403 | 404 | 422 | 500;
  readonly error: 'parent_invalid' | 'not_allowed' | 'post_unavailable' | 'body_too_long' | 'server_error';
}

/** What was asked: a comment (`create`), a reply to a parent (`create_reply`), or any other statement. */
export type CommentOperation = 'create' | 'create_reply' | 'other';

/**
 * What a comment write the database refused answers (F3.3 criteria 2-5). 23514 on the body-length CHECK is 422. On a create, 23503 and 42501
 * (the post or the parent went away or became unusable between the reads and the insert) are 400 parent_invalid for a reply, else 404
 * post_unavailable. Elsewhere 42501 is 403 and 23503 is 404. Any other database error is 500.
 * Never the message, constraint or table name. `undefined`: the failure did not come from the database (the caller handles it).
 */
export function commentFaultReply(error: unknown, operation: CommentOperation = 'other'): CommentFaultReply | undefined {
  const fault = readDatabaseFault(error);
  if (fault === undefined) return undefined;
  if (fault.code === '23514' && fault.constraint === COMMENT_BODY_LENGTH_CONSTRAINT) return { status: 422, error: 'body_too_long' };
  if (fault.code === '42501' || fault.code === '23503') {
    if (operation === 'create_reply') return { status: 400, error: 'parent_invalid' };
    if (operation === 'create') return { status: 404, error: 'post_unavailable' };
    return fault.code === '42501' ? { status: 403, error: 'not_allowed' } : { status: 404, error: 'post_unavailable' };
  }
  return { status: 500, error: 'server_error' };
}

export interface HideFaultReply {
  readonly status: 403 | 404 | 409 | 500;
  readonly error: 'not_allowed' | 'post_unavailable' | 'own_post' | 'server_error';
}

/**
 * What a hide the database refused answers (F3.9 c2, c3, c7; i3-rest-schema SQLSTATE contract). NS004 (unknown, or not readable to the caller)
 * is 404 post_unavailable; NS003 (the caller's own post, named or anonymous) is 409 own_post; 42501 (not an active Regular account: the guard's
 * caller gate, a policy or a privilege) is 403 not_allowed; any other database error is 500. By code only, never the message.
 * `undefined`: the failure did not come from the database (the caller handles it).
 */
export function hideFaultReply(error: unknown): HideFaultReply | undefined {
  const fault = readDatabaseFault(error);
  if (fault === undefined) return undefined;
  if (fault.code === 'NS004') return { status: 404, error: 'post_unavailable' };
  if (fault.code === 'NS003') return { status: 409, error: 'own_post' };
  if (fault.code === '42501') return { status: 403, error: 'not_allowed' };
  return { status: 500, error: 'server_error' };
}

/** The report CHECKs of F3.7 (migrations 20261018200000, 20261019200000): the reporter's own account, the text cap, blank text, `other` without text. */
const REPORT_SELF_CONSTRAINT = 'reports_self_check';
const REPORT_DETAILS_REQUIRED_CONSTRAINT = 'reports_other_details_check';
/** One report per person and post: a repeat on a post is 404 like every other refused post (c4); on a comment or user, 409 (c5). */
const REPORT_POST_KEY_CONSTRAINT = 'reports_reporter_post_key';

export interface ReportFaultReply {
  readonly status: 400 | 404 | 409 | 500;
  readonly error: 'invalid' | 'details_required' | 'unavailable' | 'already_reported' | 'server_error';
}

/**
 * What a report the database refused answers (F3.7 c3-c5; i3-rest-schema SQLSTATE contract). 42501 (reports_insert_check: a post or comment the
 * reporter cannot read or wrote, a post they already reported; or the insert policy), 23503 (an unknown target) and 23514 on reports_self_check
 * (their own account) are one 404 unavailable; 23505 (one report per person and target) is 409 already_reported on a comment or user, and 404
 * on a post (reports_reporter_post_key: a concurrent repeat that passed the trigger); 23514 on reports_other_details_check is 400
 * details_required and on any other report CHECK (the text cap, blank text) 400 invalid; any other database error is 500. By code and
 * constraint only, never the message. `undefined`: the failure did not come from the database.
 */
export function reportFaultReply(error: unknown): ReportFaultReply | undefined {
  const fault = readDatabaseFault(error);
  if (fault === undefined) return undefined;
  if (fault.code === '42501' || fault.code === '23503') return { status: 404, error: 'unavailable' };
  if (fault.code === '23505') {
    return fault.constraint === REPORT_POST_KEY_CONSTRAINT ? { status: 404, error: 'unavailable' } : { status: 409, error: 'already_reported' };
  }
  if (fault.code === '23514') {
    if (fault.constraint === REPORT_SELF_CONSTRAINT) return { status: 404, error: 'unavailable' };
    if (fault.constraint === REPORT_DETAILS_REQUIRED_CONSTRAINT) return { status: 400, error: 'details_required' };
    return { status: 400, error: 'invalid' };
  }
  return { status: 500, error: 'server_error' };
}

/** The project's own SQLSTATEs (class NS) a guard raises for a refused input (i3-rest-schema): the same input is refused again. */
const DETERMINISTIC_PROJECT_CODES: ReadonlySet<string> = new Set(['NS002', 'NS003', 'NS004', 'NS005']);

/** SQLSTATE class 23 (a constraint), 42501 (a privilege or policy) and the guards' NS codes: the same input fails the same way again. */
function isDeterministicFault(code: string): boolean {
  return code.startsWith('23') || code === '42501' || DETERMINISTIC_PROJECT_CODES.has(code);
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
