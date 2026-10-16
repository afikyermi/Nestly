import { randomUUID } from 'node:crypto';
import { createDatabase } from '../../src/db/client.js';
import type { AuthAccountPort, RecoveryDependencies } from '../../src/recovery/dependencies.js';
import { AUDIENCE, ISSUER } from './identity-fixtures.js';
import { captureLog } from './register-app.js';
import { buildRecoveryApp, fakeAdmin, postJson, spyScrypt } from './recovery-app.js';
import {
  accountWithAnswers,
  bearerFor,
  databaseUrl,
  newAccount,
  newBareAuthUser,
  nextIp,
  type Account,
  type Context,
  type Harness,
} from './recovery-db.js';

// Shared by the F2.0 part a server tests (tests/db/takeover-*.db.test.ts, password-*.db.test.ts; CI `db` job, as app_server).
// Written from spec.md and interface.md "Test seams" only: the Auth calls of S-01 / S-16 are replaced at recovery.authAccount.
//
//   fakeAuth(script)            an AuthAccountPort that records every call in order and answers what the script says
//   startTakeoverApp(ctx, auth) an app on its OWN database connection with that Auth stand-in
//   googleBearer / passwordBearer   tokens of an oauth session (amr oauth, session_id) and of a password session
//   affectedAccount(ctx, h)     an account that registered with a password and saved answers (the "earlier registrant")
//   link observers              tests.fx_link_state / fx_link_event_kinds (supabase/tests/setup/40_link_fixtures.sql)

export const EARLIER = new Date('2026-01-01T00:00:00Z');
export const LATER = new Date('2026-02-01T00:00:00Z');
export const EMAIL_FIRST = [
  { provider: 'email', createdAt: EARLIER },
  { provider: 'google', createdAt: LATER },
];
export const GOOGLE_FIRST = [
  { provider: 'google', createdAt: EARLIER },
  { provider: 'email', createdAt: LATER },
];

export interface AuthScript {
  identities?: ReadonlyArray<{ provider: string; createdAt: Date }> | 'failed';
  cancel?: 'set' | 'failed';
  set?: 'set' | 'failed';
  signOut?: 'done' | 'failed';
  configured?: boolean;
  /** awaited inside cancelPassword (to make two requests overlap) */
  cancelDelayMs?: number;
  /** awaited inside setPassword, after the call started (a set "in flight") */
  setDelayMs?: number;
}

export interface Call {
  op: 'readIdentities' | 'cancelPassword' | 'setPassword' | 'signOutOthers';
  input: Record<string, unknown>;
}

export interface FakeAuth {
  port: AuthAccountPort;
  script: AuthScript;
  calls: Call[];
  /** the calls of one kind, in order */
  of: (op: Call['op']) => Call[];
  /** 'op:start' / 'op:end' in the order they happened, across every app that shares this port (F2.0 A4) */
  order: string[];
  /** runs before each call of that kind answers (to observe the database at that moment) */
  onCall: Partial<Record<Call['op'], () => Promise<void>>>;
}

export function fakeAuth(initial: AuthScript = {}): FakeAuth {
  const script: AuthScript = { identities: EMAIL_FIRST, cancel: 'set', set: 'set', signOut: 'done', configured: true, ...initial };
  const calls: Call[] = [];
  const order: string[] = [];
  const onCall: FakeAuth['onCall'] = {};
  const record = async (op: Call['op'], input: Record<string, unknown>): Promise<void> => {
    calls.push({ op, input });
    await onCall[op]?.();
  };
  const port: AuthAccountPort = {
    isConfigured: () => script.configured !== false,
    readIdentities: async (input) => {
      await record('readIdentities', { ...input });
      return script.identities === 'failed' ? { kind: 'failed' } : { kind: 'ok', identities: script.identities ?? [] };
    },
    cancelPassword: async (input) => {
      order.push('cancelPassword:start');
      await record('cancelPassword', { ...input });
      if (script.cancelDelayMs) await new Promise((resolve) => setTimeout(resolve, script.cancelDelayMs));
      order.push('cancelPassword:end');
      return script.cancel ?? 'set';
    },
    setPassword: async (input) => {
      order.push('setPassword:start');
      await record('setPassword', { ...input });
      if (script.setDelayMs) await new Promise((resolve) => setTimeout(resolve, script.setDelayMs));
      order.push('setPassword:end');
      return script.set ?? 'set';
    },
    signOutOthers: async (input) => {
      await record('signOutOthers', { ...input });
      return script.signOut ?? 'done';
    },
  };
  return { port, script, calls, onCall, order, of: (op) => calls.filter((c) => c.op === op) };
}

export interface TakeoverHarness extends Harness {
  auth: FakeAuth;
}

export async function startTakeoverApp(ctx: Context, auth: FakeAuth, extra: { keys?: () => undefined; authAdmin?: RecoveryDependencies['authAdmin'] } = {}): Promise<TakeoverHarness> {
  const database = createDatabase(databaseUrl());
  const admin = fakeAdmin();
  const { authAdmin = admin.authAdmin, ...rest } = extra;
  const spy = spyScrypt();
  const log = captureLog();
  const app = await buildRecoveryApp(
    { SUPABASE_JWKS_URL: ctx.jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: databaseUrl() },
    { database, logStream: log.stream, recovery: { authAdmin, scrypt: spy.scrypt, authAccount: auth.port, ...rest } },
  );
  const harness: TakeoverHarness = { app, database, admin, spy, log, auth };
  openApps.push(harness);
  return harness;
}

