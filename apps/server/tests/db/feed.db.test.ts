import type { Writable } from 'node:stream';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { feedPageResponse, parseFeedCursor, serializeFeedCursor, type FeedPageResponse } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, toRecord, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { CLOCK_NOW, buildRegisterApp, captureLog, post, refusingDatabase, validBody } from '../helpers/register-app.js';

// I3 F3.2a2, GET /api/feed under RLS (CI db job, as app_server); criteria c1-c12 of .work/feed-view/spec.md. Expected values are hand-computed from the I3-algorithm.md
// formula (v1: wFresh 1, half-life 24 h, wFriend .5, wQuality .2, cap 20, 14 days, page 20, caps 2/5). Ranking tests fix asOf in the past with a "top" cursor;
// created_at comes from supabase/tests/setup/72_feed_view_fixtures.sql. Live tests use DB time.

const T = { timeout: COLD_START_MS };
const FEED = '/api/feed';
const ASOF = '2026-01-15T12:00:00.000000Z';
const HOUR = 3_600_000;
const ASOF_MS = Date.parse('2026-01-15T12:00:00Z');
const iso = (ms: number): string => new Date(ASOF_MS + ms).toISOString().replace('Z', '000Z');
const ago = (hours: number): string => iso(-Math.round(hours * HOUR));
const TOP_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const topCursor = (asOf = ASOF): string => serializeFeedCursor({ asOf, configVersion: 1, tier: 0, score: 1e9, createdAt: asOf, id: TOP_ID });
const b64 = (text: string): string => Buffer.from(text).toString('base64url');
const DB_TEXT = `to_char((%s) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const P = 'd0000000-0000-4000-8000-0000000000d4';
const S = '50000000-0000-4000-8000-000000000051';

interface Member { id: string; header: string }
interface Seed { by: Member; aud?: 'everyone' | 'friends'; anon?: boolean; at?: string; ago?: number; tag?: string; shared?: string; body?: string; status?: string }

const NAMES = ['Vera Viewer', 'Fiona Friend', 'Tamar Stranger', 'Uri Second', 'Weston Third', 'Yael Fourth', 'Kobi Fifth', 'Rina Restricted', 'Xavi Outsider'];
let V: Member, F: Member, Tm: Member, U: Member, W: Member, Y: Member, K: Member, R: Member, X: Member;
let everyone: Member[] = [];
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
async function start(database: Database = createDatabase(url()), logStream?: Writable): Promise<App> {
  const app = await buildRegisterApp(env(), { database, clock: () => CLOCK_NOW, ...(logStream ? { logStream } : {}) });
  toClose.push({ app, database });
  return app;
}
function recording(statements: string[]): Database {
  const client = postgres(url(), { max: 1, prepare: false, debug: (_connection: number, query: string) => void statements.push(query) });
  return { db: drizzle({ client }), client, close: () => client.end() };
}
const bearerFor = async (sub: string): Promise<string> => `Bearer ${await token({ key, sub })}`;
async function inTx(work: (tx: postgres.TransactionSql) => Promise<void>): Promise<void> {
  await side.begin(async (tx) => {
    await tx`select 1`;
    await work(tx);
  });
}
const text = async (query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> => String((await query)[0]?.v);

async function seedOne(tx: postgres.TransactionSql, s: Seed): Promise<string> {
  const id = await text(tx`select tests.fx_po_add(${s.by.id}::uuid, ${s.aud ?? 'everyone'}, ${s.anon ?? false}, 'active', ${s.body ?? 'post body'}, ${s.tag ?? null}::text, ${s.shared ?? null}::uuid)::text as v`);
  if (s.at !== undefined) await tx`select tests.fx_fv_at('post', ${id}::uuid, ${s.at}::text::timestamptz)`;
  if (s.ago !== undefined) await tx`select tests.fx_fv_ago('post', ${id}::uuid, ${s.ago}::float8 * interval '1 hour')`;
  if (s.status !== undefined) await tx`select tests.fx_po_status(${id}::uuid, ${s.status})`;
  return id;
}
async function mkAll(specs: Seed[]): Promise<string[]> {
  const out: string[] = [];
  await inTx(async (tx) => {
    for (const s of specs) out.push(await seedOne(tx, s));
  });
  return out;
}
const mk = async (s: Seed): Promise<string> => (await mkAll([s]))[0] ?? '';
async function comment(by: Member, postId: string, at: string, parent?: string): Promise<string> {
  let id = '';
  await inTx(async (tx) => {
    id = await text(tx`select tests.fx_cm_add(${by.id}::uuid, ${postId}::uuid, 'c', ${parent ?? null}::uuid)::text as v`);
    await tx`select tests.fx_fv_at('comment', ${id}::uuid, ${at}::text::timestamptz)`;
  });
  return id;
}
const comments = (by: Member, postId: string, n: number, at: string): Promise<void> =>
  inTx(async (tx) => void (await tx`select tests.fx_fv_cm(${by.id}::uuid, ${postId}::uuid, ${n}, ${at}::text::timestamptz)`));
const like = (by: Member, postId: string, at: string): Promise<void> =>
  inTx(async (tx) => void (await tx`select tests.fx_fv_rx(${by.id}::uuid, ${postId}::uuid, ${at}::text::timestamptz)`));
const likeComment = (by: Member, commentId: string, at: string): Promise<void> =>
  inTx(async (tx) => {
    const id = await text(tx`select tests.fx_rx_add(${by.id}::uuid, null, ${commentId}::uuid)::text as v`);
    await tx`select tests.fx_fv_at('reaction', ${id}::uuid, ${at}::text::timestamptz)`;
  });
const befriend = (req: Member, addr: Member, status = 'accepted'): Promise<void> =>
  inTx(async (tx) => void (await tx`select tests.fx_fr_add(${req.id}::uuid, ${addr.id}::uuid, ${status}, false)`));
const setStatus = (m: Member, status: string): Promise<unknown> => side`select tests.set_status(${m.id}::uuid, ${status})`;
const statusOf = (id: string, status: string): Promise<unknown> => side`select tests.fx_po_status(${id}::uuid, ${status})`;
const dbNow = (offset = '0 seconds'): Promise<string> => text(side.unsafe(`select ${DB_TEXT.replace('%s', `now() + interval '${offset}'`)} as v`));
const dbClock = (): Promise<string> => text(side.unsafe(`select ${DB_TEXT.replace('%s', 'clock_timestamp()')} as v`));

const feed = (app: App, header: string | null, cursor?: string) =>
  app.inject({ method: 'GET', url: cursor === undefined ? FEED : `${FEED}?cursor=${encodeURIComponent(cursor)}`, headers: header === null ? {} : { authorization: header } });
async function page(app: App, header: string, cursor?: string): Promise<FeedPageResponse> {
  const res = await feed(app, header, cursor);
  expect(res.statusCode, res.body).toBe(200);
  return parsePage(res.body);
}
const parsePage = (body: string): FeedPageResponse => {
  const raw: unknown = JSON.parse(body);
  return feedPageResponse.parse(raw);
};
const live = async (app: App, who: Member = V): Promise<string[]> => ids(await page(app, who.header));
const ids =(p: FeedPageResponse): string[] => p.items.map((i) => i.id);
const byIdDesc = (list: string[]): string[] => [...list].sort().reverse();
const top = async (app: App, who: Member = V): Promise<string[]> => ids(await page(app, who.header, topCursor()));
const errorOf = (body: string): unknown => toRecord(JSON.parse(body)).error;
const cycle = <A>(list: A[], i: number): A => {
  const value = list[i % list.length];
  if (value === undefined) throw new Error('empty list');
  return value;
};

async function reset(): Promise<void> {
  await side`select tests.fx_feed_clear()`;
  for (const m of everyone) {
    await side`select tests.fx_fr_purge(${m.id}::uuid)`;
    await setStatus(m, 'active');
  }
}

beforeAll(async () => {
  key = await newKey('feed-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  const app = await start();
  const made: Member[] = [];
  for (const fullName of NAMES) {
    const id = await text(side`select tests.fx_new_auth_user()::text as v`);
    const header = await bearerFor(id);
    const res = await post(app, header, validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push({ id, header });
  }
  everyone = made;
  const none: Member = { id: '', header: '' };
  [V = none, F = none, Tm = none, U = none, W = none, Y = none, K = none, R = none, X = none] = made;
  await side`select tests.fx_restrict(${R.id}::uuid)`;
  await closeAll();
}, COLD_START_MS * 3);
async function closeAll(): Promise<void> {
  for (const { app, database } of toClose.splice(0)) {
    await app.close();
    await database.close();
  }
}
beforeEach(reset);
afterEach(closeAll);
afterAll(async () => {
  await reset();
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

describe('[F3.2-a2 c1 FR-FEED-001 BR-065] eligibility is the database\'s: who sees which post', () => {
  it('[F3.2-a2 c1] viewer V sees exactly: own (named, friends-only, anonymous), a friend\'s friends-only, a stranger\'s everyone, a restricted author\'s everyone, a stranger\'s anonymous', T, async () => {
    const app = await start();
    await befriend(V, F);
    await befriend(W, V, 'pending');
    await befriend(V, K, 'removed');
    const [own = '', ownFr = '', ownAnon = '', frFr = '', str = '', restr = '', anon = ''] = await mkAll([
      { by: V }, { by: V, aud: 'friends' }, { by: V, anon: true }, { by: F, aud: 'friends' }, { by: Tm }, { by: R }, { by: Tm, anon: true },
    ]);
    // never visible to V
    const strFr = await mk({ by: Tm, aud: 'friends' });
    const pendFr = await mk({ by: W, aud: 'friends' });
    const remFr = await mk({ by: K, aud: 'friends' });
    const susp = await mk({ by: U });
    const banned = await mk({ by: Y });
    const gone = await mkAll([{ by: Tm, status: 'removed' }, { by: Tm, status: 'deleted' }, { by: Tm, status: 'hidden' }]);
    const hidden = await mk({ by: Tm });
    const reported = await mk({ by: Tm });
    await setStatus(U, 'suspended');
    await setStatus(Y, 'banned');
    await side`select tests.fx_ph_add(${V.id}::uuid, ${hidden}::uuid)`;
    await inTx(async (tx) => void (await tx`select tests.fx_rp_add(${V.id}::uuid, 'post', ${reported}::uuid, 'spam', null)`));
    const seen = await live(app);
    expect([...seen].sort()).toEqual([own, ownFr, ownAnon, frFr, str, restr, anon].sort());
    for (const id of [strFr, pendFr, remFr, susp, banned, hidden, reported, ...gone]) expect(seen).not.toContain(id);
  });

  it('[F3.2-a2 c1] a post V hid or reported is still seen by others; a stranger sees no friends-only post', T, async () => {
    const app = await start();
    await befriend(V, F);
    const [hidden = '', reported = '', fr = '', strFr = ''] = await mkAll([{ by: Tm }, { by: Tm }, { by: F, aud: 'friends' }, { by: Tm, aud: 'friends' }]);
    await side`select tests.fx_ph_add(${V.id}::uuid, ${hidden}::uuid)`;
    await inTx(async (tx) => void (await tx`select tests.fx_rp_add(${V.id}::uuid, 'post', ${reported}::uuid, 'spam', null)`));
    const asX = await live(app, X);
    expect([...asX].sort()).toEqual([hidden, reported].sort());
    expect(asX).not.toContain(fr);
    expect(asX).not.toContain(strFr);
    expect(await live(app, V)).not.toContain(hidden);
    expect(await live(app, V)).not.toContain(reported);
  });

  it('[F3.2-a2 c1] a suspended author\'s posts disappear and come back with the author (reactivation)', T, async () => {
    const app = await start();
    const p = await mk({ by: U });
    expect(await live(app)).toEqual([p]);
    await setStatus(U, 'suspended');
    expect(await live(app)).toEqual([]);
    await setStatus(U, 'active');
    expect(await live(app)).toEqual([p]);
  });
});

describe('[F3.2-a2 c3 FR-ALG-002] ordering fixtures, seeded v1, fixed asOf', () => {
  it('[F3.2-a2 c3] a friend\'s post is above an equal stranger\'s, and above a stranger\'s newer one (0.5 beats 12 h of freshness)', T, async () => {
    const app = await start();
    await befriend(V, F);
    const [pT = '', pF = '', pFold = ''] = await mkAll([{ by: Tm, at: ago(0) }, { by: F, at: ago(0) }, { by: F, at: ago(12) }]);
    expect(await top(app)).toEqual([pF, pFold, pT]); // 1.5 > 0.5+2^-0.5=1.207 > 1.0
  });

  it('[F3.2-a2 c3] a post 24 h older has half the freshness term: friend@24h (1.0) sits between a quality-capped fresh stranger (1.186) and a 1-minute older stranger (0.985)', T, async () => {
    const app = await start();
    await befriend(V, F);
    const [s0 = '', f24 = '', s1 = ''] = await mkAll([{ by: Tm, at: ago(0.5) }, { by: F, at: ago(24) }, { by: U, at: ago(0.5 + 1 / 60) }]);
    await comments(W, s0, 20, ago(0.2));
    expect(await top(app)).toEqual([s0, f24, s1]);
  });

  it('[F3.2-a2 c3] equal scores tie-break created_at desc: stranger@0 (1.0) above friend@24h (0.5+0.5)', T, async () => {
    const app = await start();
    await befriend(V, F);
    const [f24 = '', s0 = ''] = await mkAll([{ by: F, at: ago(24) }, { by: Tm, at: ago(0) }]);
    expect(await top(app)).toEqual([s0, f24]);
  });

  it('[F3.2-a2 c3] equal score and created_at tie-break id desc; the same in tier 1', T, async () => {
    const app = await start();
    const [a = '', b = ''] = await mkAll([{ by: Tm, at: ago(5) }, { by: U, at: ago(5) }]);
    expect(await top(app)).toEqual(byIdDesc([a, b]));
    await reset();
    const [c = '', d = '', older = ''] = await mkAll([{ by: Tm, at: ago(500) }, { by: U, at: ago(500) }, { by: W, at: ago(501) }]);
    expect(await top(app)).toEqual([...byIdDesc([c, d]), older]);
  });

  it('[F3.2-a2 c3 c5] quality caps: n=20 equals n=200 (the older n=200 stays below), n=1 beats n=0 at equal age', T, async () => {
    const app = await start();
    const [x20 = '', y200 = '', z1 = '', z0 = ''] = await mkAll([{ by: Tm, at: ago(2) }, { by: U, at: ago(2 + 1 / 60) }, { by: K, at: ago(2) }, { by: R, at: ago(2) }]);
    await comments(W, x20, 20, ago(1.5));
    await comments(W, y200, 200, ago(1.5));
    await comments(W, z1, 1, ago(1.5));
    expect(await top(app)).toEqual([x20, y200, z1, z0]);
  });

  it('[F3.2-a2 c3] tier: age <= 14 days is tier 0 (exactly 14 d included), older follows all of tier 0 by created_at desc whatever its friend or quality', T, async () => {
    const app = await start();
    await befriend(V, F);
    const [t13 = '', f14 = '', f14p = '', o20 = '', o30 = ''] = await mkAll([
      { by: Tm, at: ago(13 * 24) }, { by: F, at: ago(336) }, { by: F, at: '2026-01-01T11:59:59.999999Z' }, { by: X, at: ago(20 * 24) }, { by: U, at: ago(30 * 24) },
    ]);
    await comments(W, o30, 20, ago(1));
    // tier 0: friend@14d 0.5+2^-14 > stranger@13d 2^-13; tier 1 (14 d + 1 µs, 20 d, 30 d): created_at desc
    expect(await top(app)).toEqual([f14, t13, f14p, o20, o30]);
  });

  it('[F3.2-a2 c3] an anonymous post by the viewer\'s friend gets Friend term 0 (a named one of the same age gets 0.5)', T, async () => {
    const app = await start();
    await befriend(V, F);
    const [pS = '', pAnon = '', pFriend = ''] = await mkAll([{ by: Tm, at: ago(0) }, { by: F, anon: true, at: ago(2) }, { by: F, at: ago(2) }]);
    expect(await top(app)).toEqual([pFriend, pS, pAnon]); // 1.444 > 1.0 > 0.944
  });
});

describe('[F3.2-a2 c4] Stage is a signal, never a filter (v1 wStage 0)', () => {
  it('[F3.2-a2 c4] V (pregnant) gets the same set and the id-desc tie order whatever the posts are tagged; no statement reads journey_contexts', T, async () => {
    const statements: string[] = [];
    const app = await start(recording(statements));
    const tags: Array<[string | undefined, string | undefined, string | undefined]> = [['pregnant', 'has_child', undefined], ['has_child', undefined, 'pregnant'], [undefined, 'pregnant', 'has_child']];
    for (const [a, b, c] of tags) {
      await reset();
      const made = await mkAll([{ by: Tm, at: ago(5), ...(a ? { tag: a } : {}) }, { by: U, at: ago(5), ...(b ? { tag: b } : {}) }, { by: W, at: ago(5), ...(c ? { tag: c } : {}) }]);
      expect(await top(app)).toEqual(byIdDesc(made));
    }
    expect(statements.length).toBeGreaterThan(0);
    expect(statements.filter((q) => /journey_contexts/i.test(q))).toEqual([]);
  });
});

describe('[F3.2-a2 c5 FR-ALG-002] what n counts (one counted comment on B must beat whatever is uncounted on A)', () => {
  // A has k >= 2 rows that must not count (wrongly counted n=2 gives 0.072 > the 0.0455 of B's one counted comment); B has exactly one.
  const run = async (prepareA: (a: string) => Promise<void>, anonA = false): Promise<void> => {
    const app = await start();
    const a = await mk({ by: anonA ? Y : Tm, anon: anonA, at: ago(3) });
    const b = await mk({ by: U, at: ago(3) });
    await prepareA(a);
    await comment(W, b, ago(1));
    expect(await top(app)).toEqual([b, a]);
  };
  it('[F3.2-a2 c5] the named author\'s own like and comment are not counted', T, () => run(async (a) => { await like(Tm, a, ago(1)); await comment(Tm, a, ago(1)); }));
  it('[F3.2-a2 c5 BR-062] nor the anonymous author\'s ("the author" flag, no author read)', T, () => run(async (a) => { await like(Y, a, ago(1)); await comment(Y, a, ago(1)); }, true));
  it('[F3.2-a2 c5] likes on comments are not counted (nor the author\'s own comment they hang on)', T, () =>
    run(async (a) => { const c = await comment(Tm, a, ago(1)); await likeComment(K, c, ago(1)); await likeComment(R, c, ago(1)); }));
  it('[F3.2-a2 c5] rows of suspended and banned accounts are not counted', T, () =>
    run(async (a) => { await comments(Y, a, 2, ago(1)); await like(K, a, ago(1)); await setStatus(Y, 'suspended'); await setStatus(K, 'banned'); }));
  it('[F3.2-a2 c5] rows created after asOf are not counted', T, () => run(async (a) => { await comments(R, a, 2, iso(HOUR)); }));
  it('[F3.2-a2 c5] reports change nothing: the lower id is reported twice and still ranks below the other by id desc', T, async () => {
    const app = await start();
    const [a = '', b = ''] = await mkAll([{ by: Tm, at: ago(3) }, { by: U, at: ago(3) }]);
    const [low] = [a, b].sort();
    await inTx(async (tx) => {
      await tx`select tests.fx_rp_add(${W.id}::uuid, 'post', ${low ?? ''}::uuid, 'spam', null)`;
      await tx`select tests.fx_rp_add(${Y.id}::uuid, 'post', ${low ?? ''}::uuid, 'spam', null)`;
    });
    expect(await top(app)).toEqual(byIdDesc([a, b]));
  });
  it('[F3.2-a2 c5] likes, comments and replies of others count: reply-thread (n=2) > one like (n=1) > none', T, async () => {
    const app = await start();
    const [reply = '', liked = '', none = ''] = await mkAll([{ by: Tm, at: ago(3) }, { by: U, at: ago(3) }, { by: K, at: ago(3) }]);
    const top1 = await comment(U, reply, ago(1));
    await comment(W, reply, ago(1), top1);
    await like(W, liked, ago(1));
    expect(await top(app)).toEqual([reply, liked, none]);
  });
});

describe('[F3.2-a2 c6 c7] the cursor: structure, DB time, microseconds, stability', () => {
  const good = { asOf: ASOF, configVersion: 1, tier: 0, score: 0.5, createdAt: ASOF, id: TOP_ID };
  const raw = (over: Record<string, unknown>): string => b64(JSON.stringify({ ...good, ...over }));
  const bad: Array<[string, string]> = [
    ['not base64url', '!!! not a cursor'],
    ['base64 of text that is not JSON', b64('hello')],
    ['JSON null', b64('null')],
    ['JSON array', b64('[]')],
    ['an extra key', raw({ extra: 1 })],
    ['score as a string', raw({ score: '0.5' })],
    ['score null', raw({ score: null })],
    ['score infinite (1e999)', b64(JSON.stringify(good).replace('0.5', '1e999'))],
    ['asOf with 3 fractional digits', raw({ asOf: '2026-01-15T12:00:00.000Z' })],
    ['asOf not a calendar day', raw({ asOf: '2026-02-30T12:00:00.000000Z' })],
    ['createdAt with 3 fractional digits', raw({ createdAt: '2026-01-15T12:00:00.123Z' })],
    ['tier 2', raw({ tier: 2 })],
    ['tier as a string', raw({ tier: '0' })],
    ['configVersion -1', raw({ configVersion: -1 })],
    ['configVersion 1.5', raw({ configVersion: 1.5 })],
    ['id not a uuid', raw({ id: 'not-a-uuid' })],
    ['very long', 'A'.repeat(5000)],
  ];
  it('[F3.2-a2 c6] every structurally invalid cursor -> 400 {error: cursor_invalid} and no statement touches posts', T, async () => {
    const statements: string[] = [];
    const app = await start(recording(statements));
    for (const [name, cursor] of bad) {
      const res = await feed(app, V.header, cursor);
      expect(res.statusCode, `${name}: ${res.body}`).toBe(400);
      expect(errorOf(res.body), name).toBe('cursor_invalid');
    }
    const twice = await app.inject({ method: 'GET', url: `${FEED}?cursor=${topCursor()}&cursor=${topCursor()}`, headers: { authorization: V.header } });
    expect(twice.statusCode, twice.body).toBe(400);
    expect(statements.filter((q) => /\bposts\b/i.test(q))).toEqual([]);
  });

  it('[F3.2-a2 c6] an asOf later than the database\'s now() -> the same 400, checked in the database', T, async () => {
    const app = await start();
    for (const offset of ['1 minute', '1 day', '10 years']) {
      const res = await feed(app, V.header, topCursor(await dbNow(offset)));
      expect(res.statusCode, `${offset}: ${res.body}`).toBe(400);
      expect(errorOf(res.body)).toBe('cursor_invalid');
    }
    expect((await feed(app, V.header, topCursor(await dbNow('-1 minute')))).statusCode).toBe(200);
  });

  it('[F3.2-a2 c7] asOf is the database\'s now() with six digits, never a JS Date: bracketed by DB clock readings, and not always .xxx000', T, async () => {
    const app = await start();
    await mkAll(Array.from({ length: 21 }, (_, i) => ({ by: cycle([Tm, U, W, Y, K, R, X], i), ago: i + 1 })));
    const tails = new Set<string>();
    for (let i = 0; i < 6; i += 1) {
      const before = await dbClock();
      const p = await page(app, V.header);
      const after = await dbClock();
      const cursor = parseFeedCursor(p.nextCursor);
      expect(cursor, 'a 21st post exists, so there is a next cursor').not.toBeNull();
      expect(cursor?.asOf).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
      expect((cursor?.asOf ?? '') >= before && (cursor?.asOf ?? '') <= after, `${before} <= ${cursor?.asOf} <= ${after}`).toBe(true);
      tails.add((cursor?.asOf ?? '').slice(-4, -1));
    }
    expect([...tails].some((t) => t !== '000'), `asOf microsecond tails all end in 000: ${[...tails].join(',')}`).toBe(true);
  });

  for (const [label, shiftMs] of [['.000000', 0], ['.120000', 120]] as const) {
    it(`[F3.2-a2 c7 c9] created_at with microseconds ${label}: order kept, the cursor carries the exact text, page 2 continues with nothing repeated or skipped`, T, async () => {
      const app = await start();
      const made = await mkAll(Array.from({ length: 22 }, (_, i) => ({ by: cycle([Tm, U, W, Y, K, R, X], i), at: iso(-(i + 1) * HOUR + shiftMs) })));
      const first = await page(app, V.header, topCursor());
      expect(ids(first)).toEqual(made.slice(0, 20));
      const cursor = parseFeedCursor(first.nextCursor);
      expect(cursor).toMatchObject({ asOf: ASOF, configVersion: 1, tier: 0, id: made[19], createdAt: iso(-20 * HOUR + shiftMs) });
      const second = await page(app, V.header, first.nextCursor ?? '');
      expect(ids(second)).toEqual(made.slice(20));
      expect(second.nextCursor).toBeNull();
    });
  }

  it('[F3.2-a2 c7] scores that differ only by 1 µs of age keep their order across the page edge (float8 round trip through the cursor)', T, async () => {
    const app = await start();
    const base = ago(1).slice(0, 19);
    const made = await mkAll(Array.from({ length: 25 }, (_, i) => ({ by: cycle([Tm, U, W, Y, K, R, X], i), at: `${base}.${String(i).padStart(6, '0')}Z` })));
    const newestFirst = [...made].reverse();
    const first = await page(app, V.header, topCursor());
    expect(ids(first)).toEqual(newestFirst.slice(0, 20));
    const second = await page(app, V.header, first.nextCursor ?? '');
    expect(ids(second)).toEqual(newestFirst.slice(20));
    expect(second.nextCursor).toBeNull();
  });

  it('[F3.2-a2 c7] 3 pages, 3 posts inserted after asOf and one eligible post deleted between pages: no repeat, none skipped', T, async () => {
    const app = await start();
    const made = await mkAll(Array.from({ length: 45 }, (_, i) => ({ by: cycle([Tm, U, W, Y, K, R, X], i), ago: i + 1 })));
    const first = await page(app, V.header);
    expect(first.items).toHaveLength(20);
    const fresh = await mkAll([{ by: Tm }, { by: U }, { by: W }]);
    await statusOf(made[29] ?? '', 'deleted');
    const second = await page(app, V.header, first.nextCursor ?? '');
    const third = await page(app, V.header, second.nextCursor ?? '');
    const all = [...ids(first), ...ids(second), ...ids(third)];
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(made.filter((id) => id !== made[29]).sort());
    for (const id of fresh) expect(all).not.toContain(id);
    expect([ids(second).length, ids(third).length]).toEqual([20, 4]);
    expect(third.nextCursor).toBeNull();
  });
});

describe('[F3.2-a2 c9 c8] nextCursor is built from the last ranked unit, before re-ranking', () => {
  it('[F3.2-a2 c9] the last ranked unit is displaced to mid-page: it sits at slot 3, the cursor is its own, page 2 is exactly the next unit', T, async () => {
    const app = await start();
    const tPosts = await mkAll(Array.from({ length: 19 }, (_, i) => ({ by: Tm, at: ago(i + 1) })));
    const [u = '', w = ''] = await mkAll([{ by: U, at: ago(20) }, { by: W, at: ago(21) }]);
    const first = await page(app, V.header, topCursor());
    expect(ids(first)).toEqual([tPosts[0], tPosts[1], u, ...tPosts.slice(2)]); // cap 2 per 5: the third T post waits for U
    expect(parseFeedCursor(first.nextCursor)?.id).toBe(u);
    const second = await page(app, V.header, first.nextCursor ?? '');
    expect(ids(second)).toEqual([w]);
    expect(second.nextCursor).toBeNull();
  });

  it('[F3.2-a2 c9 c8] the last ranked units are suppressed duplicates of one original: they are not shown, not repeated on page 2, and the cursor is the last one\'s', T, async () => {
    const app = await start();
    const fill = (i: number, hours: number): Seed => ({ by: cycle([K, R, X, Y, W], i), at: ago(hours) });
    const head = await mkAll([fill(0, 1), fill(1, 2)]);
    const original = await mk({ by: Tm, at: ago(3) });
    const mid = await mkAll(Array.from({ length: 15 }, (_, i) => fill(i + 2, i + 4)));
    const [s1 = '', s2 = ''] = await mkAll([{ by: U, shared: original, at: ago(19) }, { by: Y, shared: original, at: ago(20) }]);
    const last = await mk({ by: K, at: ago(21) });
    const first = await page(app, V.header, topCursor());
    expect(ids(first)).toEqual([...head, original, ...mid]);
    expect(ids(first)).not.toContain(s1);
    expect(ids(first)).not.toContain(s2);
    expect(parseFeedCursor(first.nextCursor)?.id).toBe(s2);
    const second = await page(app, V.header, first.nextCursor ?? '');
    expect(ids(second)).toEqual([last]);
  });
});

describe('[F3.2-a2 c10 c11] configuration, cold start, empty feed, logs', () => {
  it('[F3.2-a2 c10] the seeded database answers configVersion 1 (numeric weights converted: the friend term of 0.5 is applied)', T, async () => {
    const app = await start();
    await befriend(V, F);
    const [pF = '', pT = ''] = await mkAll([{ by: F, ago: 0.5 }, { by: Tm, ago: 0.1 }]);
    const p = await page(app, V.header);
    expect(p.configVersion).toBe(1);
    expect(ids(p)).toEqual([pF, pT]);
    expect(p.restarted).not.toBe(true);
  });

  it('[F3.2-a2 c10] a cursor pinned to a missing version -> 200 restarted:true, a new first page of the current snapshot', T, async () => {
    const app = await start();
    const [fresh = ''] = await mkAll([{ by: Tm }]);
    const stale = serializeFeedCursor({ asOf: ASOF, configVersion: 99, tier: 0, score: 1e9, createdAt: ASOF, id: TOP_ID });
    const p = await page(app, V.header, stale);
    expect(p).toMatchObject({ restarted: true, configVersion: 1 });
    expect(ids(p)).toEqual([fresh]); // under the Jan snapshot the post would not exist yet; a new snapshot sees it
  });

  it('[F3.2-a2 c11] cold start: no friends -> the everyone pool plus own posts, 200', T, async () => {
    const app = await start();
    const made = await mkAll([{ by: V, ago: 3 }, { by: Tm, ago: 2 }, { by: F, aud: 'friends', ago: 1 }]);
    const p = await page(app, V.header);
    expect([...ids(p)].sort()).toEqual([made[0], made[1]].sort());
  });

  it('[F3.2-a2 c11] no eligible post -> 200 {items: [], nextCursor: null, configVersion: 1}, never an error', T, async () => {
    const app = await start();
    await mk({ by: F, aud: 'friends' });
    const res = await feed(app, V.header);
    expect(res.statusCode, res.body).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ items: [], nextCursor: null, configVersion: 1 });
  });

  it('[F3.2-a2 c11] the log holds no cursor text and no post id: on success, on a 400, and on a database failure', T, async () => {
    const log = captureLog();
    const app = await start(createDatabase(url()), log.stream);
    const [postId = ''] = await mkAll([{ by: Tm, at: ago(1) }]);
    const okCursor = serializeFeedCursor({ asOf: ASOF, configVersion: 1, tier: 0, score: 1e9, createdAt: ASOF, id: postId ?? TOP_ID });
    const badCursor = serializeFeedCursor({ asOf: await dbNow('1 day'), configVersion: 1, tier: 0, score: 1, createdAt: ASOF, id: postId ?? TOP_ID });
    expect((await feed(app, V.header, okCursor)).statusCode).toBe(200);
    expect((await feed(app, V.header, badCursor)).statusCode).toBe(400);
    const stub = await refusingDatabase(url());
    const broken = await start(stub.database, log.stream);
    const failed = await feed(broken, V.header, okCursor);
    expect(failed.statusCode).toBeGreaterThanOrEqual(500);
    const logged = log.text();
    expect(logged.length).toBeGreaterThan(0);
    for (const secret of [okCursor, badCursor, postId ?? TOP_ID, Buffer.from(okCursor, 'base64url').toString('utf8')]) expect(logged).not.toContain(secret);
  });
});

describe('[F3.2-a2 c12 BR-062 6ב] who may ask, and exactly what a unit holds', () => {
  it('[F3.2-a2 c12] a Professional -> 403 not_allowed and a suspended account -> 403, neither returns post data', T, async () => {
    const app = await start();
    await mk({ by: Tm });
    const prof = await feed(app, await bearerFor(P));
    expect(prof.statusCode, prof.body).toBe(403);
    expect(errorOf(prof.body)).toBe('not_allowed');
    const susp = await feed(app, await bearerFor(S));
    expect(susp.statusCode, susp.body).toBe(403);
    await setStatus(V, 'suspended');
    const own = await feed(app, V.header);
    expect(own.statusCode, own.body).toBe(403);
    for (const res of [prof, susp, own]) expect(res.body).not.toMatch(/items|"id"|post body/);
  });

  it('[F3.2-a2 c12] a cursor from another viewer grants nothing: X with V\'s cursor sees no friends-only post of V\'s friend', T, async () => {
    const app = await start();
    await befriend(V, F);
    const fr = await mkAll(Array.from({ length: 3 }, (_, i) => ({ by: F, aud: 'friends' as const, at: ago(3 + i * 7) })));
    const open = await mkAll(Array.from({ length: 22 }, (_, i) => ({ by: cycle([Tm, U, W, Y, K, R, X], i), at: ago(i + 1) })));
    const forV = await page(app, V.header, topCursor());
    expect(forV.nextCursor).not.toBeNull();
    const rest = await page(app, X.header, forV.nextCursor ?? '');
    for (const id of fr) expect(ids(rest)).not.toContain(id);
    for (const id of ids(rest)) expect(open).toContain(id);
  });

  it('[F3.2-a2 c12 6ב] a unit is exactly the strict shape: own post isMine, a non-friend reader sees the full author name, an anonymous unit has no author key and no id or name of its author', T, async () => {
    const app = await start();
    const [mine = '', theirs = '', anon = '', ownAnon = ''] = await mkAll([{ by: V, ago: 4, body: 'my words' }, { by: Tm, ago: 3 }, { by: F, anon: true, ago: 2 }, { by: V, anon: true, ago: 1 }]);
    const res = await feed(app, V.header);
    expect(res.statusCode, res.body).toBe(200);
    const parsed = parsePage(res.body);
    const unit = (id: string) => parsed.items.find((i) => i.id === id);
    expect(unit(mine)).toMatchObject({ kind: 'post', source: 'organic', body: 'my words', audience: 'everyone', stageTag: null, isMine: true, isAnonymous: false, author: { name: 'Vera Viewer' } });
    expect(unit(theirs)).toMatchObject({ isMine: false, isAnonymous: false, author: { name: 'Tamar Stranger' } });
    for (const id of [anon, ownAnon]) {
      const u = unit(id);
      expect(u).toMatchObject({ isMine: false, isAnonymous: true, body: 'post body' });
      expect(Object.keys(u ?? {})).not.toContain('author');
    }
    expect(res.body).not.toContain(F.id);
    expect(res.body).not.toContain('Fiona Friend');
    expect(res.body).not.toMatch(/authorId|"score"|"tier"|isFriend|"count"|likeCount|commentCount/);
  });

  it('[F3.2-a2 c12 BR-065] a share lists sharerText and its original (fields only); an original that became unavailable shows {available: false} and no original content', T, async () => {
    const app = await start();
    const original = await mk({ by: Tm, ago: 3, body: 'the original words' });
    const share = await mk({ by: U, shared: original, ago: 1, body: 'my take on it' });
    const available = (await page(app, V.header)).items.find((i) => i.id === share);
    expect(available).toMatchObject({ kind: 'share', sharerText: 'my take on it', author: { name: 'Uri Second' } });
    const o = toRecord(toRecord(available).original);
    expect(Object.keys(o).sort()).toEqual(['audience', 'author', 'available', 'body', 'createdAt', 'id', 'isAnonymous']);
    expect(o).toMatchObject({ available: true, id: original, body: 'the original words', audience: 'everyone', isAnonymous: false, author: { name: 'Tamar Stranger' } });
    for (const makeUnavailable of [() => statusOf(original, 'removed'), async () => { await statusOf(original, 'active'); await setStatus(Tm, 'suspended'); }]) {
      await makeUnavailable();
      const res = await feed(app, V.header);
      const unit = parsePage(res.body).items.find((i) => i.id === share);
      expect(toRecord(toRecord(unit).original)).toEqual({ available: false });
      expect(res.body).not.toContain('the original words');
      expect(res.body).not.toContain('Tamar Stranger');
    }
  });
});

describe('[F3.2-a2 c2 c5] the statements that really run', () => {
  it('[F3.2-a2 c2] ranking and display are separate statements by the allow-list, run as authenticated, in float8; the display fetch cannot order', T, async () => {
    const statements: string[] = [];
    const app = await start(recording(statements));
    await befriend(V, F);
    const original = await mk({ by: Tm, ago: 3 });
    await mkAll([{ by: F, ago: 1 }, { by: U, shared: original, ago: 2 }]);
    await page(app, V.header);
    const onPosts = statements.filter((q) => /\b(posts|regular_names|friendships|comments|reactions|algorithm_configurations)\b/i.test(q));
    expect(onPosts.length).toBeGreaterThanOrEqual(2);
    const forbidden = /post_hides|\breports\b|post_authors|reaction_owners|journey_contexts|\bheld_|author_visibility|\b(author_|liker_)?status\b|is_active_account|select\s+\*/i;
    const tableWildcards = (q: string, ctes: Set<string>): string[] => {
      const bound = new Map<string, string>();
      for (const m of q.matchAll(/\b(?:from|join)\s+([\w".]+)\s+(?:as\s+)?([a-z_]\w*)\b/gi)) {
        bound.set((m[2] ?? '').toLowerCase(), (m[1] ?? '').replace(/"/g, '').split('.').pop()?.toLowerCase() ?? '');
      }
      return [...q.matchAll(/\b([a-z_]\w*)\.\*/gi)].map((m) => (m[1] ?? '').toLowerCase()).filter((a) => !ctes.has(bound.get(a) ?? ''));
    };
    for (const q of onPosts) {
      // the allow-list grants one status test: an accepted friendship (Friend term); a CTE name is not a table
      expect(q.replace(/"?\b\w+"?\."?status"?\s*=\s*('accepted'|\$\d+)/gi, ''), q).not.toMatch(forbidden);
      const ctes = new Set([...q.matchAll(/(?:\bwith|,)\s+([a-z_]\w*)\s+as\s*\(/gi)].map((m) => (m[1] ?? '').toLowerCase()));
      expect(tableWildcards(q, ctes), q).toEqual([]);
      for (const m of q.matchAll(/\b(?:from|join)\s+([\w".]+)(?![\w".]|\s*\()/gi)) {
        const table = (m[1] ?? '').replace(/"/g, '').split('.').pop() ?? '';
        if (!ctes.has(table.toLowerCase())) expect(['posts', 'friendships', 'comments', 'reactions', 'algorithm_configurations', 'regular_names'], q).toContain(table);
      }
    }
    const ranking = onPosts.filter((q) => /power\s*\(/i.test(q));
    const display = onPosts.filter((q) => /regular_names/i.test(q));
    expect(ranking.length).toBeGreaterThan(0);
    expect(display.length).toBeGreaterThan(0);
    for (const q of ranking) {
      expect(q).not.toMatch(/regular_names/i);
      expect(q).not.toMatch(/\bbody\b/i);
      expect(q).toMatch(/float8/i);
      expect(q).not.toMatch(/::numeric/i);
    }
    for (const q of display) expect(q).not.toMatch(/power\s*\(|\bln\s*\(/i);
    expect(statements.join('\n')).toMatch(/authenticated/i);
    expect(statements.join('\n')).not.toMatch(/service_role|bypassrls/i);
  });
});
