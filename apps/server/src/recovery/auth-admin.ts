// The Auth calls of the password flows (F1.6; F2.0, AR-1; schema.md "The Auth calls"; data-model "Approved exceptions",
// part (a)). The ONLY file that reads the Supabase secret key, which carries service_role power over the whole project, and the
// only one that may name the admin, token-grant and logout endpoints and the forwarded-address header: the CI check
// (tests/credentials.static.test.ts) fails when any of them appears anywhere else, or in .github/. The fence is this
// file and that check, not the credential.
//
// The operations, each a fixed sequence, none a generic request function:
//   resetPassword (F1.6 recovery reset), four calls in a fixed order:
//     0. read the user's CURRENT email (read-only; the user id comes from the answers row, never from the request). The
//        handle that found the row can be stale (Auth lets a user change their email), so no password is set unless that
//        email is the request's: only the email is read, and a mismatch makes no further call;
//     1. set the user's password;
//     2. only after a 2xx, one sign-in as that user with the new password the request already holds: it yields an access
//        token, and nothing else of the response is read;
//     3. a global sign-out with that token, which ends every session of the user, the attacker's and the one call 2 made.
//     The token is dropped when the function returns: never returned, logged or stored.
//   Keys: the admin calls and call 2 send the secret key as `apikey`; the two calls that act with a caller's own access token
//   (call 3, and the identities read) send the publishable key (SUPABASE_PUBLISHABLE_KEY, the gateway key), never the secret
//   one, and a missing publishable key fails them closed: there is no fallback to the secret key.
//   F2.0 (AR-1: set-password in four more flows, no other admin operation):
//     readSignInIdentities   the caller's own Auth user with the caller's own access token (no admin call): provider and
//                            creation time of each identity, for the S-01 detection. Nothing else of the user is kept;
//     cancelPassword         the S-01 clear: sets a random password that is never returned, logged or kept;
//     setUserPassword        the forced new password (c7), the change after two answers (c10), the F1.8 first password (c11).
//   An admin password set ends every session of the user, the caller's included (Gate 2 A6): it is the revocation of the
//   clear, c7 and c10, so no separate sign-out call is made.
// The user id is always the JWT subject of the request, never a body field.
//
// Nothing is logged here, and no error text of Auth is kept: the outcome is a word the caller audits.

import { randomBytes } from 'node:crypto';
import { normalizeRecoveryEmail } from '@nestly/shared';
import { ENV } from '../lib/config.js';

const SECRET_ENV = 'SUPABASE_SECRET_KEY';
const PUBLISHABLE_ENV = 'SUPABASE_PUBLISHABLE_KEY';
const CALL_TIMEOUT_MS = 5_000;
const TOTAL_TIMEOUT_MS = 12_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

type Env = Readonly<Record<string, string | undefined>>;

export interface ResetPasswordInput {
  /** The account, from the answers row. */
  readonly userId: string;
  /** The request's email: it is the sign-in name of call 2, not a lookup. */
  readonly email: string;
  /** The new password, already judged against VAL-003. */
  readonly password: string;
  /** The platform-verified client address, so Auth counts the owner's address and not the server's. */
  readonly clientIp: string | undefined;
}

/**
 * `completed`: the password is set and every session is ended. `admin_failed`: the password was not confirmed as set (on
 * a timeout it is unknown). `revoke_failed`: the password is set but the sign-out of every session was not confirmed.
 * `email_mismatch`: the account's current email is not the request's, so nothing was set and no sign-in was made.
 */
export type ResetPasswordOutcome = 'completed' | 'admin_failed' | 'revoke_failed' | 'email_mismatch';

interface Target {
  readonly base: string;
  /** The secret key (service_role power): the admin calls and the token grant. Absent when the target was built for the caller-token calls. */
  readonly secretKey: string | undefined;
  /** The publishable key: the `apikey` of the calls that act with the caller's own access token. Absent when not required. */
  readonly publishableKey: string | undefined;
}

interface Need {
  readonly secret: boolean;
  readonly publishable: boolean;
}

/** What each operation needs: the admin sets only the secret key; the identities read only the publishable key; a reset both. */
const NEEDS = {
  admin: { secret: true, publishable: false },
  callerToken: { secret: false, publishable: true },
  reset: { secret: true, publishable: true },
} as const satisfies Record<string, Need>;

