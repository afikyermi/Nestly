// What the recovery routes share (I1 F1.6): the body bound, the fixed answers, and how a failure becomes a status. Logs carry
// a fixed line and the SQLSTATE, never the body, the email, an answer, a password, a token, a handle or an address
// (NFR-PRIV-001): a driver or parser message can quote the request.

import type { FastifyReply, FastifyRequest } from 'fastify';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { PasswordStateBusy } from '../db/password-lock.js';
import { replySessionRefused } from '../plugins/authentication.js';

/** NFR-SEC-001: a body over this is refused before it is parsed. Two answers, an email and a password fit many times over. */
export const RECOVERY_BODY_LIMIT_BYTES = 16 * 1024;

/** SQLSTATE of a privilege or policy refusal: the caller may not do this (an account that is not active, for one). */
const POLICY_REFUSED = '42501';

export function replyUnavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({ error: 'unavailable' });
}

export function replyInvalidRecovery(reply: FastifyReply): FastifyReply {
  return reply.code(401).send({ error: 'invalid_recovery' });
}

/** ERR-043: a lock is 429 `rate_limited` with retry-after; the permanent lock of the ladder (NFR-SEC-010) is 429 `recovery_locked`, with no retry. */
export function replyRateLimited(reply: FastifyReply, retryAfterSeconds: number, permanent = false): FastifyReply {
  if (permanent) return reply.code(429).send({ error: 'recovery_locked' });
  return reply.code(429).header('retry-after', String(retryAfterSeconds)).send({ error: 'rate_limited' });
}

/** The parse and size errors of Fastify itself: a fixed code, never the library's text. */
export function recoveryErrorHandler(error: { statusCode?: number | undefined; code?: string | undefined }, request: FastifyRequest, reply: FastifyReply): void {
  const status = typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
  request.log.warn({ status, code: error.code }, 'recovery request failed');
  reply.code(status).send({ error: status < 500 ? 'bad_request' : 'internal' });
}

/**
 * A database failure as an answer. A token the session guard refused (F2.0) is 401 or 503 first, a held password-state lock (A4) 503; then a transient one (the connection, a timeout) is 503 and may be retried; a refused policy
 * is 403 when `policyRefusedIs403` (a signed-in caller who may not write), and anything else is 500.
 */
export function replyDatabaseFailure(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  line: string,
  policyRefusedIs403: boolean,
): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  if (error instanceof PasswordStateBusy) {
    request.log.warn(`${line}: the password state is locked by another request`);
    return replyUnavailable(reply);
  }
  const fault = readDatabaseFault(error);
  request.log.error({ sqlstate: fault?.code }, line);
  if (policyRefusedIs403 && fault?.code === POLICY_REFUSED) return reply.code(403).send({ error: 'forbidden' });
  if (isTransientFailure(error)) return replyUnavailable(reply);
  return reply.code(500).send({ error: 'internal' });
}
