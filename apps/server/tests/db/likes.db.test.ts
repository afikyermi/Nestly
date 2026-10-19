import type { Writable } from 'node:stream';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serializeFeedCursor } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, toRecord, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, captureLog, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';
import { listComments, listReplies } from '../helpers/comments-api.js';
import { getPost } from '../helpers/posts-api.js';
import { deleteLike, putLike, type LikeKind } from '../helpers/likes-api.js';

// I3 F3.3-b2, likes and displayed counts against the real database (CI `db` job, as app_server); criteria c10-c12 of .work/comments-likes/spec.md
// and the F3.3 guards of .work/_initiatives/I3-algorithm.md (Evaluation). Expected values come from those documents only.

const T = { timeout: COLD_START_MS };
const S = '50000000-0000-4000-8000-000000000051'; // suspended fixture account
const P = 'd0000000-0000-4000-8000-0000000000d4'; // Professional fixture account
const NOBODY = '99999999-9999-4999-8999-999999999999';
const T0 = Date.parse('2026-01-15T12:00:00Z');
const HOUR = 3_600_000;
const ASOF = '2026-01-15T12:00:00.000000Z';
const TOP_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const topCursor = (): string => serializeFeedCursor({ asOf: ASOF, configVersion: 1, tier: 0, score: 1e9, createdAt: ASOF, id: TOP_ID });
const iso = (ms: number): string => new Date(T0 + ms).toISOString().replace('Z', '000Z');