function readValue(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

// Auth is reached over TLS. Plain http is accepted on a loopback host only, where a stub of Auth sits. A key an operation
// needs and that is missing makes no target: there is no fallback from one key to the other.
function readTarget(env: Env, need: Need): Target | undefined {
  const secretKey = readValue(env, SECRET_ENV);
  const publishableKey = readValue(env, PUBLISHABLE_ENV);
  const issuer = readValue(env, ENV.issuer);
  if ((need.secret && secretKey === undefined) || (need.publishable && publishableKey === undefined)) return undefined;
  if (issuer === undefined || !URL.canParse(issuer)) return undefined;
  const url = new URL(issuer);
  const safe = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
  if (!safe) return undefined;
  return {
    base: issuer.replace(/\/+$/, ''),
    secretKey: need.secret ? secretKey : undefined,
    publishableKey: need.publishable ? publishableKey : undefined,
  };
}

/** Whether a reset can reach Auth at all: the secret key, the publishable key and the issuer URL are set and usable. Reads and calls nothing. */
export function isAdminConfigured(env: Env = process.env): boolean {
  return readTarget(env, NEEDS.reset) !== undefined;
}

function accessTokenOf(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const token: unknown = Reflect.get(body, 'access_token');
  return typeof token === 'string' && token !== '' ? token : undefined;
}

function emailOf(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const email: unknown = Reflect.get(body, 'email');
  return typeof email === 'string' && email !== '' ? email : undefined;
}

interface CallInit {
  /** Which key is sent as `apikey`: the secret key, or the publishable key for a call that acts with the caller's own token. */
  readonly key: 'secret' | 'publishable';
  readonly method: string;
  readonly body?: string;
  readonly bearer?: string;
  /** The platform-verified client address for Sb-Forwarded-For, when Auth should count the caller and not the server. */
  readonly forwardedFor?: string | undefined;
}

/** One call to Auth with the key `init.key` names, a per-call timeout under the sequence's total. Throws on a network fault. */
function call(target: Target, total: AbortSignal, path: string, init: CallInit): Promise<Response> {
  const apikey = init.key === 'secret' ? target.secretKey : target.publishableKey;
  if (apikey === undefined) return Promise.reject(new Error('auth key not available'));
  const headers: Record<string, string> = { apikey, 'content-type': 'application/json' };
  if (init.bearer !== undefined) headers['authorization'] = `Bearer ${init.bearer}`;
  if (init.forwardedFor !== undefined) headers['Sb-Forwarded-For'] = init.forwardedFor;
  return fetch(`${target.base}${path}`, {
    method: init.method,
    headers,
    ...(init.body === undefined ? {} : { body: init.body }),
    redirect: 'error',
    signal: AbortSignal.any([total, AbortSignal.timeout(CALL_TIMEOUT_MS)]),
  });
}

/** The four calls, in order. Never throws: every failure is one of the four outcomes. */
export async function resetPassword(input: ResetPasswordInput, env: Env = process.env): Promise<ResetPasswordOutcome> {
  const target = readTarget(env, NEEDS.reset);
  if (target === undefined || !UUID.test(input.userId)) return 'admin_failed';
  const total = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
  const forwarded = input.clientIp;

  // Call 0. Read-only. Only the email is read, and only to compare: a non-2xx or a timeout means nothing was confirmed, so
  // nothing is set; a different (or missing) email means the handle was stale, so nothing is set either.
  try {
    const read = await call(target, total, `/admin/users/${input.userId}`, { key: 'secret', method: 'GET', forwardedFor: forwarded });
    if (!read.ok) {
      await read.body?.cancel();
      return 'admin_failed';
    }
    const current = emailOf(await read.json());
    if (current === undefined || normalizeRecoveryEmail(current) !== normalizeRecoveryEmail(input.email)) return 'email_mismatch';
  } catch {
    return 'admin_failed'; // audited by the caller; Auth's error text is deliberately not kept
  }

  // Call 1. A non-2xx, a timeout and a dropped connection all mean "the password was not confirmed as set".
  try {
    const set = await call(target, total, `/admin/users/${input.userId}`, {
      key: 'secret',
      method: 'PUT',
      body: JSON.stringify({ password: input.password }),
    });
    await set.body?.cancel();
    if (!set.ok) return 'admin_failed';
  } catch {
    return 'admin_failed'; // the outcome is audited by the caller; Auth's error text is deliberately not kept
  }

  // Calls 2 and 3. The password is set from here on: any failure is `revoke_failed`.
  try {
    const signIn = await call(target, total, '/token?grant_type=password', {
      key: 'secret',
      method: 'POST',
      body: JSON.stringify({ email: normalizeRecoveryEmail(input.email), password: input.password }),
      forwardedFor: forwarded,
    });
    if (!signIn.ok) {
      await signIn.body?.cancel();
      return 'revoke_failed';
    }
    const accessToken = accessTokenOf(await signIn.json());
    if (accessToken === undefined) return 'revoke_failed';

    const signOut = await call(target, total, '/logout?scope=global', { key: 'publishable', method: 'POST', bearer: accessToken, forwardedFor: forwarded });
    await signOut.body?.cancel();
    return signOut.ok ? 'completed' : 'revoke_failed';
  } catch {
    return 'revoke_failed'; // as above: audited by the caller, nothing kept
  }
}

// ---- F2.0 (AR-1) -------------------------------------------------------------------------------------------------------

/** One identity of the caller's Auth user, as the S-01 detection reads it: the provider and when it was linked. */
export interface SignInIdentity {
  readonly provider: string;
  readonly createdAt: Date;
}

export type IdentitiesRead = { readonly kind: 'ok'; readonly identities: readonly SignInIdentity[] } | { readonly kind: 'failed' };

/** `set`: Auth confirmed the password (or answered that it already is that password). `failed`: not confirmed. */
export type PasswordSetOutcome = 'set' | 'failed';

function identitiesOf(body: unknown): SignInIdentity[] | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const list: unknown = Reflect.get(body, 'identities');
  if (!Array.isArray(list)) return undefined;
  const identities: SignInIdentity[] = [];
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) return undefined;
    const provider: unknown = Reflect.get(entry, 'provider');
    const createdAt: unknown = Reflect.get(entry, 'created_at');
    if (typeof provider !== 'string' || typeof createdAt !== 'string') return undefined;
    const when = new Date(createdAt);
    if (Number.isNaN(when.getTime())) return undefined;
    identities.push({ provider, createdAt: when });
  }
  return identities;
}

