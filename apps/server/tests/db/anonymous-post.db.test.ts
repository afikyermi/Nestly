import type { Writable } from 'node:stream';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serializeFeedCursor } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, toRecord, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { CLOCK_NOW, buildRegisterApp, captureLog, post, validBody } from '../helpers/register-app.js';
import { createPost, deletePost, getPost, jsonObject, patchPost } from '../helpers/posts-api.js';
import { addComment, listComments, listReplies } from '../helpers/comments-api.js';
import { putLike } from '../helpers/likes-api.js';

// I3 F3.4 (.work/anonymous-post/spec.md), the server half against the real database under RLS (CI `db` job, as app_server): criteria c2, c3, c4, c6, c7, c8.
// c1 is packages/shared/tests/post-create.test.ts, c3's 23514 mapping is apps/server/tests/posts-errors.test.ts, c5 the two *.static.test.ts files.
// Criteria c9 (pgTAP) and c10 (Q7 names) wait for the regular_names policy (schema PR-A2) and are not here. Expected values come from the spec only.
// Fixture rows are committed through `side.begin`; every test starts and ends with tests.fx_feed_clear().

const T = { timeout: COLD_START_MS };
const S = '50000000-0000-4000-8000-000000000051'; // suspended fixture account
const P = 'd0000000-0000-4000-8000-0000000000d4'; // Professional fixture account
const NOBODY = '99999999-9999-4999-8999-999999999999';
const FEED = '/api/feed';
const HOUR = 3_600_000;
const ASOF = '2026-01-15T12:00:00.000000Z';
const ASOF_MS = Date.parse('2026-01-15T12:00:00Z');
const ago = (hours: number): string => new Date(ASOF_MS - Math.round(hours * HOUR)).toISOString().replace('Z', '000Z');
const topCursor = (): string => serializeFeedCursor({ asOf: ASOF, configVersion: 1, tier: 0, score: 1e9, createdAt: ASOF, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' });

interface Member { id: string; header: string; name: string }
const NAMES = ['Adi Author', 'Vera Viewer', 'Xavi Stranger', 'Cora Commenter', 'Tamar Third', 'Uri Fourth', 'Kobi Fifth', 'Weston Sixth'];
let A: Member, V: Member, X: Member, C: Member, Tm: Member, U: Member, K: Member, W: Member;
let everyone: Member[] = [];
let hS: string;
let hP: string;
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
async function start(logStream?: Writable): Promise<App> {
  const database = createDatabase(url());
  const app = await buildRegisterApp(env(), { database, clock: () => CLOCK_NOW, ...(logStream ? { logStream } : {}) });
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
const text = async (query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> => String((await query)[0]?.v);
const stateOf = (id: string): Promise<string> => text(side`select coalesce(tests.fx_po_state(${id}::uuid), 'none') as v`);
const postCount = async (): Promise<number> => Number(await text(side`select tests.fx_po_count() as v`));
const authorRows = async (): Promise<number> => Number(await text(side`select tests.fx_pa_count() as v`));
const realAuthorOf = (id: string): Promise<string> => text(side`select coalesce(tests.fx_pa_author(${id}::uuid)::text, 'none') as v`);
const counts = async (): Promise<string[]> => [
  await text(side`select tests.fx_cm_count() as v`),
  await text(side`select tests.fx_rx_count() as v`),
  await text(side`select tests.fx_pa_count() as v`),
];
const setStatus = (id: string, status: string): Promise<unknown> => side`select tests.set_status(${id}::uuid, ${status})`;

async function inTx(work: (tx: postgres.TransactionSql) => Promise<void>): Promise<void> {
  await side.begin(async (tx) => {
    await tx`select 1`;
    await work(tx);
  });
}
async function seedPost(by: Member, anon: boolean, aud: 'everyone' | 'friends' = 'everyone', body = 'post body'): Promise<string> {
  let id = '';
  await inTx(async (tx) => {
    id = await text(tx`select tests.fx_po_add(${by.id}::uuid, ${aud}, ${anon}, 'active', ${body}, null, null)::text as v`);
  });
  return id;
}
async function seedComment(by: Member, postId: string, body: string, parent: string | null = null): Promise<string> {
  let id = '';
  await inTx(async (tx) => {
    id = await text(tx`select tests.fx_cm_add(${by.id}::uuid, ${postId}::uuid, ${body}, ${parent}::uuid)::text as v`);
  });
  return id;
}
const befriend = (req: Member, addr: Member): Promise<void> => inTx(async (tx) => void (await tx`select tests.fx_fr_add(${req.id}::uuid, ${addr.id}::uuid, 'accepted', false)`));
const setAt = (postId: string, at: string): Promise<void> => inTx(async (tx) => void (await tx`select tests.fx_fv_at('post', ${postId}::uuid, ${at}::text::timestamptz)`));
const keysDeep = (value: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  }
  return out;
};
const feed = (app: App, header: string, cursor?: string) =>
  app.inject({ method: 'GET', url: cursor === undefined ? FEED : `${FEED}?cursor=${encodeURIComponent(cursor)}`, headers: { authorization: header } });
const topIds = async (app: App, who: Member): Promise<string[]> => {
  const res = await feed(app, who.header, topCursor());
  expect(res.statusCode, res.body).toBe(200);
  const items = toRecord(JSON.parse(res.body)).items;
  if (!Array.isArray(items)) throw new Error('items is not an array');
  return items.map((i) => String(toRecord(i).id));
};
const itemOf = async (app: App, who: Member, id: string): Promise<Record<string, unknown> | undefined> => {
  const res = await feed(app, who.header, topCursor());
  const items = toRecord(JSON.parse(res.body)).items;
  return Array.isArray(items) ? items.map((i) => toRecord(i)).find((i) => i.id === id) : undefined;
};

beforeAll(async () => {
  key = await newKey('anonymous-post-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  [hS, hP] = await Promise.all([bearerFor(S), bearerFor(P)]);
  const app = await start();
  const made: Member[] = [];
  for (const fullName of NAMES) {
    const id = await text(side`select tests.fx_new_auth_user()::text as v`);
    const header = await bearerFor(id);
    const res = await post(app, header, validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push({ id, header, name: fullName });
  }
  everyone = made;
  const none: Member = { id: '', header: '', name: '' };
  [A = none, V = none, X = none, C = none, Tm = none, U = none, K = none, W = none] = made;
  await closeAll();
}, COLD_START_MS * 3);

async function reset(): Promise<void> {
  await side`select tests.fx_feed_clear()`;
  for (const m of everyone) {
    await side`select tests.fx_fr_purge(${m.id}::uuid)`;
    await setStatus(m.id, 'active');
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

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.4 c2 FR-FEED-005 r.1 r.3 BR-062] POST /posts anonymously', () => {
  it('[F3.4 c2] 201 with the strict shape and isAnonymous:true; author_id NULL, is_anonymous true, one post_authors row that is the caller\'s; no author id in the answer', T, async () => {
    const app = await start();
    const res = await createPost(app, A.header, { body: '  שאלה רגישה  ', audience: 'everyone', isAnonymous: true });
    expect(res.statusCode, res.body).toBe(201);
    const out = jsonObject(res.body);
    expect(Object.keys(out).sort()).toEqual(['audience', 'body', 'createdAt', 'id', 'isAnonymous', 'stageTag']);
    expect(out).toMatchObject({ body: 'שאלה רגישה', audience: 'everyone', stageTag: null, isAnonymous: true });
    expect(Number.isNaN(Date.parse(String(out.createdAt)))).toBe(false);
    const id = String(out.id);
    expect(await stateOf(id)).toBe('status=active aud=everyone anon=t author=null tag=null share=f body=שאלה רגישה');
    expect(await realAuthorOf(id)).toBe(A.id);
    expect(await authorRows()).toBe(1);
    expect(res.body).not.toContain(A.id);
    expect(keysDeep(JSON.parse(res.body)).has('authorId')).toBe(false);
  });

  it('[F3.4 c2] a named post\'s 201 gains isAnonymous:false and writes no post_authors row; an explicit false is the same', T, async () => {
    const app = await start();
    for (const payload of [{ body: 'x', audience: 'everyone' }, { body: 'x', audience: 'friends', isAnonymous: false }]) {
      const res = await createPost(app, A.header, payload);
      expect(res.statusCode, res.body).toBe(201);
      const out = jsonObject(res.body);
      expect(Object.keys(out).sort()).toEqual(['audience', 'body', 'createdAt', 'id', 'isAnonymous', 'stageTag']);
      expect(out.isAnonymous).toBe(false);
      expect(await stateOf(String(out.id))).toContain(`anon=f author=${A.id}`);
    }
    expect(await authorRows()).toBe(0);
  });

  it('[F3.4 c2] the stage tag the author chose is kept on an anonymous post (5א)', T, async () => {
    const app = await start();
    const res = await createPost(app, A.header, { body: 'x', audience: 'everyone', isAnonymous: true, stageTag: 'pregnant' });
    expect(res.statusCode, res.body).toBe(201);
    expect(jsonObject(res.body).stageTag).toBe('pregnant');
    expect(await stateOf(String(jsonObject(res.body).id))).toContain('tag=pregnant');
  });

  it('[F3.4 c1 c2] anonymous with "friends" → 422 audience_not_allowed, no post and no post_authors row', T, async () => {
    const app = await start();
    const res = await createPost(app, A.header, { body: 'x', audience: 'friends', isAnonymous: true });
    expect(res.statusCode, res.body).toBe(422);
    expect(jsonObject(res.body)).toEqual({ error: 'audience_not_allowed' });
    expect(await postCount()).toBe(0);
    expect(await authorRows()).toBe(0);
  });

  it('[F3.4 c2] boundaries and wrong types on an anonymous create write nothing: blank, 2,001 code points, isAnonymous "true"/1/null, extra authorId', T, async () => {
    const app = await start();
    for (const body of ['', '   ', 'א'.repeat(2001)]) expect((await createPost(app, A.header, { body, audience: 'everyone', isAnonymous: true })).statusCode).toBe(422);
    for (const isAnonymous of ['true', 1, null, [], {}]) expect((await createPost(app, A.header, { body: 'x', audience: 'everyone', isAnonymous })).statusCode, JSON.stringify(isAnonymous)).toBe(400);
    expect((await createPost(app, A.header, { body: 'x', audience: 'everyone', isAnonymous: true, authorId: X.id })).statusCode).toBe(400);
    expect(await postCount()).toBe(0);
    expect(await authorRows()).toBe(0);
    expect((await createPost(app, A.header, { body: '😀'.repeat(2000), audience: 'everyone', isAnonymous: true })).statusCode).toBe(201);
  });

  it('[F3.4 c2] hostile text is stored verbatim on an anonymous post', T, async () => {
    const app = await start();
    const hostile = `'); drop table nestly.post_authors; -- \${1+1} <script>alert(1)</script>`;
    const res = await createPost(app, A.header, { body: hostile, audience: 'everyone', isAnonymous: true });
    expect(res.statusCode, res.body).toBe(201);
    expect(jsonObject(res.body).body).toBe(hostile);
    expect(await authorRows()).toBe(1);
  });

  it('[F3.4 c2] two simultaneous anonymous creates: every 201 has its own post and its own post_authors row (503 allowed), none is shared', T, async () => {
    const first = await start();
    const second = await start();
    const [x, y] = await Promise.all([
      createPost(first, A.header, { body: 'same', audience: 'everyone', isAnonymous: true }),
      createPost(second, A.header, { body: 'same', audience: 'everyone', isAnonymous: true }),
    ]);
    for (const res of [x, y]) expect([201, 503]).toContain(res.statusCode);
    const made = [x, y].filter((r) => r.statusCode === 201).length;
    expect(await postCount()).toBe(made);
    expect(await authorRows()).toBe(made);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.4 c3 AC-076 FR-FEED-005] who may post anonymously', () => {
  it('[F3.4 c3] a Professional → 403 not_allowed; 0 posts and 0 post_authors rows', T, async () => {
    const app = await start();
    const res = await createPost(app, hP, { body: 'x', audience: 'everyone', isAnonymous: true });
    expect(res.statusCode, res.body).toBe(403);
    expect(jsonObject(res.body)).toEqual({ error: 'not_allowed' });
    expect(await postCount()).toBe(0);
    expect(await authorRows()).toBe(0);
  });

  it('[F3.4 c3] a suspended account → 403, nothing written; an account suspended after it was active stops at once', T, async () => {
    const app = await start();
    const res = await createPost(app, hS, { body: 'x', audience: 'everyone', isAnonymous: true });
    expect(res.statusCode, res.body).toBe(403);
    await setStatus(A.id, 'suspended');
    const later = await createPost(app, A.header, { body: 'x', audience: 'everyone', isAnonymous: true });
    expect(later.statusCode, later.body).toBe(403);
    expect(await postCount()).toBe(0);
    expect(await authorRows()).toBe(0);
  });

  it('[F3.4 c3] no token → 401, nothing written', T, async () => {
    const app = await start();
    const res = await createPost(app, null, { body: 'x', audience: 'everyone', isAnonymous: true });
    expect(res.statusCode).toBe(401);
    expect(await postCount()).toBe(0);
    expect(await authorRows()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.4 c4 FR-FEED-005 r.1] GET /posts/:id on an anonymous post', () => {
  it('[F3.4 c4] the strict shape adds isAnonymous:true; isMine is true for the real author only; there is no author key and no author data', T, async () => {
    const app = await start();
    await befriend(V, A);
    const id = await seedPost(A, true, 'everyone', 'anon words');
    await seedPost(X, true); // a stranger with an anonymous post of their own must not read as the author of A's
    const keys = ['audience', 'body', 'commentCount', 'createdAt', 'id', 'isAnonymous', 'isMine', 'likeCount', 'likedByMe', 'stageTag'];
    for (const [who, mine] of [[A, true], [V, false], [X, false], [C, false]] as const) {
      const res = await getPost(app, who.header, id);
      expect(res.statusCode, res.body).toBe(200);
      const out = jsonObject(res.body);
      expect(Object.keys(out).sort(), who.name).toEqual(keys);
      expect(out, who.name).toMatchObject({ id, body: 'anon words', isAnonymous: true, isMine: mine });
      expect(keysDeep(out).has('author')).toBe(false);
      expect(res.body).not.toContain(A.id);
      expect(res.body).not.toContain(A.name);
    }
  });

  it('[F3.4 c4] a named post: isAnonymous:false and isMine as before (author true, friend and stranger false)', T, async () => {
    const app = await start();
    await befriend(V, A);
    const id = await seedPost(A, false, 'everyone', 'named words');
    await seedPost(A, true); // A also has an anonymous post: the named one is still judged by its own author_id
    for (const [who, mine] of [[A, true], [V, false], [X, false]] as const) {
      const out = jsonObject((await getPost(app, who.header, id)).body);
      expect(out, who.name).toMatchObject({ isAnonymous: false, isMine: mine });
    }
  });

  it('[F3.4 c4] the 404 cases are unchanged: unknown id, a suspended viewer, a hidden/removed/deleted anonymous post (also to its author) all answer the same body', T, async () => {
    const app = await start();
    const visible = await seedPost(A, true);
    const hidden = await seedPost(A, true);
    const removed = await seedPost(A, true);
    const deleted = String(jsonObject((await createPost(app, A.header, { body: 'x', audience: 'everyone', isAnonymous: true })).body).id);
    await inTx(async (tx) => {
      await tx`select tests.fx_po_status(${hidden}::uuid, 'hidden')`;
      await tx`select tests.fx_po_status(${removed}::uuid, 'removed')`;
    });
    expect((await deletePost(app, A.header, deleted)).statusCode).toBe(204);
    expect((await getPost(app, X.header, visible)).statusCode).toBe(200);
    const reference = await getPost(app, X.header, NOBODY);
    expect(reference.statusCode).toBe(404);
    const answers = [
      await getPost(app, hS, visible),
      await getPost(app, A.header, hidden),
      await getPost(app, X.header, hidden),
      await getPost(app, A.header, removed),
      await getPost(app, A.header, deleted),
      await getPost(app, X.header, deleted),
    ];
    for (const res of answers) expect([res.statusCode, res.body]).toEqual([404, reference.body]);
    expect((await getPost(app, null, visible)).statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.4 c6 FR-FEED-005] the real author edits and deletes an anonymous post', () => {
  it('[F3.4 c6] PATCH body and stageTag → 200 and stored; the post stays anonymous with no author_id', T, async () => {
    const app = await start();
    const id = String(jsonObject((await createPost(app, A.header, { body: 'first', audience: 'everyone', isAnonymous: true })).body).id);
    const res = await patchPost(app, A.header, id, { body: ' second ', stageTag: 'has_child' });
    expect(res.statusCode, res.body).toBe(200);
    expect(jsonObject(res.body)).toMatchObject({ id, body: 'second', stageTag: 'has_child', audience: 'everyone' });
    expect(res.body).not.toContain(A.id);
    expect(await stateOf(id)).toBe('status=active aud=everyone anon=t author=null tag=has_child share=f body=second');
    const same = await patchPost(app, A.header, id, { body: 'second', audience: 'everyone' });
    expect(same.statusCode, same.body).toBe(200);
    expect(await realAuthorOf(id)).toBe(A.id);
  });

  it('[F3.4 c6] PATCH audience "friends" → 422 audience_not_allowed and the row is unchanged', T, async () => {
    const app = await start();
    const id = await seedPost(A, true, 'everyone', 'keep me');
    const before = await stateOf(id);
    const res = await patchPost(app, A.header, id, { body: 'changed', audience: 'friends' });
    expect(res.statusCode, res.body).toBe(422);
    expect(jsonObject(res.body)).toEqual({ error: 'audience_not_allowed' });
    expect(res.body).not.toMatch(/23514|constraint|posts_audience_check|violates/i);
    expect(await stateOf(id)).toBe(before);
  });

  it('[F3.4 c6] isAnonymous in a PATCH (true or false) is still a 400 and the row is unchanged', T, async () => {
    const app = await start();
    const id = await seedPost(A, true, 'everyone', 'keep me');
    const before = await stateOf(id);
    for (const isAnonymous of [true, false]) expect((await patchPost(app, A.header, id, { body: 'x', isAnonymous })).statusCode).toBe(400);
    expect(await stateOf(id)).toBe(before);
  });

  it('[F3.4 c6] DELETE → 204; its comments, likes and post_authors row are gone; a second DELETE → 404', T, async () => {
    const app = await start();
    const id = await seedPost(A, true, 'everyone', 'doomed');
    await seedComment(X, id, 'a comment');
    expect((await putLike(app, X.header, 'post', id)).statusCode).toBe(204);
    expect(await counts()).toEqual(['1', '1', '1']);
    const res = await deletePost(app, A.header, id);
    expect(res.statusCode, res.body).toBe(204);
    expect(res.body).toBe('');
    expect(await stateOf(id)).toBe('none');
    expect(await counts()).toEqual(['0', '0', '0']);
    expect((await deletePost(app, A.header, id)).statusCode).toBe(404);
  });

  it('[F3.4 c6] DELETE with an open report → the same 204; then 404 for the author and everyone else', T, async () => {
    const app = await start();
    const id = await seedPost(A, true, 'everyone', 'reported');
    await inTx(async (tx) => void (await tx`select tests.fx_rp_add(${X.id}::uuid, 'post', ${id}::uuid, 'spam', null)`));
    const res = await deletePost(app, A.header, id);
    expect(res.statusCode, res.body).toBe(204);
    expect(res.body).toBe('');
    const missing = await getPost(app, A.header, NOBODY);
    for (const who of [A, X, V]) {
      const read = await getPost(app, who.header, id);
      expect([read.statusCode, read.body], who.name).toEqual([404, missing.body]);
    }
    expect(await text(side`select tests.fx_hold_state('post', ${id}::uuid) as v`)).toMatch(/^status=deleted/);
  });

  it('[F3.4 c6] another user\'s PATCH and DELETE → 404 with the unknown-id body, the post unchanged — also for a user who has an anonymous post of their own', T, async () => {
    const app = await start();
    const id = await seedPost(A, true, 'everyone', 'mine alone');
    await seedPost(X, true);
    const before = await stateOf(id);
    const missing = await patchPost(app, X.header, NOBODY, { body: 'z' });
    for (const who of [X, V, C]) {
      const edit = await patchPost(app, who.header, id, { body: 'hijack', stageTag: 'pregnant' });
      const del = await deletePost(app, who.header, id);
      expect([edit.statusCode, edit.body], who.name).toEqual([404, missing.body]);
      expect(del.statusCode, who.name).toBe(404);
    }
    expect(await stateOf(id)).toBe(before);
    expect(await realAuthorOf(id)).toBe(A.id);
    expect((await patchPost(app, null, id, { body: 'x' })).statusCode).toBe(401);
    expect((await deletePost(app, null, id)).statusCode).toBe(401);
  });

  it('[F3.4 c6] two simultaneous deletes by the author: at most one 204, the other 404 (503 allowed); post and post_authors are gone', T, async () => {
    const first = await start();
    const second = await start();
    const id = await seedPost(A, true);
    const [x, y] = await Promise.all([deletePost(first, A.header, id), deletePost(second, A.header, id)]);
    const codes = [x.statusCode, y.statusCode];
    for (const code of codes) expect([204, 404, 503]).toContain(code);
    expect(codes.filter((c) => c === 204).length).toBeLessThanOrEqual(1);
    if (!codes.includes(503)) expect(codes.filter((c) => c === 204).length).toBe(1);
    expect(await postCount()).toBe(codes.includes(204) ? 0 : 1);
    expect(await authorRows()).toBe(codes.includes(204) ? 0 : 1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.4 c7 AC-075 FR-FEED-005 r.1 6א] the leak scan: nothing a reader gets names the author', () => {
  const IDENTIFIERS = (): string[] => [A.id, `f14b-${A.id}`, 'example.invalid'];

  it('[F3.4 c7] A\'s friend V and stranger X: no body (feed pages, post, comments, replies, likes, 4xx) holds A\'s id or email, and nothing about the anonymous post or the "המחבר" comment holds A\'s name', T, async () => {
    const app = await start();
    await befriend(V, A);
    const anon = String(jsonObject((await createPost(app, A.header, { body: 'anon question', audience: 'everyone', isAnonymous: true })).body).id);
    const named = String(jsonObject((await createPost(app, A.header, { body: 'named question', audience: 'everyone' })).body).id);
    const own = await addComment(app, A.header, anon, { body: 'the author answers' });
    expect(own.statusCode, own.body).toBe(201);
    const theirs = await seedComment(C, anon, 'a reader speaks');
    const reply = await addComment(app, A.header, anon, { body: 'author reply', parentId: theirs });
    expect(reply.statusCode, reply.body).toBe(201);
    await setAt(anon, ago(1)); // the 'top' feed page below shows posts created before its asOf
    await setAt(named, ago(2));
    const authorCommentId = String(toRecord(toRecord(JSON.parse(own.body)).comment).id);
    expect((await putLike(app, V.header, 'post', anon)).statusCode).toBe(204);
    expect((await putLike(app, X.header, 'comment', authorCommentId)).statusCode).toBe(204);

    const bodies: Array<{ label: string; body: string; anonymousOnly: boolean }> = [];
    for (const who of [V, X, A]) {
      const add = (label: string, body: string, anonymousOnly: boolean): void => void bodies.push({ label: `${who.name}: ${label}`, body, anonymousOnly });
      add('post', (await getPost(app, who.header, anon)).body, true);
      add('named post', (await getPost(app, who.header, named)).body, false);
      add('comments', (await listComments(app, who.header, anon)).body, true);
      add('replies', (await listReplies(app, who.header, theirs)).body, true);
      add('feed', (await feed(app, who.header)).body, false);
      add('feed (top)', (await feed(app, who.header, topCursor())).body, false);
      add('unknown post', (await getPost(app, who.header, NOBODY)).body, true);
      add('unknown comments', (await listComments(app, who.header, NOBODY)).body, true);
      add('bad reply', (await addComment(app, who.header, anon, { body: 'x', parentId: NOBODY })).body, true);
      add('like unknown', (await putLike(app, who.header, 'post', NOBODY)).body, true);
    }
    for (const who of [V, X]) {
      bodies.push({ label: `${who.name}: edit refused`, body: (await patchPost(app, who.header, anon, { body: 'hijack' })).body, anonymousOnly: true });
      bodies.push({ label: `${who.name}: delete refused`, body: (await deletePost(app, who.header, anon)).body, anonymousOnly: true });
    }
    expect(bodies.length).toBeGreaterThan(20);
    for (const { label, body, anonymousOnly } of bodies) {
      for (const needle of IDENTIFIERS()) expect(body, `${label} holds ${needle}`).not.toContain(needle);
      if (anonymousOnly) expect(body, `${label} holds the author's name`).not.toContain(A.name);
    }

    // The feed unit of the anonymous post and the "המחבר" comment themselves hold no name (the named post's unit may).
    for (const who of [V, X]) {
      const unit = await itemOf(app, who, anon);
      expect(unit, who.name).toBeDefined();
      expect(JSON.stringify(unit)).not.toContain(A.name);
      expect(keysDeep(unit).has('author')).toBe(false);
      const thread = await listComments(app, who.header, anon);
      const item = toRecord(JSON.parse(thread.body)).items;
      if (!Array.isArray(item)) throw new Error('items is not an array');
      const byAuthor = item.map((i) => toRecord(i)).find((i) => i.byAuthor === true);
      expect(byAuthor, who.name).toBeDefined();
      expect('author' in (byAuthor ?? {})).toBe(false);
    }
  });

  it('[F3.4 c7] the logger records of A\'s create, read, edit and delete hold neither A\'s id nor the post id', T, async () => {
    const log = captureLog();
    const app = await start(log.stream);
    const made = await createPost(app, A.header, { body: 'to log', audience: 'everyone', isAnonymous: true });
    expect(made.statusCode, made.body).toBe(201);
    const id = String(jsonObject(made.body).id);
    expect((await getPost(app, A.header, id)).statusCode).toBe(200);
    expect((await patchPost(app, A.header, id, { body: 'edited' })).statusCode).toBe(200);
    expect((await patchPost(app, A.header, id, { audience: 'friends' })).statusCode).toBe(422);
    expect((await getPost(app, X.header, id)).statusCode).toBe(200);
    expect((await deletePost(app, A.header, id)).statusCode).toBe(204);
    expect((await getPost(app, A.header, id)).statusCode).toBe(404);
    expect(log.text().length).toBeGreaterThan(0);
    expect(log.text()).not.toContain(A.id);
    expect(log.text()).not.toContain(id);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.4 c8 AC-076 BR-062 FR-ALG] the anonymous post in the feed carries no social graph', () => {
  it('[F3.4 c8] made through POST /posts, A\'s anonymous post scores for A\'s friend V exactly as a non-friend\'s: Friend term 0', T, async () => {
    const app = await start();
    await befriend(V, A);
    // Freshness only (v1: half-life 24 h, Friend term .5): stranger now = 1.0; A anonymous 2 h old = 0.944; were A's friendship applied it would be 1.444.
    const pAnon = String(jsonObject((await createPost(app, A.header, { body: 'anon', audience: 'everyone', isAnonymous: true })).body).id);
    const pStranger = await seedPost(Tm, false);
    await setAt(pAnon, ago(2));
    await setAt(pStranger, ago(0));
    expect(await topIds(app, V)).toEqual([pStranger, pAnon]);
  });

  it('[F3.4 c8] it counts toward maxAnonymousInWindow (2 per window) across different authors: the third anonymous post waits for a named one', T, async () => {
    const app = await start();
    const anon = async (who: Member, hours: number): Promise<string> => {
      const id = String(jsonObject((await createPost(app, who.header, { body: 'anon', audience: 'everyone', isAnonymous: true })).body).id);
      await setAt(id, ago(hours));
      return id;
    };
    const aA = await anon(A, 1);
    const aU = await anon(U, 2);
    const aK = await anon(K, 3);
    const named1 = await seedPost(Tm, false);
    const named2 = await seedPost(W, false);
    await setAt(named1, ago(4));
    await setAt(named2, ago(5));
    const order = await topIds(app, V);
    expect(order.slice(0, 3)).toEqual([aA, aU, named1]);
    expect([...order].sort()).toEqual([aA, aU, aK, named1, named2].sort());
  });

  it('[F3.4 c8] it does not count toward A\'s maxSameCreatorInWindow: two anonymous and two named posts of A keep their pure freshness order', T, async () => {
    const app = await start();
    const mk = async (anon: boolean, hours: number): Promise<string> => {
      const id = String(jsonObject((await createPost(app, A.header, { body: 'p', audience: 'everyone', ...(anon ? { isAnonymous: true } : {}) })).body).id);
      await setAt(id, ago(hours));
      return id;
    };
    const a1 = await mk(true, 1);
    const n2 = await mk(false, 2);
    const a3 = await mk(true, 3);
    const n4 = await mk(false, 4);
    const tm = await seedPost(Tm, false);
    const u = await seedPost(U, false);
    await setAt(tm, ago(5));
    await setAt(u, ago(6));
    // If A's anonymous posts were counted as A's, the third post of A in the window would be pushed behind Tm.
    expect(await topIds(app, V)).toEqual([a1, n2, a3, n4, tm, u]);
  });

  it('[F3.4 c8] isMine is false for A in A\'s own feed, and the unit is anonymous with no author key (F3.2 c12 unchanged)', T, async () => {
    const app = await start();
    const id = String(jsonObject((await createPost(app, A.header, { body: 'mine anon', audience: 'everyone', isAnonymous: true })).body).id);
    await setAt(id, ago(1));
    const unit = await itemOf(app, A, id);
    expect(unit).toMatchObject({ isMine: false, isAnonymous: true });
    expect(keysDeep(unit).has('author')).toBe(false);
  });
});
