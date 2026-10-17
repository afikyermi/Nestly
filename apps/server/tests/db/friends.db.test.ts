import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { ACCOUNT_A, ACCOUNT_B, AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { holdingAfterWork } from '../helpers/hold-transaction.js';
import { CLOCK_NOW, EMPTY_DATE, buildRegisterApp, child, jsonOf, parts, post, validBody } from '../helpers/register-app.js';
import { ACTIONS, act, getLists, idsOf, parseLists, send, sendTo, type Action, type Lists } from '../helpers/friends-api.js';

// I2 F2.4a, the friendship API against the real database (CI `db` job, as app_server, fixtures of supabase/tests/setup/):
//   A, B: active Regulars ('Alice Aaron', 'Bella Baruch'), never Friends   S suspended, X banned (Regulars)   P Professional
//   M Moderator, D Admin (60_friend_fixtures.sql)   C: a fresh registered Regular per test that needs one
// Spec criteria (.work/friends/spec.md): c1 send · c2 refused targets · c3 duplicates · c4 races · c5 accept · c6 decline · c7 cancel
// · c8 remove · c9 transitions · c10 stopped accounts and actors · c11 the lists · c12 strict input. Derived from spec.md and
// schema.md F2.4a ("Server", DR-3, DR-7) only. The URLs and list keys are the assumptions listed in helpers/friends-api.ts.
// What the database refuses on its own (policies, grants, the transition trigger) is asserted once, in
// supabase/tests/61_friendships_actions.sql; here the same rules are seen through the status codes.
// A and B's friendship rows are removed before and after every test (tests.fx_fr_purge); fresh users' rows stay (nobody reads them).

const T = { timeout: COLD_START_MS };
const S = '50000000-0000-4000-8000-000000000051';
const X = 'e0000000-0000-4000-8000-0000000000e5';
const P = 'd0000000-0000-4000-8000-0000000000d4';
const M = '60000000-0000-4000-8000-0000000000a1';
const D = '60000000-0000-4000-8000-0000000000a2';
const NOBODY = '99999999-9999-4999-8999-999999999999';
const NAME_A = 'Alice Aaron';
const NAME_B = 'Bella Baruch';

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
const toClose: Array<{ app: App; database: Database }> = [];

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
}
const env = () => ({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() });

/** One app on its own Database: a Database holds one connection, so two apps are two real connections. */
async function start(database: Database = createDatabase(url())): Promise<App> {
  const app = await buildRegisterApp(env(), { database, clock: () => CLOCK_NOW });
  toClose.push({ app, database });
  return app;
}
async function closeAll(): Promise<void> {
  for (const { app, database } of toClose.splice(0)) {
    await app.close();
    await database.close();
  }
}