interface Member { id: string; header: string }
const NAMES = ['Adi Author', 'Cora Commenter', 'Fiona Friend', 'Xavi Stranger', 'Yoni Other', 'Ofer Other', 'Rina Restricted'];
let AU: Member, C: Member, F: Member, X: Member, Y: Member, O: Member, R: Member;
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
async function start(logStream?: Writable, database: Database = createDatabase(url())): Promise<App> {
  const app = await buildRegisterApp(env(), { database, clock: () => CLOCK_NOW, ...(logStream ? { logStream } : {}) });
  toClose.push({ app, database });
  return app;
}
function recording(statements: string[]): Database {
  const client = postgres(url(), { max: 1, prepare: false, debug: (_connection: number, query: string) => void statements.push(query) });
  return { db: drizzle({ client }), client, close: () => client.end() };
}
async function closeAll(): Promise<void> {
  for (const { app, database } of toClose.splice(0)) {
    await app.close();
    await database.close();
  }
}
const bearerFor = async (sub: string): Promise<string> => `Bearer ${await token({ key, sub })}`;
const text = async (query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> => String((await query)[0]?.v);
const count = (fn: 'fx_cm_count' | 'fx_rx_count' | 'fx_ro_count'): Promise<number> => text(side.unsafe(`select tests.${fn}() as v`)).then(Number);
async function inTx(work: (tx: postgres.TransactionSql) => Promise<void>): Promise<void> {
  await side.begin(async (tx) => {
    await tx`select 1`;
    await work(tx);
  });
}
async function seedPost(by: Member, aud: 'everyone' | 'friends' = 'everyone', extra: { ago?: number; shared?: string } = {}): Promise<string> {
  let id = '';
  await inTx(async (tx) => {
    id = await text(tx`select tests.fx_po_add(${by.id}::uuid, ${aud}, false, 'active', 'post body', null, ${extra.shared ?? null}::uuid)::text as v`);
    if (extra.ago !== undefined) await tx`select tests.fx_fv_at('post', ${id}::uuid, ${iso(-extra.ago * HOUR)}::text::timestamptz)`;
  });
  return id;
}
async function seedComment(by: Member, postId: string, minute: number, parent: string | null = null): Promise<string> {
  let id = '';
  await inTx(async (tx) => {
    id = await text(tx`select tests.fx_cm_add(${by.id}::uuid, ${postId}::uuid, ${`c${minute}`}, ${parent}::uuid)::text as v`);
    await tx`select tests.fx_fv_at('comment', ${id}::uuid, ${new Date(T0 + minute * 60_000).toISOString()}::text::timestamptz)`;
  });
  return id;
}
/** A like written as `by`'s identity on a post or a comment (the database fills the owner and the liker status itself). */
const seedLike = (by: Member, kind: LikeKind, target: string, ago = 1): Promise<void> =>
  inTx(async (tx) => {
    const id = await text(tx`select tests.fx_rx_add(${by.id}::uuid, ${kind === 'post' ? target : null}::uuid, ${kind === 'comment' ? target : null}::uuid)::text as v`);
    await tx`select tests.fx_fv_at('reaction', ${id}::uuid, ${iso(-ago * HOUR)}::text::timestamptz)`;
  });
const report = (by: Member, kind: 'post' | 'comment', target: string): Promise<void> =>
  inTx(async (tx) => void (await tx`select tests.fx_rp_add(${by.id}::uuid, ${kind}, ${target}::uuid, 'spam', null)`));
const befriend = (req: Member, addr: Member): Promise<void> =>
  inTx(async (tx) => void (await tx`select tests.fx_fr_add(${req.id}::uuid, ${addr.id}::uuid, 'accepted', false)`));
const setStatus = (id: string, status: string): Promise<unknown> => side`select tests.set_status(${id}::uuid, ${status})`;
const postStatus = (id: string, status: string): Promise<unknown> => side`select tests.fx_po_status(${id}::uuid, ${status})`;

type Rec = Record<string, unknown>;
const items = (body: string): Rec[] => {
  const list = toRecord(JSON.parse(body)).items;
  if (!Array.isArray(list)) throw new Error('items is not an array');
  return list.map((i) => toRecord(i));
};
const repliesOf = (item: Rec): Rec[] => (Array.isArray(item.replies) ? item.replies.map((i) => toRecord(i)) : []);
const postView = async (app: App, who: Member, id: string): Promise<Rec> => {
  const res = await getPost(app, who.header, id);
  expect(res.statusCode, res.body).toBe(200);
  const out = toRecord(JSON.parse(res.body));
  return 'post' in out ? toRecord(out.post) : out;
};
const feedUrl = (cursor?: string): string => (cursor === undefined ? '/api/feed' : `/api/feed?cursor=${encodeURIComponent(cursor)}`);
const feedBody = async (app: App, who: Member, cursor?: string): Promise<string> => {
  const res = await app.inject({ method: 'GET', url: feedUrl(cursor), headers: { authorization: who.header } });
  expect(res.statusCode, res.body).toBe(200);
  return res.body;
};
const unit = (body: string, id: string): Rec => {
  const found = items(body).find((i) => i.id === id);
  if (!found) throw new Error(`unit ${id} not in the page`);
  return found;
};
/** Every comment the thread renders to `who` on a post: top-level, inline replies and further reply pages, merged by id. */
async function rendered(app: App, who: Member, postId: string): Promise<number> {
  const ids = new Set<string>();
  let cursor: string | undefined;
  do {
    const res = await listComments(app, who.header, postId, cursor);
    expect(res.statusCode, res.body).toBe(200);
    for (const item of items(res.body)) {
      ids.add(String(item.id));
      repliesOf(item).forEach((r) => ids.add(String(r.id)));
      let rc: string | undefined;
      while (Number(item.replyCount) > repliesOf(item).length) {
        const more = await listReplies(app, who.header, String(item.id), rc);
        expect(more.statusCode, more.body).toBe(200);
        items(more.body).forEach((r) => ids.add(String(r.id)));
        const next = toRecord(JSON.parse(more.body)).nextCursor;
        if (typeof next !== 'string') break;
        rc = next;
      }
    }
    const next = toRecord(JSON.parse(res.body)).nextCursor;
    cursor = typeof next === 'string' ? next : undefined;
  } while (cursor !== undefined);
  return ids.size;
}
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
const FORBIDDEN = ['user_id', 'userId', 'is_by_author', 'isByAuthor', 'is_by_post_author', 'author_id', 'authorId', 'score', 'n', 'likers', 'likedBy'];
const expectNoForbiddenKeys = (body: string): void => {
  const keys = keysDeep(JSON.parse(body));
  for (const k of FORBIDDEN) expect(keys.has(k), `forbidden key ${k} in ${body.slice(0, 300)}`).toBe(false);
};

beforeAll(async () => {
  key = await newKey('likes-db-key');
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
  [AU = none, C = none, F = none, X = none, Y = none, O = none, R = none] = made;
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

/** A readable target of each kind: a post by AU, or a top-level comment by C under it. */
async function target(kind: LikeKind): Promise<string> {
  const postId = await seedPost(AU);
  return kind === 'post' ? postId : seedComment(C, postId, 1);
}

// ---------------------------------------------------------------------------------------------------------------------
describe.each<LikeKind>(['post', 'comment'])('[F3.3-b2 c10] PUT|DELETE like on a %s', (kind) => {
  it(`[F3.3-b2 c10] PUT → 204 with no body, idempotent: repeat PUT leaves one like; one like per user; DELETE removes only the caller's, repeat DELETE is 204`, T, async () => {
    const log = captureLog();
    const app = await start(log.stream);
    const id = await target(kind);
    const first = await putLike(app, X.header, kind, id);
    expect(first.statusCode, first.body).toBe(204);
    expect(first.body).toBe('');
    expect((await putLike(app, X.header, kind, id)).statusCode).toBe(204);
    expect(await count('fx_rx_count')).toBe(1);
    expect(await count('fx_ro_count')).toBe(1);
    expect((await putLike(app, Y.header, kind, id)).statusCode).toBe(204);
    expect(await count('fx_rx_count')).toBe(2);
    expect((await deleteLike(app, X.header, kind, id)).statusCode).toBe(204);
    expect(await count('fx_rx_count')).toBe(1);
    expect((await deleteLike(app, X.header, kind, id)).statusCode).toBe(204);
    expect((await deleteLike(app, F.header, kind, id)).statusCode, 'never liked → still 204').toBe(204);
    expect(await count('fx_rx_count'), "Y's like survives X's deletes").toBe(1);
    expect(log.text()).not.toContain(X.id);
  });

  it('[F3.3-b2 c10] the author may like their own content; a friend may like a friends-only post', T, async () => {
    const app = await start();
    const own = await target(kind);
    expect((await putLike(app, kind === 'post' ? AU.header : C.header, kind, own)).statusCode).toBe(204);
    const postId = await seedPost(AU, 'friends');
    const id = kind === 'post' ? postId : await seedComment(AU, postId, 1);
    await befriend(F, AU);
    expect((await putLike(app, F.header, kind, id)).statusCode).toBe(204);
    expect(await count('fx_rx_count')).toBe(2);
  });

  it('[F3.3-b2 c10] no token → 401; a Professional and a suspended account → 403; none writes or removes a row', T, async () => {
    const app = await start();
    const id = await target(kind);
    await seedLike(X, kind, id);
    for (const send of [putLike, deleteLike]) {
      expect((await send(app, null, kind, id)).statusCode).toBe(401);
      expect((await send(app, hP, kind, id)).statusCode).toBe(403);
      expect((await send(app, hS, kind, id)).statusCode).toBe(403);
    }
    expect(await count('fx_rx_count')).toBe(1);
  });

  it('[F3.3-b2 c10] a malformed, unknown or unreadable target → the same 404 for PUT and DELETE, never 204, and no row', T, async () => {
    const app = await start();
    const unreadable: string[] = [];
    const friendsOnly = await seedPost(AU, 'friends');
    const hidden = await seedPost(AU);
    const removed = await seedPost(AU);
    const held = await seedPost(AU);
    const suspendedAuthor = await seedPost(O);
    await postStatus(hidden, 'hidden');
    await postStatus(removed, 'removed');
    await report(Y, 'post', held);
    expect((await app.inject({ method: 'DELETE', url: `/api/posts/${held}`, headers: { authorization: AU.header } })).statusCode).toBe(204);
    const open = await seedPost(AU);
    const underFriends = await seedComment(AU, friendsOnly, 1);
    const underHidden = await seedComment(AU, hidden, 2);
    const heldComment = await seedComment(F, open, 3);
    const suspendedComment = await seedComment(O, open, 4);
    await report(Y, 'comment', heldComment);
    expect((await app.inject({ method: 'DELETE', url: `/api/comments/${heldComment}`, headers: { authorization: F.header } })).statusCode).toBe(204);
    await setStatus(O.id, 'suspended');
    if (kind === 'post') unreadable.push(friendsOnly, hidden, removed, held, suspendedAuthor);
    else unreadable.push(underFriends, underHidden, heldComment, suspendedComment);
    const reference = await putLike(app, X.header, kind, NOBODY);
    expect(reference.statusCode).toBe(404);
    for (const send of [putLike, deleteLike]) {
      for (const bad of [...unreadable, 'not-a-uuid']) {
        const res = await send(app, X.header, kind, bad);
        expect(res.statusCode, `${bad}: ${res.body}`).toBe(404);
        if (bad !== 'not-a-uuid') expect(res.body).toBe(reference.body);
      }
    }
    expect(await count('fx_rx_count')).toBe(0);
  });

  it('[F3.3-b2 c10] six simultaneous PUTs by one user leave exactly one like (503 is allowed, a duplicate is not)', T, async () => {
    const app = await start();
    const id = await target(kind);
    const results = await Promise.all(Array.from({ length: 6 }, () => putLike(app, X.header, kind, id)));
    for (const r of results) expect([204, 503], r.body).toContain(r.statusCode);
    expect(await count('fx_rx_count')).toBeLessThanOrEqual(1);
    expect((await putLike(app, X.header, kind, id)).statusCode).toBe(204);
    expect(await count('fx_rx_count')).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.3-b2 c11] displayed counts', () => {
  it('[F3.3-b2 c11] post likeCount counts the author\'s own like and a restricted liker; likes on its comments never count; 0 when none', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const comment = await seedComment(C, postId, 1);
    expect((await postView(app, X, postId)).likeCount).toBe(0);
    await seedLike(AU, 'post', postId);
    await seedLike(R, 'post', postId);
    await seedLike(Y, 'post', postId);
    await seedLike(X, 'comment', comment);
    await seedLike(Y, 'comment', comment);
    await seedLike(AU, 'comment', comment);
    expect((await postView(app, X, postId)).likeCount).toBe(3);
    expect(unit(JSON.stringify({ items: items(await feedBody(app, X)) }), postId).likeCount).toBe(3);
  });

  it('[F3.3-b2 c11] a suspended liker\'s like drops out of the count and returns on reactivation (post, comment, feed)', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const comment = await seedComment(AU, postId, 1);
    await seedLike(C, 'post', postId);
    await seedLike(F, 'post', postId);
    await seedLike(C, 'comment', comment);
    const read = async (): Promise<[unknown, unknown, unknown]> => {
      const thread = items((await listComments(app, X.header, postId)).body);
      return [(await postView(app, X, postId)).likeCount, thread[0]?.likeCount, unit(await feedBody(app, X), postId).likeCount];
    };
    expect(await read()).toEqual([2, 1, 2]);
    await setStatus(C.id, 'suspended');
    expect(await read()).toEqual([1, 0, 1]);
    await setStatus(C.id, 'active');
    expect(await read()).toEqual([2, 1, 2]);
  });

  it('[F3.3-b2 c11] every comment, inline reply and replies-page item carries likeCount for its own row only', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const top = await seedComment(C, postId, 1);
    const reply = await seedComment(F, postId, 2, top);
    await seedLike(X, 'comment', top);
    await seedLike(Y, 'comment', top);
    await seedLike(X, 'comment', reply);
    await seedLike(Y, 'post', postId);
    const [item] = items((await listComments(app, O.header, postId)).body);
    expect([item?.likeCount, repliesOf(item ?? {})[0]?.likeCount]).toEqual([2, 1]);
    const paged = items((await listReplies(app, O.header, top)).body);
    expect(paged.map((r) => r.likeCount)).toEqual([1]);
  });

  it('[F3.3-b2 c11] a share counts its own row: comments and likes on the original do not move the share\'s counts', T, async () => {
    const app = await start();
    const original = await seedPost(AU);
    const share = await seedPost(C, 'everyone', { shared: original });
    await seedComment(F, original, 1);
    await seedComment(F, original, 2);
    await seedLike(Y, 'post', original);
    await seedComment(Y, share, 3);
    await seedLike(Y, 'post', share);
    await seedLike(F, 'post', share);
    const body = await feedBody(app, X);
    expect([unit(body, share).likeCount, unit(body, share).commentCount]).toEqual([2, 1]);
    const orig = await postView(app, X, original); // the feed shows an original under its share, so read it on its own page
    expect([orig.likeCount, orig.commentCount]).toEqual([1, 2]);
  });

  it('[F3.3-b2 c11] commentCount = comments + replies of visible parents: a held parent hides its replies (even the viewer\'s own) and a suspended commenter is absent; card count = rendered items', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const t1 = await seedComment(C, postId, 1);
    await seedComment(X, postId, 2, t1);
    const heldTop = await seedComment(F, postId, 3);
    await seedComment(O, postId, 4, heldTop);
    const t3 = await seedComment(C, postId, 5);
    for (let i = 0; i < 4; i += 1) await seedComment(i % 2 === 0 ? X : Y, postId, 6 + i, t3);
    await seedComment(R, postId, 11, t3);
    await seedComment(O, postId, 12, t3);
    await seedComment(O, postId, 13);
    await report(Y, 'comment', heldTop);
    expect((await app.inject({ method: 'DELETE', url: `/api/comments/${heldTop}`, headers: { authorization: F.header } })).statusCode).toBe(204);
    await setStatus(O.id, 'suspended');
    // visible: t1, t3 (2 top-level) + 1 reply under t1 + 5 under t3 (X, Y, X, Y, R; the suspended O's one is absent) = 8; heldTop's reply is not rendered
    for (const who of [X, Y, C, AU]) {
      expect((await postView(app, who, postId)).commentCount, `post page for ${who.id}`).toBe(8);
      expect(unit(await feedBody(app, who), postId).commentCount, `feed card for ${who.id}`).toBe(8);
      expect(await rendered(app, who, postId)).toBe(8);
    }
  });

  it('[F3.3-b2 c11] the count the viewer sees equals what the thread renders to them, also for the held comment\'s own author and for the reply\'s own author', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    await seedComment(C, postId, 1);
    const heldTop = await seedComment(F, postId, 2);
    await seedComment(Y, postId, 3, heldTop);
    await report(X, 'comment', heldTop);
    expect((await app.inject({ method: 'DELETE', url: `/api/comments/${heldTop}`, headers: { authorization: F.header } })).statusCode).toBe(204);
    for (const who of [F, Y, X]) {
      const shown = await rendered(app, who, postId);
      expect((await postView(app, who, postId)).commentCount, who.id).toBe(shown);
      expect(unit(await feedBody(app, who), postId).commentCount, who.id).toBe(shown);
    }
    expect(await rendered(app, X, postId)).toBe(1);
  });

  it('[F3.3-b2 c11] an unreadable post → 404 with no count at all (not 0); no liker list or id anywhere', T, async () => {
    const app = await start();
    const postId = await seedPost(AU, 'friends');
    const res = await getPost(app, X.header, postId);
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toMatch(/likeCount|commentCount|likedByMe/);
    const open = await seedPost(AU);
    const comment = await seedComment(C, open, 1);
    await seedLike(Y, 'post', open);
    await seedLike(Y, 'comment', comment);
    for (const body of [JSON.stringify(await postView(app, X, open)), (await listComments(app, X.header, open)).body, await feedBody(app, X)]) {
      expectNoForbiddenKeys(body);
      expect(body).not.toContain(Y.id);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.3-b2 c12] likedByMe and the ranking', () => {
  it('[F3.3-b2 c12] likedByMe is false for a viewer when only another user liked (RLS, not an app filter), true for the liker, false again after unlike', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const comment = await seedComment(C, postId, 1);
    await seedLike(X, 'post', postId);
    await seedLike(X, 'comment', comment);
    const seenBy = async (who: Member): Promise<unknown[]> => [
      (await postView(app, who, postId)).likedByMe,
      items((await listComments(app, who.header, postId)).body)[0]?.likedByMe,
      unit(await feedBody(app, who), postId).likedByMe,
    ];
    expect(await seenBy(X)).toEqual([true, true, true]);
    expect(await seenBy(Y)).toEqual([false, false, false]);
    expect(await seenBy(AU)).toEqual([false, false, false]);
    expect((await deleteLike(app, X.header, 'post', postId)).statusCode).toBe(204);
    expect((await postView(app, X, postId)).likedByMe).toBe(false);
    expect((await putLike(app, Y.header, 'comment', comment)).statusCode).toBe(204);
    expect(items((await listComments(app, Y.header, postId)).body)[0]?.likedByMe).toBe(true);
    expect(items((await listComments(app, X.header, postId)).body)[0]?.likedByMe).toBe(true);
  });

  it('[F3.3-b2 c12] a feed page adds only likeCount, commentCount and likedByMe: two viewers with different likes see the same ids, order, cursors and counts', T, async () => {
    const app = await start();
    const ids: string[] = [];
    for (let h = 1; h <= 22; h += 1) ids.push(await seedPost(AU, 'everyone', { ago: h }));
    for (const liked of [ids[0], ids[5], ids[9]]) await seedLike(X, 'post', liked ?? '');
    const strip = (body: string): unknown => ({ ...toRecord(JSON.parse(body)), items: items(body).map((i) => Object.fromEntries(Object.entries(i).filter(([k]) => k !== 'likedByMe'))) });
    const pageX = await feedBody(app, X, topCursor());
    const pageY = await feedBody(app, Y, topCursor());
    expect(strip(pageX)).toEqual(strip(pageY));
    expect(items(pageX).filter((i) => i.likedByMe === true).map((i) => i.id).sort()).toEqual([ids[0], ids[5], ids[9]].sort());
    expect(items(pageY).some((i) => i.likedByMe === true)).toBe(false);
    const next = toRecord(JSON.parse(pageX)).nextCursor;
    expect(typeof next).toBe('string');
    expect(strip(await feedBody(app, X, String(next)))).toEqual(strip(await feedBody(app, Y, String(next))));
    for (const i of items(pageX)) expect(Object.keys(i)).toEqual(expect.arrayContaining(['likeCount', 'commentCount', 'likedByMe']));
    expectNoForbiddenKeys(pageX);
  });

  it('[F3.3-b2 c12] the three statements run in one REPEATABLE READ transaction; only the like-state statement names reaction_owners, and it carries no user_id predicate', T, async () => {
    const statements: string[] = [];
    const app = await start(undefined, recording(statements));
    const postId = await seedPost(AU);
    await seedLike(X, 'post', postId);
    expect(unit(await feedBody(app, X), postId).likedByMe).toBe(true);
    const owners = statements.filter((q) => /reaction_owners/i.test(q));
    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatch(/select\s+(?:\w+\.)?target_id\s+from\s+(?:"?nestly"?\.)?"?reaction_owners"?\s+where\s+(?:\w+\.)?target_id\s*=\s*any\s*\(/i);
    expect(owners[0]).not.toMatch(/user_id|auth\.uid|\bjoin\b|count\s*\(|group by/i);
    expect(statements.filter((q) => /post_authors/i.test(q))).toEqual([]);
    expect(statements.some((q) => /isolation level repeatable read/i.test(q)), 'REPEATABLE READ is set for the feed transaction').toBe(true);
    const counts = statements.filter((q) => /likeCount|commentCount/.test(q));
    expect(counts.length).toBeGreaterThan(0);
    for (const q of counts) expect(q).not.toMatch(/reaction_owners|post_authors|liker_status|author_status|\bstatus\b|is_by_|created_at|user_id/i);
  });

  it('[F3.3-b2 c12] on the feed, the post page, the thread and the replies page the transaction runs begin → set transaction isolation level repeatable read → set local role, in that order', T, async () => {
    const postId = await seedPost(AU);
    const top = await seedComment(C, postId, 1);
    await seedComment(F, postId, 2, top);
    const reads: Array<[string, (app: App) => Promise<{ statusCode: number }>]> = [
      ['GET /feed', (a) => a.inject({ method: 'GET', url: feedUrl(), headers: { authorization: X.header } })],
      ['GET /posts/:id', (a) => getPost(a, X.header, postId)],
      ['GET /posts/:id/comments', (a) => listComments(a, X.header, postId)],
      ['GET /comments/:id/replies', (a) => listReplies(a, X.header, top)],
    ];
    for (const [name, run] of reads) {
      const statements: string[] = [];
      const app = await start(undefined, recording(statements));
      expect((await run(app)).statusCode, name).toBe(200);
      const at = (pattern: RegExp): number => statements.findIndex((q) => pattern.test(q));
      const [begin, level, role] = [at(/^\s*begin\b/i), at(/set\s+transaction\s+isolation\s+level\s+repeatable\s+read/i), at(/set\s+local\s+role/i)];
      expect([begin, level, role].every((i) => i >= 0), `${name}: ${JSON.stringify(statements.slice(0, 4))}`).toBe(true);
      expect(begin < level && level < role, `${name}: begin ${begin}, level ${level}, role ${role}`).toBe(true);
      expect(level, `${name}: nothing between begin and the isolation level`).toBe(begin + 1);
    }
  });

  it('[F3.3-b2 c11 c12] the owner row is not readable through any count: Y sees likeCount 1 and likedByMe false for X\'s like, and no response names X', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    await seedLike(X, 'post', postId);
    const view = await postView(app, Y, postId);
    expect([view.likeCount, view.likedByMe]).toEqual([1, false]);
    expect(JSON.stringify(view)).not.toContain(X.id);
  });
});
