// The account's own deletion (I9 part 1; FR-SET-002, BR-073, PG-050, ERR-026, VAL-052). Signed in: the authentication hook has run before
// anything here. No route takes an id, in the path, a query or the body: the account is the caller, and what it may do is the database's.
//   GET  /api/account/deletion          → 200 { status: 'none' } | { status: 'scheduled', dueAt } · 404 no_account · 401/503 · 500
//   POST /api/account/deletion          { confirmed: true } (strict) → 200 { status: 'scheduled', dueAt } · 400 invalid (before any
//                                        database work) · 401 reauth_required (no password sign-in in the last 5 minutes, ERR-048)
//                                        · 409 group_owner (ERR-026) · 409 not_allowed (staff, or not active) · 401/503 · 500
//   POST /api/account/deletion/cancel   {} (strict) → 200 { status: 'none' } · 400 invalid · 409 not_scheduled · 401/503 · 500
//   any other method → 405.
// Logs carry a fixed line and the SQLSTATE, never the body, a token or an id (NFR-PRIV-001).

import { noteFailure } from '../lib/failure-report.js';
import { accountDeletionCancelRequest, accountDeletionRequest } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import { cancelDeletion, readDeletionStatus, requestDeletion } from '../services/account-deletion-service.js';

export interface AccountDeletionRouteDependencies {
  readonly database: Database | undefined;
  readonly clock?: () => Date;
}

const PATH = '/api/account/deletion';
const CANCEL_PATH = '/api/account/deletion/cancel';

function replyFailure(request: FastifyRequest, reply: FastifyReply, error: unknown, line: string): FastifyReply {
  const refused = replySessionRefused(reply, error);
  if (refused !== undefined) return refused;
  request.log.error({ sqlstate: readDatabaseFault(error)?.code }, line);
  noteFailure(request, error);
  if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
  return reply.code(500).send({ error: 'internal' });
}

async function read(request: FastifyRequest, reply: FastifyReply, deps: AccountDeletionRouteDependencies) {
  reply.header('cache-control', 'no-store');
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const status = await readDeletionStatus(deps.database, identity);
    return status === undefined ? reply.code(404).send({ error: 'no_account' }) : reply.code(200).send(status);
  } catch (error) {
    return replyFailure(request, reply, error, 'account deletion read failed');
  }
}

async function schedule(request: FastifyRequest, reply: FastifyReply, deps: AccountDeletionRouteDependencies) {
  reply.header('cache-control', 'no-store');
  if (!accountDeletionRequest.safeParse(request.body).success) return reply.code(400).send({ error: 'invalid' });
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const result = await requestDeletion(deps.database, identity, request.verifiedPasswordAt, (deps.clock ?? (() => new Date()))());
    switch (result.kind) {
      case 'scheduled':
        return reply.code(200).send(result.status);
      case 'reauth_required':
        return reply.code(401).send({ error: 'reauth_required' });
      case 'group_owner':
        return reply.code(409).send({ error: 'group_owner' });
      case 'not_allowed':
        return reply.code(409).send({ error: 'not_allowed' });
    }
  } catch (error) {
    return replyFailure(request, reply, error, 'account deletion request failed');
  }
}

async function cancel(request: FastifyRequest, reply: FastifyReply, deps: AccountDeletionRouteDependencies) {
  reply.header('cache-control', 'no-store');
  if (!accountDeletionCancelRequest.safeParse(request.body ?? {}).success) return reply.code(400).send({ error: 'invalid' });
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const result = await cancelDeletion(deps.database, identity);
    return result.kind === 'cancelled' ? reply.code(200).send({ status: 'none' }) : reply.code(409).send({ error: 'not_scheduled' });
  } catch (error) {
    return replyFailure(request, reply, error, 'account deletion cancel failed');
  }
}

const notAllowed = (allow: string) => (_request: FastifyRequest, reply: FastifyReply) =>
  reply.code(405).header('allow', allow).header('cache-control', 'no-store').send({ error: 'method_not_allowed' });

export function registerAccountDeletionRoutes(app: FastifyInstance, deps: AccountDeletionRouteDependencies): void {
  app.route({ method: 'GET', url: PATH, handler: (request, reply) => read(request, reply, deps) });
  app.route({ method: 'POST', url: PATH, handler: (request, reply) => schedule(request, reply, deps) });
  app.route({ method: 'POST', url: CANCEL_PATH, handler: (request, reply) => cancel(request, reply, deps) });
  app.route({ method: ['PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: PATH, handler: notAllowed('GET, POST') });
  app.route({ method: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: CANCEL_PATH, handler: notAllowed('POST') });
}
