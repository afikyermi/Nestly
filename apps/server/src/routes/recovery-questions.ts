// POST and PUT /api/recovery-questions (I1 F1.6; FR-AUTH-003, AC-092). Signed in: the authentication hook has run before
// anything here (401 before the body is read). POST saves the first two answers (201; 409 when answers already exist);
// PUT replaces them after the current two are proved (200; 401 `invalid_recovery` for a wrong pair, counted as a failure;
// 429 under a lock; 409 `not_set` when the caller has no visible answers row, a not-active account included, because the
// select-own policy hides it; 503 when the handle cannot be moved to the token's email). A body that is not exactly the shape is 400 `invalid_questions`, before any database work. A missing
// pepper is 503. A body naming a user is a 400 too: the schemas are strict, and the rows touched are the caller's own by RLS.

import { recoveryChangeRequest, recoveryStoreRequest } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { clientAddress } from '../recovery/client-ip.js';
import type { RecoveryDependencies } from '../recovery/dependencies.js';
import { changeRecoveryAnswers, storeRecoveryAnswers } from '../services/recovery-questions-service.js';
import {
  RECOVERY_BODY_LIMIT_BYTES,
  recoveryErrorHandler,
  replyDatabaseFailure,
  replyInvalidRecovery,
  replyRateLimited,
  replyUnavailable,
} from './recovery-common.js';

export interface RecoveryQuestionsRouteDependencies {
  readonly database: Database | undefined;
  readonly recovery: RecoveryDependencies;
}

const PATH = '/api/recovery-questions';
const INVALID_QUESTIONS = { error: 'invalid_questions' };

async function store(request: FastifyRequest, reply: FastifyReply, deps: RecoveryQuestionsRouteDependencies) {
  const { identity } = request;
  if (identity === null || deps.database === undefined) return replyUnavailable(reply);
  reply.header('cache-control', 'no-store');

  const parsed = recoveryStoreRequest.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send(INVALID_QUESTIONS);
  const keys = deps.recovery.keys();
  if (keys === undefined) return replyUnavailable(reply);
  // The email claim becomes the lookup handle, and the token's issue time orders it against another account's claim. A
  // token without either cannot be given a handle: nothing is stored.
  const { verifiedEmail: email, verifiedIssuedAt: issuedAt } = request;
  if (email === null || issuedAt === null) {
    request.log.error('recovery questions: the token has no email claim or issue time');
    return reply.code(500).send({ error: 'internal' });
  }

  try {
    const result = await storeRecoveryAnswers(
      deps.database,
      deps.recovery,
      keys,
      identity,
      { email, issuedAt },
      { addressKey: clientAddress(request.ip).key },
      parsed.data.answers,
    );
    if (result.kind === 'already_set') return reply.code(409).send({ error: 'already_set' });
    if (result.kind === 'handle_held') {
      request.log.warn('recovery questions: the email handle is held by a newer claim');
      return replyUnavailable(reply);
    }
    return reply.code(201).send({ ok: true });
  } catch (error) {
    return replyDatabaseFailure(request, reply, error, 'recovery answers write failed', true);
  }
}

async function change(request: FastifyRequest, reply: FastifyReply, deps: RecoveryQuestionsRouteDependencies) {
  const { identity } = request;
  if (identity === null || deps.database === undefined) return replyUnavailable(reply);
  reply.header('cache-control', 'no-store');

  const parsed = recoveryChangeRequest.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send(INVALID_QUESTIONS);
  const keys = deps.recovery.keys();
  if (keys === undefined) return replyUnavailable(reply);
  const { verifiedEmail: email, verifiedIssuedAt: issuedAt } = request;

  try {
    const result = await changeRecoveryAnswers(
      deps.database,
      deps.recovery,
      keys,
      identity,
      email === null || issuedAt === null ? undefined : { email, issuedAt },
      { addressKey: clientAddress(request.ip).key },
      parsed.data.current,
      parsed.data.answers,
    );
    switch (result.kind) {
      case 'changed':
        return reply.code(200).send({ ok: true });
      case 'not_set':
        return reply.code(409).send({ error: 'not_set' });
      case 'invalid':
        return replyInvalidRecovery(reply);
      case 'limited':
        return replyRateLimited(reply, result.retryAfterSeconds, result.permanent);
      case 'unavailable':
        request.log.warn('recovery questions: the email handle could not be re-keyed');
        return replyUnavailable(reply);
    }
  } catch (error) {
    return replyDatabaseFailure(request, reply, error, 'recovery answers change failed', true);
  }
}

export function registerRecoveryQuestionsRoute(app: FastifyInstance, deps: RecoveryQuestionsRouteDependencies): void {
  const errorHandler = recoveryErrorHandler;
  app.route({
    method: 'POST',
    url: PATH,
    bodyLimit: RECOVERY_BODY_LIMIT_BYTES,
    errorHandler,
    handler: (request, reply) => store(request, reply, deps),
  });
  app.route({
    method: 'PUT',
    url: PATH,
    bodyLimit: RECOVERY_BODY_LIMIT_BYTES,
    errorHandler,
    handler: (request, reply) => change(request, reply, deps),
  });

  // Any other method: 405 with the Allow header. Authentication still comes first, like everywhere.
  app.route({
    method: ['GET', 'PATCH', 'DELETE', 'OPTIONS'],
    url: PATH,
    handler: (_request, reply) => reply.code(405).header('allow', 'POST, PUT').send({ error: 'method_not_allowed' }),
  });
}
