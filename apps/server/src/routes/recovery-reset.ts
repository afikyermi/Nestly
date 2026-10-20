// POST /api/recovery/reset (I1 F1.6; FR-AUTH-003, AC-092, VAL-003). Signed out: the one public route besides the health
// check, so no authentication hook protects it. The body is the email, exactly two answers and the new password. Order:
// 400 for a body that is not exactly that (before any lookup, uncounted); 503 when the pepper or the Auth key is missing
// (before any database work, uncounted, unaudited); then the service. Every failure to prove the answers is the same 401
// `invalid_recovery`; a lock is 429 `rate_limited` with retry-after; a failed Auth call is 503 `unavailable`.
//
// The client address is `request.ip`, which app.ts derives from the platform's own X-Forwarded-For entry.

import { recoveryResetRequest } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { clientAddress } from '../recovery/client-ip.js';
import type { RecoveryDependencies } from '../recovery/dependencies.js';
import { redeemReset } from '../services/recovery-reset-service.js';
import {
  RECOVERY_BODY_LIMIT_BYTES,
  recoveryErrorHandler,
  replyDatabaseFailure,
  replyInvalidRecovery,
  replyRateLimited,
  replyUnavailable,
} from './recovery-common.js';

export interface RecoveryResetRouteDependencies {
  readonly database: Database | undefined;
  readonly recovery: RecoveryDependencies;
}

const PATH = '/api/recovery/reset';

async function reset(request: FastifyRequest, reply: FastifyReply, deps: RecoveryResetRouteDependencies) {
  reply.header('cache-control', 'no-store');
  const parsed = recoveryResetRequest.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });

  const keys = deps.recovery.keys();
  if (keys === undefined || !deps.recovery.authAdmin.isConfigured() || deps.database === undefined) {
    return replyUnavailable(reply);
  }

  const address = clientAddress(request.ip);
  try {
    const result = await redeemReset(
      deps.database,
      deps.recovery,
      keys,
      { addressKey: address.key, address: address.forAuth },
      parsed.data,
      (message) => request.log.error(message),
    );
    switch (result.kind) {
      case 'ok':
        return reply.code(200).send({ ok: true });
      case 'invalid':
        return replyInvalidRecovery(reply);
      case 'limited':
        return replyRateLimited(reply, result.retryAfterSeconds, result.dayLock);
      case 'unavailable':
        return replyUnavailable(reply);
    }
  } catch (error) {
    return replyDatabaseFailure(request, reply, error, 'recovery reset failed', false);
  }
}

export function registerRecoveryResetRoute(app: FastifyInstance, deps: RecoveryResetRouteDependencies): void {
  app.route({
    method: 'POST',
    url: PATH,
    bodyLimit: RECOVERY_BODY_LIMIT_BYTES,
    errorHandler: recoveryErrorHandler,
    handler: (request, reply) => reset(request, reply, deps),
  });

  // Any other method: 405 with the Allow header. Only POST is public, so authentication answers first for the others.
  app.route({
    method: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    url: PATH,
    handler: (_request, reply) => reply.code(405).header('allow', 'POST').send({ error: 'method_not_allowed' }),
  });
}
