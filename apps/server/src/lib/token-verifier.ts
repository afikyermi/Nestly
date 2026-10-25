// Access-token verification with `jose` against the project's JWKS (decisions 2026-10-11 "JWT verification"; I1 F1.1
// part c, criteria 22-23). The token proves who the caller is and nothing else: its `role`, `app_metadata` and
// `user_metadata` are never read (data-model rules 3 and 14). Account type, status and permissions come from the
// database, through RLS.

import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import type { AuthConfig } from './config.js';

/**
 * The caller, as far as a verified token can say: the user id, and the three claims that identify the session (F2.0,
 * DR-S1): `session_id`, `iat` (whole seconds) and the `amr` methods. The session claims go to the database, which compares
 * them with the identity link check it holds (nestly.session_guard()); they never stand for type, status or permission
 * (platform rule 14). A claim that is missing or malformed is left out, and the database reads it as NULL.
 */
export interface Identity {
  readonly userId: string;
  readonly sessionId?: string | undefined;
  readonly issuedAt?: number | undefined;
  readonly authMethods?: readonly string[] | undefined;
}

/**
 * Why a token was not accepted. `token`: the token itself failed a check — the caller gets 401. `unavailable`: the
 * check could not be made, because the key set could not be fetched — the caller gets 503. Neither carries the
 * library's text to the response.
 */
export class TokenRejected extends Error {
  constructor(
    readonly reason: 'token' | 'unavailable',
    options?: ErrorOptions,
  ) {
    super(`access token rejected: ${reason}`, options);
    this.name = 'TokenRejected';
  }
}

/**
 * What a verified token yields. `identity` is the user id and the session identifiers: it is all the database and every route
 * but one ever sees. `email` and `issuedAt` (the `iat` claim, whole seconds) are exposed for ONE purpose: the recovery handle
 * (F1.6, DR-B). The store, change and /api/me paths turn the email into the account's lookup handle, and the issue time
 * orders two claims to the same email (the later wins). Neither is ever used for authorization (platform rule 14).
 */
export interface VerifiedToken {
  readonly identity: Identity;
  readonly email: string | undefined;
  readonly issuedAt: number | undefined;
  /**
   * When this session last proved the password (the newest `password` entry of `amr`, whole seconds), or undefined. Read by ONE purpose:
   * the account deletion request must follow a fresh password sign-in (VAL-052). Never authorization: the database decides what it may do.
   */
  readonly passwordAt?: number | undefined;
}

export type TokenVerifier = (token: string) => Promise<VerifiedToken>;

// Supabase signs access tokens with the project's asymmetric key (ECC P-256). Only ES256 is accepted, so `none`, HS256
// and any other algorithm are refused before a key is looked up.
const ALGORITHMS = ['ES256'];

// auth.uid() casts the `sub` claim to uuid; anything else is not a Supabase user id.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// jose failures that are about the token itself. Everything else — the JWKS endpoint unreachable, timing out, not
// answering 200 or not serving a key set — means the token could not be checked, and is reported as `unavailable`.
const TOKEN_FAILURES: ReadonlySet<string> = new Set([
  errors.JOSEAlgNotAllowed.code,
  errors.JOSENotSupported.code,
  errors.JWSInvalid.code,
  errors.JWSSignatureVerificationFailed.code,
  errors.JWTInvalid.code,
  errors.JWTExpired.code,
  errors.JWTClaimValidationFailed.code,
  errors.JWKSNoMatchingKey.code,
  errors.JWKSMultipleMatchingKeys.code,
]);

const AUTH_METHOD = /^[a-z_]{1,32}$/;
const MAX_AUTH_METHODS = 8;

/**
 * The `method` of each `amr` entry Supabase wrote ({ method, timestamp }), all or nothing (Gate 2 A7): undefined when the claim is
 * not an array, holds more than MAX_AUTH_METHODS entries, or any entry is not that shape. A dropped entry could have been the
 * `password` method the guard looks for; with no `amr` at all the database fails closed (a post-clear session reads stale).
 */
function authMethodsOf(amr: unknown): string[] | undefined {
  if (!Array.isArray(amr) || amr.length > MAX_AUTH_METHODS) return undefined;
  const methods: string[] = [];
  for (const entry of amr) {
    const method: unknown = typeof entry === 'object' && entry !== null ? Reflect.get(entry, 'method') : undefined;
    if (typeof method !== 'string' || !AUTH_METHOD.test(method)) return undefined;
    methods.push(method);
  }
  return methods;
}

/** The newest timestamp of a `password` entry, read with the same all-or-nothing rule: undefined unless the whole claim is well formed. */
function passwordAtOf(amr: unknown): number | undefined {
  if (authMethodsOf(amr) === undefined || !Array.isArray(amr)) return undefined;
  let newest: number | undefined;
  for (const entry of amr) {
    const method: unknown = Reflect.get(Object(entry), 'method');
    const at: unknown = Reflect.get(Object(entry), 'timestamp');
    if (method !== 'password' || typeof at !== 'number' || !Number.isInteger(at)) continue;
    if (newest === undefined || at > newest) newest = at;
  }
  return newest;
}

function classify(error: unknown): TokenRejected {
  const isTokenFailure = error instanceof errors.JOSEError && TOKEN_FAILURES.has(error.code);
  return new TokenRejected(isTokenFailure ? 'token' : 'unavailable', { cause: error });
}

/**
 * One verifier per server instance. The key set is fetched on first use and cached by `jose`; a token whose key id is
 * unknown triggers at most one refetch per cooldown. With no cached key and the endpoint unreachable, every token is
 * rejected as `unavailable` (criterion 26).
 */
export function createTokenVerifier(config: AuthConfig): TokenVerifier {
  const keySet = createRemoteJWKSet(config.jwksUrl);

  return async (token) => {
    let subject: unknown;
    let email: unknown;
    let issuedAt: unknown;
    let sessionId: unknown;
    let amr: unknown;
    try {
      const { payload } = await jwtVerify(token, keySet, {
        algorithms: ALGORITHMS,
        issuer: config.issuer,
        audience: config.audience,
        requiredClaims: ['sub', 'exp'],
      });
      subject = payload.sub;
      email = payload.email;
      issuedAt = payload.iat;
      sessionId = payload['session_id'];
      amr = payload['amr'];
    } catch (error) {
      throw classify(error);
    }
    if (typeof subject !== 'string' || !UUID.test(subject)) throw new TokenRejected('token');
    const iat = typeof issuedAt === 'number' && Number.isInteger(issuedAt) ? issuedAt : undefined;
    return {
      identity: {
        userId: subject,
        sessionId: typeof sessionId === 'string' && UUID.test(sessionId) ? sessionId : undefined,
        issuedAt: iat,
        authMethods: authMethodsOf(amr),
      },
      email: typeof email === 'string' ? email : undefined,
      issuedAt: iat,
      passwordAt: passwordAtOf(amr),
    };
  };
}
