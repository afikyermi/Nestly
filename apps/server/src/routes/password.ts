// The three server password calls of F2.0 (I2 part a; FR-AUTH-003, FR-AUTH-005; spec c7, c10, c11, c12). Signed in: the
// authentication hook has run before anything here (401 before the body is read). None takes a user id or an email: each
// acts on the JWT subject, and the bodies are strict, so a body naming a user is a 400.
//   POST /api/password/forced  { password }            c7  200 · 400 invalid_password · 409 not_required · 503
//   POST /api/password/change  { current, password }   c10 200 · 400 invalid_request · 401 invalid_recovery · 409 not_set
//                                                          · 429 rate_limited | recovery_locked_day · 503
//   POST /api/password/first   { password }            c11 200 · 400 invalid_password · 403 forbidden · 503
// A 200 means the password is set AND every session of the user has ended, the caller's included (the admin set does it,
// Gate 2 A6): the client signs in again with the new password. No token is returned.
// The body is judged before any database work; a missing pepper or Auth key is 503 before any step. Logs carry fixed lines
// and the SQLSTATE, never the body, a password, an answer, a token or an address (NFR-PRIV-001).

import { passwordChangeRequest, passwordSetRequest } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { clientAddress } from '../recovery/client-ip.js';
import type { RecoveryDependencies } from '../recovery/dependencies.js';
import type { RecoveryKeys } from '../recovery/pepper.js';
import { changePassword, setFirstPassword, setForcedPassword, type PasswordClient } from '../services/password-service.js';
import {
  RECOVERY_BODY_LIMIT_BYTES,
  recoveryErrorHandler,
  replyDatabaseFailure,
  replyInvalidRecovery,
  replyRateLimited,
  replyUnavailable,
} from './recovery-common.js';

export interface PasswordRoutesDependencies {
  readonly database: Database | undefined;
  readonly recovery: RecoveryDependencies;
}

const INVALID_PASSWORD = { error: 'invalid_password' };

interface Ready {
  readonly database: Database;
  readonly keys: RecoveryKeys;
  readonly client: PasswordClient;
}

/** The common preconditions: a protected request, the database, the pepper and the Auth key. Undefined: answered 503. */
function ready(request: FastifyRequest, deps: PasswordRoutesDependencies): Ready | undefined {
  const keys = deps.recovery.keys();
  if (request.identity === null || deps.database === undefined || keys === undefined) return undefined;
  if (!deps.recovery.authAccount.isConfigured()) return undefined;
  return { database: deps.database, keys, client: { addressKey: clientAddress(request.ip).key } };
}

/** The audit handle of c7 and c11 is the token's email claim; a token without one cannot be audited, so nothing is set. */
function tokenEmail(request: FastifyRequest, reply: FastifyReply): string | undefined {
  if (request.verifiedEmail !== null) return request.verifiedEmail;
  request.log.error('password: the token has no email claim');
  void reply.code(500).send({ error: 'internal' });
  return undefined;
}

async function forced(request: FastifyRequest, reply: FastifyReply, deps: PasswordRoutesDependencies) {
  reply.header('cache-control', 'no-store');
  const parsed = passwordSetRequest.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send(INVALID_PASSWORD);
  const env = ready(request, deps);
  if (env === undefined || request.identity === null) return replyUnavailable(reply);
  const email = tokenEmail(request, reply);
  if (email === undefined) return reply;
  try {
    const result = await setForcedPassword(env.database, deps.recovery, env.keys, request.identity, email, env.client, parsed.data.password);
    if (result.kind === 'set') return reply.code(200).send({ ok: true });
    if (result.kind === 'not_required') return reply.code(409).send({ error: 'not_required' });
    return replyUnavailable(reply);
  } catch (error) {
    return replyDatabaseFailure(request, reply, error, 'forced password set failed', false);
  }
}

async function first(request: FastifyRequest, reply: FastifyReply, deps: PasswordRoutesDependencies) {
  reply.header('cache-control', 'no-store');
  const parsed = passwordSetRequest.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send(INVALID_PASSWORD);
  const env = ready(request, deps);
  if (env === undefined || request.identity === null) return replyUnavailable(reply);
  const email = tokenEmail(request, reply);
  if (email === undefined) return reply;
  try {
    const result = await setFirstPassword(env.database, deps.recovery, env.keys, request.identity, email, env.client, parsed.data.password);
    if (result.kind === 'set') return reply.code(200).send({ ok: true });
    if (result.kind === 'has_account') return reply.code(403).send({ error: 'forbidden' });
    return replyUnavailable(reply);
  } catch (error) {
    return replyDatabaseFailure(request, reply, error, 'first password set failed', false);
  }
}

async function change(request: FastifyRequest, reply: FastifyReply, deps: PasswordRoutesDependencies) {
  reply.header('cache-control', 'no-store');
  const parsed = passwordChangeRequest.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
  const env = ready(request, deps);
  const { identity, verifiedEmail: email, verifiedIssuedAt: issuedAt } = request;
  if (env === undefined || identity === null) return replyUnavailable(reply);
  try {
    const result = await changePassword(
      env.database,
      deps.recovery,
      env.keys,
      identity,
      { claim: email === null || issuedAt === null ? undefined : { email, issuedAt }, client: env.client },
      parsed.data.current,
      parsed.data.password,
      (message) => request.log.error(message),
    );
    switch (result.kind) {
      case 'changed':
        return reply.code(200).send({ ok: true });
      case 'not_set':
        return reply.code(409).send({ error: 'not_set' });
      case 'invalid':
        return replyInvalidRecovery(reply);
      case 'limited':
        return replyRateLimited(reply, result.retryAfterSeconds, result.dayLock);
      case 'unavailable':
        return replyUnavailable(reply);
    }
  } catch (error) {
    return replyDatabaseFailure(request, reply, error, 'password change failed', false);
  }
}

export function registerPasswordRoutes(app: FastifyInstance, deps: PasswordRoutesDependencies): void {
  const routes = [
    ['/api/password/forced', forced],
    ['/api/password/change', change],
    ['/api/password/first', first],
  ] as const;
  for (const [url, handler] of routes) {
    app.route({
      method: 'POST',
      url,
      bodyLimit: RECOVERY_BODY_LIMIT_BYTES,
      errorHandler: recoveryErrorHandler,
      handler: (request, reply) => handler(request, reply, deps),
    });
    // Any other method: 405 with the Allow header. Authentication still comes first, like everywhere.
    app.route({
      method: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      url,
      handler: (_request, reply) => reply.code(405).header('allow', 'POST').send({ error: 'method_not_allowed' }),
    });
  }
}
