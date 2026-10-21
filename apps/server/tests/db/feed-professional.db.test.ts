import type { Writable } from 'node:stream';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { feedPageResponse, scorePost, serializeFeedCursor, type FeedConfig, type FeedPageResponse } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, toRecord, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { CLOCK_NOW, buildRegisterApp, post, validBody } from '../helpers/register-app.js';
import { addComment } from '../helpers/comments-api.js';
import { putLike } from '../helpers/likes-api.js';

// I3 professional-posting, the Professional's side of GET /api/feed under RLS (split from feed.db.test.ts for the file budget; same fixtures and helpers). Original header: I3 F3.2a2, GET /api/feed under RLS (CI db job, as app_server); criteria c1-c12 of .work/feed-view/spec.md. Expected values are hand-computed from the I3-algorithm.md
// formula (v1: wFresh 1, half-life 24 h, wFriend .5, wQuality .2, cap 20, 14 days, page 20, caps 2/5). Ranking tests fix asOf in the past with a "top" cursor;
// created_at comes from supabase/tests/setup/72_feed_view_fixtures.sql.

// professional-posting c6(b): counts the calls of readOwnStages and lets them through (the real function runs).
const stageReads = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../src/repositories/journeys-repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/repositories/journeys-repository.js')>();
  return {
    ...actual,
    readOwnStages: (...args: Parameters<typeof actual.readOwnStages>) => {
      stageReads.calls += 1;
      return actual.readOwnStages(...args);
    },
  };
});

