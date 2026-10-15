// The Auth calls of a password reset (F1.6; schema.md "The Auth calls"; data-model "Approved exceptions", part (a)).
// The ONLY file that reads the Supabase secret key, which carries service_role power over the whole project, and the only
// one that may name the admin, token-grant and logout endpoints and the forwarded-address header: the CI check
// (tests/credentials.static.test.ts) fails when any of them appears anywhere else, or in .github/. The fence is this
// file and that check, not the credential.
//
// One operation, four calls in a fixed order, none exported alone and no generic request function:
//   0. read the user's CURRENT email (read-only; the user id comes from the answers row, never from the request). The
//      handle that found the row can be stale (Auth lets a user change their email), so no password is set unless that
//      email is the request's: only the email is read, and a mismatch makes no further call;
//   1. set the user's password;
//   2. only after a 2xx, one sign-in as that user with the new password the request already holds: it yields an access
//      token, and nothing else of the response is read;
//   3. a global sign-out with that token, which ends every session of the user, the attacker's and the one call 2 made.
// The token is dropped when the function returns: never returned, logged or stored.
//
// Nothing is logged here, and no error text of Auth is kept: the outcome is a word the caller audits.

import { normalizeRecoveryEmail } from '@nestly/shared';
import { ENV } from '../lib/config.js';

const SECRET_ENV = 'SUPABASE_SECRET_KEY';
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
  readonly key: string;
}

function readValue(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

// Auth is reached over TLS with the secret key. Plain http is accepted on a loopback host only, where a stub of Auth sits.
function readTarget(env: Env): Target | undefined {
  const key = readValue(env, SECRET_ENV);
  const issuer = readValue(env, ENV.issuer);
  if (key === undefined || issuer === undefined || !URL.canParse(issuer)) return undefined;
  const url = new URL(issuer);
  const safe = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
  if (!safe) return undefined;
  return { base: issuer.replace(/\/+$/, ''), key };
}

/** Whether a reset can reach Auth at all: the secret key and the issuer URL are set and usable. Reads and calls nothing. */
export function isAdminConfigured(env: Env = process.env): boolean {
  return readTarget(env) !== undefined;
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

/** The four calls, in order. Never throws: every failure is one of the four outcomes. */
export async function resetPassword(input: ResetPasswordInput, env: Env = process.env): Promise<ResetPasswordOutcome> {
  const target = readTarget(env);
  if (target === undefined || !UUID.test(input.userId)) return 'admin_failed';
  const { base, key } = target;
  const total = AbortSignal.timeout(TOTAL_TIMEOUT_MS);

  async function call(path: string, init: { method: string; body?: string; bearer?: string; forwarded: boolean }): Promise<Response> {
    const headers: Record<string, string> = { apikey: key, 'content-type': 'application/json' };
    if (init.bearer !== undefined) headers['authorization'] = `Bearer ${init.bearer}`;
    if (init.forwarded && input.clientIp !== undefined) headers['Sb-Forwarded-For'] = input.clientIp;
    return fetch(`${base}${path}`, {
      method: init.method,
      headers,
      ...(init.body === undefined ? {} : { body: init.body }),
      redirect: 'error',
      signal: AbortSignal.any([total, AbortSignal.timeout(CALL_TIMEOUT_MS)]),
    });
  }

  // Call 0. Read-only. Only the email is read, and only to compare: a non-2xx or a timeout means nothing was confirmed, so
  // nothing is set; a different (or missing) email means the handle was stale, so nothing is set either.
  try {
    const read = await call(`/admin/users/${input.userId}`, { method: 'GET', forwarded: true });
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
    const set = await call(`/admin/users/${input.userId}`, {
      method: 'PUT',
      body: JSON.stringify({ password: input.password }),
      forwarded: false,
    });
    await set.body?.cancel();
    if (!set.ok) return 'admin_failed';
  } catch {
    return 'admin_failed'; // the outcome is audited by the caller; Auth's error text is deliberately not kept
  }

  // Calls 2 and 3. The password is set from here on: any failure is `revoke_failed`.
  try {
    const signIn = await call('/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: normalizeRecoveryEmail(input.email), password: input.password }),
      forwarded: true,
    });
    if (!signIn.ok) {
      await signIn.body?.cancel();
      return 'revoke_failed';
    }
    const accessToken = accessTokenOf(await signIn.json());
    if (accessToken === undefined) return 'revoke_failed';

    const signOut = await call('/logout?scope=global', { method: 'POST', bearer: accessToken, forwarded: true });
    await signOut.body?.cancel();
    return signOut.ok ? 'completed' : 'revoke_failed';
  } catch {
    return 'revoke_failed'; // as above: audited by the caller, nothing kept
  }
}