async function errorCodeOf(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    const code: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'error_code') : undefined;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}

/** The caller's own identities, read with the caller's own access token. Never throws. */
export async function readSignInIdentities(
  input: { readonly accessToken: string; readonly clientIp: string | undefined },
  env: Env = process.env,
): Promise<IdentitiesRead> {
  const target = readTarget(env, NEEDS.callerToken);
  if (target === undefined) return { kind: 'failed' };
  try {
    const total = AbortSignal.timeout(CALL_TIMEOUT_MS);
    const read = await call(target, total, '/user', { key: 'publishable', method: 'GET', bearer: input.accessToken, forwardedFor: input.clientIp });
    if (!read.ok) {
      await read.body?.cancel();
      return { kind: 'failed' };
    }
    const identities = identitiesOf(await read.json());
    return identities === undefined ? { kind: 'failed' } : { kind: 'ok', identities };
  } catch {
    return { kind: 'failed' };
  }
}

/** Sets `password` on the user with the admin key. Auth's `same_password` counts as set (a retry). Never throws. */
export async function setUserPassword(
  input: { readonly userId: string; readonly password: string },
  env: Env = process.env,
): Promise<PasswordSetOutcome> {
  const target = readTarget(env, NEEDS.admin);
  if (target === undefined || !UUID.test(input.userId)) return 'failed';
  try {
    const total = AbortSignal.timeout(CALL_TIMEOUT_MS);
    const set = await call(target, total, `/admin/users/${input.userId}`, {
      key: 'secret',
      method: 'PUT',
      body: JSON.stringify({ password: input.password }),
    });
    if (set.ok) {
      await set.body?.cancel();
      return 'set';
    }
    return (await errorCodeOf(set)) === 'same_password' ? 'set' : 'failed';
  } catch {
    return 'failed';
  }
}

/** The S-01 clear: a random password nobody knows replaces the earlier registrant's. Never returned or kept. Never throws. */
export function cancelPassword(input: { readonly userId: string }, env: Env = process.env): Promise<PasswordSetOutcome> {
  return setUserPassword({ userId: input.userId, password: randomBytes(48).toString('base64url') }, env);
}