const bearerFor = async (sub: string): Promise<string> => `Bearer ${await token({ key, sub })}`;
async function one(query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> {
  const rows = await query;
  return String(rows[0]?.v);
}
/** The rows between two people as the fixtures show them: 'a>b:pending ; b>a:declined+c' (direction relative to x and y). */
const rows = (x: string, y: string) => one(side`select tests.fx_fr_rows(${x}::uuid, ${y}::uuid) as v`);
const frState = () => one(side`select tests.fx_fr_state() as v`);
const frCount = async (): Promise<number> => Number(await one(side`select tests.fx_fr_count() as v`));
const setStatus = async (who: string, status: 'active' | 'suspended' | 'banned'): Promise<void> => {
  await side`select tests.set_status(${who}::uuid, ${status})`;
};
const purgeAB = async (): Promise<void> => {
  await side`select tests.fx_fr_purge(${ACCOUNT_A}::uuid)`;
  await side`select tests.fx_fr_purge(${ACCOUNT_B}::uuid)`;
};
async function freshUser(): Promise<string> {
  const [row] = await side`select tests.fx_new_auth_user()::text as id`;
  const id: unknown = row?.id;
  if (typeof id !== 'string') throw new Error('tests.fx_new_auth_user returned no id: is 20_registration_fixtures.sql loaded?');
  return id;
}
/** A fresh, registered, active Regular named `fullName`. */
async function registered(app: App, fullName: string): Promise<{ id: string; header: string }> {
  const id = await freshUser();
  const header = await bearerFor(id);
  const res = await post(app, header, validBody({ fullName, stages: ['has_child'], dueDate: EMPTY_DATE, children: [child({ name: 'ילד', sex: 'boy', birthDate: parts('2020-01-01') })] }));
  if (res.statusCode !== 201) throw new Error(`could not register a fresh user: ${res.statusCode} ${res.body}`);
  return { id, header };
}

const is2xx = (status: number): boolean => status >= 200 && status < 300;
async function listsOf(app: App, header: string): Promise<Lists> {
  const res = await getLists(app, header);
  expect(res.statusCode, res.body).toBe(200);
  return parseLists(res.body);
}
const errorOf = (body: string): unknown => jsonOf(body).error;

let hA: string;
let hB: string;

beforeAll(async () => {
  key = await newKey('friends-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  hA = await bearerFor(ACCOUNT_A);
  hB = await bearerFor(ACCOUNT_B);
}, COLD_START_MS);

beforeEach(async () => {
  await setStatus(ACCOUNT_A, 'active');
  await setStatus(ACCOUNT_B, 'active');
  await purgeAB();
});

afterEach(async () => {
  await closeAll();
  await setStatus(ACCOUNT_A, 'active');
  await setStatus(ACCOUNT_B, 'active');
  await purgeAB();
});

afterAll(async () => {
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4a c1 FR-REL-001 VAL-017] A sends B a request', () => {
  it('[F2.4a c1] 201; one pending row A->B; in A\'s sent list and B\'s incoming list, with the other\'s name; not in C\'s lists', T, async () => {
    const app = await start();
    const c = await registered(app, 'Carmel Shani');
    const res = await sendTo(app, hA, ACCOUNT_B);
    expect(res.statusCode, res.body).toBe(201);
    expect(await rows(ACCOUNT_A, ACCOUNT_B)).toBe('a>b:pending');
    const a = await listsOf(app, hA);
    const b = await listsOf(app, hB);
    expect(a.sent.map((e) => [e.userId, e.fullName])).toEqual([[ACCOUNT_B, NAME_B]]);
    expect(b.incoming.map((e) => [e.userId, e.fullName])).toEqual([[ACCOUNT_A, NAME_A]]);
    expect([a.incoming.length, a.friends.length, b.sent.length, b.friends.length]).toEqual([0, 0, 0, 0]);
    const other = await listsOf(app, c.header);
    expect([other.incoming.length, other.sent.length, other.friends.length]).toEqual([0, 0, 0]);
  });

  it('[F2.4a c1] the requester comes from the token, never from the body: the row is A\'s whatever the caller is', T, async () => {
    const app = await start();
    expect((await sendTo(app, hB, ACCOUNT_A)).statusCode).toBe(201);
    expect(await rows(ACCOUNT_B, ACCOUNT_A)).toBe('a>b:pending');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4a c2 AC-034 BR-029 ERR-016 DR-5] refused targets', () => {
  it('[F2.4a c2] P, M, D, a random uuid, S (suspended), X (banned) -> 404 {error:"unavailable"}, the same body for all six, no row', T, async () => {
    const app = await start();
    const before = await frState();
    const bodies: string[] = [];
    for (const target of [P, M, D, NOBODY, S, X]) {
      const res = await sendTo(app, hA, target);
      expect(res.statusCode, `target ${target}: ${res.body}`).toBe(404);
      expect(errorOf(res.body)).toBe('unavailable');
      bodies.push(res.body);
    }
    expect(new Set(bodies).size, `the six answers differ: ${bodies.join(' | ')}`).toBe(1);
    expect(await frState()).toBe(before);
  });

  it.each(['suspended', 'banned'] as const)('[F2.4a c2] B becomes %s: A\'s send -> the same 404 body as for a random uuid, no row', T, async (status) => {
    const app = await start();
    const random = await sendTo(app, hA, NOBODY);
    await setStatus(ACCOUNT_B, status);
    const res = await sendTo(app, hA, ACCOUNT_B);
    expect(res.statusCode, res.body).toBe(404);
    expect(res.body).toBe(random.body);
    expect(await frCount()).toBe(0);
  });

  it('[F2.4a c2] A to A -> 400 {error:"invalid"}, no row', T, async () => {
    const app = await start();
    const res = await sendTo(app, hA, ACCOUNT_A);
    expect(res.statusCode, res.body).toBe(400);
    expect(errorOf(res.body)).toBe('invalid');
    expect(await frCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4a c3 VAL-017 FR-REL-001 DR-3 DR-7] duplicates', () => {
  it('[F2.4a c3] A->B pending, A sends again -> 409 request_exists, one row', T, async () => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    const res = await sendTo(app, hA, ACCOUNT_B);
    expect(res.statusCode, res.body).toBe(409);
    expect(errorOf(res.body)).toBe('request_exists');
    expect(await rows(ACCOUNT_A, ACCOUNT_B)).toBe('a>b:pending');
  });

  it('[F2.4a c3] A and B Friends, either sends -> 409 already_friends, still one row', T, async () => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    expect(is2xx((await act(app, hB, 'accept', ACCOUNT_A)).statusCode)).toBe(true);
    for (const [header, target] of [[hA, ACCOUNT_B], [hB, ACCOUNT_A]] as const) {
      const res = await sendTo(app, header, target);
      expect(res.statusCode, res.body).toBe(409);
      expect(errorOf(res.body)).toBe('already_friends');
    }
    expect(await rows(ACCOUNT_A, ACCOUNT_B)).toBe('a>b:accepted');
  });

  it('[F2.4a c3] B->A while A->B is pending -> 409 incoming_pending, no second row, no Friendship', T, async () => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    const res = await sendTo(app, hB, ACCOUNT_A);
    expect(res.statusCode, res.body).toBe(409);
    expect(errorOf(res.body)).toBe('incoming_pending');
    expect(await rows(ACCOUNT_A, ACCOUNT_B)).toBe('a>b:pending');
    expect((await listsOf(app, hA)).friends).toHaveLength(0);
  });

  it('[F2.4a c3 c6 DR-3 DR-7] A->B declined: A sends again -> 409 request_exists; B sends to A -> 409 incoming_pending and B can then accept it', T, async () => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    expect(is2xx((await act(app, hB, 'decline', ACCOUNT_A)).statusCode)).toBe(true);
    const again = await sendTo(app, hA, ACCOUNT_B);
    expect(again.statusCode, again.body).toBe(409);
    expect(errorOf(again.body)).toBe('request_exists');
    const reverse = await sendTo(app, hB, ACCOUNT_A);
    expect(reverse.statusCode, reverse.body).toBe(409);
    expect(errorOf(reverse.body)).toBe('incoming_pending');
    expect(await rows(ACCOUNT_A, ACCOUNT_B)).toBe('a>b:pending');
    expect(is2xx((await act(app, hB, 'accept', ACCOUNT_A)).statusCode)).toBe(true);
    expect(idsOf((await listsOf(app, hA)).friends)).toEqual([ACCOUNT_B]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4a c4 VAL-017] concurrent sends end with exactly one pending row', () => {
  const PAIRS: Array<[string, 'AB-BA' | 'AB-AB']> = [['A->B with B->A', 'AB-BA'], ['A->B with A->B', 'AB-AB']];

  it.each(PAIRS)('[F2.4a c4] %s, 20 runs on two connections: one 201 and one 409 each time, one pending row, no Friendship', { timeout: COLD_START_MS * 4 }, async (_label, kind) => {
    const [one1, two] = [await start(), await start()];
    for (let run = 1; run <= 20; run += 1) {
      await purgeAB();
      const first = sendTo(one1, hA, ACCOUNT_B);
      const second = kind === 'AB-BA' ? sendTo(two, hB, ACCOUNT_A) : sendTo(two, hA, ACCOUNT_B);
      const [r1, r2] = await Promise.all([first, second]);
      expect([r1.statusCode, r2.statusCode].sort(), `run ${run}: ${r1.body} | ${r2.body}`).toEqual([201, 409]);
      const state = await rows(ACCOUNT_A, ACCOUNT_B);
      expect(['a>b:pending', 'b>a:pending'], `run ${run}: ${state}`).toContain(state);
    }
  });

  it.each(PAIRS)('[F2.4a c4] %s, the first transaction held open after its insert, 20 runs: the second waits, then gets 409; one pending row', { timeout: COLD_START_MS * 4 }, async (_label, kind) => {
    for (let run = 1; run <= 20; run += 1) {
      await purgeAB();
      const holder = holdingAfterWork(createDatabase(url()));
      const first = await start(holder.database);
      const second = await start();
      holder.arm();
      const p1 = sendTo(first, hA, ACCOUNT_B);
      const reachedOrDone = await Promise.race([holder.reached.then(() => 'held'), p1.then(() => 'done')]);
      expect(reachedOrDone, `run ${run}: the first send never opened a transaction to hold`).toBe('held');
      const p2 = kind === 'AB-BA' ? sendTo(second, hB, ACCOUNT_A) : sendTo(second, hA, ACCOUNT_B);
      await new Promise((resolve) => setTimeout(resolve, 150));
      holder.release();
      const [r1, r2] = await Promise.all([p1, p2]);
      expect([r1.statusCode, r2.statusCode].sort(), `run ${run}: ${r1.body} | ${r2.body}`).toEqual([201, 409]);
      expect(await rows(ACCOUNT_A, ACCOUNT_B), `run ${run}`).toBe('a>b:pending');
      await closeAll();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4a c5 FR-REL-001 AC-034] accept', () => {
  it('[F2.4a c5] B accepts: A and B are each in the other\'s Friends list, the request has left both request lists', T, async () => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    const res = await act(app, hB, 'accept', ACCOUNT_A);
    expect(is2xx(res.statusCode), res.body).toBe(true);
    expect(await rows(ACCOUNT_A, ACCOUNT_B)).toBe('a>b:accepted');
    const a = await listsOf(app, hA);
    const b = await listsOf(app, hB);
    expect(a.friends.map((e) => [e.userId, e.fullName])).toEqual([[ACCOUNT_B, NAME_B]]);
    expect(b.friends.map((e) => [e.userId, e.fullName])).toEqual([[ACCOUNT_A, NAME_A]]);
    expect([a.incoming.length, a.sent.length, b.incoming.length, b.sent.length]).toEqual([0, 0, 0, 0]);
  });

  it('[F2.4a c5] A (the requester) and C (a stranger) accepting -> 404 {error:"unavailable"}, nothing changes', T, async () => {
    const app = await start();
    const c = await registered(app, 'Carmel Shani');
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    const before = await frState();
    const byA = await act(app, hA, 'accept', ACCOUNT_B);
    const byC = await act(app, c.header, 'accept', ACCOUNT_A);
    for (const res of [byA, byC]) {
      expect(res.statusCode, res.body).toBe(404);
      expect(errorOf(res.body)).toBe('unavailable');
    }
    expect(await frState()).toBe(before);
    expect(await rows(ACCOUNT_A, ACCOUNT_B)).toBe('a>b:pending');
  });

  it('[F2.4a c5] accepting a request nobody sent (a random uuid) -> 404 {error:"unavailable"}', T, async () => {
    const app = await start();
    const res = await act(app, hB, 'accept', NOBODY);
    expect(res.statusCode, res.body).toBe(404);
    expect(errorOf(res.body)).toBe('unavailable');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4a c6 FR-REL-001 DR-3] decline', () => {
  it('[F2.4a c6 DR-3] B declines: no Friendship, it leaves B\'s incoming list; A\'s side stays silent (still in A\'s sent list, no status shown)', T, async () => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    const res = await act(app, hB, 'decline', ACCOUNT_A);
    expect(is2xx(res.statusCode), res.body).toBe(true);
    expect(await rows(ACCOUNT_A, ACCOUNT_B)).toBe('a>b:declined');
    const a = await listsOf(app, hA);
    const b = await listsOf(app, hB);
    expect(b.incoming).toHaveLength(0);
    expect([a.friends.length, b.friends.length]).toEqual([0, 0]);
    expect(a.sent.map((e) => e.userId)).toEqual([ACCOUNT_B]);
    expect(a.sent[0]?.keys).toEqual(['fullName', 'requestedAt', 'userId']);
  });

  it('[F2.4a c6] A and C declining -> 404 {error:"unavailable"}, nothing changes', T, async () => {
    const app = await start();
    const c = await registered(app, 'Carmel Shani');
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    const before = await frState();
    for (const res of [await act(app, hA, 'decline', ACCOUNT_B), await act(app, c.header, 'decline', ACCOUNT_A)]) {
      expect(res.statusCode, res.body).toBe(404);
      expect(errorOf(res.body)).toBe('unavailable');
    }
    expect(await frState()).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4a c7 DR-4] cancel', () => {
  it('[F2.4a c7] A cancels its pending request: it leaves both lists; A may send it again', T, async () => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    const res = await act(app, hA, 'cancel', ACCOUNT_B);
    expect(is2xx(res.statusCode), res.body).toBe(true);
    const a = await listsOf(app, hA);
    const b = await listsOf(app, hB);
    expect([a.sent.length, a.incoming.length, b.incoming.length, b.sent.length, a.friends.length, b.friends.length]).toEqual([0, 0, 0, 0, 0, 0]);
    const again = await sendTo(app, hA, ACCOUNT_B);
    expect(again.statusCode, again.body).toBe(201);
    expect(idsOf((await listsOf(app, hB)).incoming)).toEqual([ACCOUNT_A]);
  });

  it('[F2.4a c7] B (the addressee) and C cancelling -> 404 {error:"unavailable"}, the request stays', T, async () => {
    const app = await start();
    const c = await registered(app, 'Carmel Shani');
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    const before = await frState();
    for (const res of [await act(app, hB, 'cancel', ACCOUNT_A), await act(app, c.header, 'cancel', ACCOUNT_B), await act(app, c.header, 'cancel', ACCOUNT_A)]) {
      expect(res.statusCode, res.body).toBe(404);
      expect(errorOf(res.body)).toBe('unavailable');
    }
    expect(await frState()).toBe(before);
    expect(idsOf((await listsOf(app, hB)).incoming)).toEqual([ACCOUNT_A]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4a c8 FR-REL-001] remove', () => {
  async function friends(app: App): Promise<void> {
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    expect(is2xx((await act(app, hB, 'accept', ACCOUNT_A)).statusCode)).toBe(true);
  }

  it.each([['A', 'a'], ['B', 'b']] as const)('[F2.4a c8] %s removes the Friendship: on the next read neither Friends list holds the other; either may send a new request', T, async (_who, remover) => {
    const app = await start();
    await friends(app);
    const res = remover === 'a' ? await act(app, hA, 'remove', ACCOUNT_B) : await act(app, hB, 'remove', ACCOUNT_A);
    expect(is2xx(res.statusCode), res.body).toBe(true);
    expect((await listsOf(app, hA)).friends).toHaveLength(0);
    expect((await listsOf(app, hB)).friends).toHaveLength(0);
    const newer = remover === 'a' ? await sendTo(app, hB, ACCOUNT_A) : await sendTo(app, hA, ACCOUNT_B);
    expect(newer.statusCode, newer.body).toBe(201);
  });

  it('[F2.4a c8] C removing A and B\'s Friendship -> 404 {error:"unavailable"}, they stay Friends', T, async () => {
    const app = await start();
    const c = await registered(app, 'Carmel Shani');
    await friends(app);
    const before = await frState();
    for (const res of [await act(app, c.header, 'remove', ACCOUNT_A), await act(app, c.header, 'remove', ACCOUNT_B)]) {
      expect(res.statusCode, res.body).toBe(404);
      expect(errorOf(res.body)).toBe('unavailable');
    }
    expect(await frState()).toBe(before);
    expect(idsOf((await listsOf(app, hA)).friends)).toEqual([ACCOUNT_B]);
  });

  it('[F2.4a c8] removing a person who is not a Friend (a random uuid) -> 404 {error:"unavailable"}', T, async () => {
    const app = await start();
    const res = await act(app, hA, 'remove', NOBODY);
    expect(res.statusCode, res.body).toBe(404);
    expect(errorOf(res.body)).toBe('unavailable');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4a c9 rule 11] transitions', () => {
  it('[F2.4a c9] a request that is no longer pending: accept / decline / cancel -> 409 request_gone, no change', T, async () => {
    const app = await start();
    // declined: B's accept and decline again
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    expect(is2xx((await act(app, hB, 'decline', ACCOUNT_A)).statusCode)).toBe(true);
    let before = await frState();
    for (const res of [await act(app, hB, 'accept', ACCOUNT_A), await act(app, hB, 'decline', ACCOUNT_A)]) {
      expect(res.statusCode, res.body).toBe(409);
      expect(errorOf(res.body)).toBe('request_gone');
    }
    expect(await frState()).toBe(before);
    // cancelled: B's accept and decline
    await purgeAB();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    expect(is2xx((await act(app, hA, 'cancel', ACCOUNT_B)).statusCode)).toBe(true);
    before = await frState();
    for (const res of [await act(app, hB, 'accept', ACCOUNT_A), await act(app, hB, 'decline', ACCOUNT_A), await act(app, hA, 'cancel', ACCOUNT_B)]) {
      expect(res.statusCode, res.body).toBe(409);
      expect(errorOf(res.body)).toBe('request_gone');
    }
    expect(await frState()).toBe(before);
    // accepted: B's decline, A's cancel
    await purgeAB();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    expect(is2xx((await act(app, hB, 'accept', ACCOUNT_A)).statusCode)).toBe(true);
    before = await frState();
    for (const res of [await act(app, hB, 'decline', ACCOUNT_A), await act(app, hA, 'cancel', ACCOUNT_B), await act(app, hB, 'accept', ACCOUNT_A)]) {
      expect(res.statusCode, res.body).toBe(409);
      expect(errorOf(res.body)).toBe('request_gone');
    }
    expect(await frState()).toBe(before);
    expect(await rows(ACCOUNT_A, ACCOUNT_B)).toBe('a>b:accepted');
  });

  it('[F2.4a c9] a second remove -> 409, nothing changes', T, async () => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    expect(is2xx((await act(app, hB, 'accept', ACCOUNT_A)).statusCode)).toBe(true);
    expect(is2xx((await act(app, hA, 'remove', ACCOUNT_B)).statusCode)).toBe(true);
    const before = await frState();
    for (const res of [await act(app, hA, 'remove', ACCOUNT_B), await act(app, hB, 'remove', ACCOUNT_A)]) {
      expect(res.statusCode, res.body).toBe(409);
    }
    expect(await frState()).toBe(before);
  });

  it('[F2.4a c9] accept (B) and cancel (A) sent concurrently, 20 runs: one succeeds, the other is 409, and the row shows only the one that won', { timeout: COLD_START_MS * 4 }, async () => {
    const [appA, appB] = [await start(), await start()];
    for (let run = 1; run <= 20; run += 1) {
      await purgeAB();
      expect((await sendTo(appA, hA, ACCOUNT_B)).statusCode).toBe(201);
      const [accept, cancel] = await Promise.all([act(appB, hB, 'accept', ACCOUNT_A), act(appA, hA, 'cancel', ACCOUNT_B)]);
      const statuses = [accept.statusCode, cancel.statusCode];
      const state = await rows(ACCOUNT_A, ACCOUNT_B);
      expect(statuses.filter(is2xx), `run ${run}: ${accept.body} | ${cancel.body} | ${state}`).toHaveLength(1);
      expect(statuses.filter((s) => s === 409), `run ${run}: ${accept.body} | ${cancel.body}`).toHaveLength(1);
      expect(state, `run ${run}`).toBe(is2xx(accept.statusCode) ? 'a>b:accepted' : 'a>b:pending+c');
    }
  });

  it.each([['accept first', true], ['cancel first', false]] as const)('[F2.4a c9] accept and cancel with the first transaction held open (%s): exactly one takes effect', { timeout: COLD_START_MS * 4 }, async (_label, acceptFirst) => {
    for (let run = 1; run <= 10; run += 1) {
      await purgeAB();
      const setup = await start();
      expect((await sendTo(setup, hA, ACCOUNT_B)).statusCode).toBe(201);
      const holder = holdingAfterWork(createDatabase(url()));
      const first = await start(holder.database);
      const second = await start();
      holder.arm();
      const p1 = acceptFirst ? act(first, hB, 'accept', ACCOUNT_A) : act(first, hA, 'cancel', ACCOUNT_B);
      const reachedOrDone = await Promise.race([holder.reached.then(() => 'held'), p1.then(() => 'done')]);
      expect(reachedOrDone, `run ${run}: the first call never opened a transaction to hold`).toBe('held');
      const p2 = acceptFirst ? act(second, hA, 'cancel', ACCOUNT_B) : act(second, hB, 'accept', ACCOUNT_A);
      await new Promise((resolve) => setTimeout(resolve, 150));
      holder.release();
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(is2xx(r1.statusCode), `run ${run}: first ${r1.body}`).toBe(true);
      expect(r2.statusCode, `run ${run}: second ${r2.body}`).toBe(409);
      expect(await rows(ACCOUNT_A, ACCOUNT_B), `run ${run}`).toBe(acceptFirst ? 'a>b:accepted' : 'a>b:pending+c');
      await closeAll();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4a c10 A9 rule 15 ERR-022 BR-034 A7 DR-5] stopped accounts and the wrong kind of account', () => {
  const callAll = async (app: App, header: string, target: string): Promise<Array<[string, number, string]>> => {
    const out: Array<[string, number, string]> = [];
    const sent = await sendTo(app, header, target);
    out.push(['send', sent.statusCode, sent.body]);
    for (const action of ACTIONS) {
      const res = await act(app, header, action, target);
      out.push([action, res.statusCode, res.body]);
    }
    const lists = await getLists(app, header);
    out.push(['lists', lists.statusCode, lists.body]);
    return out;
  };

  it.each([['S (suspended)', S], ['X (banned)', X]] as const)('[F2.4a c10] %s: every action and the lists -> 403 account_unavailable, no row', T, async (_label, id) => {
    const app = await start();
    expect((await sendTo(app, hB, ACCOUNT_A)).statusCode).toBe(201);
    const before = await frState();
    for (const [name, status, body] of await callAll(app, await bearerFor(id), ACCOUNT_A)) {
      expect(status, `${name}: ${body}`).toBe(403);
      expect(errorOf(body), name).toBe('account_unavailable');
    }
    expect(await frState()).toBe(before);
  });

  it.each(['suspended', 'banned'] as const)('[F2.4a c10 DR-5] A becomes %s: every action -> 403, the kept request changes nothing; active again, it can be accepted', T, async (status) => {
    const app = await start();
    expect((await sendTo(app, hB, ACCOUNT_A)).statusCode).toBe(201);
    const before = await frState();
    await setStatus(ACCOUNT_A, status);
    for (const [name, code, body] of await callAll(app, hA, ACCOUNT_B)) {
      expect(code, `${name}: ${body}`).toBe(403);
      expect(errorOf(body), name).toBe('account_unavailable');
    }
    expect(await frState()).toBe(before);
    await setStatus(ACCOUNT_A, 'active');
    expect(is2xx((await act(app, hA, 'accept', ACCOUNT_B)).statusCode)).toBe(true);
    expect(idsOf((await listsOf(app, hA)).friends)).toEqual([ACCOUNT_B]);
  });

  it('[F2.4a c10 DR-5] a pending request whose requester is not active: in neither list, cannot be accepted; back, with the row kept, on reactivation', T, async () => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    await setStatus(ACCOUNT_A, 'suspended');
    expect((await listsOf(app, hB)).incoming).toHaveLength(0);
    const res = await act(app, hB, 'accept', ACCOUNT_A);
    expect(res.statusCode, res.body).toBeGreaterThanOrEqual(400);
    expect(res.statusCode, res.body).toBeLessThan(500);
    expect(await rows(ACCOUNT_A, ACCOUNT_B)).toBe('a>b:pending');
    await setStatus(ACCOUNT_A, 'active');
    expect(idsOf((await listsOf(app, hB)).incoming)).toEqual([ACCOUNT_A]);
    expect(is2xx((await act(app, hB, 'accept', ACCOUNT_A)).statusCode)).toBe(true);
  });

  it('[F2.4a c10 DR-5] a pending request whose addressee is not active is absent from the requester\'s sent list, and returns on reactivation', T, async () => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    await setStatus(ACCOUNT_B, 'banned');
    expect((await listsOf(app, hA)).sent).toHaveLength(0);
    await setStatus(ACCOUNT_B, 'active');
    expect(idsOf((await listsOf(app, hA)).sent)).toEqual([ACCOUNT_B]);
  });

  it('[F2.4a c10 DR-5] a non-active Friend is absent from the other\'s Friends list and returns on reactivation, the row kept', T, async () => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    expect(is2xx((await act(app, hB, 'accept', ACCOUNT_A)).statusCode)).toBe(true);
    for (const status of ['suspended', 'banned'] as const) {
      await setStatus(ACCOUNT_B, status);
      expect((await listsOf(app, hA)).friends, status).toHaveLength(0);
      expect(await rows(ACCOUNT_A, ACCOUNT_B)).toBe('a>b:accepted');
      await setStatus(ACCOUNT_B, 'active');
      expect(idsOf((await listsOf(app, hA)).friends), status).toEqual([ACCOUNT_B]);
    }
  });

  it.each([['P (Professional)', P], ['M (Moderator)', M], ['D (Admin)', D]] as const)('[F2.4a c10 A7 BR-034] %s as actor: every action and the lists -> 403, no row', T, async (_label, id) => {
    const app = await start();
    expect((await sendTo(app, hB, ACCOUNT_A)).statusCode).toBe(201);
    const before = await frState();
    for (const [name, status, body] of await callAll(app, await bearerFor(id), ACCOUNT_A)) {
      expect(status, `${name}: ${body}`).toBe(403);
    }
    expect(await frState()).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4a c11 PG-036 P1 P2] GET the lists', () => {
  it('[F2.4a c11] a new account gets three empty lists', T, async () => {
    const app = await start();
    const c = await registered(app, 'Carmel Shani');
    const lists = await listsOf(app, c.header);
    expect(lists.keys).toEqual(['friends', 'incoming', 'sent']);
    expect([lists.incoming.length, lists.sent.length, lists.friends.length]).toEqual([0, 0, 0]);
  });

  it('[F2.4a c11] the three lists hold only the caller\'s rows; each entry holds exactly id, full name and, for requests, the request time', T, async () => {
    const app = await start();
    const c = await registered(app, 'Carmel Shani');
    const d = await registered(app, 'Dorit Peretz');
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    expect((await sendTo(app, c.header, ACCOUNT_A)).statusCode).toBe(201);
    expect((await sendTo(app, hA, d.id)).statusCode).toBe(201);
    expect(is2xx((await act(app, await bearerFor(d.id), 'accept', ACCOUNT_A)).statusCode)).toBe(true);
    const a = await listsOf(app, hA);
    expect(a.keys).toEqual(['friends', 'incoming', 'sent']);
    expect(a.sent.map((e) => [e.userId, e.fullName])).toEqual([[ACCOUNT_B, NAME_B]]);
    expect(a.incoming.map((e) => [e.userId, e.fullName])).toEqual([[c.id, 'Carmel Shani']]);
    expect(a.friends.map((e) => [e.userId, e.fullName])).toEqual([[d.id, 'Dorit Peretz']]);
    for (const entry of [...a.sent, ...a.incoming]) {
      expect(entry.keys).toEqual(['fullName', 'requestedAt', 'userId']);
      expect(Number.isNaN(Date.parse(String(entry.requestedAt))), `requestedAt ${String(entry.requestedAt)}`).toBe(false);
    }
    for (const entry of a.friends) expect(entry.keys).toEqual(['fullName', 'userId']);
    // B and C see only their own side
    const b = await listsOf(app, hB);
    expect([b.incoming.map((e) => e.userId), b.sent.length, b.friends.length]).toEqual([[ACCOUNT_A], 0, 0]);
    const other = await listsOf(app, c.header);
    expect([other.sent.map((e) => e.userId), other.incoming.length, other.friends.length]).toEqual([[ACCOUNT_A], 0, 0]);
  });

  it('[F2.4a c11] the raw answer carries no email, gender, children, journeys, status or privacy setting of anyone', T, async () => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    expect(is2xx((await act(app, hB, 'accept', ACCOUNT_A)).statusCode)).toBe(true);
    const res = await getLists(app, hA);
    expect(res.body).not.toMatch(/email|gender|child|journey|status|visibility|privacy|declined|accepted|pending|@/i);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.4a c12 A1 A8 rule 12] strict input', () => {
  const BAD_BODIES: Array<[string, unknown]> = [
    ['a non-uuid id', { targetUserId: 'not-a-uuid' }],
    ['a uuid with junk', { targetUserId: `${ACCOUNT_B.slice(0, -1)}x` }],
    ['an empty id', { targetUserId: '' }],
    ['a number', { targetUserId: 12345 }],
    ['null', { targetUserId: null }],
    ['an array', { targetUserId: [ACCOUNT_B] }],
    ['a very long id', { targetUserId: 'a'.repeat(5000) }],
    ['SQL in the id', { targetUserId: "'; drop table nestly.friendships;--" }],
    ['no id', {}],
    ['an extra key requesterId', { targetUserId: ACCOUNT_B, requesterId: NOBODY }],
    ['an extra key status', { targetUserId: ACCOUNT_B, status: 'accepted' }],
    ['an extra key addresseeId', { targetUserId: ACCOUNT_B, addresseeId: NOBODY }],
    ['an extra key addressee_id', { targetUserId: ACCOUNT_B, addressee_id: NOBODY }],
    ['the body is an array', [{ targetUserId: ACCOUNT_B }]],
    ['null body', null],
  ];

  it.each(BAD_BODIES)('[F2.4a c12] send with %s -> 400, no row', T, async (_label, payload) => {
    const app = await start();
    const before = await frState();
    const res = await send(app, hA, payload);
    expect(res.statusCode, res.body).toBe(400);
    expect(errorOf(res.body)).toBe('invalid');
    expect(await frState()).toBe(before);
    expect(await frCount()).toBe(0);
  });

  it('[F2.4a c12] send with a body that is not JSON -> 4xx, no row', T, async () => {
    const app = await start();
    const res = await send(app, hA, '{"targetUserId":');
    expect(res.statusCode, res.body).toBeGreaterThanOrEqual(400);
    expect(res.statusCode, res.body).toBeLessThan(500);
    expect(await frCount()).toBe(0);
  });

  it.each(['accept', 'decline', 'cancel', 'remove'] as const)('[F2.4a c12] %s with an id that is not a uuid -> 400, nothing changes', T, async (action: Action) => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    const before = await frState();
    for (const id of ['not-a-uuid', '12345', "1'%20or%20'1'='1", `${ACCOUNT_B.slice(0, -1)}x`, 'a'.repeat(2000)]) {
      const res = await act(app, hB, action, id);
      expect(res.statusCode, `${id.slice(0, 20)}: ${res.body}`).toBe(400);
    }
    expect(await frState()).toBe(before);
  });
});
