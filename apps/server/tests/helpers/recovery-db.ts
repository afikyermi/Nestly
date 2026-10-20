import { randomInt, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { expect } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { clientAddress } from '../../src/recovery/client-ip.js';
import { emailHandle, ipHash } from '../../src/recovery/hashing.js';
import { readRecoveryKeys } from '../../src/recovery/pepper.js';
import type { RecoveryKeys } from '../../src/recovery/pepper.js';
import {
  AUDIENCE,
  ISSUER,
  newKey,
  startJwks,
  token,
  toRecord,
  toRecords,
  type App,
  type JwksServer,
  type TestKey,
} from './identity-fixtures.js';
import { captureLog, jsonOf, type LogCapture } from './register-app.js';
import { buildRecoveryApp, fakeAdmin, freshPepper, postJson, setPepper, spyScrypt, PAIR, type FakeAdmin, type ScryptSpy } from './recovery-app.js';

// Shared by tests/db/recovery-*.db.test.ts (CI `db` job, as app_server, with the fixtures of supabase/tests/setup/ including
// 30_recovery_fixtures.sql). Written from interface.md "Test seams" and the fixture header; nothing here reads the source.
//
//   startContext()                one JWKS, one app_server side connection (checked), one pepper for the whole file
//   newAccount(ctx)               an Auth user with an ACTIVE regular nestly.users row and a unique email
//   startApp(ctx, opts)           an app on its OWN database connection with the Auth stand-in and the scrypt spy
//   saveAnswers(h, account, ...)  POST /api/recovery-questions with the account's token, returns the response
//   attemptReset(h, body, ip)     POST /api/recovery/reset from one address
//   handleHex / ipHex             the hashes the server must have stored, recomputed from the pepper
//   kinds / throttle / ...        the fixture observers (the audit and the hashes are readable by no runtime role)
//
// Each test uses its own accounts (unique emails) and its own client address, so committed rows never collide, and the
// per-IP and per-account limits of one test cannot reach another.

export const COLD_START_MS = 60_000;
export const T = { timeout: COLD_START_MS };
export const NEW_PASSWORD = 'סיסמה חדשה ארוכה 12345';

export type Side = ReturnType<typeof postgres>;

export interface Context {
  key: TestKey;
  jwks: JwksServer;
  side: Side;
  pepper: string;
  keys: RecoveryKeys;
}

export function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
}

