import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CONSENT_PRIVACY_VERSION, CONSENT_TERMS_VERSION } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { CLOCK_NOW, EMPTY_DATE, buildRegisterApp, captureLog, child, jsonOf, parts, post, validBody } from '../helpers/register-app.js';

// I1 F1.4 part b, the route POST /api/register against the real database (CI `db` job only, as app_server, after pgTAP).
// Spec Revision 2 criteria: 8 (201 and the rows), 10 (a deterministic refusal -> 500, nothing written), 11 (a transient
// write failure -> 503 profile_write_failed, rolled back; a retry with the same session and body -> 201, one account),
// 13 (no password / email / children / token in logs or bodies), 15 (409, no write; 401 writes nothing).
// ORCHESTRATOR's reading of 10 vs 11 is tested as stated: a deterministic database refusal (SQLSTATE class 23 or 42501) -> 500
// `internal`; anything a retry could fix -> 503 `profile_write_failed`.
// Each test registers a FRESH Auth user (tests.fx_new_auth_user(), supabase/tests/setup/20_registration_fixtures.sql); rows
// are read through the fixture observers, which RLS does not filter. Derived from spec.md and interface.md only.

const T = { timeout: COLD_START_MS };
const SECRET_NAME = 'שם־סודי־של־הורה';
const SECRET_CHILD = 'ילדה־סודית';
const SECRET_DATE = '2019-03-17';

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

/** A Database whose Nth transaction (counted from arm()) runs its work and then fails like a lost connection: the work is rolled back. */
function flakyDatabase(real: Database): { database: Database; arm: (nth: number) => void; failures: () => number } {
  let remaining = 0;
  let failures = 0;
  const db = new Proxy(real.db, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (typeof value !== 'function') return value;
      if (prop !== 'transaction') {
        const bound: unknown = value.bind(target);
        return bound;
      }
      return (work: unknown, ...rest: unknown[]) => {
        if (remaining > 0) remaining -= 1;
        if (remaining !== 0 || typeof work !== 'function') {
          const passed: unknown = Reflect.apply(value, target, [work, ...rest]);
          return passed;
        }
        remaining = -1; // spent
        failures += 1;
        const failing = async (tx: unknown): Promise<never> => {
          await Reflect.apply(work, undefined, [tx]);
          throw new Error('connection lost');
        };
        const outcome: unknown = Reflect.apply(value, target, [failing, ...rest]);
        return outcome;
      };
    },
  });
  return {
    database: { db, client: real.client, close: () => real.close() },
    arm: (nth) => {
      remaining = nth;
    },
    failures: () => failures,
  };
}

async function start(seams: { database?: Database; logStream?: ReturnType<typeof captureLog>['stream'] } = {}): Promise<{ app: App; database: Database }> {
  const database = seams.database ?? createDatabase(url());
  const app = await buildRegisterApp(env(), { database, clock: () => CLOCK_NOW, ...(seams.logStream ? { logStream: seams.logStream } : {}) });
  toClose.push({ app, database });
  return { app, database };
}

async function freshUser(): Promise<string> {
  const [row] = await side`select tests.fx_new_auth_user()::text as id`;
  const id: unknown = row?.id;
  if (typeof id !== 'string') throw new Error('tests.fx_new_auth_user returned no id: is 20_registration_fixtures.sql loaded?');
  return id;
}
const bearerFor = async (sub: string, over: Record<string, unknown> = {}): Promise<string> => `Bearer ${await token({ key, sub, ...over })}`;

