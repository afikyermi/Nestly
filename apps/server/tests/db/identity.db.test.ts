import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import {
  ACCOUNT_A,
  ACCOUNT_B,
  AUDIENCE,
  COLD_START_MS,
  ISSUER,
  makeApp,
  newKey,
  restoreEnv,
  startJwks,
  toRecord,
  toRecords,
  token,
  type App,
  type JwksServer,
  type TestKey,
} from '../helpers/identity-fixtures.js';
import { inIdentity, outsideIdentity, type Row } from '../helpers/identity-seam.js';

// I1 F1.1 part c, spec criteria 23 (in the transaction), 24, 25, and the behavioural half of 27. Runs in the CI `db` job
// only (npm run test:db), as app_server, against the disposable database after pgTAP, with the fixtures of
// supabase/tests/setup/ loaded:
//   a, b: regular, active   s: suspended   x: banned   c: an Auth user with no nestly.users row
// Derived from the spec. SRS: SRS section 13 (identity in every transaction), NFR-SEC-002, FR-MOD-002 / BR-024 (status
// takes effect at once); platform rules r3 (settings last only for the transaction) and r15 (status).
//
// The test route reaches the transaction through request.inIdentityTransaction (tests/helpers/identity-seam.ts). The test
// owns the Database it passes to buildApp({ database }), so it can also query the same single connection directly.

const T = { timeout: COLD_START_MS };

const FIXTURE: Record<string, string> = {
  a: ACCOUNT_A,
  b: ACCOUNT_B,
  s: '50000000-0000-4000-8000-000000000051',
  x: 'e0000000-0000-4000-8000-0000000000e5',
  c: 'c0000000-0000-4000-8000-0000000000c3',
};

const ROUTE = '/api/_f11c/q';
// The test route runs one of these fixed statements. Nothing in a request chooses SQL text.
const QUERIES: Record<string, string> = {
  ctx: 'select current_user::text as cu, session_user::text as su, auth.uid()::text as uid, auth.role()::text as role',
  users: 'select id::text as id from nestly.users order by id',
  profiles: 'select user_id::text as id from nestly.regular_profiles order by user_id',
  pid: 'select pg_backend_pid()::int as pid',
  // The names of the claims the transaction carries, sorted and comma-joined (platform rule 14: only sub and role).
  claimkeys: "select string_agg(k, ',' order by k) as keys from jsonb_object_keys(current_setting('request.jwt.claims')::jsonb) as k",
  boom: 'select 1 / 0',
  sleep: 'select pg_sleep(0.4), pg_backend_pid()::int as pid',
  // The policy settings the identity entry sets to '' (performance plan ז'), name=value in name order; NULL would read "null".
  unset: `select string_agg(n || '=' || coalesce(current_setting(n, true), 'null'), ',' order by n) as v
          from unnest(array['nestly.staff_view', 'nestly.analytics_view', 'nestly.own_delete', 'nestly.reveal_user',
                            'nestly.search_scope', 'nestly.profile_view_target', 'nestly.block_ending']) as n`,
  // A path that turns the staff view on later in the transaction, as the admin reads do (admin-repository.ts): the setting is 'on',
  // and the users the caller reads then (its permissions decide, not the setting).
  staffon: `select s.v, (select current_setting('nestly.staff_view', true)) as after, (select string_agg(id::text, ',' order by id) from nestly.users) as ids
            from (select pg_catalog.set_config('nestly.staff_view', 'on', true) as v offset 0) as s`,
};
const OUTSIDE =
  "select pg_backend_pid()::int as pid, current_user::text as cu, current_setting('role') as role, coalesce(current_setting('request.jwt.claims', true), '') as claims";

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let handlerCalls = 0;
const open: Array<{ app: App; database: Database }> = [];
const databaseOf = new WeakMap<App, Database>();

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
}

