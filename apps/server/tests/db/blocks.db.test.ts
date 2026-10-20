import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { blockedListResponse } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { blockUser } from '../../src/services/blocks-service.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';
import { deleteBlock, getBlocks, putBlock } from '../helpers/blocks-api.js';
import { open } from '../helpers/profile-view-api.js';
import { getPost } from '../helpers/posts-api.js';

// Blocking a user (FR-REL-002) through the API against the real database (CI `db` job, as app_server): block and unblock, the blocked list,
// the profile and posts hidden both ways, the Friendship ended, and the refusals. The policies themselves are pgTAP's (file 91).

const T = { timeout: COLD_START_MS };
const NOBODY = '99999999-9999-4999-8999-999999999999';

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let app: App;
let blocker = '';
let blocked = '';
let third = '';
let staff = '';

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
}
const bearer = async (sub: string): Promise<string> => `Bearer ${await token({ key, sub })}`;
const text = async (query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> => String((await query)[0]?.v);
async function inTx(work: (tx: postgres.TransactionSql) => Promise<void>): Promise<void> {
  await side.begin(async (tx) => {
    await tx`select 1`;
    await work(tx);
  });
}
async function seedPost(by: string): Promise<string> {
  let id = '';
  await inTx(async (tx) => {
    id = await text(tx`select tests.fx_po_add(${by}::uuid, 'everyone', false, 'active', 'post body', null, null)::text as v`);
  });
  return id;
}
const befriend = (a: string, b: string): Promise<void> => inTx(async (tx) => void (await tx`select tests.fx_fr_add(${a}::uuid, ${b}::uuid, 'accepted', false)`));
const friendRows = (a: string, b: string): Promise<string> => text(side`select tests.fx_fr_rows(${a}::uuid, ${b}::uuid) as v`);

beforeAll(async () => {
  key = await newKey('blocks-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  app = await buildRegisterApp(
    { SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() },
    { database, clock: () => CLOCK_NOW },
  );
  const made: string[] = [];
  for (const fullName of ['Bela Blocker', 'Dana Blocked', 'Tom Third']) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, await bearer(userId), validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  [blocker = '', blocked = '', third = ''] = made;
  staff = await text(side`select tests.fx_fr_id('fr_m')::text as v`);
}, COLD_START_MS * 3);

async function reset(): Promise<void> {
  for (const who of [blocker, blocked, third]) {
    await deleteBlock(app, await bearer(who), blocker);
    await deleteBlock(app, await bearer(who), blocked);
    await side`select tests.fx_fr_purge(${who}::uuid)`.catch(() => undefined);
  }
}
beforeEach(reset);
afterAll(async () => {
  await reset();
  await app.close();
  await database.close();
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

describe('[FR-REL-002] blocking a user', () => {
  it('a block is 204 (a repeat too); the blocker lists the account with its name; the blocked account lists nothing', T, async () => {
    expect((await putBlock(app, await bearer(blocker), blocked)).statusCode).toBe(204);
    expect((await putBlock(app, await bearer(blocker), blocked)).statusCode).toBe(204);
    const mine = blockedListResponse.parse(JSON.parse((await getBlocks(app, await bearer(blocker))).body));
    expect(mine.blocked.map((b) => [b.userId, b.fullName])).toEqual([[blocked, 'Dana Blocked']]);
    const theirs = blockedListResponse.parse(JSON.parse((await getBlocks(app, await bearer(blocked))).body));
    expect(theirs.blocked).toEqual([]);
  });

  it('the profile does not open and the posts are hidden, both ways; a third account still sees both', T, async () => {
    const postOfBlocked = await seedPost(blocked);
    const postOfBlocker = await seedPost(blocker);
    await putBlock(app, await bearer(blocker), blocked);
    expect((await open(app, await bearer(blocker), blocked)).statusCode).toBe(404);
    expect((await open(app, await bearer(blocked), blocker)).statusCode).toBe(404);
    expect((await getPost(app, await bearer(blocker), postOfBlocked)).statusCode).toBe(404);
    expect((await getPost(app, await bearer(blocked), postOfBlocker)).statusCode).toBe(404);
    expect((await open(app, await bearer(third), blocked)).statusCode).toBe(200);
    expect((await getPost(app, await bearer(third), postOfBlocked)).statusCode).toBe(200);
  });

  it('a block ends the Friendship', T, async () => {
    await befriend(blocker, blocked);
    await putBlock(app, await bearer(blocked), blocker);
    expect(await friendRows(blocker, blocked)).toBe('a>b:removed');
  });

  it('unblocking is 204 (also with no block) and everything opens again; only the blocker lifts a block', T, async () => {
    await putBlock(app, await bearer(blocker), blocked);
    expect((await deleteBlock(app, await bearer(blocked), blocker)).statusCode).toBe(204); // the blocked account's delete touches nothing
    expect((await open(app, await bearer(blocked), blocker)).statusCode).toBe(404);
    expect((await deleteBlock(app, await bearer(blocker), blocked)).statusCode).toBe(204);
    expect((await open(app, await bearer(blocked), blocker)).statusCode).toBe(200);
    expect((await deleteBlock(app, await bearer(blocker), blocked)).statusCode).toBe(204);
  });

  it("refusals: one's own id and a bad id are 400, an unknown account 404, a staff account may not block", T, async () => {
    expect(JSON.parse((await putBlock(app, await bearer(blocker), blocker)).body)).toEqual({ error: 'invalid' });
    expect((await putBlock(app, await bearer(blocker), 'not-a-uuid')).statusCode).toBe(400);
    const unknown = await putBlock(app, await bearer(blocker), NOBODY);
    expect([unknown.statusCode, JSON.parse(unknown.body)]).toEqual([404, { error: 'user_unavailable' }]);
    expect(await blockUser(database, { userId: staff }, blocked)).toEqual({ kind: 'not_allowed' }); // the route answers 403 not_allowed
    expect((await putBlock(app, null, blocked)).statusCode).toBe(401);
  });
});