async function one(query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> {
  const rows = await query;
  return String(rows[0]?.v);
}
const counts = (id: string) => one(side`select tests.fx_counts(${id}::uuid) as v`);
const journeys = (id: string) => one(side`select tests.fx_journeys(${id}::uuid) as v`);
const childrenOf = (id: string) => one(side`select tests.fx_children(${id}::uuid) as v`);
const consentOf = (id: string) => one(side`select tests.fx_consent(${id}::uuid) as v`);
const profileOf = (id: string) => one(side`select tests.fx_profile(${id}::uuid) as v`);
const userOf = (id: string) => one(side`select tests.fx_user(${id}::uuid) as v`);
async function ms(query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<number> {
  const value: unknown = (await query)[0]?.ms;
  if (typeof value !== 'number') throw new Error('expected a number of milliseconds');
  return value;
}
const clock = () => ms(side`select (extract(epoch from clock_timestamp()) * 1000)::float8 as ms`);
const consentTime = (id: string) => ms(side`select (extract(epoch from tests.fx_consent_at(${id}::uuid)) * 1000)::float8 as ms`);
const snapshot = async (id: string) => [await counts(id), await journeys(id), await childrenOf(id), await consentOf(id), await profileOf(id)];

beforeAll(async () => {
  key = await newKey('register-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
}, COLD_START_MS);

afterEach(async () => {
  vi.doUnmock('@nestly/shared');
  vi.resetModules();
  for (const { app, database } of toClose.splice(0)) {
    await app.close();
    await database.close();
  }
});

afterAll(async () => {
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.4-b c8] the happy path: a valid session and body create the account in one transaction', () => {
  it('[F1.4-b c8] 201 {status:created} with no session, no ids; 1 user, 1 profile, 2 journeys, 2 children, 1 consent', T, async () => {
    const { app } = await start();
    const id = await freshUser();
    expect(await counts(id)).toBe('0/0/0/0/0');

    const res = await post(app, await bearerFor(id), validBody());

    expect(res.statusCode, res.body).toBe(201);
    expect(jsonOf(res.body)).toEqual({ status: 'created' });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body).not.toContain(id);
    expect(await counts(id)).toBe('1/1/2/2/1');
    expect(await userOf(id)).toBe('regular/active');
    expect(await profileOf(id)).toBe('דנה כהן/woman');
    expect(await journeys(id)).toBe('has_child:null ; pregnant:2026-12-01');
    expect(await childrenOf(id)).toBe('1:נועה:girl:2024-02-29 ; 2:אלי:boy:2022-01-15');
  });

  it('[F1.4-b c8 c9] the consent holds the shared constants, the declaration true, and a time within 5 s of the request', T, async () => {
    const { app } = await start();
    const id = await freshUser();
    const before = await clock();
    const res = await post(app, await bearerFor(id), validBody());
    const after = await clock();
    expect(res.statusCode, res.body).toBe(201);
    expect((await consentOf(id)).split('/').slice(0, 3).join('/')).toBe(`${CONSENT_TERMS_VERSION}/${CONSENT_PRIVACY_VERSION}/true`);
    const at = await consentTime(id);
    expect(at).toBeGreaterThanOrEqual(before - 5000);
    expect(at).toBeLessThanOrEqual(after + 5000);
  });

  it('[F1.4-b c8] only planning: one journey, no due date, no children, gender absent -> null', T, async () => {
    const { app } = await start();
    const id = await freshUser();
    const res = await post(app, await bearerFor(id), validBody({ stages: ['planning'], dueDate: EMPTY_DATE, children: [], parentGender: undefined }));
    expect(res.statusCode, res.body).toBe(201);
    expect(await counts(id)).toBe('1/1/1/0/1');
    expect(await journeys(id)).toBe('planning:null');
    expect(await profileOf(id)).toBe('דנה כהן/-');
  });

  it('[F1.4-b c8] pregnant with the due date left empty stores null; ten children are stored in slot order', T, async () => {
    const { app } = await start();
    const a = await freshUser();
    expect((await post(app, await bearerFor(a), validBody({ stages: ['pregnant'], dueDate: EMPTY_DATE, children: [] }))).statusCode).toBe(201);
    expect(await journeys(a)).toBe('pregnant:null');

    const b = await freshUser();
    const kids = Array.from({ length: 10 }, (_, i) => child({ name: `ילד ${i + 1}` }));
    expect((await post(app, await bearerFor(b), validBody({ stages: ['has_child'], dueDate: EMPTY_DATE, children: kids }))).statusCode).toBe(201);
    expect(await counts(b)).toBe('1/1/1/10/1');
    expect((await childrenOf(b)).split(' ; ').map((s) => s.split(':')[0])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('[F1.4-b c8] hostile text in the names is stored as data and the request is a normal 201', T, async () => {
    const { app } = await start();
    const id = await freshUser();
    const evil = "Robert'); drop table nestly.children;--";
    const res = await post(app, await bearerFor(id), validBody({ fullName: evil, stages: ['has_child'], dueDate: EMPTY_DATE, children: [child({ name: evil })] }));
    expect(res.statusCode, res.body).toBe(201);
    expect(await profileOf(id)).toBe(`${evil}/woman`);
    expect(await counts(id)).toBe('1/1/1/1/1');
  });

  it('[F1.4-b c8 c14] the identity is the token\'s: registering X leaves every other user untouched', T, async () => {
    const { app } = await start();
    const x = await freshUser();
    const y = await freshUser();
    expect((await post(app, await bearerFor(x), validBody())).statusCode).toBe(201);
    expect(await counts(y)).toBe('0/0/0/0/0');
    expect(await counts('a0000000-0000-4000-8000-0000000000a1')).toBe('1/1/2/2/1');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.4-b c15] a session of an account that already exists is 409 and writes nothing', () => {
  it('[F1.4-b c15] a second request with the same token and body -> 409 already_registered; nothing changes', T, async () => {
    const { app } = await start();
    const id = await freshUser();
    const header = await bearerFor(id);
    expect((await post(app, header, validBody())).statusCode).toBe(201);
    const before = await snapshot(id);

    for (let i = 0; i < 3; i += 1) {
      const again = await post(app, header, validBody());
      expect(again.statusCode, again.body).toBe(409);
      expect(jsonOf(again.body)).toEqual({ error: 'already_registered' });
    }
    expect(await snapshot(id)).toEqual(before);
  });

  it('[F1.4-b c15] a second request with DIFFERENT data does not overwrite or add anything', T, async () => {
    const { app } = await start();
    const id = await freshUser();
    const header = await bearerFor(id);
    await post(app, header, validBody());
    const before = await snapshot(id);
    const other = await post(app, header, validBody({ stages: ['planning'], fullName: 'Someone Else', parentGender: 'man', dueDate: EMPTY_DATE, children: [] }));
    expect(other.statusCode).toBe(409);
    expect(await snapshot(id)).toEqual(before);
  });

  it('[F1.4-b c15] fixture a (an existing account with rows) -> 409, its rows unchanged', T, async () => {
    const { app } = await start();
    const a = 'a0000000-0000-4000-8000-0000000000a1';
    const before = await snapshot(a);
    const res = await post(app, await bearerFor(a), validBody());
    expect(res.statusCode, res.body).toBe(409);
    expect(jsonOf(res.body)).toEqual({ error: 'already_registered' });
    expect(await snapshot(a)).toEqual(before);
    expect(before[0]).toBe('1/1/2/2/1');
  });

  it('[F1.4-b c15] a suspended account (it cannot see its own row) is 409 too, and a professional one (a users row, no profile), with no write', T, async () => {
    const { app } = await start();
    for (const [who, expected] of [['50000000-0000-4000-8000-000000000051', '1/1/0/0/0'], ['d0000000-0000-4000-8000-0000000000d4', '1/0/0/0/0']] as const) {
      expect(await counts(who)).toBe(expected);
      const res = await post(app, await bearerFor(who), validBody());
      expect(res.statusCode, `${who}: ${res.body}`).toBe(409);
      expect(jsonOf(res.body)).toEqual({ error: 'already_registered' });
      expect(await counts(who)).toBe(expected);
    }
  });

  it('[F1.4-b c15] two simultaneous requests with one token: one 201, one 409, one account', T, async () => {
    const { app } = await start();
    const id = await freshUser();
    const header = await bearerFor(id);
    const results = await Promise.all([post(app, header, validBody()), post(app, header, validBody())]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await counts(id)).toBe('1/1/2/2/1');
  });

  it('[F1.4-b c15] five simultaneous requests: one 201, four 409, one account', T, async () => {
    const { app } = await start();
    const id = await freshUser();
    const header = await bearerFor(id);
    const results = await Promise.all(Array.from({ length: 5 }, () => post(app, header, validBody())));
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(4);
    expect(await counts(id)).toBe('1/1/2/2/1');
  });
});

describe('[F1.4-b c15 c2] a request that is refused writes nothing', () => {
  it('[F1.4-b c15] a tampered or expired token and a rejected body leave a fresh account with zero rows', T, async () => {
    const { app } = await start();
    const id = await freshUser();
    const good = await bearerFor(id);
    const [h = '', p = '', s = ''] = good.replace('Bearer ', '').split('.');
    const tampered = `Bearer ${h}.${p}.${s.slice(0, -4)}${s.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`;
    const expired = await bearerFor(id, { exp: Math.floor(Date.now() / 1000) - 3600 });
    expect((await post(app, tampered, validBody())).statusCode).toBe(401);
    expect((await post(app, expired, validBody())).statusCode).toBe(401);
    expect((await post(app, null, validBody())).statusCode).toBe(401);
    expect((await post(app, good, validBody({ consent: false }))).statusCode).toBe(400);
    expect((await post(app, good, validBody({ email: 'a@b.co', password: 'abcdefgh' }))).statusCode).toBe(400);
    expect((await post(app, good, validBody({ children: Array.from({ length: 11 }, () => child()) }))).statusCode).toBe(400);
    expect(await counts(id)).toBe('0/0/0/0/0');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.4-b c10] a deterministic database refusal of a validated body is 500 internal and writes nothing', () => {
  it('[F1.4-b c10] a token whose Auth user does not exist (foreign key) -> 500 internal, no row anywhere, no detail in the body', T, async () => {
    const { app } = await start();
    const ghost = '99999999-9999-4999-8999-999999999996';
    const res = await post(app, await bearerFor(ghost), validBody());
    expect(res.statusCode, res.body).toBe(500);
    expect(jsonOf(res.body)).toEqual({ error: 'internal' });
    expect(await counts(ghost)).toBe('0/0/0/0/0');
  });

  it('[F1.4-b c10] the LAST insert (the consent) refused -> 500 internal and zero rows in all five tables; the same session and body then succeed', T, async () => {
    const id = await freshUser();
    const header = await bearerFor(id);

    vi.resetModules();
    vi.doMock('@nestly/shared', async (original) => ({ ...(await original<typeof import('@nestly/shared')>()), CONSENT_TERMS_VERSION: '' }));
    const broken = await start();
    const res = await post(broken.app, header, validBody());
    expect(res.statusCode, res.body).toBe(500);
    expect(jsonOf(res.body)).toEqual({ error: 'internal' });
    // user, profile, 2 journeys and 2 children were written before the consent: all rolled back
    expect(await counts(id)).toBe('0/0/0/0/0');
    expect(res.body).not.toMatch(/consent|terms|constraint|23514|check/i);
    await broken.app.close();
    await broken.database.close();
    toClose.splice(0);

    vi.doUnmock('@nestly/shared');
    vi.resetModules();
    const healthy = await start();
    const retry = await post(healthy.app, header, validBody());
    expect(retry.statusCode, retry.body).toBe(201);
    expect(await counts(id)).toBe('1/1/2/2/1');
  });

  it('[F1.4-b c10] a 500 is not a partial success and is not retried by the server: still zero rows after a second identical request', T, async () => {
    const { app } = await start();
    const ghost = '99999999-9999-4999-8999-999999999995';
    for (let i = 0; i < 2; i += 1) {
      expect((await post(app, await bearerFor(ghost), validBody())).statusCode).toBe(500);
    }
    expect(await counts(ghost)).toBe('0/0/0/0/0');
  });
});

describe('[F1.4-b c11] a transient write failure is 503 profile_write_failed, rolled back; a retry with the same session and body creates one account', () => {
  it('[F1.4-b c11] the write fails after all five inserts ran: 503 profile_write_failed, zero rows; the retry -> 201; one account', T, async () => {
    const flaky = flakyDatabase(createDatabase(url()));
    const { app } = await start({ database: flaky.database });
    const id = await freshUser();
    const header = await bearerFor(id);

    flaky.arm(2); // transaction 1 = hasAccount, transaction 2 = the write
    const failed = await post(app, header, validBody());
    expect(flaky.failures(), 'the injected failure really fired').toBe(1);
    expect(failed.statusCode, failed.body).toBe(503);
    expect(jsonOf(failed.body)).toEqual({ error: 'profile_write_failed' });
    expect(failed.body).not.toMatch(/connection|lost|postgres|sql/i);
    expect(await counts(id)).toBe('0/0/0/0/0');

    const retry = await post(app, header, validBody());
    expect(retry.statusCode, retry.body).toBe(201);
    expect(await counts(id)).toBe('1/1/2/2/1');
    expect(await journeys(id)).toBe('has_child:null ; pregnant:2026-12-01');

    const third = await post(app, header, validBody());
    expect(third.statusCode).toBe(409);
    expect(await counts(id)).toBe('1/1/2/2/1');
  });

  it('[F1.4-b c11] two failures in a row, then success: still exactly one account', T, async () => {
    const flaky = flakyDatabase(createDatabase(url()));
    const { app } = await start({ database: flaky.database });
    const id = await freshUser();
    const header = await bearerFor(id);
    for (let i = 0; i < 2; i += 1) {
      flaky.arm(2);
      expect((await post(app, header, validBody())).statusCode).toBe(503);
      expect(await counts(id)).toBe('0/0/0/0/0');
    }
    expect((await post(app, header, validBody())).statusCode).toBe(201);
    expect(await counts(id)).toBe('1/1/2/2/1');
  });

  it('[F1.4-b c11] a transient failure is not reported as 500, and a deterministic one is not reported as 503 (the rule: retry could fix it -> 503)', T, async () => {
    const flaky = flakyDatabase(createDatabase(url()));
    const { app } = await start({ database: flaky.database });
    const id = await freshUser();
    flaky.arm(2);
    const transient = await post(app, await bearerFor(id), validBody());
    expect(transient.statusCode).toBe(503);
    const ghost = await post(app, await bearerFor('99999999-9999-4999-8999-999999999994'), validBody());
    expect(ghost.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.4-b c13 NFR-PRIV-001] a real registration leaves no password, email, name, date or token in a log line or a response body', () => {
  it('[F1.4-b c13] successful, repeated, rejected and failed requests: nothing sensitive is logged or returned', T, async () => {
    const log = captureLog();
    const { app } = await start({ logStream: log.stream });
    const id = await freshUser();
    const header = await bearerFor(id);
    const raw = header.replace('Bearer ', '');
    const body = validBody({ fullName: SECRET_NAME, stages: ['has_child'], dueDate: EMPTY_DATE, children: [child({ name: SECRET_CHILD, birthDate: parts(SECRET_DATE) })] });

    const responses = [
      await post(app, header, body), // 201
      await post(app, header, body), // 409
      await post(app, header, { ...body, password: 'hunter2-hunter2', email: 'secret.person@example.invalid' }), // 400
      await post(app, await bearerFor('99999999-9999-4999-8999-999999999993'), body), // 500
    ];
    // the body is validated before the account is looked up, so the third is a 400 even for an existing account
    expect(responses.map((r) => r.statusCode)).toEqual([201, 409, 400, 500]);
    const text = log.text();
    expect(text.length).toBeGreaterThan(0);
    for (const secret of [SECRET_NAME, SECRET_CHILD, SECRET_DATE, 'hunter2-hunter2', 'secret.person@example.invalid', raw, raw.split('.')[1] ?? 'x']) {
      expect(text, `log contains ${secret.slice(0, 10)}`).not.toContain(secret);
      for (const res of responses) expect(res.body).not.toContain(secret);
    }
    for (const res of responses) expect(res.body).not.toMatch(/postgres|nestly\.|constraint|sqlstate|23505|23503|users_pkey|stack/i);
  });
});
