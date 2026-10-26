// The shared answers of the tracker, cycle and home routes (I6). A raw database message never leaves; the log carries a fixed line
// and the SQLSTATE, never a value (NFR-PRIV-001: health data).
import { noteFailure } from '../lib/failure-report.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import type { Outcome } from '../services/trackers-service.js';

/** Maps an outcome to its answer; `ok` sends `okBody` with `okStatus`. */
export function replyOutcome<T>(reply: FastifyReply, outcome: Outcome<T>, okStatus: 200 | 201, okBody: (value: T) => unknown): FastifyReply {
  switch (outcome.kind) {
    case 'ok':
      return reply.code(okStatus).send(okBody(outcome.value));
    case 'unavailable':
      // ERR-037: the account is stopped. The web asks GET /api/me again and the session guard ends the session.
      return reply.code(403).send({ error: 'account_unavailable' });
    case 'no_profile':
      return reply.code(404).send({ error: 'no_profile' });
    case 'duplicate_date':
      return reply.code(409).send({ error: 'duplicate_date' });
    case 'not_found':
      return reply.code(404).send({ error: 'not_found' });
  }
}

export function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown, line: string): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, line);
  noteFailure(request, error);
  if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'internal' });
}

/** Any other method: 405 with the Allow header. Authentication still comes first, like everywhere. */
export function notAllowed(allow: string) {
  return (_request: FastifyRequest, reply: FastifyReply) =>
    reply.code(405).header('allow', allow).header('cache-control', 'no-store').send({ error: 'method_not_allowed' });
}
