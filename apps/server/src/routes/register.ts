// POST /api/register (I1 F1.4 part b; FR-REG-004, AC-091). The caller already holds a Supabase session: the web signed
// up against Auth itself, so no email or password ever reaches this server and the server makes no Auth call. The
// authentication hook has run before anything here (401 before the body is read). The body is step 1 plus the consent
// declaration, judged with the server's clock (Q4: today is the UTC date plus one day of tolerance).
//
// Answers are fixed codes (conventions, "User-facing errors"). This route's logs carry the status, the SQLSTATE and the
// constraint name, never the error object: a driver or parser message can quote the body, and the body is a parent's
// and children's data (NFR-PRIV-001).

import { createRegistrationRequestSchema, addDaysIso } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import { createRegistration, hasAccount } from '../services/registration-service.js';

/** FR-REG-004, NFR-SEC-001: a body over this is refused before it is parsed. */
export const REGISTER_BODY_LIMIT_BYTES = 100 * 1024;

export interface RegisterRouteDependencies {
  readonly database: Database | undefined;
  /** The server's clock. A test passes a fixed one. */
  readonly clock: () => Date;
}

const PATH = '/api/register';

/** SQLSTATE class 23 (a constraint) and 42501 (a privilege or policy): the same body fails the same way again. */
function isDeterministicFault(code: string): boolean {
  return code.startsWith('23') || code === '42501';
}

function serverToday(now: Date): string {
  return addDaysIso(now.toISOString().slice(0, 10), 1);
}

async function register(request: FastifyRequest, reply: FastifyReply, deps: RegisterRouteDependencies) {
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });

  const parsed = createRegistrationRequestSchema(serverToday(deps.clock())).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });

  try {
    if (await hasAccount(deps.database, identity)) return reply.code(409).send({ error: 'already_registered' });
    const outcome = await createRegistration(deps.database, identity, parsed.data);
    if (outcome.kind === 'already_registered') return reply.code(409).send({ error: 'already_registered' });
    return reply.code(201).send({ status: 'created' });
  } catch (error) {
    const fault = readDatabaseFault(error);
    request.log.error({ sqlstate: fault?.code, constraint: fault?.constraint }, 'registration write failed');
    // A rule the database enforces refused a body that passed validation: retrying cannot help (criterion 10).
    if (fault !== undefined && isDeterministicFault(fault.code)) return reply.code(500).send({ error: 'internal' });
    // Anything else (connection lost, timeout) may pass on a retry with the same session (criterion 11).
    return reply.code(503).send({ error: 'profile_write_failed' });
  }
}

export function registerRegistrationRoute(app: FastifyInstance, deps: RegisterRouteDependencies): void {
  app.route({
    method: 'POST',
    url: PATH,
    bodyLimit: REGISTER_BODY_LIMIT_BYTES,
    errorHandler: (error, request, reply) => {
      const status = typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
      request.log.warn({ status, code: error.code }, 'register request failed');
      reply.code(status).send({ error: status < 500 ? 'bad_request' : 'internal' });
    },
    handler: (request, reply) => register(request, reply, deps),
  });

  // Any other method: 405 with the Allow header (criterion 13). Authentication still comes first, like everywhere.
  app.route({
    method: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    url: PATH,
    handler: (_request, reply) => reply.code(405).header('allow', 'POST').send({ error: 'method_not_allowed' }),
  });
}