async function serverApp(): Promise<App> {
  const database = createDatabase(url());
  const app = await makeApp(
    { SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() },
    (a) => {
      a.get<{ Querystring: { q?: string } }>(ROUTE, async (request) => {
        handlerCalls += 1;
        const text = QUERIES[request.query.q ?? ''];
        if (text === undefined) throw new Error('unknown test query');
        return { rows: await inIdentity(request, text) };
      });
    },
    database,
  );
  open.push({ app, database });
  databaseOf.set(app, database);
  return app;
}

function outside(app: App): Promise<Row[]> {
  const database = databaseOf.get(app);
  if (!database) throw new Error('not an app built by serverApp()');
  return outsideIdentity(database, OUTSIDE);
}

interface Answer {
  status: number;
  rows: Row[];
  body: string;
}

function answerOf(status: number, body: string, json: () => unknown): Answer {
  // A 200 must carry {rows: [...]}; anything else in a 200 is a failure of the test route, not "no rows".
  const rows = status === 200 ? toRecords(toRecord(json()).rows) : [];
  return { status, rows, body };
}

async function call(app: App, q: string, sub: string | null, extra?: Record<string, unknown>): Promise<Answer> {
  const headers: Record<string, string> = {};
  if (sub !== null) headers.authorization = `Bearer ${await token({ key, sub, extra })}`;
  const res = await app.inject({ method: 'GET', url: `${ROUTE}?q=${q}`, headers });
  return answerOf(res.statusCode, res.body, () => res.json());
}

const ids = (rows: Row[]): string[] => rows.map((r) => String(r.id));

async function setStatus(who: string, status: 'active' | 'suspended' | 'banned'): Promise<void> {
  await side`select tests.set_status(tests.fx_id_checked(${who}), ${status})`;
}
async function backendCount(): Promise<number> {
  const [row] = await side`select count(*)::int as n from pg_stat_activity where usename = 'app_server' and pid <> pg_backend_pid()`;
  return Number(row?.n);
}