export async function startContext(): Promise<Context> {
  const key = await newKey(`recovery-db-key-${randomUUID().slice(0, 8)}`);
  const jwks = await startJwks([key]);
  const side = postgres(databaseUrl(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  const pepper = freshPepper();
  setPepper(pepper);
  const keys = readRecoveryKeys({ RECOVERY_PEPPER: pepper });
  if (keys === undefined) throw new Error('the test pepper was rejected');
  return { key, jwks, side, pepper, keys };
}

export async function stopContext(ctx: Context): Promise<void> {
  await ctx.jwks.close();
  await ctx.side.end({ timeout: 5 });
}

// ---- addresses and hashes -------------------------------------------------------------------------------------------------
const base = [randomInt(20, 200), randomInt(0, 250)];
let counter = 0;
/** A client address nobody else in this run uses. */
export function nextIp(): string {
  counter += 1;
  return `10.${base[0]}.${(base[1] ?? 0) + Math.floor(counter / 250)}.${(counter % 250) + 1}`;
}

const toHex = (value: unknown): string => {
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (typeof value === 'string') return value;
  throw new Error('expected a Buffer or a hex string');
};
export const handleHex = (ctx: Context, email: string): string => toHex(emailHandle(ctx.keys, email));
export const ipHex = (ctx: Context, address: string): string => toHex(ipHash(ctx.keys, clientAddress(address).key));

// ---- accounts ------------------------------------------------------------------------------------------------------------
export interface Account {
  id: string;
  email: string;
}

export async function newAccount(ctx: Context, email = `recovery-${randomUUID()}@example.invalid`): Promise<Account> {
  const [row] = await ctx.side`select tests.fx_recovery_new_account(${email})::text as id`;
  const id: unknown = row?.id;
  if (typeof id !== 'string') throw new Error('tests.fx_recovery_new_account returned no id: is 30_recovery_fixtures.sql loaded?');
  return { id, email };
}

/** An Auth user with NO nestly.users row (an unregistered identity). */
export async function newBareAuthUser(ctx: Context): Promise<Account> {
  const [row] = await ctx.side`select tests.fx_new_auth_user()::text as id`;
  const id: unknown = row?.id;
  if (typeof id !== 'string') throw new Error('tests.fx_new_auth_user returned no id');
  return { id, email: `bare-${id}@example.invalid` };
}

export async function setStatus(ctx: Context, id: string, status: 'active' | 'suspended' | 'banned'): Promise<void> {
  await ctx.side`select tests.set_status(${id}::uuid, ${status})`;
}

export const bearerFor = async (ctx: Context, account: Account, claimEmail: string | null = account.email, extra: Record<string, unknown> = {}): Promise<string> =>
  `Bearer ${await token({ key: ctx.key, sub: account.id, extra: { ...(claimEmail === null ? {} : { email: claimEmail }), ...extra } })}`;

// ---- observers (fixture functions) ----------------------------------------------------------------------------------------
async function text(query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> {
  const rows = await query;
  const value: unknown = rows[0]?.v;
  if (typeof value !== 'string') throw new Error('the fixture function returned no text');
  return value;
}
export const kinds = (ctx: Context, handle: string): Promise<string> => text(ctx.side`select tests.fx_recovery_kinds(${handle}) as v`);
export const eventsJson = (ctx: Context, handle: string): Promise<string> => text(ctx.side`select tests.fx_recovery_events_json(${handle}) as v`);
export const answersJson = (ctx: Context, id: string): Promise<string> => text(ctx.side`select tests.fx_recovery_answers_json(${id}::uuid) as v`);
/** 'shortFailures/longFailures/locked/shortWindowSet/longWindowSet' or '-' */
export const throttle = (ctx: Context, kind: 'handle' | 'ip', subject: string): Promise<string> =>
  text(ctx.side`select tests.fx_recovery_throttle(${kind}, ${subject}) as v`);
/** NFR-SEC-010: a handle's lock ladder, 'failures/locked' or '-'. */
export const ladder = (ctx: Context, handle: string): Promise<string> => text(ctx.side`select tests.fx_recovery_ladder(${handle}) as v`);
export async function shift(ctx: Context, kind: 'handle' | 'ip', subject: string, by: string): Promise<void> {
  await ctx.side`select tests.fx_recovery_shift(${kind}, ${subject}, ${by}::interval)`;
}
export async function breakEvents(ctx: Context, handle: string, kind = ''): Promise<void> {
  await ctx.side`select tests.fx_recovery_break_events(${handle}, ${kind})`;
}
export async function unbreakEvents(ctx: Context): Promise<void> {
  await ctx.side`select tests.fx_recovery_unbreak_events()`;
}
/** The JSON text of one fixture row as an object (the answers row). */
export function record(jsonText: string): Record<string, unknown> {
  return toRecord(JSON.parse(jsonText));
}
/** The JSON text of the audit rows as a list of objects. */
export function recordsOf(jsonText: string): Array<Record<string, unknown>> {
  return toRecords(JSON.parse(jsonText));
}
/** A bytea column as it appears in the fixture JSON ("\x…") without the prefix. */
export const hexOf = (value: unknown): string => String(value).replace(/^\\x/, '');

// ---- apps ----------------------------------------------------------------------------------------------------------------
export interface Harness {
  app: App;
  database: Database;
  admin: FakeAdmin;
  spy: ScryptSpy;
  log: LogCapture;
}

const open: Harness[] = [];

export interface StartOptions {
  admin?: FakeAdmin;
}

export async function startApp(ctx: Context, options: StartOptions = {}): Promise<Harness> {
  const database = createDatabase(databaseUrl());
  const admin = options.admin ?? fakeAdmin();
  const spy = spyScrypt();
  const log = captureLog();
  const app = await buildRecoveryApp(
    { SUPABASE_JWKS_URL: ctx.jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: databaseUrl() },
    { database, logStream: log.stream, recovery: { authAdmin: admin.authAdmin, scrypt: spy.scrypt } },
  );
  const harness = { app, database, admin, spy, log };
  open.push(harness);
  return harness;
}

export async function closeApps(): Promise<void> {
  for (const { app, database } of open.splice(0)) {
    await app.close();
    await database.close();
  }
}

// ---- requests ------------------------------------------------------------------------------------------------------------
export const entry = (question: string, answer: string) => ({ question, answer });
export const RIGHT = PAIR; // pet "Rex", street "Herzl"

export function saveAnswers(h: Harness, authorization: string, answers: unknown = PAIR, ip = nextIp()) {
  return postJson(h.app, '/api/recovery-questions', { answers }, { authorization, 'x-forwarded-for': ip });
}

export function changeAnswers(h: Harness, authorization: string, current: unknown, answers: unknown, ip = nextIp()) {
  return h.app.inject({
    method: 'PUT',
    url: '/api/recovery-questions',
    headers: { 'content-type': 'application/json', authorization, 'x-forwarded-for': ip },
    payload: JSON.stringify({ current, answers }),
  });
}

export function attemptReset(h: Harness, body: Record<string, unknown>, ip = nextIp()) {
  return postJson(h.app, '/api/recovery/reset', body, { 'x-forwarded-for': ip });
}

export const resetFor = (email: string, answers: unknown = RIGHT, password = NEW_PASSWORD): Record<string, unknown> => ({ email, answers, password });

export function me(h: Harness, authorization: string) {
  return h.app.inject({ method: 'GET', url: '/api/me', headers: { authorization } });
}

/** An account with answers saved (pet "Rex", street "Herzl" unless told otherwise), ready to be recovered. */
export async function accountWithAnswers(ctx: Context, h: Harness, answers: unknown = PAIR): Promise<Account> {
  const account = await newAccount(ctx);
  const res = await saveAnswers(h, await bearerFor(ctx, account), answers);
  expect(res.statusCode, `saving the answers of a fresh account: ${res.body}`).toBe(201);
  h.spy.reset();
  h.admin.calls.length = 0;
  return account;
}

export { jsonOf };
