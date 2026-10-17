import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { ACCOUNT_A, ACCOUNT_B, AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, captureLog, jsonOf } from '../helpers/register-app.js';

// I2 F2.1, GET and PUT /api/profile against the real database (CI `db` job, as app_server, fixtures of supabase/tests/setup/):
//   a: regular, active, 'Alice Aaron' / woman    b: regular, active, 'Bella Baruch' / no gender
//   s: suspended   x: banned   c: an Auth user with no nestly.users row
// Spec criteria (.work/profile-view-edit/spec.md): 1 2 (the answer shape and NULL gender), 5 7 (stored as sent, trimmed, each gender
// and null), 8 9 (400s and the row unchanged, forbidden keys), 10 (the caller's own row only), 11 (a stopped account), 12 (no profile
// row: 404, nothing created), 14 (the success line holds no name or gender), and the concurrency of two writes.
// Rows are read through the fixture observers (tests.fx_profile), which RLS does not filter. Derived from spec.md only.

const T = { timeout: COLD_START_MS };
const S = '50000000-0000-4000-8000-000000000051';
const X = 'e0000000-0000-4000-8000-0000000000e5';
const C = 'c0000000-0000-4000-8000-0000000000c3';
const A_ORIGINAL = { fullName: 'Alice Aaron', parentGender: 'woman' };
const A_STORED = 'Alice Aaron/woman';
const B_STORED = 'Bella Baruch/-';

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let log: ReturnType<typeof captureLog>;
const toClose: Array<{ app: App; database: Database }> = [];

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
}
const env = () => ({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() });

async function start(): Promise<App> {
  const database = createDatabase(url());
  log = captureLog();
  const app = await buildRegisterApp(env(), { database, logStream: log.stream });
  toClose.push({ app, database });
  return app;
}

const bearerFor = async (sub: string): Promise<string> => `Bearer ${await token({ key, sub })}`;
const profileOf = async (who: string): Promise<string | null> => {
  const rows = await side`select tests.fx_profile(tests.fx_id_checked(${who})) as p`;
  const value: unknown = rows[0]?.p;
  return typeof value === 'string' ? value : null;
};
const stateHash = async (): Promise<string> => {
  const rows = await side`select tests.fx_state() as s`;
  return String(rows[0]?.s);
};
const setStatus = async (who: string, status: 'active' | 'suspended' | 'banned'): Promise<void> => {
  await side`select tests.set_status(tests.fx_id_checked(${who}), ${status})`;
};

const GET = (app: App, header: string | null, path = '/api/profile') =>
  app.inject({ method: 'GET', url: path, headers: header === null ? {} : { authorization: header } });