const openApps: TakeoverHarness[] = [];
export async function closeTakeoverApps(): Promise<void> {
  for (const { app, database } of openApps.splice(0)) {
    await app.close();
    await database.close();
  }
}

// ---- tokens --------------------------------------------------------------------------------------------------------------
export const sessionId = (): string => randomUUID();
const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** A Google session's token. `iatOffset` seconds from now (positive: issued after a clear that happens now). */
export const googleBearer = (ctx: Context, account: Account, session = sessionId(), iatOffset = 0, claimEmail: string | null = account.email): Promise<string> =>
  bearerFor(ctx, account, claimEmail, { session_id: session, amr: [{ method: 'oauth' }], iat: nowSeconds() + iatOffset });

/** A password session's token (amr password). */
export const passwordBearer = (ctx: Context, account: Account, session = sessionId(), iatOffset = 0, claimEmail: string | null = account.email): Promise<string> =>
  bearerFor(ctx, account, claimEmail, { session_id: session, amr: [{ method: 'password' }], iat: nowSeconds() + iatOffset });

/** The same token without any session claim (an old-style token). */
export const bareSessionBearer = (ctx: Context, account: Account): Promise<string> =>
  bearerFor(ctx, account, account.email, { amr: [{ method: 'password' }] });

// ---- accounts ------------------------------------------------------------------------------------------------------------
/** The earlier registrant: an active account with a password session that saved its two answers (pet Rex, street Herzl). */
export async function affectedAccount(ctx: Context, h: Harness): Promise<Account> {
  return accountWithAnswers(ctx, h);
}

export { newAccount, newBareAuthUser, nextIp };

// ---- requests ------------------------------------------------------------------------------------------------------------
export const get = (h: Harness, url: string, authorization?: string) =>
  h.app.inject({ method: 'GET', url, headers: authorization === undefined ? {} : { authorization } });

export const postPassword = (h: Harness, route: 'forced' | 'change' | 'first', body: unknown, authorization?: string, ip = nextIp()) =>
  postJson(h.app, `/api/password/${route}`, body, { ...(authorization === undefined ? {} : { authorization }), 'x-forwarded-for': ip });

export const NEW_PW = 'סיסמה חדשה ארוכה 12345';
export const OK_BODY = '{"ok":true}';

export interface Link {
  /** 'verdict/clearedSet/clearingSession/passwordSet' or '-' */
  state: string;
  kinds: string;
}

type SideRows = ReadonlyArray<Record<string, unknown>>;
async function textOf(query: PromiseLike<SideRows>): Promise<string> {
  const value: unknown = (await query)[0]?.v;
  if (typeof value !== 'string') throw new Error('the fixture function returned no text: is 40_link_fixtures.sql loaded?');
  return value;
}
export const linkState = (ctx: Context, id: string): Promise<string> => textOf(ctx.side`select tests.fx_link_state(${id}::uuid) as v`);
export const linkKinds = (ctx: Context, id: string): Promise<string> => textOf(ctx.side`select tests.fx_link_event_kinds(${id}::uuid) as v`);
export const linkEventsJson = (ctx: Context, id: string): Promise<string> => textOf(ctx.side`select tests.fx_link_events_json(${id}::uuid) as v`);
export async function linkPut(ctx: Context, id: string, verdict: 'affected' | 'unaffected', session: string, cleared = false, passwordSet = false): Promise<void> {
  await ctx.side`select tests.fx_link_put(${id}::uuid, ${verdict}, ${session}::uuid,
    ${cleared ? new Date() : null}::timestamptz, ${cleared ? session : null}::uuid, ${passwordSet ? new Date() : null}::timestamptz)`;
}

// ---- the per-user lock (schema.md Gate 2 amendment A4) -------------------------------------------------------------------------
/** The text the lock is taken on: 'nestly.password_state:' + the user id (A4), hashed by the database. */
export const lockKey = (userId: string): string => `nestly.password_state:${userId}`;

/**
 * Holds the user's password-state lock on a separate connection, as another request would, while `during` runs; released on
 * return. A try-lock taken by the app in that time must fail (503 `unavailable`).
 */
export async function holdingLock<T>(ctx: Context, userId: string, during: () => Promise<T>): Promise<T> {
  const results: T[] = [];
  await ctx.side.begin(async (tx) => {
    const [row] = await tx`select pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(${lockKey(userId)}, 0)) as got`;
    if (row?.got !== true) throw new Error('the test could not take the lock: another holder exists');
    results.push(await during());
  });
  for (const value of results) return value;
  throw new Error('the callback did not run');
}

/** Waits (polling) until `condition` holds; fails after `ms`. */
export async function until(condition: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > end) throw new Error('timed out waiting for the in-flight call to start');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** A reset stand-in that logs its start and end into `order` and takes `delayMs` to answer 'completed'. */
export function delayedAdmin(order: string[], delayMs: number): RecoveryDependencies['authAdmin'] {
  return {
    isConfigured: () => true,
    resetPassword: async () => {
      order.push('reset:start');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      order.push('reset:end');
      return 'completed';
    },
  };
}
