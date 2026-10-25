// Authentication: every route requires a verified access token unless it is on PUBLIC_ROUTES (I1 F1.1 part c,
// criteria 21-22, 26; FR-AUTH-004, BR-015, AC-016 server side). The hook runs before any handler, so a rejected
// request never reaches one and never opens a transaction.
//
// Answers are fixed: 401 `{ error: 'unauthenticated' }` for every token failure — absent, malformed, wrong key or
// algorithm, expired, wrong issuer or audience, no user id — and 503 `{ error: 'unavailable' }` when the check cannot
// be made (configuration missing, key set unreachable). No library text and no hint of which check failed.
//
// F2.0 (S-01, FR-AUTH-005): a token from a Google (oauth) session passes the identity link gate before any route runs: the
// detection, and the takeover clear when it applies, complete first (c1, c3); a pending clear is 503, a stale token 401.
// For every other token the session guard is read inside each identity transaction, and a refusal there is answered by
// replySessionRefused below, in every protected route.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, SessionRefused, type IdentityTx } from '../db/identity-transaction.js';
import { TokenRejected, type Identity, type TokenVerifier } from '../lib/token-verifier.js';

/** `<METHOD> <route pattern>`. Anything not listed here is protected, including routes added later. */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set(['GET /api/health', 'POST /api/recovery/reset']);

declare module 'fastify' {
  interface FastifyRequest {
    /** The verified caller. `null` on a public route. */
    identity: Identity | null;
    /**
     * The verified token's email claim and issue time (`iat`), or null (public route, or no claim). Read by the recovery
     * handle paths only (store, change, /api/me), to build the lookup handle and order two claims; never for authorization.
     */
    verifiedEmail: string | null;
    verifiedIssuedAt: number | null;
    /** When the verified session last proved the password (`amr`), or null. Read by the account deletion request only (VAL-052). */
    verifiedPasswordAt: number | null;
    /**
     * The verified bearer token itself, or null (public route). Only for the Auth calls made with the caller's own token
     * (F2.0: the S-01 identity read). Never logged, stored or returned.
     */
    accessToken: string | null;
    /** Runs `work` in this request's identity transaction (data-model rule 3). Protected routes only. */
    inIdentityTransaction<T>(work: (tx: IdentityTx) => Promise<T>): Promise<T>;
  }
}

export interface AuthenticationDependencies {
  /** Undefined when the auth configuration is missing or unusable: every protected request is rejected. */
  readonly verifier: TokenVerifier | undefined;
  /** Undefined when DATABASE_URL is missing or unusable: every protected request is rejected. */
  readonly database: Database | undefined;
  /** F2.0: the identity link gate of a request from an oauth session (services/identity-link-service.ts, wired in app.ts). */
  readonly linkGate?: LinkGate;
}

/** What the gate answers: the route may run, the token is stale (401), or the request must wait (503). */
export type LinkGate = (request: FastifyRequest, identity: Identity, accessToken: string) => Promise<'proceed' | 'unauthenticated' | 'unavailable'>;

const BEARER = /^Bearer +(\S+)$/i;

function rejectUnauthenticated(reply: FastifyReply): FastifyReply {
  return reply.code(401).header('www-authenticate', 'Bearer').send({ error: 'unauthenticated' });
}

function rejectUnavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({ error: 'unavailable' });
}

/**
 * The answer to a token the session guard refused inside a route (F2.0 c4, c6): stale is 401 like any refused token, a
 * pending clear (or an unchecked oauth token) is 503. Undefined when `error` is not a refusal, so the route handles it.
 */
export function replySessionRefused(reply: FastifyReply, error: unknown): FastifyReply | undefined {
  if (!(error instanceof SessionRefused)) return undefined;
  return error.guard === 'stale' || error.guard === 'unauthenticated' ? rejectUnauthenticated(reply) : rejectUnavailable(reply);
}

const isOAuthSession = (identity: Identity): boolean => identity.authMethods?.includes('oauth') === true;

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
  const { verifier, database, linkGate } = deps;

  app.decorateRequest('identity', null);
  app.decorateRequest('verifiedEmail', null);
  app.decorateRequest('verifiedIssuedAt', null);
  app.decorateRequest('verifiedPasswordAt', null);
  app.decorateRequest('accessToken', null);
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
      request.verifiedIssuedAt = verified.issuedAt ?? null;
      request.verifiedPasswordAt = verified.passwordAt ?? null;
      request.accessToken = token;
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

    const identity = request.identity;
    if (identity === null || !isOAuthSession(identity)) return;
    if (linkGate === undefined) return rejectUnavailable(reply);
    const gate = await linkGate(request, identity, token);
    if (gate === 'unauthenticated') return rejectUnauthenticated(reply);
    if (gate === 'unavailable') return rejectUnavailable(reply);
  });
}