const PUT = (app: App, header: string | null, payload: unknown, path = '/api/profile') =>
  app.inject({
    method: 'PUT',
    url: path,
    headers: { 'content-type': 'application/json', ...(header === null ? {} : { authorization: header }) },
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

beforeAll(async () => {
  key = await newKey('profile-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  await setStatus('a', 'active');
}, COLD_START_MS);

afterEach(async () => {
  await setStatus('a', 'active');
  // The tests change A's profile: put it back through the API itself, then close.
  const app = await start();
  const res = await PUT(app, await bearerFor(ACCOUNT_A), A_ORIGINAL);
  if (res.statusCode !== 200) throw new Error(`could not restore A's profile: ${res.statusCode} ${res.body}`);
  for (const { app: a, database } of toClose.splice(0)) {
    await a.close();
    await database.close();
  }
});

afterAll(async () => {
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.1 c1 c2 FR-PROFILE-001] GET returns the caller\'s own profile', () => {
  it('[F2.1 c1] A -> 200 {fullName, parentGender} and nothing else', T, async () => {
    const app = await start();
    const res = await GET(app, await bearerFor(ACCOUNT_A));
    expect(res.statusCode, res.body).toBe(200);
    expect(jsonOf(res.body)).toEqual({ fullName: 'Alice Aaron', parentGender: 'woman' });
  });

  it('[F2.1 c2 VAL-006] B, who gave no gender -> parentGender null (not absent, not a word)', T, async () => {
    const app = await start();
    const res = await GET(app, await bearerFor(ACCOUNT_B));
    expect(res.statusCode, res.body).toBe(200);
    expect(jsonOf(res.body)).toEqual({ fullName: 'Bella Baruch', parentGender: null });
  });

  it('[F2.1 c10 A1] the answer is about the token: another account\'s id in the query, a header or the path changes nothing', T, async () => {
    const app = await start();
    const res = await app.inject({
      method: 'GET',
      url: `/api/profile?id=${ACCOUNT_B}&userId=${ACCOUNT_B}&user_id=${ACCOUNT_B}`,
      headers: { authorization: await bearerFor(ACCOUNT_A), 'x-user-id': ACCOUNT_B },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(jsonOf(res.body)).toEqual({ fullName: 'Alice Aaron', parentGender: 'woman' });
    const byPath = await GET(app, await bearerFor(ACCOUNT_A), `/api/profile/${ACCOUNT_B}`);
    expect(byPath.statusCode).toBeGreaterThanOrEqual(400);
    expect(byPath.body).not.toContain('Bella');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.1 c5 c7 AC-015 VAL-001 VAL-006] PUT stores what was sent, trimmed', () => {
  it('[F2.1 c5] "  רון לוי  " + man -> 200 the stored values, the row has the trimmed name, and a GET agrees', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const res = await PUT(app, header, { fullName: '  רון לוי  ', parentGender: 'man' });
    expect(res.statusCode, res.body).toBe(200);
    expect(jsonOf(res.body)).toEqual({ fullName: 'רון לוי', parentGender: 'man' });
    expect(await profileOf('a')).toBe('רון לוי/man');
    expect(jsonOf((await GET(app, header)).body)).toEqual({ fullName: 'רון לוי', parentGender: 'man' });
  });

  it.each(['woman', 'man', 'other', 'prefer_not_to_say'] as const)('[F2.1 c7 VAL-006] gender %s is stored exactly', T, async (gender) => {
    const app = await start();
    const res = await PUT(app, await bearerFor(ACCOUNT_A), { fullName: 'Alice Aaron', parentGender: gender });
    expect(res.statusCode, res.body).toBe(200);
    expect(jsonOf(res.body)).toEqual({ fullName: 'Alice Aaron', parentGender: gender });
    expect(await profileOf('a')).toBe(`Alice Aaron/${gender}`);
  });

  it('[F2.1 c7 Q3] gender null clears it: stored NULL, and a GET says null', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const res = await PUT(app, header, { fullName: 'Alice Aaron', parentGender: null });
    expect(res.statusCode, res.body).toBe(200);
    expect(jsonOf(res.body)).toEqual({ fullName: 'Alice Aaron', parentGender: null });
    expect(await profileOf('a')).toBe('Alice Aaron/-');
    expect(jsonOf((await GET(app, header)).body).parentGender).toBeNull();
  });

  it('[F2.1 c5 VAL-001] 2 and 60 characters are accepted', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    for (const name of ['אב', 'x'.repeat(60)]) {
      const res = await PUT(app, header, { fullName: name, parentGender: 'woman' });
      expect(res.statusCode, name).toBe(200);
      expect(await profileOf('a')).toBe(`${name}/woman`);
    }
  });

  it('[F2.1 c5 S2 hostile] a name shaped like SQL is stored as data', T, async () => {
    const app = await start();
    const name = "Rob'); drop table nestly.users;--";
    const res = await PUT(app, await bearerFor(ACCOUNT_A), { fullName: name, parentGender: 'woman' });
    expect(res.statusCode, res.body).toBe(200);
    expect(await profileOf('a')).toBe(`${name}/woman`);
    expect(await profileOf('b')).toBe(B_STORED);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.1 c8 VAL-001 VAL-006 S2] the server checks with the shared rules; the row stays unchanged', () => {
  const NAME_CASES: Array<[string, unknown, 'full_name_required' | 'full_name_length']> = [
    ['empty', '', 'full_name_required'],
    ['spaces only', '      ', 'full_name_required'],
    ['one character', 'x', 'full_name_length'],
    ['one character between spaces', '  x  ', 'full_name_length'],
    ['61 characters', 'x'.repeat(61), 'full_name_length'],
    ['61 characters between spaces', ` ${'x'.repeat(61)} `, 'full_name_length'],
    ['a very long name (10 000 characters)', 'x'.repeat(10_000), 'full_name_length'],
  ];

  it.each(NAME_CASES)('[F2.1 c8 VAL-001] fullName %s -> 400 invalid + the reason, row unchanged', T, async (_label, value, reason) => {
    const app = await start();
    const before = await stateHash();
    const res = await PUT(app, await bearerFor(ACCOUNT_A), { fullName: value, parentGender: 'woman' });
    expect(res.statusCode, res.body).toBe(400);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid', reason });
    expect(await stateHash()).toBe(before);
    expect(await profileOf('a')).toBe(A_STORED);
  });

  it.each([['female'], [''], ['WOMAN'], ['woman '], ["woman'; drop table nestly.users;--"]])('[F2.1 c8 VAL-006] parentGender %j -> 400 parent_gender_invalid, row unchanged', T, async (gender) => {
    const app = await start();
    const before = await stateHash();
    const res = await PUT(app, await bearerFor(ACCOUNT_A), { fullName: 'Okay Name', parentGender: gender });
    expect(res.statusCode, res.body).toBe(400);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid', reason: 'parent_gender_invalid' });
    expect(await stateHash()).toBe(before);
  });

  it.each([
    ['a number for the name', { fullName: 12, parentGender: 'woman' }],
    ['null for the name', { fullName: null, parentGender: 'woman' }],
    ['no name', { parentGender: 'woman' }],
    ['a number for the gender', { fullName: 'Okay Name', parentGender: 5 }],
    ['an array', ['Okay Name', 'woman']],
    ['a string', 'Okay Name'],
    ['null', null],
    ['an empty object', {}],
  ])('[F2.1 c8 S2] a body with %s -> 400, row unchanged', T, async (_label, body) => {
    const app = await start();
    const before = await stateHash();
    const res = await PUT(app, await bearerFor(ACCOUNT_A), body);
    expect(res.statusCode, res.body).toBe(400);
    expect(jsonOf(res.body).error).toBeDefined();
    expect(await stateHash()).toBe(before);
  });

  it('[F2.1 c8] a body that is not JSON, or empty, is a 4xx and changes nothing', T, async () => {
    const app = await start();
    const before = await stateHash();
    for (const raw of ['{"fullName":', '', 'not json']) {
      const res = await PUT(app, await bearerFor(ACCOUNT_A), raw);
      expect(res.statusCode, raw).toBeGreaterThanOrEqual(400);
      expect(res.statusCode, raw).toBeLessThan(500);
    }
    expect(await stateHash()).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.1 c9 c10 data-model rules 12 14] the caller\'s own row only; no id from the request', () => {
  const FORBIDDEN = [
    ['userId', ACCOUNT_B],
    ['user_id', ACCOUNT_B],
    ['accountType', 'professional'],
    ['account_type', 'professional'],
    ['createdAt', '2020-01-01T00:00:00Z'],
    ['created_at', '2020-01-01T00:00:00Z'],
    ['id', ACCOUNT_B],
    ['status', 'active'],
  ] as const;

  it.each(FORBIDDEN)('[F2.1 c9] a body carrying %s -> 400 and no row changes (A\'s and B\'s included)', T, async (name, value) => {
    const app = await start();
    const before = await stateHash();
    const res = await PUT(app, await bearerFor(ACCOUNT_A), { fullName: 'Hijacker Name', parentGender: 'man', [name]: value });
    expect(res.statusCode, res.body).toBe(400);
    expect(await stateHash()).toBe(before);
    expect(await profileOf('a')).toBe(A_STORED);
    expect(await profileOf('b')).toBe(B_STORED);
  });

  it('[F2.1 c9 c10 A1] A\'s valid body with B\'s id in the query or a header writes A\'s row only; B is untouched', T, async () => {
    const app = await start();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/profile?id=${ACCOUNT_B}&userId=${ACCOUNT_B}&user_id=${ACCOUNT_B}`,
      headers: { authorization: await bearerFor(ACCOUNT_A), 'content-type': 'application/json', 'x-user-id': ACCOUNT_B },
      payload: JSON.stringify({ fullName: 'Alice Renamed', parentGender: 'other' }),
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await profileOf('a')).toBe('Alice Renamed/other');
    expect(await profileOf('b')).toBe(B_STORED);
  });

  it('[F2.1 c9 c10] no route takes an id in its path: PUT /api/profile/<B> writes nothing', T, async () => {
    const app = await start();
    const before = await stateHash();
    const res = await PUT(app, await bearerFor(ACCOUNT_A), { fullName: 'Hijacker Name', parentGender: 'man' }, `/api/profile/${ACCOUNT_B}`);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(await stateHash()).toBe(before);
  });

  it('[F2.1 c10 A1] B saving changes B\'s row and never A\'s', T, async () => {
    const app = await start();
    try {
      const res = await PUT(app, await bearerFor(ACCOUNT_B), { fullName: 'Bella Renamed', parentGender: 'woman' });
      expect(res.statusCode, res.body).toBe(200);
      expect(await profileOf('b')).toBe('Bella Renamed/woman');
      expect(await profileOf('a')).toBe(A_STORED);
    } finally {
      await PUT(app, await bearerFor(ACCOUNT_B), { fullName: 'Bella Baruch', parentGender: null });
    }
    expect(await profileOf('b')).toBe(B_STORED);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.1 c11 A9 rule 15 ERR-037] a suspended or banned account reads and writes nothing', () => {
  it.each([['s', S], ['x', X]] as const)('[F2.1 c11] the fixture account %s: GET returns none of its profile and PUT changes nothing', T, async (who, id) => {
    const app = await start();
    const before = await stateHash();
    const got = await GET(app, await bearerFor(id));
    expect(got.statusCode, got.body).toBeGreaterThanOrEqual(400);
    expect(got.body).not.toMatch(/Sara|Xenia|Suspended|Banned|prefer_not_to_say|"other"/);
    const put = await PUT(app, await bearerFor(id), { fullName: 'Changed While Stopped', parentGender: 'man' });
    expect(put.statusCode, put.body).toBeGreaterThanOrEqual(400);
    expect(await stateHash()).toBe(before);
    expect(await profileOf(who)).not.toContain('Changed While Stopped');
  });

  it.each(['suspended', 'banned'] as const)('[F2.1 c11] A becomes %s: the same token reads nothing and writes nothing; active again, it works', T, async (status) => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    expect((await GET(app, header)).statusCode).toBe(200);
    await setStatus('a', status);
    const got = await GET(app, header);
    expect(got.statusCode, got.body).toBeGreaterThanOrEqual(400);
    expect(got.body).not.toContain('Alice');
    const put = await PUT(app, header, { fullName: 'Changed While Stopped', parentGender: 'man' });
    expect(put.statusCode, put.body).toBeGreaterThanOrEqual(400);
    expect(await profileOf('a')).toBe(A_STORED);
    await setStatus('a', 'active');
    const back = await PUT(app, header, { fullName: 'Back Again', parentGender: 'man' });
    expect(back.statusCode, back.body).toBe(200);
    expect(await profileOf('a')).toBe('Back Again/man');
  });

  it('[F2.1 c11] a suspended and a banned account are told the same thing (one stopped answer)', T, async () => {
    const app = await start();
    const suspended = await GET(app, await bearerFor(S));
    const banned = await GET(app, await bearerFor(X));
    expect(banned.statusCode).toBe(suspended.statusCode);
    expect(banned.body).toBe(suspended.body);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.1 c12 FR-AUTH-004 Q4] an Auth user with no account row', () => {
  it('[F2.1 c12] GET -> 404 {error:"no_profile"}', T, async () => {
    const app = await start();
    const res = await GET(app, await bearerFor(C));
    expect(res.statusCode, res.body).toBe(404);
    expect(jsonOf(res.body)).toEqual({ error: 'no_profile' });
  });

  it('[F2.1 c12] PUT -> 404 and no row is created (users and regular_profiles are byte-for-byte what they were)', T, async () => {
    const app = await start();
    const before = await stateHash();
    const res = await PUT(app, await bearerFor(C), { fullName: 'Cora Newcomer', parentGender: 'woman' });
    expect(res.statusCode, res.body).toBe(404);
    expect(jsonOf(res.body)).toEqual({ error: 'no_profile' });
    expect(await stateHash()).toBe(before);
  });

  it('[F2.1 c12] a token whose subject exists nowhere at all is the same 404, and creates nothing', T, async () => {
    const app = await start();
    const before = await stateHash();
    const ghost = await bearerFor('99999999-9999-4999-8999-999999999992');
    expect((await GET(app, ghost)).statusCode).toBe(404);
    expect((await PUT(app, ghost, { fullName: 'Ghost Writer', parentGender: null })).statusCode).toBe(404);
    expect(await stateHash()).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.1 c14 NFR-PRIV-001] the logs of a successful or refused request hold no name or gender', () => {
  it('[F2.1 c14] GET and PUT in success, 400 and 404: the log has no name, gender, token or id', T, async () => {
    const app = await start();
    const authorization = await bearerFor(ACCOUNT_A);
    const NAME = 'Marker-Name-Zq9-Private';
    expect((await PUT(app, authorization, { fullName: NAME, parentGender: 'prefer_not_to_say' })).statusCode).toBe(200);
    expect((await GET(app, authorization)).statusCode).toBe(200);
    expect((await PUT(app, authorization, { fullName: `${NAME}${'x'.repeat(80)}`, parentGender: 'prefer_not_to_say' })).statusCode).toBe(400);
    expect((await PUT(app, authorization, { fullName: NAME, parentGender: 'prefer_not_to_say', userId: ACCOUNT_B })).statusCode).toBe(400);
    expect((await PUT(app, await bearerFor(C), { fullName: NAME, parentGender: 'prefer_not_to_say' })).statusCode).toBe(404);
    const text = log.text();
    const raw = authorization.replace(/^Bearer /, '');
    for (const secret of [NAME, 'prefer_not_to_say', raw, raw.split('.')[1] ?? raw, ACCOUNT_A, ACCOUNT_B, C]) {
      expect(text, `the log contains ${secret.slice(0, 14)}`).not.toContain(secret);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.1 c15 c5 Q5] two writes at once, and a repeat', () => {
  it('[F2.1 c15 Q5] two simultaneous PUTs for A both answer 200 and the row ends as exactly one of them (last write wins)', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const one = { fullName: 'First Writer', parentGender: 'man' };
    const two = { fullName: 'Second Writer', parentGender: 'other' };
    const [r1, r2] = await Promise.all([PUT(app, header, one), PUT(app, header, two)]);
    expect(r1.statusCode, r1.body).toBe(200);
    expect(r2.statusCode, r2.body).toBe(200);
    expect(['First Writer/man', 'Second Writer/other']).toContain(await profileOf('a'));
  });

  it('[F2.1 c15] the same PUT twice in a row (a retry after a timeout) is 200 both times and the row is the same', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const body = { fullName: 'Retried Name', parentGender: 'man' };
    expect((await PUT(app, header, body)).statusCode).toBe(200);
    expect((await PUT(app, header, body)).statusCode).toBe(200);
    expect(await profileOf('a')).toBe('Retried Name/man');
  });
});
