import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { cancelDeletion, readDeletionStatus, requestDeletion } from '../../src/services/account-deletion-service.js';
import { readAccountState } from '../../src/services/account-state-service.js';
import { readAdminOverview } from '../../src/services/staff-work-service.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, post, validBody } from '../helpers/register-app.js';

// I9 part 1, the account's own deletion against the real database (CI `db` job, as app_server): FR-SET-002, BR-073, PG-050, ERR-026,
// AC-108, decisions-in-force §16.4 (the Admin's counter and red bar). The policies, the guard and the execution are pgTAP's (file 110);
// here the services run in the identity transaction exactly as the routes call them. Each test leaves its accounts active again,
// except the one whose deletion it executes.

const T = { timeout: COLD_START_MS };
const DAY = 24 * 60 * 60 * 1000;

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let parent = '';
let owner = '';
let gone = '';
let admin = '';
let moderator = '';
/** A password sign-in five seconds ago (VAL-052). */
const fresh = (): number => Math.floor(Date.now() / 1000) - 5;

const url = (): string => {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
};
const text = async (query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> => String((await query)[0]?.v);
const id = (who: string) => ({ userId: who });

/** One fixture call inside a transaction that commits (the fixtures refuse to run as a statement of their own). */
async function fixture(call: (tx: postgres.TransactionSql) => PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> {
  let out = '';
  await side.begin(async (tx) => {
    await tx`select 1`;
    out = await text(call(tx));
  });
  return out;
}

async function counts(): Promise<{ pending: number; overdue: number }> {
  const overview = await readAdminOverview(database, id(admin));
  if (overview.kind !== 'ok') throw new Error('the Admin overview did not load');
  return overview.overview.accountDeletions;
}

beforeAll(async () => {
  key = await newKey('account-deletion-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  const env = { SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() };
  const app: App = await buildRegisterApp(env, { database, clock: () => new Date() });
  const made: string[] = [];
  for (const fullName of ['Noa Leaving', 'Tal Owner', 'Gil Gone']) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, `Bearer ${await token({ key, sub: userId })}`, validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  [parent = '', owner = '', gone = ''] = made;
  await app.close();
  admin = await text(side`select tests.fx_fr_id('fr_d')::text as v`);
  moderator = await text(side`select tests.fx_sf_id('sf_m1')::text as v`);
}, COLD_START_MS * 3);

afterAll(async () => {
  await database.close();
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

describe('[I9 FR-SET-002 PG-050 AC-108] request and cancel', () => {
  it('[FR-SET-002 AC-108] a fresh request schedules the deletion 30 days ahead; the account is held at PG-050; cancel restores it', T, async () => {
    const before = await counts();
    expect(await readDeletionStatus(database, id(parent))).toEqual({ status: 'none' });
    expect(await requestDeletion(database, id(parent), null, new Date())).toEqual({ kind: 'reauth_required' });

    const result = await requestDeletion(database, id(parent), fresh(), new Date());
    expect(result.kind).toBe('scheduled');
    const dueAt = result.kind === 'scheduled' && result.status.status === 'scheduled' ? result.status.dueAt : '';
    expect(Math.abs(Date.parse(dueAt) - (Date.now() + 30 * DAY))).toBeLessThan(60_000);
    expect(await readDeletionStatus(database, id(parent))).toEqual({ status: 'scheduled', dueAt });
    // FR-AUTH-002: the state the web reads at sign-in, page load and refresh
    expect(await readAccountState(database, id(parent))).toEqual({ state: 'deletion_scheduled' });
    // a second request while scheduled changes nothing
    expect(await requestDeletion(database, id(parent), fresh(), new Date())).toEqual({ kind: 'not_allowed' });
    // §16.4: the Admin's counter
    expect(await counts()).toEqual({ pending: before.pending + 1, overdue: before.overdue });

    expect(await cancelDeletion(database, id(parent))).toEqual({ kind: 'cancelled' });
    expect(await readAccountState(database, id(parent))).toMatchObject({ state: 'active' });
    expect(await readDeletionStatus(database, id(parent))).toEqual({ status: 'none' });
    expect(await cancelDeletion(database, id(parent))).toEqual({ kind: 'not_scheduled' });
    expect(await counts()).toEqual(before);
  });

  it('[ERR-026 AC-177] a Group Owner is refused until the Group is no longer theirs', T, async () => {
    const insertGroup = "insert into nestly.groups (name, privacy) values ('I9 owner group', 'public')";
    expect(await fixture((tx) => tx`select tests.dml_as('authenticated', tests.claims(${owner}::uuid), ${insertGroup}) as v`)).toBe('OK:1');
    expect(await requestDeletion(database, id(owner), fresh(), new Date())).toEqual({ kind: 'group_owner' });
    expect(await readAccountState(database, id(owner))).toMatchObject({ state: 'active' });
    const closeGroup = `update nestly.groups set status = 'deleted', deleted_at = now(), deleted_xact = pg_current_xact_id() where created_by = '${owner}'`;
    expect(await fixture((tx) => tx`select tests.fx_dl_exec(${closeGroup}) as v`)).toBe('OK:1');
    expect((await requestDeletion(database, id(owner), fresh(), new Date())).kind).toBe('scheduled');
    expect(await cancelDeletion(database, id(owner))).toEqual({ kind: 'cancelled' });
  });

  it('[FR-SET-002 AC-183] a staff account cannot schedule its own deletion', T, async () => {
    expect(await requestDeletion(database, id(admin), fresh(), new Date())).toEqual({ kind: 'not_allowed' });
    expect(await requestDeletion(database, id(moderator), fresh(), new Date())).toEqual({ kind: 'not_allowed' });
  });
});

describe('[I9 §16.4 BR-073] the Admin sees an overdue deletion; an executed account is told it was deleted', () => {
  it('[§16.4 AC-184] past its date the deletion is overdue and cannot be cancelled; executed, the identity reads `deleted`', T, async () => {
    const before = await counts();
    expect((await requestDeletion(database, id(gone), fresh(), new Date())).kind).toBe('scheduled');
    await fixture((tx) => tx`select tests.fx_dl_due(${gone}::uuid, interval '31 days')::text as v`);
    expect(await counts()).toEqual({ pending: before.pending + 1, overdue: before.overdue + 1 });
    expect(await cancelDeletion(database, id(gone))).toEqual({ kind: 'not_scheduled' });
    // the counter is the Admin's alone: a Moderator has no Admin home
    expect((await readAdminOverview(database, id(moderator))).kind).toBe('forbidden');

    const run = await fixture((tx) => tx`select tests.jobs_as('select nestly.execute_account_deletions()::text') as v`);
    expect(run).toMatch(/^\(?[1-9]\d*,0,0\)?$/);
    expect(await readAccountState(database, id(gone))).toEqual({ state: 'deleted' });
    expect(await readDeletionStatus(database, id(gone))).toBeUndefined();
    expect(await counts()).toEqual(before);
    // an Auth user that never had an account is still sent to registration
    const newcomer = await text(side`select tests.fx_new_auth_user()::text as v`);
    expect(await readAccountState(database, id(newcomer))).toEqual({ state: 'unregistered' });
  });
});
