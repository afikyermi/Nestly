// Shared by the admin routes (FR-MOD-002, FR-MOD-003, FR-ADMIN-005): the one place a service outcome and a failure become a reply. The answers carry
// a status and one `error` code, never a message, a table or a constraint (conventions, "User-facing errors"). Logs carry a fixed line and the
// SQLSTATE, never an id, a reason or a name (NFR-PRIV-001).

import type { FastifyReply, FastifyRequest } from 'fastify';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import type { Outcome, Refusal } from '../services/admin-service.js';

const STATUS: Record<Refusal['kind'], number> = { forbidden: 403, not_found: 404, invalid: 400, reason_required: 400, not_applicable: 409 };

export function replyRefusal(reply: FastifyReply, refusal: Refusal): FastifyReply {
  return reply.code(STATUS[refusal.kind]).send({ error: refusal.kind });
}

export function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown, line: string): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, line);
  if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'internal' });
}

/** Runs a service call and sends `shape(outcome)` on success; a refusal or a failure is answered here. */
export async function answer<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  line: string,
  call: () => Promise<Outcome<T>>,
  shape: (ok: T) => unknown,
  status = 200,
): Promise<FastifyReply> {
  reply.header('cache-control', 'no-store');
  try {
    const outcome = await call();
    if (outcome.kind !== 'ok') return replyRefusal(reply, outcome);
    return reply.code(status).send(shape(outcome));
  } catch (error) {
    return replyFailure(request, reply, error, line);
  }
}
