import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { ACCOUNT_A, ACCOUNT_B, AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { CLOCK_NOW, EMPTY_DATE, buildRegisterApp, captureLog, jsonOf, post, validBody } from '../helpers/register-app.js';

// I2 F2.3a, GET and PUT /api/privacy against the real database (CI `db` job, as app_server, fixtures of supabase/tests/setup/):
//   a, b: regular, active   s: suspended   x: banned   p: professional, active   c: an Auth user with no nestly.users row
// Spec criteria (.work/profile-privacy/spec.md): 2 (each of the 8 combinations stored exactly as sent, and read back; one PUT for
// the three; two tabs: last write wins), 3 (outside the domain, not a boolean, any other key -> 400 {error:"invalid"}, no row
// changes), 5 (own row only; stopped -> 403 account_unavailable; unregistered -> 404 no_profile), 6 (the defaults, also for an
// account registered now, which sends none of them). Rows are read through tests.fx_privacy / tests.fx_state, which RLS does not
// filter. Derived from spec.md; route and key names from interface.md.

const T = { timeout: COLD_START_MS };
const S = '50000000-0000-4000-8000-000000000051';
const X = 'e0000000-0000-4000-8000-0000000000e5';
const P = 'd0000000-0000-4000-8000-0000000000d4';
const C = 'c0000000-0000-4000-8000-0000000000c3';
const DEFAULTS = { profileVisibility: 'open', isEmptyJourneySentenceShown: true, isChildBirthdayShared: true } as const;
const DEFAULTS_STORED = 'open/true/true';
type Settings = { profileVisibility: 'open' | 'restricted'; isEmptyJourneySentenceShown: boolean; isChildBirthdayShared: boolean };
const stored = (s: Settings): string => `${s.profileVisibility}/${String(s.isEmptyJourneySentenceShown)}/${String(s.isChildBirthdayShared)}`;

const COMBINATIONS: Settings[] = (['open', 'restricted'] as const).flatMap((profileVisibility) =>
  [false, true].flatMap((isEmptyJourneySentenceShown) =>
    [false, true].map((isChildBirthdayShared) => ({ profileVisibility, isEmptyJourneySentenceShown, isChildBirthdayShared }))));

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

async function start(database: Database = createDatabase(url())): Promise<App> {
  const app = await buildRegisterApp(env(), { database, clock: () => CLOCK_NOW, logStream: captureLog().stream });
  toClose.push({ app, database });
  return app;
}

const bearerFor = async (sub: string): Promise<string> => `Bearer ${await token({ key, sub })}`;
async function one(query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> {
  const rows = await query;
  return String(rows[0]?.v);
}
const privacyOf = (id: string) => one(side`select tests.fx_privacy(${id}::uuid) as v`);
const stateHash = () => one(side`select tests.fx_state() as v`);
const countsOf = (id: string) => one(side`select tests.fx_counts(${id}::uuid) as v`);
const setStatus = async (who: string, status: 'active' | 'suspended' | 'banned'): Promise<void> => {
  await side`select tests.set_status(tests.fx_id_checked(${who}), ${status})`;
};
const putDirect = async (id: string, s: Settings): Promise<void> => {
  await side`select tests.fx_privacy_put(${id}::uuid, ${s.profileVisibility}, ${s.isEmptyJourneySentenceShown}, ${s.isChildBirthdayShared})`;
};

const GET = (app: App, header: string | null, path = '/api/privacy') =>
  app.inject({ method: 'GET', url: path, headers: header === null ? {} : { authorization: header } });
const PUT = (app: App, header: string | null, payload: unknown, path = '/api/privacy') =>
  app.inject({
    method: 'PUT',
    url: path,
    headers: { 'content-type': 'application/json', ...(header === null ? {} : { authorization: header }) },
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

beforeAll(async () => {
  key = await newKey('privacy-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  await setStatus('a', 'active');
}, COLD_START_MS);

afterEach(async () => {
  await setStatus('a', 'active');
  await putDirect(ACCOUNT_A, DEFAULTS);
  await putDirect(ACCOUNT_B, DEFAULTS);
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
describe('[F2.3a c1 c6 BR-037 Q1 Q5] GET returns the caller\'s own settings; untouched accounts read the defaults', () => {
  it('[F2.3a c6] A, who never chose -> 200 open, sentence shown, birthday on, and nothing else', T, async () => {
    const app = await start();
    const res = await GET(app, await bearerFor(ACCOUNT_A));
    expect(res.statusCode, res.body).toBe(200);
    expect(jsonOf(res.body)).toEqual(DEFAULTS);
  });

  it('[F2.3a c6] an account registered now reads the three defaults, without its registration having sent them', T, async () => {
    const app = await start();
    const [row] = await side`select tests.fx_new_auth_user()::text as id`;
    const id = String(row?.id);
    const header = await bearerFor(id);
    const reg = await post(app, header, validBody({ stages: ['planning'], dueDate: EMPTY_DATE, children: [] }));
    expect(reg.statusCode, reg.body).toBe(201);
    expect(await privacyOf(id)).toBe(DEFAULTS_STORED);
    const res = await GET(app, header);
    expect(res.statusCode, res.body).toBe(200);
    expect(jsonOf(res.body)).toEqual(DEFAULTS);
  });

  it('[F2.3a c5 A1] the answer is about the token: B\'s id in the query, a header or the path changes nothing', T, async () => {
    const app = await start();
    await putDirect(ACCOUNT_B, { profileVisibility: 'restricted', isEmptyJourneySentenceShown: false, isChildBirthdayShared: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/privacy?id=${ACCOUNT_B}&userId=${ACCOUNT_B}&user_id=${ACCOUNT_B}`,
      headers: { authorization: await bearerFor(ACCOUNT_A), 'x-user-id': ACCOUNT_B },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(jsonOf(res.body)).toEqual(DEFAULTS);
    const byPath = await GET(app, await bearerFor(ACCOUNT_A), `/api/privacy/${ACCOUNT_B}`);
    expect(byPath.statusCode).toBeGreaterThanOrEqual(400);
    expect(byPath.body).not.toContain('restricted');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.3a c2 FR-PRIV-001 Q2] one PUT stores the three exactly as sent', () => {
  it.each(COMBINATIONS.map((s) => [stored(s), s] as const))('[F2.3a c2] %s -> 200 the stored values; the row and a later GET agree', T, async (_label, settings) => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const res = await PUT(app, header, settings);
    expect(res.statusCode, res.body).toBe(200);
    expect(jsonOf(res.body)).toEqual(settings);
    expect(await privacyOf(ACCOUNT_A)).toBe(stored(settings));
    const again = await start();
    const got = await GET(again, header);
    expect(got.statusCode, got.body).toBe(200);
    expect(jsonOf(got.body)).toEqual(settings);
  });

  it('[F2.3a c2] from restricted/off/off back to the defaults: every setting moves back, not only one', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    expect((await PUT(app, header, { profileVisibility: 'restricted', isEmptyJourneySentenceShown: false, isChildBirthdayShared: false })).statusCode).toBe(200);
    const res = await PUT(app, header, DEFAULTS);
    expect(res.statusCode, res.body).toBe(200);
    expect(await privacyOf(ACCOUNT_A)).toBe(DEFAULTS_STORED);
  });

  it('[F2.3a c2 Q2] two tabs saving at once both answer 200; the row ends as exactly one of them (last write wins)', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const one = { profileVisibility: 'restricted', isEmptyJourneySentenceShown: true, isChildBirthdayShared: false } as const;
    const two = { profileVisibility: 'open', isEmptyJourneySentenceShown: false, isChildBirthdayShared: true } as const;
    const [r1, r2] = await Promise.all([PUT(app, header, one), PUT(await start(), header, two)]);
    expect(r1.statusCode, r1.body).toBe(200);
    expect(r2.statusCode, r2.body).toBe(200);
    expect([stored(one), stored(two)]).toContain(await privacyOf(ACCOUNT_A));
  });

  it('[F2.3a c2] the same PUT twice (a retry after a timeout) is 200 both times and the row is the same', T, async () => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    const body = { profileVisibility: 'restricted', isEmptyJourneySentenceShown: false, isChildBirthdayShared: true } as const;
    expect((await PUT(app, header, body)).statusCode).toBe(200);
    expect((await PUT(app, header, body)).statusCode).toBe(200);
    expect(await privacyOf(ACCOUNT_A)).toBe(stored(body));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.3a c3 VAL-027 S2 rule 12] the server checks with the shared rules: 400 {error:"invalid"}, no row changes', () => {
  const INVALID: Array<[string, unknown]> = [
    ['visibility "public"', { ...DEFAULTS, profileVisibility: 'public' }],
    ['visibility "Open" (case)', { ...DEFAULTS, profileVisibility: 'Open' }],
    ['visibility "open " (a trailing space)', { ...DEFAULTS, profileVisibility: 'open ' }],
    ['visibility empty', { ...DEFAULTS, profileVisibility: '' }],
    ['visibility null', { ...DEFAULTS, profileVisibility: null }],
    ['visibility a number', { ...DEFAULTS, profileVisibility: 1 }],
    ['visibility a boolean', { ...DEFAULTS, profileVisibility: true }],
    ['visibility an array', { ...DEFAULTS, profileVisibility: ['open'] }],
    ['visibility 10 000 characters', { ...DEFAULTS, profileVisibility: 'o'.repeat(10_000) }],
    ['visibility shaped like SQL', { ...DEFAULTS, profileVisibility: "open'); update nestly.users set status = 'active';--" }],
    ['visibility "hidden" (no hide-from-search, VAL-027)', { ...DEFAULTS, profileVisibility: 'hidden' }],
    ['the sentence toggle as the string "true"', { ...DEFAULTS, isEmptyJourneySentenceShown: 'true' }],
    ['the sentence toggle as 1', { ...DEFAULTS, isEmptyJourneySentenceShown: 1 }],
    ['the sentence toggle as 0', { ...DEFAULTS, isEmptyJourneySentenceShown: 0 }],
    ['the sentence toggle null', { ...DEFAULTS, isEmptyJourneySentenceShown: null }],
    ['the birthday toggle as "yes"', { ...DEFAULTS, isChildBirthdayShared: 'yes' }],
    ['the birthday toggle as "false"', { ...DEFAULTS, isChildBirthdayShared: 'false' }],
    ['the birthday toggle null', { ...DEFAULTS, isChildBirthdayShared: null }],
    ['the birthday toggle an object', { ...DEFAULTS, isChildBirthdayShared: {} }],
    ['no visibility (one Save carries the three)', { isEmptyJourneySentenceShown: true, isChildBirthdayShared: true }],
    ['no sentence toggle', { profileVisibility: 'open', isChildBirthdayShared: true }],
    ['no birthday toggle', { profileVisibility: 'open', isEmptyJourneySentenceShown: true }],
    ['an empty object', {}],
  ];
  const FORBIDDEN: Array<[string, unknown]> = [
    ['userId', ACCOUNT_B], ['user_id', ACCOUNT_B], ['searchable', false], ['hiddenFromSearch', true],
    ['id', ACCOUNT_B], ['fullName', 'Hijacker Name'], ['status', 'active'], ['__proto__', { profileVisibility: 'restricted' }],
  ];

  it.each(INVALID)('[F2.3a c3] %s -> 400 {error:"invalid"}, the database byte-for-byte unchanged', T, async (_label, body) => {
    const app = await start();
    const before = await stateHash();
    const res = await PUT(app, await bearerFor(ACCOUNT_A), body);
    expect(res.statusCode, res.body).toBe(400);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid' });
    expect(await stateHash()).toBe(before);
    expect(await privacyOf(ACCOUNT_A)).toBe(DEFAULTS_STORED);
  });

  // c3 promises only "400" for another key (the {error:"invalid"} body is promised for the domain and type cases above).
  it.each(FORBIDDEN)('[F2.3a c3 VAL-027 rule 12] a valid body plus the key %s -> 400; neither A nor B changes', T, async (name, value) => {
    const app = await start();
    const before = await stateHash();
    const raw = `{"profileVisibility":"restricted","isEmptyJourneySentenceShown":false,"isChildBirthdayShared":false,${JSON.stringify(name)}:${JSON.stringify(value)}}`;
    const res = await PUT(app, await bearerFor(ACCOUNT_A), raw);
    expect(res.statusCode, res.body).toBe(400);
    expect(await stateHash()).toBe(before);
    expect(await privacyOf(ACCOUNT_A)).toBe(DEFAULTS_STORED);
    expect(await privacyOf(ACCOUNT_B)).toBe(DEFAULTS_STORED);
  });

  it.each([['an array', [DEFAULTS]], ['a string', 'open'], ['null', null], ['a number', 7]])('[F2.3a c3] a body that is %s -> 400, nothing changes', T, async (_label, body) => {
    const app = await start();
    const before = await stateHash();
    const res = await PUT(app, await bearerFor(ACCOUNT_A), JSON.stringify(body));
    expect(res.statusCode, res.body).toBe(400);
    expect(await stateHash()).toBe(before);
  });

  it('[F2.3a c3] a body that is not JSON, or empty, is a 4xx and changes nothing', T, async () => {
    const app = await start();
    const before = await stateHash();
    for (const raw of ['{"profileVisibility":', '', 'not json']) {
      const res = await PUT(app, await bearerFor(ACCOUNT_A), raw);
      expect(res.statusCode, raw).toBeGreaterThanOrEqual(400);
      expect(res.statusCode, raw).toBeLessThan(500);
    }
    expect(await stateHash()).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.3a c5 A1 rules 12 14] the caller\'s own row only', () => {
  it('[F2.3a c5 A1] A\'s valid body with B\'s id in the query and a header writes A\'s row only; B is untouched', T, async () => {
    const app = await start();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/privacy?id=${ACCOUNT_B}&userId=${ACCOUNT_B}&user_id=${ACCOUNT_B}`,
      headers: { authorization: await bearerFor(ACCOUNT_A), 'content-type': 'application/json', 'x-user-id': ACCOUNT_B },
      payload: JSON.stringify({ profileVisibility: 'restricted', isEmptyJourneySentenceShown: false, isChildBirthdayShared: false }),
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await privacyOf(ACCOUNT_A)).toBe('restricted/false/false');
    expect(await privacyOf(ACCOUNT_B)).toBe(DEFAULTS_STORED);
  });

  it('[F2.3a c5 A1] PUT /api/privacy/<B> writes nothing', T, async () => {
    const app = await start();
    const before = await stateHash();
    const res = await PUT(app, await bearerFor(ACCOUNT_A), { profileVisibility: 'restricted', isEmptyJourneySentenceShown: false, isChildBirthdayShared: false }, `/api/privacy/${ACCOUNT_B}`);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(await stateHash()).toBe(before);
  });

  it('[F2.3a c5 A1] B saving changes B\'s row and never A\'s; A\'s GET does not show B\'s values', T, async () => {
    const app = await start();
    const res = await PUT(app, await bearerFor(ACCOUNT_B), { profileVisibility: 'restricted', isEmptyJourneySentenceShown: true, isChildBirthdayShared: false });
    expect(res.statusCode, res.body).toBe(200);
    expect(await privacyOf(ACCOUNT_B)).toBe('restricted/true/false');
    expect(await privacyOf(ACCOUNT_A)).toBe(DEFAULTS_STORED);
    expect(jsonOf((await GET(app, await bearerFor(ACCOUNT_A))).body)).toEqual(DEFAULTS);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.3a c5 A9 rule 15] a stopped account reads and writes nothing', () => {
  it.each([['s', S], ['x', X]] as const)('[F2.3a c5] the fixture account %s: GET and PUT -> 403 account_unavailable, nothing changes', T, async (_who, id) => {
    const app = await start();
    const before = await stateHash();
    const got = await GET(app, await bearerFor(id));
    expect(got.statusCode, got.body).toBe(403);
    expect(jsonOf(got.body)).toEqual({ error: 'account_unavailable' });
    const put = await PUT(app, await bearerFor(id), { profileVisibility: 'restricted', isEmptyJourneySentenceShown: false, isChildBirthdayShared: false });
    expect(put.statusCode, put.body).toBe(403);
    expect(jsonOf(put.body)).toEqual({ error: 'account_unavailable' });
    expect(await stateHash()).toBe(before);
    expect(await privacyOf(id)).toBe(DEFAULTS_STORED);
  });

  it.each(['suspended', 'banned'] as const)('[F2.3a c5] A becomes %s: the same token reads and writes nothing; active again, it works', T, async (status) => {
    const app = await start();
    const header = await bearerFor(ACCOUNT_A);
    expect((await GET(app, header)).statusCode).toBe(200);
    await setStatus('a', status);
    const got = await GET(app, header);
    expect(got.statusCode, got.body).toBe(403);
    expect(jsonOf(got.body)).toEqual({ error: 'account_unavailable' });
    const put = await PUT(app, header, { profileVisibility: 'restricted', isEmptyJourneySentenceShown: false, isChildBirthdayShared: false });
    expect(put.statusCode, put.body).toBe(403);
    expect(jsonOf(put.body)).toEqual({ error: 'account_unavailable' });
    expect(await privacyOf(ACCOUNT_A)).toBe(DEFAULTS_STORED);
    await setStatus('a', 'active');
    const back = await PUT(app, header, { profileVisibility: 'restricted', isEmptyJourneySentenceShown: false, isChildBirthdayShared: false });
    expect(back.statusCode, back.body).toBe(200);
    expect(await privacyOf(ACCOUNT_A)).toBe('restricted/false/false');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.3a c5 FR-AUTH-004] no Regular profile: 404 no_profile, nothing created', () => {
  it('[F2.3a c5] an Auth user with no account row: GET and PUT -> 404 {error:"no_profile"}; the database is unchanged', T, async () => {
    const app = await start();
    const before = await stateHash();
    const got = await GET(app, await bearerFor(C));
    expect(got.statusCode, got.body).toBe(404);
    expect(jsonOf(got.body)).toEqual({ error: 'no_profile' });
    const put = await PUT(app, await bearerFor(C), DEFAULTS);
    expect(put.statusCode, put.body).toBe(404);
    expect(jsonOf(put.body)).toEqual({ error: 'no_profile' });
    expect(await stateHash()).toBe(before);
    expect(await countsOf(C)).toBe('0/0/0/0/0');
  });

  it('[F2.3a c5 scope "Regular only"] a Professional account has no Regular settings: GET and PUT are refused, nothing is created', T, async () => {
    const app = await start();
    const before = await stateHash();
    const got = await GET(app, await bearerFor(P));
    expect(got.statusCode, got.body).toBeGreaterThanOrEqual(400);
    const put = await PUT(app, await bearerFor(P), { profileVisibility: 'restricted', isEmptyJourneySentenceShown: false, isChildBirthdayShared: false });
    expect(put.statusCode, put.body).toBeGreaterThanOrEqual(400);
    expect(await stateHash()).toBe(before);
    expect(await privacyOf(P)).toBe('-');
  });
});
