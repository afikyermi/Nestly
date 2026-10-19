import type { Writable } from 'node:stream';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, toRecord, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, captureLog, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';
import { addComment, deleteComment, listComments, listReplies } from '../helpers/comments-api.js';
import { jsonObject } from '../helpers/posts-api.js';

// I3 F3.3-b1, the comment API against the real database (CI `db` job, as app_server); criteria c2-c9 of .work/comments-likes/spec.md.
// Expected values come from the spec only. Fixture rows are committed through `side.begin`; every test starts and ends with tests.fx_feed_clear().

const T = { timeout: COLD_START_MS };
const S = '50000000-0000-4000-8000-000000000051'; // suspended fixture account
const P = 'd0000000-0000-4000-8000-0000000000d4'; // Professional fixture account
const NOBODY = '99999999-9999-4999-8999-999999999999';
const T0 = Date.parse('2026-01-15T12:00:00Z');

interface Member { id: string; header: string }
const NAMES = ['Adi Author', 'Cora Commenter', 'Fiona Friend', 'Quinn Requester', 'Xavi Stranger', 'Rina Restricted', 'Ofer Other'];
let AU: Member, C: Member, F: Member, Q: Member, X: Member, R: Member, O: Member;
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
const count = (fn: 'fx_cm_count' | 'fx_rx_count'): Promise<number> => text(side.unsafe(`select tests.${fn}() as v`)).then(Number);
const cmState = (id: string): Promise<string> => text(side`select coalesce(tests.fx_cm_state(${id}::uuid), 'none') as v`);

async function inTx(work: (tx: postgres.TransactionSql) => Promise<void>): Promise<void> {
  await side.begin(async (tx) => {
    await tx`select 1`;
    await work(tx);
  });
}
async function seedPost(by: Member, aud: 'everyone' | 'friends' = 'everyone', anon = false): Promise<string> {
  let id = '';
  await inTx(async (tx) => {
    id = await text(tx`select tests.fx_po_add(${by.id}::uuid, ${aud}, ${anon}, 'active', 'post body', null, null)::text as v`);
  });
  return id;
}
/** A comment written as `by` at T0 + minute; returns its id. */
async function seedComment(by: Member, postId: string, minute: number, body = `c${minute}`, parent: string | null = null): Promise<string> {
  let id = '';
  await inTx(async (tx) => {
    id = await text(tx`select tests.fx_cm_add(${by.id}::uuid, ${postId}::uuid, ${body}, ${parent}::uuid)::text as v`);
    await tx`select tests.fx_fv_at('comment', ${id}::uuid, ${new Date(T0 + minute * 60_000).toISOString()}::text::timestamptz)`;
  });
  return id;
}
const report = (by: Member, kind: 'post' | 'comment', target: string): Promise<void> =>
  inTx(async (tx) => void (await tx`select tests.fx_rp_add(${by.id}::uuid, ${kind}, ${target}::uuid, 'spam', null)`));
const befriend = (req: Member, addr: Member, status: 'accepted' | 'pending'): Promise<void> =>
  inTx(async (tx) => void (await tx`select tests.fx_fr_add(${req.id}::uuid, ${addr.id}::uuid, ${status}, false)`));
const setStatus = (id: string, status: string): Promise<unknown> => side`select tests.set_status(${id}::uuid, ${status})`;

const items = (body: string): Array<Record<string, unknown>> => {
  const list = toRecord(JSON.parse(body)).items;
  if (!Array.isArray(list)) throw new Error('items is not an array');
  return list.map((i) => toRecord(i));
};
const repliesOf = (item: Record<string, unknown>): Array<Record<string, unknown>> => {
  if (!Array.isArray(item.replies)) throw new Error('replies is not an array');
  return item.replies.map((i) => toRecord(i));
};
const bodiesOf = (body: string): string[] => items(body).map((i) => String(i.body));
const errorOf = (body: string): unknown => toRecord(JSON.parse(body)).error;
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
const FORBIDDEN = ['user_id', 'userId', 'is_by_author', 'isByAuthor', 'is_by_post_author', 'author_id', 'authorId', 'postId', 'post_id', 'status'];
const expectNoForbiddenKeys = (body: string): void => {
  const keys = keysDeep(JSON.parse(body));
  for (const k of FORBIDDEN) expect(keys.has(k), `forbidden key ${k} in ${body}`).toBe(false);
};