const T = { timeout: COLD_START_MS };
const FEED = '/api/feed';
const ASOF = '2026-01-15T12:00:00.000000Z';
const HOUR = 3_600_000;
const ASOF_MS = Date.parse('2026-01-15T12:00:00Z');
const iso = (ms: number): string => new Date(ASOF_MS + ms).toISOString().replace('Z', '000Z');
const ago = (hours: number): string => iso(-Math.round(hours * HOUR));
const TOP_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const topCursor = (asOf = ASOF): string => serializeFeedCursor({ asOf, configVersion: 1, tier: 0, score: 1e9, createdAt: asOf, id: TOP_ID });
const DB_TEXT = `to_char((%s) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const P = 'd0000000-0000-4000-8000-0000000000d4';

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
const like = (by: Member, postId: string, at: string): Promise<void> =>
  inTx(async (tx) => void (await tx`select tests.fx_fv_rx(${by.id}::uuid, ${postId}::uuid, ${at}::text::timestamptz)`));
const befriend = (req: Member, addr: Member, status = 'accepted'): Promise<void> =>
  inTx(async (tx) => void (await tx`select tests.fx_fr_add(${req.id}::uuid, ${addr.id}::uuid, ${status}, false)`));
const setStatus = (m: Member, status: string): Promise<unknown> => side`select tests.set_status(${m.id}::uuid, ${status})`;
const dbText = (expr: string): Promise<string> => text(side.unsafe(`select ${DB_TEXT.replace('%s', expr)} as v`));
const dbNow = (offset: string): Promise<string> => dbText(`now() + interval '${offset}'`);

const feed = (app: App, header: string | null, cursor?: string) =>
  app.inject({ method: 'GET', url: cursor === undefined ? FEED : `${FEED}?cursor=${encodeURIComponent(cursor)}`, headers: header === null ? {} : { authorization: header } });
async function page(app: App, header: string, cursor?: string): Promise<FeedPageResponse> {
  const res = await feed(app, header, cursor);
  expect(res.statusCode, res.body).toBe(200);
  return parsePage(res.body);
}
const parsePage = (body: string): FeedPageResponse => feedPageResponse.parse(toRecord(JSON.parse(body)));
const live = async (app: App, who: Member = V): Promise<string[]> => ids(await page(app, who.header));
const ids =(p: FeedPageResponse): string[] => p.items.map((i) => i.id);
const top = async (app: App, who: Member = V): Promise<string[]> => ids(await page(app, who.header, topCursor()));
const errorOf = (body: string): unknown => toRecord(JSON.parse(body)).error;
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
  const [who] = await side`select session_user::text as su`; expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
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
beforeEach(reset); afterEach(closeAll);
afterAll(async () => {
  await reset();
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

// ---------------------------------------------------------------------------------------------------------------------
// professional-posting c4, c6 (.work/professional-posting/spec.md; algorithm-review.md R2, R4). A pinned inactive version 9001 (wFriend 2, wStage 2)
// is inserted once (configuration rows are immutable and cannot be deleted, so it stays; a cursor pinned to it makes a page use it).
const PINNED = 9001;
const PINNED_CONFIG: FeedConfig = {
  wFresh: 1, halfLifeHours: 24, wFriend: 2, wQuality: 0.2, qualityCap: 20, wStage: 2, scoredWindowDays: 14,
  maxSameCreatorInWindow: 2, diversityWindow: 5, maxAnonymousInWindow: 2, pageSize: 20, wIntent: 0, intentHalfLifeHours: 168,
};
const pinnedCursor = (): string => serializeFeedCursor({ asOf: ASOF, configVersion: PINNED, tier: 0, score: 1e9, createdAt: ASOF, id: TOP_ID });
const PRO: Member = { id: P, header: '' };
type Tag = 'planning' | 'pregnant' | 'has_child';

async function ensurePinnedConfig(): Promise<void> {
  await inTx(async (tx) => {
    await tx.unsafe(`select tests.fx_cfg_exec($q$ insert into nestly.algorithm_configurations
      (surface, version, is_active, w_fresh, half_life_hours, w_friend, w_quality, quality_cap, w_stage, scored_window_days,
       diversity_window, max_same_creator_in_window, max_anonymous_in_window, page_size, created_by, reason)
      select 'regular_feed', ${PINNED}, false, 1.0, 24, 2.0, 0.2, 20, 2.0, 14, 5, 2, 2, 20, 'test reviewer', 'professional-posting c6 pinned config'
      where not exists (select 1 from nestly.algorithm_configurations where version = ${PINNED}) $q$)`);
  });
}

type Fixture = { id: string; ageH: number; n: number; tag: Tag | null; friend: boolean; at: string };
/** The expected order from the shared reference (`scorePost`; the content profile is the same formula with the Friend and Stage terms at weight 0, proved in packages/shared/tests/feed-ranking.test.ts): score desc, then created_at desc, then id desc (no re-ranking: every window has distinct creators). */
function expectedOrder(list: Fixture[], config: FeedConfig, viewerStages: Tag[] | 'content'): string[] {
  const scored = list.map((f) => ({
    f,
    score: scorePost(viewerStages === 'content' ? { ...config, wFriend: 0, wStage: 0 } : config, { ageHours: f.ageH, isFriend: f.friend, isAnonymous: false, n: f.n, stageTag: f.tag, viewerStages: viewerStages === 'content' ? [] : viewerStages }),
  }));
  scored.sort((a, b) => b.score - a.score || (a.f.at < b.f.at ? 1 : a.f.at > b.f.at ? -1 : 0) || (a.f.id < b.f.id ? 1 : -1));
  return scored.map((x) => x.f.id);
}
async function seedFixtures(spec: Array<{ by: Member; ageH: number; n: number; tag?: Tag; friend?: boolean }>): Promise<Fixture[]> {
  const ids = await mkAll(spec.map((s) => ({ by: s.by, at: ago(s.ageH), ...(s.tag ? { tag: s.tag } : {}) })));
  const out: Fixture[] = [];
  for (const [i, s] of spec.entries()) {
    const id = ids[i] ?? '';
    const likers = everyone.filter((m) => m.id !== s.by.id).slice(0, s.n);
    for (const liker of likers) await like(liker, id, ago(1));
    out.push({ id, ageH: s.ageH, n: s.n, tag: s.tag ?? null, friend: s.friend === true, at: ago(s.ageH) });
  }
  return out;
}
const proHeader = (): Promise<string> => bearerFor(P);

describe('[professional-posting c6 FR-FEED-001 FR-ALG-002 R2] a Professional reads the feed on the content profile', () => {
  beforeAll(ensurePinnedConfig, COLD_START_MS);
  afterEach(async () => void (await setStatus(PRO, 'active')));

  it('[professional-posting c6] 200 with own and everyone posts, never a friends post (the set of a non-friend Regular); the own post is isMine with author.name null', T, async () => {
    const app = await start();
    const header = await proHeader();
    const made = await app.inject({ method: 'POST', url: '/api/posts', headers: { authorization: header, 'content-type': 'application/json' }, payload: JSON.stringify({ body: 'pro post', audience: 'everyone' }) });
    expect(made.statusCode, made.body).toBe(201);
    const mineId = String(toRecord(JSON.parse(made.body)).id);
    const open = await mk({ by: Tm });
    const restricted = await mk({ by: R });
    const friendsOnly = await mk({ by: F, aud: 'friends' });
    const res = await feed(app, header);
    expect(res.statusCode, res.body).toBe(200);
    const seen = parsePage(res.body);
    expect([...ids(seen)].sort()).toEqual([mineId, open, restricted].sort());
    expect(ids(seen)).not.toContain(friendsOnly);
    expect(seen.items.find((i) => i.id === mineId)).toMatchObject({ isMine: true, isAnonymous: false, author: { name: null } });
  });

  it('[professional-posting c6a c6b] wFriend 2, wStage 2, stage-tagged posts: ids and order equal the content-only reference; readOwnStages is called 0 times (and does run for a Regular)', T, async () => {
    const app = await start();
    await befriend(V, F);
    const list = await seedFixtures([
      { by: Tm, ageH: 3, n: 0 }, { by: U, ageH: 20, n: 3, tag: 'pregnant' }, { by: W, ageH: 9, n: 1, tag: 'pregnant' },
      { by: Y, ageH: 30, n: 0, tag: 'has_child' }, { by: K, ageH: 5, n: 2, tag: 'pregnant' }, { by: X, ageH: 12, n: 0 }, { by: F, ageH: 40, n: 0, friend: true },
    ]);
    stageReads.calls = 0;
    const asPro = await page(app, await proHeader(), pinnedCursor());
    const expected = expectedOrder(list, PINNED_CONFIG, 'content');
    expect(asPro.configVersion).toBe(PINNED);
    expect(ids(asPro)).toEqual(expected);
    await page(app, await proHeader(), pinnedCursor());
    expect(stageReads.calls).toBe(0);
    // the fixture can fail: a Regular with a Stage and a Friend, on the same config, gets another order, and her Stage is read
    const asRegular = await page(app, V.header, pinnedCursor());
    expect(ids(asRegular)).toEqual(expectedOrder(list, PINNED_CONFIG, ['pregnant', 'has_child']));
    expect(ids(asRegular)).not.toEqual(expected);
    expect(stageReads.calls).toBeGreaterThan(0);
  });

  it('[professional-posting c6c] at wStage 0 a Professional and a Regular with no friends see the same ids in the same order at one asOf', T, async () => {
    const app = await start();
    await seedFixtures([
      { by: Tm, ageH: 3, n: 1 }, { by: U, ageH: 20, n: 3, tag: 'pregnant' }, { by: W, ageH: 9, n: 0, tag: 'has_child' },
      { by: Y, ageH: 30, n: 2 }, { by: K, ageH: 5, n: 0, tag: 'pregnant' }, { by: F, ageH: 12, n: 0 },
    ]);
    const asPro = await page(app, await proHeader(), topCursor());
    const asRegular = await page(app, X.header, topCursor());
    expect(asPro.configVersion).toBe(1);
    expect(ids(asPro)).toHaveLength(6);
    expect(ids(asPro)).toEqual(ids(asRegular));
  });

  it('[professional-posting c6 · I14c §9.7] a suspended Professional -> 403 account_unavailable; an Admin and a Moderator read the review feed', T, async () => {
    const app = await start();
    await mk({ by: Tm });
    await setStatus(PRO, 'suspended');
    const suspended = await feed(app, await proHeader());
    expect(suspended.statusCode, suspended.body).toBe(403);
    expect(errorOf(suspended.body)).toBe('account_unavailable');
    for (const who of ['fr_d', 'fr_m']) {
      const res = await feed(app, await bearerFor(await text(side`select tests.fx_fr_id(${who})::text as v`)));
      expect(res.statusCode, res.body).toBe(200);
      expect(res.body).toMatch(/items/);
    }
  });
});

describe("[professional-posting c4 R4] a Professional's post in a Regular viewer's feed", () => {
  beforeAll(ensurePinnedConfig, COLD_START_MS);
  afterEach(async () => void (await setStatus(PRO, 'active')));

  it("[professional-posting c4] wFriend 2, wStage 2, a viewer with a Stage and friends: a Professional's everyone post sits exactly where a non-friend Regular's untagged post of the same age and n sits; a named unit, author.name null, isMine false", T, async () => {
    const app = await start();
    await befriend(V, F);
    const base = await seedFixtures([
      { by: F, ageH: 1, n: 0, friend: true }, { by: Tm, ageH: 6, n: 1 }, { by: K, ageH: 8, n: 0, tag: 'pregnant' }, { by: U, ageH: 40, n: 0 },
    ]);
    const proId = await mk({ by: PRO, at: ago(6) });
    await like(W, proId, ago(1));
    const proPost: Fixture = { id: proId, ageH: 6, n: 1, tag: null, friend: false, at: ago(6) };
    const seen = await page(app, V.header, pinnedCursor());
    expect(ids(seen)).toEqual(expectedOrder([...base, proPost], PINNED_CONFIG, ['pregnant', 'has_child']));
    const twin = base[1]?.id ?? '';
    expect(Math.abs(ids(seen).indexOf(proId) - ids(seen).indexOf(twin))).toBe(1);
    expect(seen.items.find((i) => i.id === proId)).toMatchObject({ kind: 'post', isAnonymous: false, isMine: false, author: { name: null }, stageTag: null, audience: 'everyone' });
    expect(seen.items.find((i) => i.id === twin)).toMatchObject({ author: { name: 'Tamar Stranger' } });
  });

  it("[professional-posting c4 N3] a stopped Professional's posts are absent for everyone, and return when the account is active again", T, async () => {
    const app = await start();
    const proId = await mk({ by: PRO, at: ago(2) });
    const other = await mk({ by: Tm, at: ago(3) });
    for (const who of [V, X]) expect(await top(app, who)).toEqual([proId, other]);
    await setStatus(PRO, 'suspended');
    for (const who of [V, X, F]) expect(await top(app, who)).toEqual([other]);
    await setStatus(PRO, 'active');
    expect(await top(app, V)).toEqual([proId, other]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// professional-posting c7 (R5), the server layer: a Professional's engagement works through the API and counts in n like any active user's, except on
// their own post; a stopped Professional's engagement leaves n. (The row flags is_by_author / is_by_post_author themselves are pgTAP 85.)
// Live pages (no cursor): the engagement is written now, so it falls inside the page's asOf.
describe('[professional-posting c7 R5 FR-FEED-001 FR-ALG-002] a Professional comments, replies and likes', () => {
  afterEach(async () => void (await setStatus(PRO, 'active')));

  it('[professional-posting c7] comment, reply and like on a readable post -> 201 / 201 / 204; the comment and reply carry author.name null', T, async () => {
    const app = await start();
    const header = await proHeader();
    const target = await mk({ by: Tm });
    const theirs = await comment(Tm, target, ago(1));
    const made = await addComment(app, header, target, { body: 'תגובה' });
    expect(made.statusCode, made.body).toBe(201);
    expect(toRecord(toRecord(JSON.parse(made.body)).comment)).toMatchObject({ isMine: true, byAuthor: false, author: { name: null } });
    const reply = await addComment(app, header, target, { body: 'תשובה', parentId: theirs });
    expect(reply.statusCode, reply.body).toBe(201);
    expect(toRecord(toRecord(JSON.parse(reply.body)).comment)).toMatchObject({ parentId: theirs, author: { name: null } });
    expect((await putLike(app, header, 'post', target)).statusCode).toBe(204);
    expect((await putLike(app, header, 'comment', theirs)).statusCode).toBe(204);
  });

  it('[professional-posting c7] the refusals of F3.3 hold: an unreadable post (friends-only of a stranger) -> 404 for comment and like; a blank body -> 422/400; no row is written', T, async () => {
    const app = await start();
    const header = await proHeader();
    const friendsOnly = await mk({ by: Tm, aud: 'friends' });
    expect((await addComment(app, header, friendsOnly, { body: 'x' })).statusCode).toBe(404);
    expect((await putLike(app, header, 'post', friendsOnly)).statusCode).toBe(404);
    const open = await mk({ by: Tm });
    expect([400, 422]).toContain((await addComment(app, header, open, { body: '   ' })).statusCode);
    const rows = await text(side`select (tests.fx_cm_count() + tests.fx_rx_count())::text as v`);
    expect(rows).toBe('0');
  });

  it("[professional-posting c7] a Professional's like and comment on a Regular's post count in n; on their own post they do not; a suspended Professional's leave n", T, async () => {
    const app = await start();
    const header = await proHeader();
    const at = await dbNow('-6 hours');
    const firstOf = async (a: string, b: string): Promise<string> => {
      const seen = await live(app, V);
      expect(seen).toEqual(expect.arrayContaining([a, b]));
      return seen.indexOf(a) < seen.indexOf(b) ? a : b;
    };
    // counts: whichever of two otherwise-equal posts the Professional engaged with comes first (the tie order is by id, so both directions are tried)
    for (const pick of [0, 1]) {
      await reset();
      const pair = await mkAll([{ by: Tm, at }, { by: U, at }]);
      const chosen = pair[pick] ?? '';
      expect((await putLike(app, header, 'post', chosen)).statusCode).toBe(204);
      expect(await firstOf(pair[0] ?? '', pair[1] ?? '')).toBe(chosen);
    }
    // own post: the Professional's own like and comment stay out of n, so a post with one Regular like beats it
    await reset();
    const own = await mk({ by: PRO, at });
    const rival = await mk({ by: Tm, at });
    expect((await putLike(app, header, 'post', own)).statusCode).toBe(204);
    expect((await addComment(app, header, own, { body: 'לעצמי' })).statusCode).toBe(201);
    await like(U, rival, await dbNow('-1 hour'));
    expect(await firstOf(own, rival)).toBe(rival);
    // suspended: the engagement leaves n
    await reset();
    const engaged = await mk({ by: Tm, at });
    const liked = await mk({ by: U, at });
    expect((await putLike(app, header, 'post', engaged)).statusCode).toBe(204);
    expect((await addComment(app, header, engaged, { body: 'שלום' })).statusCode).toBe(201);
    await like(W, liked, await dbNow('-1 hour'));
    expect(await firstOf(engaged, liked)).toBe(engaged); // n 2 against 1
    await setStatus(PRO, 'suspended');
    expect(await firstOf(engaged, liked)).toBe(liked); // n 0 against 1
  });
});