beforeAll(async () => {
  key = await newKey('db-test-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  await setStatus('a', 'active');
}, COLD_START_MS);

afterEach(async () => {
  for (const { app, database } of open.splice(0)) {
    await app.close();
    await database.close();
  }
  // Whatever a test did to a status, the next one starts from the fixtures.
  await setStatus('a', 'active');
});

afterAll(async () => {
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.1-c c23] inside the transaction the caller is `authenticated`, whatever the token role claim says (SRS section 13, platform r3)', () => {
  const ROLES: Array<[string, Record<string, unknown>]> = [
    ['authenticated', { role: 'authenticated' }],
    ['anon', { role: 'anon' }],
    ['service_role', { role: 'service_role' }],
    ['postgres', { role: 'postgres' }],
    ['no role claim', { role: undefined }],
    ['app_metadata and user_metadata saying service_role', { app_metadata: { role: 'service_role' }, user_metadata: { role: 'service_role' } }],
  ];

  // Everything a Supabase token can carry beyond sub and role: none of it may reach the database.
  const CLAIM_SETS: Array<[string, Record<string, unknown>]> = [
    ['a plain token', {}],
    ['a token with no role claim', { role: undefined }],
    [
      'a token carrying app_metadata, user_metadata, email, session and custom claims',
      {
        app_metadata: { role: 'service_role', provider: 'email' },
        user_metadata: { status: 'active', account_type: 'admin' },
        email: 'a@example.invalid',
        phone: '',
        session_id: 'f0000000-0000-4000-8000-0000000000f6',
        is_anonymous: false,
        custom_claim: 'x',
      },
    ],
  ];

  it.each(ROLES)('[F1.1-c c23] role claim %s: current_user authenticated, auth.uid() is the sub, auth.role() authenticated', T, async (_label, extra) => {
    const app = await serverApp();
    const res = await call(app, 'ctx', ACCOUNT_A, extra);
    expect(res.status, res.body).toBe(200);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ cu: 'authenticated', uid: ACCOUNT_A, role: 'authenticated', su: 'app_server' });
  });

  it('[F1.1-c c23] the sub of the token, not a fixed or earlier one, is what auth.uid() returns', T, async () => {
    const app = await serverApp();
    const res = await call(app, 'ctx', ACCOUNT_B, { role: 'service_role' });
    expect(res.rows[0]).toMatchObject({ cu: 'authenticated', uid: ACCOUNT_B, role: 'authenticated' });
  });

  // F2.0 DR-S1 (Gate 2): the session identifiers session_id, iat and amr pass too, when the token has them; nothing else does.
  it.each(CLAIM_SETS)('[F1.1-c c23 · F2.0-a DR-S1] platform r14: request.jwt.claims inside the transaction holds exactly {role, sub} plus the session identifiers the token had: %s', T, async (_label, extra) => {
    const app = await serverApp();
    const res = await call(app, 'claimkeys', ACCOUNT_A, extra);
    expect(res.status, res.body).toBe(200);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]?.keys).toBe('session_id' in extra ? 'iat,role,session_id,sub' : 'iat,role,sub');
  });

  it.each(ROLES)('[F1.1-c c23] role claim %s grants no more than authenticated: the caller reads only its own users row', T, async (_label, extra) => {
    const app = await serverApp();
    const res = await call(app, 'users', ACCOUNT_A, extra);
    expect(res.status, res.body).toBe(200);
    expect(ids(res.rows)).toEqual([ACCOUNT_A]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.1-c c24] identity settings last only for the transaction (platform r3, SRS section 13)', () => {
  it('[F1.1-c c24] after a request for A ends, the same pooled connection is app_server with empty request.jwt.claims', T, async () => {
    const app = await serverApp();
    const inside = await call(app, 'pid', ACCOUNT_A);
    expect(inside.status, inside.body).toBe(200);
    const insidePid = inside.rows[0]?.pid;

    const [after] = await outside(app);
    expect(after?.pid, 'the outside query ran on the connection the request used').toBe(insidePid);
    expect(after?.cu).toBe('app_server');
    expect(after?.role).toBe('none');
    expect(after?.claims).toBe('');
    expect(String(after?.claims)).not.toContain(ACCOUNT_A);
  });

  it('[F1.1-c c24] the same holds after a request whose statement failed (the rollback leaves nothing behind)', T, async () => {
    const app = await serverApp();
    const ok = await call(app, 'pid', ACCOUNT_A);
    const failed = await call(app, 'boom', ACCOUNT_A);
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect(failed.body).not.toMatch(/division|zero|nestly|app_server|postgres|select 1/i);
    const [after] = await outside(app);
    expect(after?.pid).toBe(ok.rows[0]?.pid);
    expect(after?.cu).toBe('app_server');
    expect(after?.role).toBe('none');
    expect(after?.claims).toBe('');
  });

  it('[F1.1-c c24] a following request for B on that connection sees only B, then A again sees only A', T, async () => {
    const app = await serverApp();
    const first = await call(app, 'pid', ACCOUNT_A);
    for (const [who, sub] of [['b', ACCOUNT_B], ['a', ACCOUNT_A], ['b', ACCOUNT_B], ['b', ACCOUNT_B], ['a', ACCOUNT_A]] as const) {
      const users = await call(app, 'users', sub);
      const profiles = await call(app, 'profiles', sub);
      expect(ids(users.rows), `users for ${who}`).toEqual([sub]);
      expect(ids(profiles.rows), `regular_profiles for ${who}`).toEqual([sub]);
      const pid = await call(app, 'pid', sub);
      expect(pid.rows[0]?.pid, 'one connection serves every request').toBe(first.rows[0]?.pid);
    }
  });

  it('[F1.1-c c24] concurrent requests for A and B never see each other: every answer holds only its own caller', T, async () => {
    const app = await serverApp();
    const calls = Array.from({ length: 24 }, (_unused, i) => {
      const sub = i % 2 === 0 ? ACCOUNT_A : ACCOUNT_B;
      return call(app, i % 3 === 0 ? 'profiles' : 'users', sub).then((r) => ({ sub, r }));
    });
    for (const { sub, r } of await Promise.all(calls)) {
      expect(r.status).toBe(200);
      expect(ids(r.rows)).toEqual([sub]);
    }
  });

  it('[F1.1-c c24] an anonymous (rejected) request between two identities does not inherit the previous one', T, async () => {
    const app = await serverApp();
    await call(app, 'users', ACCOUNT_A);
    const before = handlerCalls;
    const none = await call(app, 'users', null);
    expect(none.status).toBe(401);
    expect(handlerCalls).toBe(before);
    const b = await call(app, 'users', ACCOUNT_B);
    expect(ids(b.rows)).toEqual([ACCOUNT_B]);
  });

  it('[F1.1-c c27] one connection per instance: a burst of concurrent requests uses at most one database connection', T, async () => {
    const before = await backendCount();
    const app = await serverApp();
    const burst = Array.from({ length: 8 }, (_unused, i) => call(app, 'sleep', i % 2 === 0 ? ACCOUNT_A : ACCOUNT_B));
    await new Promise((resolve) => setTimeout(resolve, 250));
    const during = await backendCount();
    const done = await Promise.all(burst);
    expect(during - before, 'database connections opened by one server instance during a burst').toBeLessThanOrEqual(1);
    expect(done.every((r) => r.status === 200)).toBe(true);
    expect(new Set(done.map((r) => r.rows[0]?.pid)).size).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('the policy settings start empty in every identity transaction (performance plan ז\', 26.10)', () => {
  it('reads \'\' for each setting the authenticated policies read, on a fresh connection and after a transaction that set one', T, async () => {
    const app = await serverApp();
    const expected = ['nestly.analytics_view', 'nestly.block_ending', 'nestly.own_delete', 'nestly.profile_view_target', 'nestly.reveal_user', 'nestly.search_scope', 'nestly.staff_view']
      .map((n) => `${n}=`)
      .join(',');
    const first = await call(app, 'unset', ACCOUNT_A);
    expect(first.status, first.body).toBe(200);
    expect(first.rows[0]?.v).toBe(expected);
    await call(app, 'staffon', ACCOUNT_A);
    const again = await call(app, 'unset', ACCOUNT_B);
    expect(again.rows[0]?.v, 'the previous transaction\'s on does not carry over').toBe(expected);
  });

  it('a path that sets the staff view on later still gets on; a Regular account reads the same users with it as without it', T, async () => {
    const app = await serverApp();
    const plain = await call(app, 'users', ACCOUNT_A);
    const on = await call(app, 'staffon', ACCOUNT_A);
    expect(on.status, on.body).toBe(200);
    expect(on.rows[0]).toMatchObject({ v: 'on', after: 'on' });
    // has_permission('USER_VIEW') is false for a Regular account: the setting alone opens nothing
    expect(String(on.rows[0]?.ids)).toBe(ids(plain.rows).join(','));
    expect(ids(plain.rows)).toEqual([ACCOUNT_A]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.1-c c25] end to end through the server: the caller reads its own User row (initiative exit, platform r15)', () => {
  it('[F1.1-c c25] an active account gets 1 row, its own', T, async () => {
    const app = await serverApp();
    const res = await call(app, 'users', ACCOUNT_A);
    expect(res.status, res.body).toBe(200);
    expect(ids(res.rows)).toEqual([ACCOUNT_A]);
  });

  it('[F1.5-a c1] the same token after suspension or ban still gets exactly its own row, and the row stays when the account is active again', T, async () => {
    const app = await serverApp();
    const t = await token({ key, sub: ACCOUNT_A });
    const read = async (): Promise<Row[]> => {
      const res = await app.inject({ method: 'GET', url: `${ROUTE}?q=users`, headers: { authorization: `Bearer ${t}` } });
      expect(res.statusCode, res.body).toBe(200);
      return answerOf(res.statusCode, res.body, () => res.json()).rows;
    };
    expect(ids(await read())).toEqual([ACCOUNT_A]);
    await setStatus('a', 'suspended');
    expect(ids(await read())).toEqual([ACCOUNT_A]);
    await setStatus('a', 'active');
    expect(ids(await read())).toEqual([ACCOUNT_A]);
    await setStatus('a', 'banned');
    expect(ids(await read())).toEqual([ACCOUNT_A]);
  });

  it('[F1.1-c c25] suspension also hides the account\'s regular_profiles row', T, async () => {
    const app = await serverApp();
    await setStatus('a', 'suspended');
    const res = await call(app, 'profiles', ACCOUNT_A);
    expect(res.status, res.body).toBe(200);
    expect(res.rows).toEqual([]);
  });

  it.each([
    ['s (suspended in the fixtures)', 's'],
    ['x (banned in the fixtures)', 'x'],
  ])('[F1.5-a c1] account %s gets only its own row, including from a token that claims to be active', T, async (_label, who) => {
    const app = await serverApp();
    const lying = { app_metadata: { status: 'active', role: 'service_role' }, user_metadata: { status: 'active', role: 'service_role' }, role: 'service_role' };
    for (const extra of [undefined, lying]) {
      const res = await call(app, 'users', FIXTURE[who] ?? '', extra);
      expect(res.status, res.body).toBe(200);
      expect(ids(res.rows)).toEqual([FIXTURE[who]]);
    }
  });

  it('[F1.1-c c25] account c (an Auth user with no nestly.users row) gets 0 rows, including from a token that claims to be active', T, async () => {
    const app = await serverApp();
    const lying = { app_metadata: { status: 'active', role: 'service_role' }, user_metadata: { status: 'active', role: 'service_role' }, role: 'service_role' };
    for (const extra of [undefined, lying]) {
      const res = await call(app, 'users', FIXTURE.c ?? '', extra);
      expect(res.status, res.body).toBe(200);
      expect(res.rows).toEqual([]);
    }
  });

  it('[F1.1-c c25] without a token the request gets 401 and no query runs (the handler is not entered)', T, async () => {
    const app = await serverApp();
    const before = handlerCalls;
    const res = await call(app, 'users', null);
    expect(res.status).toBe(401);
    expect(res.rows).toEqual([]);
    expect(handlerCalls).toBe(before);
    const bad = await app.inject({ method: 'GET', url: `${ROUTE}?q=users`, headers: { authorization: 'Bearer not-a-token' } });
    expect(bad.statusCode).toBe(401);
    expect(handlerCalls).toBe(before);
  });

  it('[F1.1-c c25] [Q-a] a token whose sub is not a UUID gets 401 and no query runs', T, async () => {
    const app = await serverApp();
    const before = handlerCalls;
    for (const sub of ['not-a-uuid', "'; drop table nestly.users; --", `${ACCOUNT_A}0`]) {
      const res = await call(app, 'users', sub);
      expect(res.status, sub).toBe(401);
    }
    expect(handlerCalls).toBe(before);
    expect(ids((await call(app, 'users', ACCOUNT_A)).rows)).toEqual([ACCOUNT_A]);
  });

  it('[F1.1-c c25] a token for an account that does not exist in Auth at all reads nothing and breaks nothing', T, async () => {
    const app = await serverApp();
    const res = await call(app, 'users', '99999999-9999-4999-8999-999999999999');
    expect(res.status).toBe(200);
    expect(res.rows).toEqual([]);
    expect(ids((await call(app, 'users', ACCOUNT_A)).rows)).toEqual([ACCOUNT_A]);
  });
});