beforeAll(async () => {
  key = await newKey('comments-db-key');
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
    made.push({ id, header });
  }
  everyone = made;
  const none: Member = { id: '', header: '' };
  [AU = none, C = none, F = none, Q = none, X = none, R = none, O = none] = made;
  await side`select tests.fx_restrict(${R.id}::uuid)`;
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
describe('[F3.3-b1 c2 c3] POST /posts/:id/comments', () => {
  it('[F3.3-b1 c3] 201 {comment} with the strict shape; the body is trimmed and stored; no author id, post id, status or count key', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const res = await addComment(app, C.header, postId, { body: '  תודה על השיתוף 💛  ' });
    expect(res.statusCode, res.body).toBe(201);
    const { comment } = toRecord(JSON.parse(res.body));
    const c = toRecord(comment);
    expect(Object.keys(c).sort()).toEqual(['author', 'body', 'byAuthor', 'createdAt', 'id', 'isMine', 'likeCount', 'likedByMe', 'parentId']);
    expect(c).toMatchObject({ parentId: null, body: 'תודה על השיתוף 💛', isMine: true, byAuthor: false, author: { name: 'Cora Commenter' } });
    expect(Number.isNaN(Date.parse(String(c.createdAt)))).toBe(false);
    expectNoForbiddenKeys(res.body);
    expect(await cmState(String(c.id))).toBe(`status=active author=${C.id} mark=f parent=null post=${postId}`);
  });

  it('[F3.3-b1 c2] 1,000 code points pass (Hebrew and emoji); 1,001 is body_too_long; blank is body_required; none writes a row', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    for (const ok of ['א'.repeat(1000), '😀'.repeat(1000)]) expect((await addComment(app, C.header, postId, { body: ok })).statusCode).toBe(201);
    expect(await count('fx_cm_count')).toBe(2);
    for (const long of ['א'.repeat(1001), '😀'.repeat(1001), 'x'.repeat(100_000)]) {
      const res = await addComment(app, C.header, postId, { body: long });
      expect([400, 422], res.body).toContain(res.statusCode);
      expect(errorOf(res.body)).toBe('body_too_long');
    }
    for (const blank of ['', '   ', '\n\t ']) {
      const res = await addComment(app, C.header, postId, { body: blank });
      expect([400, 422], res.body).toContain(res.statusCode);
      expect(errorOf(res.body)).toBe('body_required');
    }
    expect(await count('fx_cm_count')).toBe(2);
  });

  it('[F3.3-b1 c2] a NUL, a wrong type, a missing body, non-JSON and an extra key (authorId, byAuthor, status, postId) are 400 and write no row', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const bad: unknown[] = [
      { body: 'a\u0000b' }, { body: 5 }, { body: null }, {}, '{not json', '[]', 'null',
      { body: 'x', authorId: AU.id }, { body: 'x', byAuthor: true }, { body: 'x', status: 'removed' }, { body: 'x', postId: NOBODY }, { body: 'x', parentId: 'not-a-uuid' },
    ];
    for (const payload of bad) {
      const res = await addComment(app, C.header, postId, payload);
      expect(res.statusCode, `${JSON.stringify(payload)}: ${res.body}`).toBe(400);
    }
    expect(await count('fx_cm_count')).toBe(0);
  });

  it('[F3.3-b1 c3] hostile text is stored verbatim, never interpreted', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const hostile = `'); drop table nestly.comments; -- \${1+1} <img src=x onerror=alert(1)> \\0`;
    const res = await addComment(app, C.header, postId, { body: hostile });
    expect(res.statusCode, res.body).toBe(201);
    expect(toRecord(toRecord(JSON.parse(res.body)).comment).body).toBe(hostile);
    expect(await count('fx_cm_count')).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.3-b1 c4] who may comment where', () => {
  it('[F3.3-b1 c4] no token → 401; a Professional and a suspended account → 403; none writes a row', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    expect((await addComment(app, null, postId, { body: 'x' })).statusCode).toBe(401);
    expect((await addComment(app, hP, postId, { body: 'x' })).statusCode).toBe(403);
    expect((await addComment(app, hS, postId, { body: 'x' })).statusCode).toBe(403);
    expect(await count('fx_cm_count')).toBe(0);
  });

  it('[F3.3-b1 c4] missing, deleted, held, hidden, removed, a stranger\'s friends-only and a suspended author\'s post → the same 404 post_unavailable; no row', T, async () => {
    const app = await start();
    const friendsOnly = await seedPost(AU, 'friends');
    const hidden = await seedPost(AU);
    const removed = await seedPost(AU);
    const held = await seedPost(AU);
    const gone = await seedPost(AU);
    const suspendedAuthor = await seedPost(O);
    await inTx(async (tx) => {
      await tx`select tests.fx_po_status(${hidden}::uuid, 'hidden')`;
      await tx`select tests.fx_po_status(${removed}::uuid, 'removed')`;
    });
    await report(X, 'post', held);
    expect((await app.inject({ method: 'DELETE', url: `/api/posts/${held}`, headers: { authorization: AU.header } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/api/posts/${gone}`, headers: { authorization: AU.header } })).statusCode).toBe(204);
    await setStatus(O.id, 'suspended');
    const reference = await addComment(app, C.header, NOBODY, { body: 'x' });
    expect(reference.statusCode).toBe(404);
    expect(errorOf(reference.body)).toBe('post_unavailable');
    for (const id of [friendsOnly, hidden, removed, held, gone, suspendedAuthor]) {
      const res = await addComment(app, C.header, id, { body: 'x' });
      expect(`${res.statusCode}|${res.body}`, id).toBe(`404|${reference.body}`);
    }
    expect(await count('fx_cm_count')).toBe(0);
  });

  it('[F3.3-b1 c4] a friend may comment on a friends-only post', T, async () => {
    const app = await start();
    const postId = await seedPost(AU, 'friends');
    await befriend(F, AU, 'accepted');
    expect((await addComment(app, F.header, postId, { body: 'x' })).statusCode).toBe(201);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.3-b1 c5] replies: one level', () => {
  it('[F3.3-b1 c5] a reply to a top-level comment on the same post → 201 with parentId', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const top = await seedComment(C, postId, 1);
    const res = await addComment(app, X.header, postId, { body: 'reply', parentId: top });
    expect(res.statusCode, res.body).toBe(201);
    expect(toRecord(toRecord(JSON.parse(res.body)).comment).parentId).toBe(top);
  });

  it('[F3.3-b1 c5] a reply to a reply, a parent on another post, an unreadable, a held and an unknown parent → 400 parent_invalid, one identical body, no row', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const other = await seedPost(AU);
    const top = await seedComment(C, postId, 1);
    const reply = await seedComment(X, postId, 2, 'r', top);
    const elsewhere = await seedComment(C, other, 3);
    const unreadable = await seedComment(O, postId, 4);
    const heldTop = await seedComment(F, postId, 5);
    await setStatus(O.id, 'suspended');
    await report(X, 'comment', heldTop);
    expect((await deleteComment(app, F.header, heldTop)).statusCode).toBe(204);
    const before = await count('fx_cm_count');
    const bodies = new Set<string>();
    for (const parentId of [reply, elsewhere, unreadable, heldTop, NOBODY]) {
      const res = await addComment(app, X.header, postId, { body: 'x', parentId });
      expect(res.statusCode, `${parentId}: ${res.body}`).toBe(400);
      expect(errorOf(res.body)).toBe('parent_invalid');
      bodies.add(res.body);
    }
    expect(bodies.size).toBe(1);
    expect(await count('fx_cm_count')).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.3-b1 c6 AC-076 VAL-036] "המחבר"', () => {
  it('[F3.3-b1 c6] on an anonymous post the real author\'s comment is byAuthor, has no author key, isMine only for them; others keep author', T, async () => {
    const log = captureLog();
    const app = await start(log.stream);
    const postId = await seedPost(AU, 'everyone', true);
    const mine = await addComment(app, AU.header, postId, { body: 'from the author' });
    expect(mine.statusCode, mine.body).toBe(201);
    const created = toRecord(toRecord(JSON.parse(mine.body)).comment);
    expect(created).toMatchObject({ byAuthor: true, isMine: true });
    expect('author' in created).toBe(false);
    expect(await cmState(String(created.id))).toBe(`status=active author=null mark=t parent=null post=${postId}`);
    const other = await addComment(app, C.header, postId, { body: 'from a reader' });
    expect(toRecord(toRecord(JSON.parse(other.body)).comment)).toMatchObject({ byAuthor: false, author: { name: 'Cora Commenter' } });
    const asAuthor = items((await listComments(app, AU.header, postId)).body);
    const asReader = await listComments(app, X.header, postId);
    expect(asAuthor.map((i) => [i.byAuthor, i.isMine, 'author' in i])).toEqual([[true, true, false], [false, false, true]]);
    expect(items(asReader.body).map((i) => [i.byAuthor, i.isMine, 'author' in i])).toEqual([[true, false, false], [false, false, true]]);
    for (const body of [mine.body, other.body, asReader.body]) {
      expect(body).not.toContain(AU.id);
      expectNoForbiddenKeys(body);
    }
    expect(log.text()).not.toContain(AU.id);
  });

  it('[F3.3-b1 c6] on a named post the author\'s comment keeps author and is not byAuthor-without-author; no id leaks in an error either', T, async () => {
    const log = captureLog();
    const app = await start(log.stream);
    const postId = await seedPost(AU);
    const res = await addComment(app, AU.header, postId, { body: 'named' });
    const c = toRecord(toRecord(JSON.parse(res.body)).comment);
    expect(c.author).toEqual({ name: 'Adi Author' });
    const anonId = await seedPost(AU, 'everyone', true);
    const refused = await addComment(app, AU.header, anonId, { body: 'x', parentId: NOBODY });
    expect(refused.statusCode).toBe(400);
    expect(refused.body).not.toContain(AU.id);
    expect(log.text()).not.toContain(AU.id);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.3-b1 c6] isMine on "המחבר"', () => {
  it('[F3.3-b1 c6] true only for the real author of an anonymous post; false for the readers, a friend, and any other commenter, in the thread and its replies', T, async () => {
    const app = await start();
    const postId = await seedPost(AU, 'everyone', true);
    await befriend(F, AU, 'accepted');
    const top = await seedComment(AU, postId, 1, 'author top');
    await seedComment(AU, postId, 2, 'author reply', top);
    await seedComment(C, postId, 3, 'other');
    const mine = (viewer: Member) => listComments(app, viewer.header, postId).then((r) => items(r.body).map((i) => [i.isMine, ...repliesOf(i).map((x) => x.isMine)]));
    expect(await mine(AU)).toEqual([[true, true], [false]]);
    for (const other of [F, X, C, Q]) expect(await mine(other), other.id).toEqual([[false, false], [other === C]]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.3-b1 c7] author.name is what regular_names returns to the viewer under RLS', () => {
  // One fixture table: a policy change edits this table, not code. Commenter C on a named post by AU. null = the viewer is not allowed the name.
  const NAME_TABLE: Array<{ viewer: () => Member; relation: 'self' | 'friend' | 'request counterparty' | 'stranger'; expected: string | null }> = [
    { viewer: () => C, relation: 'self', expected: 'Cora Commenter' },
    { viewer: () => F, relation: 'friend', expected: 'Cora Commenter' },
    { viewer: () => Q, relation: 'request counterparty', expected: 'Cora Commenter' },
    { viewer: () => X, relation: 'stranger', expected: 'Cora Commenter' }, // Afik Q7 B (19.10): was null before the comment-reader policy
  ];
  it('[F3.3-b1 c7] the table rows (self, friend, request counterparty, stranger) hold in the thread and in the create answer', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    await befriend(F, C, 'accepted');
    await befriend(Q, C, 'pending');
    await seedComment(C, postId, 1);
    for (const row of NAME_TABLE) {
      const [first] = items((await listComments(app, row.viewer().header, postId)).body);
      expect(toRecord(first?.author), row.relation).toEqual({ name: row.expected });
    }
  });

  it('[F3.3-b1 c7] the post\'s named author is named to a stranger; a Restricted commenter is present in the thread', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    await seedComment(AU, postId, 1, 'by author');
    await seedComment(R, postId, 2, 'by restricted');
    const rows = items((await listComments(app, X.header, postId)).body);
    expect(rows.map((r) => r.body)).toEqual(['by author', 'by restricted']);
    expect(toRecord(rows[0]?.author)).toEqual({ name: 'Adi Author' });
    expect(toRecord(rows[1]?.author)).toEqual({ name: 'Rina Restricted' }); // Q7 B: every comment the reader may see carries its commenter's full name
  });

  it('[F3.4 c10 Q7 B] a stranger sees the full name on a comment and on a reply; the "המחבר" comment of an anonymous post author keeps no author key and names nobody', T, async () => {
    const app = await start();
    const named = await seedPost(AU);
    const top = await seedComment(C, named, 1, 'top');
    await seedComment(F, named, 2, 'reply', top);
    const [first] = items((await listComments(app, X.header, named)).body);
    expect(toRecord(first?.author)).toEqual({ name: 'Cora Commenter' });
    expect(repliesOf(first ?? {}).map((r) => toRecord(r.author))).toEqual([{ name: 'Fiona Friend' }]);
    const anon = await seedPost(AU, 'everyone', true);
    await seedComment(AU, anon, 1, 'the author speaks');
    const rows = items((await listComments(app, X.header, anon)).body);
    expect(rows).toHaveLength(1);
    expect('author' in (rows[0] ?? {})).toBe(false);
    expect(JSON.stringify(rows)).not.toContain('Adi Author');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.3-b1 c8] GET /posts/:id/comments', () => {
  it('[F3.3-b1 c8] empty → {items:[],nextCursor:null}; 401 without a token; an unreadable post → 404', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const empty = await listComments(app, C.header, postId);
    expect(empty.statusCode).toBe(200);
    expect(jsonObject(empty.body)).toEqual({ items: [], nextCursor: null });
    expect((await listComments(app, null, postId)).statusCode).toBe(401);
    const closed = await seedPost(AU, 'friends');
    const missing = await listComments(app, X.header, NOBODY);
    expect(missing.statusCode).toBe(404);
    expect((await listComments(app, X.header, closed)).body).toBe(missing.body);
  });

  it('[F3.3-b1 c8] top-level oldest first, replies nested oldest first; 20 a page, then the rest; no repeat, no skip', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const tops: string[] = [];
    for (let i = 1; i <= 25; i++) tops.push(await seedComment(C, postId, i * 10, `t${i}`));
    await seedComment(X, postId, 300, 'late reply', tops[0]);
    await seedComment(F, postId, 250, 'early reply', tops[0]);
    const one = await listComments(app, X.header, postId);
    expect(one.statusCode, one.body).toBe(200);
    const firstPage = items(one.body);
    expect(firstPage.map((i) => i.body)).toEqual(Array.from({ length: 20 }, (_, i) => `t${i + 1}`));
    expect(repliesOf(firstPage[0] ?? {}).map((r) => r.body)).toEqual(['early reply', 'late reply']);
    expect(repliesOf(firstPage[1] ?? {})).toEqual([]);
    const cursor = toRecord(JSON.parse(one.body)).nextCursor;
    expect(typeof cursor).toBe('string');
    const two = await listComments(app, X.header, postId, String(cursor));
    expect(bodiesOf(two.body)).toEqual(['t21', 't22', 't23', 't24', 't25']);
    expect(toRecord(JSON.parse(two.body)).nextCursor).toBeNull();
  });

  it('[F3.3-b1 c8] deleting the last row of page one, and one of page two, between the pages repeats and skips nothing', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const ids: string[] = [];
    for (let i = 1; i <= 25; i++) ids.push(await seedComment(C, postId, i, `t${i}`));
    const one = await listComments(app, C.header, postId);
    const cursor = String(toRecord(JSON.parse(one.body)).nextCursor);
    expect((await deleteComment(app, C.header, ids[19] ?? '')).statusCode).toBe(204);
    expect((await deleteComment(app, C.header, ids[22] ?? '')).statusCode).toBe(204);
    const two = await listComments(app, C.header, postId, cursor);
    expect(bodiesOf(two.body)).toEqual(['t21', 't22', 't24', 't25']);
  });

  it('[F3.3-b1 c8] an invalid cursor → 400 cursor_invalid', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    await seedComment(C, postId, 1);
    for (const bad of ['garbage', 'e30', Buffer.from('{"x":1}').toString('base64url'), '%%%']) {
      const res = await listComments(app, X.header, postId, bad);
      expect(res.statusCode, bad).toBe(400);
      expect(errorOf(res.body)).toBe('cursor_invalid');
    }
  });

  it('[F3.3-b1 c8 c4] absent: a suspended commenter, a held comment, a reply under a held parent; present: a reported comment, even to its reporter', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    await seedComment(O, postId, 1, 'by suspended');
    const held = await seedComment(C, postId, 2, 'held');
    await seedComment(F, postId, 3, 'reply under held', held);
    const reported = await seedComment(C, postId, 4, 'reported');
    await seedComment(F, postId, 5, 'reply under reported', reported);
    await seedComment(F, postId, 6, 'plain');
    await setStatus(O.id, 'suspended');
    await report(X, 'comment', held);
    await report(X, 'comment', reported);
    expect((await deleteComment(app, C.header, held)).statusCode).toBe(204);
    for (const viewer of [X, C, F, AU]) {
      const rows = items((await listComments(app, viewer.header, postId)).body);
      expect(rows.map((r) => r.body), viewer.id).toEqual(['reported', 'plain']);
      expect(repliesOf(rows[0] ?? {}).map((r) => r.body)).toEqual(['reply under reported']);
    }
  });

  it('[F3.3-b1 c8] a reader sees no comment on a post they cannot read, a suspended viewer gets a refusal not the list', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    await seedComment(C, postId, 1);
    const res = await listComments(app, hS, postId);
    expect([403, 404]).toContain(res.statusCode);
    expect(res.body).not.toContain('c1');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.3-b1 c9] DELETE /comments/:id', () => {
  it('[F3.3-b1 c9] the commenter → 204 (empty body); the row, its replies and its likes are gone', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const top = await seedComment(C, postId, 1);
    await seedComment(X, postId, 2, 'reply', top);
    await inTx(async (tx) => void (await tx`select tests.fx_rx_add(${F.id}::uuid, null, ${top}::uuid)`));
    expect(await count('fx_rx_count')).toBe(1);
    const res = await deleteComment(app, C.header, top);
    expect(res.statusCode, res.body).toBe(204);
    expect(res.body).toBe('');
    expect(await count('fx_cm_count')).toBe(0);
    expect(await count('fx_rx_count')).toBe(0);
  });

  it('[F3.3-b1 c9] with an open report → the same 204 and body; gone for every reader, the reporter included; a second delete is 404', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const plain = await seedComment(C, postId, 1, 'plain');
    const held = await seedComment(C, postId, 2, 'held');
    await report(X, 'comment', held);
    const a = await deleteComment(app, C.header, plain);
    const b = await deleteComment(app, C.header, held);
    expect([b.statusCode, b.body, b.headers['content-type']]).toEqual([a.statusCode, a.body, a.headers['content-type']]);
    expect(b.statusCode).toBe(204);
    for (const viewer of [X, C, AU, F]) expect(items((await listComments(app, viewer.header, postId)).body)).toEqual([]);
    expect((await deleteComment(app, C.header, held)).statusCode).toBe(404);
  });

  it('[F3.3-b1 c9] another user\'s comment (the post\'s author too), an unknown id and a non-uuid → 404 with one body; the row is unchanged; 401 without a token', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const id = await seedComment(C, postId, 1);
    const before = await cmState(id);
    const missing = await deleteComment(app, X.header, NOBODY);
    expect(missing.statusCode).toBe(404);
    for (const h of [AU.header, X.header, F.header]) {
      const res = await deleteComment(app, h, id);
      expect(`${res.statusCode}|${res.body}`).toBe(`404|${missing.body}`);
    }
    expect((await deleteComment(app, X.header, 'not-a-uuid')).statusCode).toBe(404);
    expect((await deleteComment(app, null, id)).statusCode).toBe(401);
    expect(await cmState(id)).toBe(before);
  });

  it('[F3.3-b1 c9 G2] the commenter still deletes their comment after the post is hidden, or reported; so does the real author of an anonymous post', T, async () => {
    const app = await start();
    const hiddenPost = await seedPost(AU);
    const reportedPost = await seedPost(AU);
    const anonPost = await seedPost(AU, 'everyone', true);
    const onHidden = await seedComment(C, hiddenPost, 1);
    const onReported = await seedComment(C, reportedPost, 2);
    const onAnon = await seedComment(AU, anonPost, 3, 'mine, anonymous');
    await side`select tests.fx_po_status(${hiddenPost}::uuid, 'hidden')`;
    await report(X, 'post', reportedPost);
    expect((await deleteComment(app, C.header, onHidden)).statusCode).toBe(204);
    expect((await deleteComment(app, C.header, onReported)).statusCode).toBe(204);
    expect((await deleteComment(app, AU.header, onAnon)).statusCode).toBe(204);
    expect(await count('fx_cm_count')).toBe(0);
  });

  it('[F3.3-b1 c9] two simultaneous deletes: at most one 204, the other 404 (503 allowed); the comment is gone or left whole', T, async () => {
    const first = await start();
    const second = await start();
    const postId = await seedPost(AU);
    const id = await seedComment(C, postId, 1);
    const [x, y] = await Promise.all([deleteComment(first, C.header, id), deleteComment(second, C.header, id)]);
    const codes = [x.statusCode, y.statusCode];
    for (const code of codes) expect([204, 404, 503]).toContain(code);
    expect(codes.filter((c) => c === 204).length).toBeLessThanOrEqual(1);
    expect(await count('fx_cm_count')).toBe(codes.includes(204) ? 0 : 1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.3-b1 c8] replies are bounded: 3 inline, replyCount, GET /comments/:id/replies', () => {
  const pageOf = (body: string): { rows: string[]; next: unknown } => ({ rows: bodiesOf(body), next: toRecord(JSON.parse(body)).nextCursor });

  it('[F3.3-b1 c8] a parent with 25 replies carries the oldest 3 and replyCount 25; the replies call pages 20 then 5 from the oldest, no repeat, no skip', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const top = await seedComment(C, postId, 1, 'top');
    const ids: string[] = [];
    for (let i = 1; i <= 25; i++) ids.push(await seedComment(i % 2 ? X : F, postId, 10 + i, `r${i}`, top));
    const [item] = items((await listComments(app, X.header, postId)).body);
    expect(item?.replyCount).toBe(25);
    expect(repliesOf(item ?? {}).map((r) => r.body)).toEqual(['r1', 'r2', 'r3']);
    expectNoForbiddenKeys(JSON.stringify(item));
    const one = await listReplies(app, X.header, top);
    expect(one.statusCode, one.body).toBe(200);
    const first = pageOf(one.body);
    expect(first.rows).toEqual(Array.from({ length: 20 }, (_, i) => `r${i + 1}`));
    expect(typeof first.next).toBe('string');
    expect((await deleteComment(app, F.header, ids[19] ?? '')).statusCode).toBe(204); // the cursor row itself goes between the pages
    expect((await deleteComment(app, X.header, ids[22] ?? '')).statusCode).toBe(204);
    const two = pageOf((await listReplies(app, X.header, top, String(first.next))).body);
    expect(two.rows).toEqual(['r21', 'r22', 'r24', 'r25']);
    expect(two.next).toBeNull();
    expectNoForbiddenKeys(one.body);
  });

  it('[F3.3-b1 c8] replyCount counts only replies the reader may see: a held reply and a suspended replier\'s are not counted', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const top = await seedComment(C, postId, 1, 'top');
    await seedComment(F, postId, 2, 'visible', top);
    const held = await seedComment(F, postId, 3, 'held', top);
    await seedComment(O, postId, 4, 'by suspended', top);
    await report(X, 'comment', held);
    await deleteComment(app, F.header, held);
    await setStatus(O.id, 'suspended');
    const [item] = items((await listComments(app, X.header, postId)).body);
    expect(item?.replyCount).toBe(1);
    expect(repliesOf(item ?? {}).map((r) => r.body)).toEqual(['visible']);
    expect(bodiesOf((await listReplies(app, X.header, top)).body)).toEqual(['visible']);
  });

  it('[F3.3-b1 c8] a parent without replies: replyCount 0, and the replies call is {items:[],nextCursor:null}', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const top = await seedComment(C, postId, 1);
    const [item] = items((await listComments(app, X.header, postId)).body);
    expect([item?.replyCount, repliesOf(item ?? {})]).toEqual([0, []]);
    expect(jsonObject((await listReplies(app, X.header, top)).body)).toEqual({ items: [], nextCursor: null });
  });

  it('[F3.3-b1 c8] a malformed or extra-key cursor → 400 cursor_invalid', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const top = await seedComment(C, postId, 1);
    const reply = await seedComment(X, postId, 2, 'r', top);
    const at = '2026-01-15T12:00:00.000000Z';
    for (const bad of ['garbage', `${at}~${reply}~x`, `${at}~`, `${at}~not-a-uuid`]) {
      const res = await listReplies(app, X.header, top, bad);
      expect(res.statusCode, bad).toBe(400);
      expect(errorOf(res.body)).toBe('cursor_invalid');
    }
  });

  it('[F3.3-b1 c8] a cursor whose id is a top-level (non-reply) comment → 400 cursor_invalid', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const top = await seedComment(C, postId, 1);
    await seedComment(X, postId, 2, 'r', top);
    const res = await listReplies(app, X.header, top, `2026-01-15T12:00:00.000000Z~${top}`);
    expect([res.statusCode, errorOf(res.body)]).toEqual([400, 'cursor_invalid']);
  });

  it('[F3.3-b1 c8] an unknown id, a reply, a held parent and a parent on an unreadable post → one identical 404 comment_unavailable; 401 without a token', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const closed = await seedPost(AU, 'friends');
    const top = await seedComment(C, postId, 1);
    const reply = await seedComment(X, postId, 2, 'r', top);
    const heldTop = await seedComment(F, postId, 3, 'held');
    const onClosed = await seedComment(AU, closed, 4);
    await report(X, 'comment', heldTop);
    await deleteComment(app, F.header, heldTop);
    const reference = await listReplies(app, X.header, NOBODY);
    expect(reference.statusCode).toBe(404);
    expect(errorOf(reference.body)).toBe('comment_unavailable');
    for (const id of [reply, heldTop, onClosed, 'not-a-uuid']) {
      const res = await listReplies(app, X.header, id);
      expect(`${res.statusCode}|${res.body}`, id).toBe(`404|${reference.body}`);
    }
    expect((await listReplies(app, null, top)).statusCode).toBe(401);
    expect([403, 404]).toContain((await listReplies(app, hS, top)).statusCode);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.3-b1 c8 c9] more G2 and absence', () => {
  it('[F3.3-b1 c9 G2] the commenter still deletes their comment after hiding the post for themselves (post_hides)', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const id = await seedComment(C, postId, 1);
    await inTx(async (tx) => void (await tx`select tests.fx_ph_add(${C.id}::uuid, ${postId}::uuid)`));
    expect((await deleteComment(app, C.header, id)).statusCode).toBe(204);
    expect(await count('fx_cm_count')).toBe(0);
  });

  it('[F3.3-b1 c8] a banned commenter\'s comment, and a banned replier\'s reply, are absent', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    await seedComment(O, postId, 1, 'by banned');
    const top = await seedComment(C, postId, 2, 'by active');
    await seedComment(O, postId, 3, 'reply by banned', top);
    await setStatus(O.id, 'banned');
    const rows = items((await listComments(app, X.header, postId)).body);
    expect(rows.map((r) => r.body)).toEqual(['by active']);
    expect(rows[0]?.replyCount).toBe(0);
    expect(repliesOf(rows[0] ?? {})).toEqual([]);
  });
});
