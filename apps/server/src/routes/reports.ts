// POST /api/reports (I3 F3.7; FR-MOD-001, UC-26, AC-106). Signed in: the authentication hook has run before anything here (401 before the body
// is read, and no database query). The body never names the reporter; the reporter is the caller's by the database, and the database decides
// which posts, comments and accounts may be reported (reports_insert_check, the CHECKs, the keys).
//   POST   { targetKind, targetId, reason, details? } (strict) → 201 { received: true } and nothing else · 400 invalid | details_required ·
//          404 unavailable (unreadable, own, unknown or already reported post; one body for every reason) · 409 already_reported ·
//          403 account_unavailable (a stopped account, ERR-037) | not_allowed (no account)
//   all:   401/503 session guard · 503 · 500 server_error. Any other method → 405 with Allow. No GET, PATCH or DELETE: a report is never read back.
// Logs carry a fixed line and the SQLSTATE, never a target id, a reporter or the text (NFR-PRIV-001, S-35).

import { noteFailure } from '../lib/failure-report.js';
import { checkCreateReport } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isConnectionFailure, readDatabaseFault, reportFaultReply } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { fileReport } from '../services/reports-service.js';

export interface ReportsRouteDependencies {
  readonly database: Database | undefined;
}

const REPORTS_PATH = '/api/reports';

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, 'report failed');
  noteFailure(request, error);
  if (isConnectionFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  const fault = reportFaultReply(error);
  if (fault !== undefined) return reply.code(fault.status).send({ error: fault.error });
  return reply.code(500).send({ error: 'server_error' });
}

async function create(request: FastifyRequest, reply: FastifyReply, deps: ReportsRouteDependencies) {
  const { identity } = request;
  reply.header('cache-control', 'no-store');
  const checked = checkCreateReport(request.body);
  if (!checked.ok) return reply.code(400).send({ error: checked.reason });
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const outcome = await fileReport(deps.database, identity, checked.value);
    if (outcome.kind === 'received') return reply.code(201).send({ received: true });
    return reply.code(403).send({ error: outcome.kind === 'stopped' ? 'account_unavailable' : 'not_allowed' });
  } catch (error) {
    return replyFailure(request, reply, error);
  }
}

/** Any other method: 405 with the Allow header. Authentication still comes first, like everywhere. */
function notAllowed(_request: FastifyRequest, reply: FastifyReply) {
  return reply.code(405).header('allow', 'POST').header('cache-control', 'no-store').send({ error: 'method_not_allowed' });
}

export function registerReportsRoutes(app: FastifyInstance, deps: ReportsRouteDependencies): void {
  app.route({ method: 'POST', url: REPORTS_PATH, handler: (request, reply) => create(request, reply, deps) });
  app.route({ method: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: REPORTS_PATH, handler: notAllowed });
}
