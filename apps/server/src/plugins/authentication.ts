// Authentication: every route requires a verified access token unless it is on PUBLIC_ROUTES (I1 F1.1 part c,
// criteria 21-22, 26; FR-AUTH-004, BR-015, AC-016 server side). The hook runs before any handler, so a rejected
// request never reaches one and never opens a transaction.
//
// Answers are fixed: 401 `{ error: 'unauthenticated' }` for every token failure — absent, malformed, wrong key or
// algorithm, expired, wrong issuer or audience, no user id — and 503 `{ error: 'unavailable' }` when the check cannot
// be made (configuration missing, key set unreachable). No library text and no hint of which check failed.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import { TokenRejected, type Identity, type TokenVerifier } from '../lib/token-verifier.js';

/** `<METHOD> <route pattern>`. Anything not listed here is protected, including routes added later. */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set(['GET /api/health', 'POST /api/recovery/reset']);

declare module 'fastify' {
  interface FastifyRequest {
    /** The verified caller. `null` on a public route. */
    identity: Identity | null;
    /**
     * The verified token's email claim, or null (public route, or no claim). Read by the recovery-questions store route
     * only, to build the lookup handle; never for authorization.
     */
    verifiedEmail: string | null;
    /** Runs `work` in this request's identity transaction (data-model rule 3). Protected routes only. */
    inIdentityTransaction<T>(work: (tx: IdentityTx) => Promise<T>): Promise<T>;
  }
}

export interface AuthenticationDependencies {
  /** Undefined when the auth configuration is missing or unusable: every protected request is rejected. */
  readonly verifier: TokenVerifier | undefined;
  /** Undefined when DATABASE_URL is missing or unusable: every protected request is rejected. */
  readonly database: Database | undefined;
}

const BEARER = /^Bearer +(\S+)$/i;

function rejectUnauthenticated(reply: FastifyReply): FastifyReply {
  return reply.code(401).header('www-authenticate', 'Bearer').send({ error: 'unauthenticated' });
}

function rejectUnavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({ error: 'unavailable' });
}

/** The library's machine code (e.g. ERR_JWT_EXPIRED) when the cause has one; nothing else of the cause. */
function joseCode(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return undefined;
  return typeof cause.code === 'string' ? cause.code : undefined;
}

function isPublic(request: FastifyRequest): boolean {
  const route = request.routeOptions.url;
  return route !== undefined && PUBLIC_ROUTES.has(`${request.method} ${route}`);
}

export function registerAuthentication(app: FastifyInstance, deps: AuthenticationDependencies): void {
  const { verifier, database } = deps;

  app.decorateRequest('identity', null);
  app.decorateRequest('verifiedEmail', null);
  app.decorateRequest('inIdentityTransaction', function <T>(
    this: FastifyRequest,
    work: (tx: IdentityTx) => Promise<T>,
  ): Promise<T> {
    // The hook guarantees both on a protected route; reaching here without them is a programming error.
    if (this.identity === null || database === undefined) {
      return Promise.reject(new Error('inIdentityTransaction called outside an authenticated request'));
    }
    return inIdentityTransaction(database, this.identity, work);
  });

  app.addHook('onRequest', async (request, reply) => {
    if (isPublic(request)) return;
    if (verifier === undefined || database === undefined) return rejectUnavailable(reply);

    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (token === undefined) return rejectUnauthenticated(reply);

    try {
      const verified = await verifier(token);
      request.identity = verified.identity;
      request.verifiedEmail = verified.email ?? null;
    } catch (error) {
      // Never log the error object: its cause is the library's error, which can carry the decoded claims.
      if (error instanceof TokenRejected) {
        request.log.warn({ reason: error.reason, code: joseCode(error.cause) }, 'access token rejected');
        if (error.reason === 'token') return rejectUnauthenticated(reply);
      } else {
        request.log.warn({ reason: 'unexpected' }, 'access token rejected');
      }
      return rejectUnavailable(reply);
    }
  });
}
