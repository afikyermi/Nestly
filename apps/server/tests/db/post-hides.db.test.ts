import type { Writable } from 'node:stream';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serializeFeedCursor } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { inIdentityTransaction } from '../../src/db/identity-transaction.js';
import { readRankedPosts, type RankedPost } from '../../src/repositories/feed-repository.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, toRecord, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, captureLog, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';
import { listComments } from '../helpers/comments-api.js';
import { getPost } from '../helpers/posts-api.js';
import { putLike } from '../helpers/likes-api.js';
import { deleteHide, putHide } from '../helpers/post-hides-api.js';

// I3 F3.9, PUT|DELETE /api/posts/:id/hide against the real database (CI `db` job, as app_server); criteria c1-c7 of .work/hide-post/spec.md (c6 as worded in
// .work/hide-post/algorithm-review.md) and the Gate 1 low "a repeat hide of a now-unreadable post is 204" (.work/_initiatives/I3-rest-gate1.md). The
// refusals' SQLSTATEs are .work/i3-rest-schema/schema.md's; the guard itself is pgTAP's (file 83). Expected values come from those documents only.

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
// The seeded config of I3-algorithm.md v1 (as feed.db.test.ts): the ranking key is a function of these and the fixture only.
const CONFIG = { wFresh: 1, halfLifeHours: 24, wFriend: 0.5, wQuality: 0.2, qualityCap: 20, wStage: 0, scoredWindowDays: 14, pageSize: 50 } as const;

interface Member { id: string; header: string }
const NAMES = ['Hana Hider', 'Ben Beholder', 'Adi Author', 'Cora Commenter', 'Fiona Friend', 'Xavi Stranger', 'Yoni Other', 'Ofer Other'];
let A: Member, B: Member, AU: Member, C: Member, F: Member, X: Member, Y: Member, O: Member;
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
const hideRows = (): Promise<number> => text(side.unsafe('select tests.fx_ph_count() as v')).then(Number);
async function inTx(work: (tx: postgres.TransactionSql) => Promise<void>): Promise<void> {
  await side.begin(async (tx) => {
    await tx`select 1`;
    await work(tx);
  });
}
async function seedPost(by: Member, aud: 'everyone' | 'friends' = 'everyone', extra: { ago?: number; shared?: string; anon?: boolean } = {}): Promise<string> {
  let id = '';
  await inTx(async (tx) => {
    id = await text(tx`select tests.fx_po_add(${by.id}::uuid, ${aud}, ${extra.anon ?? false}, 'active', 'post body', null, ${extra.shared ?? null}::uuid)::text as v`);
    if (extra.ago !== undefined) await tx`select tests.fx_fv_at('post', ${id}::uuid, ${iso(-extra.ago * HOUR)}::text::timestamptz)`;
  });
  return id;
}
const seedComment = (by: Member, postId: string, ago: number): Promise<void> =>
  inTx(async (tx) => {
    const id = await text(tx`select tests.fx_cm_add(${by.id}::uuid, ${postId}::uuid, 'comment body', null)::text as v`);
    await tx`select tests.fx_fv_at('comment', ${id}::uuid, ${iso(-ago * HOUR)}::text::timestamptz)`;
  });
const seedLike = (by: Member, postId: string, ago: number): Promise<void> =>
  inTx(async (tx) => {
    const id = await text(tx`select tests.fx_rx_add(${by.id}::uuid, ${postId}::uuid, null)::text as v`);
    await tx`select tests.fx_fv_at('reaction', ${id}::uuid, ${iso(-ago * HOUR)}::text::timestamptz)`;
  });
const report = (by: Member, target: string): Promise<void> => inTx(async (tx) => void (await tx`select tests.fx_rp_add(${by.id}::uuid, 'post', ${target}::uuid, 'spam', null)`));
const befriend = (req: Member, addr: Member): Promise<void> => inTx(async (tx) => void (await tx`select tests.fx_fr_add(${req.id}::uuid, ${addr.id}::uuid, 'accepted', false)`));
const setStatus = (id: string, status: string): Promise<unknown> => side`select tests.set_status(${id}::uuid, ${status})`;
const postStatus = (id: string, status: string): Promise<unknown> => side`select tests.fx_po_status(${id}::uuid, ${status})`;
const seedHide = async (app: App, by: Member, postId: string): Promise<void> => {
  const res = await putHide(app, by.header, postId);
  expect(res.statusCode, `seed hide: ${res.body}`).toBe(204);
};

type Rec = Record<string, unknown>;
const items = (body: string): Rec[] => {
  const list = toRecord(JSON.parse(body)).items;
  if (!Array.isArray(list)) throw new Error('items is not an array');
  return list.map((i) => toRecord(i));
};
const feedBody = async (app: App, who: Member, cursor?: string): Promise<string> => {
  const res = await app.inject({ method: 'GET', url: cursor === undefined ? '/api/feed' : `/api/feed?cursor=${encodeURIComponent(cursor)}`, headers: { authorization: who.header } });
  expect(res.statusCode, res.body).toBe(200);
  return res.body;
};
const feedIds = async (app: App, who: Member, cursor?: string): Promise<string[]> => items(await feedBody(app, who, cursor)).map((i) => String(i.id));
const postView = async (app: App, who: Member, id: string): Promise<Rec> => {
  const res = await getPost(app, who.header, id);
  expect(res.statusCode, res.body).toBe(200);
  const out = toRecord(JSON.parse(res.body));
  return 'post' in out ? toRecord(out.post) : out;
};
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

/** The ranking statement's rows for `who` at the fixed asOf, through the identity transaction (as the feed service runs it). */
async function ranking(who: Member): Promise<Map<string, { tier: number; score: number }>> {
  const database = createDatabase(url());
  try {
    const rows: RankedPost[] = await inIdentityTransaction(database, { userId: who.id }, (tx) => readRankedPosts(tx, { asOf: ASOF, config: CONFIG, stages: [], after: null }));
    return new Map(rows.map((r) => [r.id, { tier: r.tier, score: r.score }]));
  } finally {
    await database.close();
  }
}

beforeAll(async () => {
  key = await newKey('post-hides-db-key');
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
  [A = none, B = none, AU = none, C = none, F = none, X = none, Y = none, O = none] = made;
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

const GONE = { error: 'post_unavailable' };

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.9 c1] PUT /posts/:id/hide', () => {
  it('[F3.9 c1] 204 with no body; a repeat is 204; one row; then in a second session the feed omits the post and the post page, its comments and likes are 404 post_unavailable', T, async () => {
    const app = await start();
    const id = await seedPost(AU);
    const other = await seedPost(C);
    const first = await putHide(app, A.header, id);
    expect(first.statusCode, first.body).toBe(204);
    expect(first.body).toBe('');
    expect((await putHide(app, A.header, id)).statusCode).toBe(204);
    expect(await hideRows()).toBe(1);

    const second = await start(); // a new app and a new token: another session, nothing carried over
    const again = await bearerFor(A.id);
    const fresh: Member = { id: A.id, header: again };
    const ids = await feedIds(second, fresh);
    expect(ids).toContain(other);
    expect(ids).not.toContain(id);
    const unknown = await getPost(second, again, NOBODY);
    expect(unknown.statusCode).toBe(404);
    // GET /posts/:id is F3.1's route (its 404 body is its own, 'not_found'): the spec's "post_unavailable" is F3.3 c4's, for comments and likes. Here: 404, and
    // the same body as for an id that never existed (no oracle). Wording returned to SPEC.
    const page = await getPost(second, again, id);
    expect(page.statusCode).toBe(404);
    expect(page.body).toBe(unknown.body);
    const thread = await listComments(second, again, id);
    expect([thread.statusCode, JSON.parse(thread.body)]).toEqual([404, GONE]);
    // The like route answers 404 too, with its own body ('not_found', as for GET /posts/:id): the same body as for an id that never existed.
    const like = await putLike(second, again, 'post', id);
    expect(like.statusCode).toBe(404);
    expect(like.body).toBe((await putLike(second, again, 'post', NOBODY)).body);
  });

  it("[F3.9 c1] a friend's friends-only post may be hidden; the hide is kept and a repeat after the friendship ended is still 204 (c1 wins over the post being unreadable now)", T, async () => {
    const app = await start();
    const id = await seedPost(F, 'friends');
    await befriend(A, F);
    expect((await putHide(app, A.header, id)).statusCode).toBe(204);
    await side`select tests.fx_fr_purge(${A.id}::uuid)`;
    const repeat = await putHide(app, A.header, id);
    expect([repeat.statusCode, repeat.body]).toEqual([204, '']);
    expect(await hideRows()).toBe(1);
  });

  it('[F3.9 c1] six simultaneous PUTs by one user leave exactly one row (503 is allowed, a duplicate or a 5xx other than 503 is not)', T, async () => {
    const app = await start();
    const id = await seedPost(AU);
    const results = await Promise.all(Array.from({ length: 6 }, () => putHide(app, A.header, id)));
    for (const r of results) expect([204, 503], r.body).toContain(r.statusCode);
    expect(await hideRows()).toBeLessThanOrEqual(1);
    expect((await putHide(app, A.header, id)).statusCode).toBe(204);
    expect(await hideRows()).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.9 c2] a post the caller cannot read, or a bad request', () => {
  it('[F3.9 c2] every unreadable post answers the same 404 post_unavailable as an unknown uuid, for PUT, with 0 rows (no existence oracle)', T, async () => {
    const app = await start();
    const friendsOnly = await seedPost(AU, 'friends');
    const removed = await seedPost(AU);
    const hiddenStatus = await seedPost(AU);
    const held = await seedPost(AU);
    const deleted = await seedPost(AU);
    const suspendedAuthor = await seedPost(O);
    const reported = await seedPost(AU);
    await postStatus(removed, 'removed');
    await postStatus(hiddenStatus, 'hidden');
    await report(Y, held);
    expect((await app.inject({ method: 'DELETE', url: `/api/posts/${held}`, headers: { authorization: AU.header } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/api/posts/${deleted}`, headers: { authorization: AU.header } })).statusCode).toBe(204);
    await report(A, reported);
    await setStatus(O.id, 'suspended');
    const reference = await putHide(app, A.header, NOBODY);
    expect([reference.statusCode, JSON.parse(reference.body)]).toEqual([404, GONE]);
    for (const [label, id] of Object.entries({ friendsOnly, removed, hiddenStatus, held, deleted, suspendedAuthor, reported })) {
      const res = await putHide(app, A.header, id);
      expect(res.statusCode, `${label}: ${res.body}`).toBe(404);
      expect(res.body, label).toBe(reference.body);
    }
    expect(await hideRows()).toBe(0);
  });

  it('[F3.9 c2] a non-uuid id and any body → 400 invalid, no row', T, async () => {
    const app = await start();
    const id = await seedPost(AU);
    for (const bad of ['not-a-uuid', '123', `${id}x`, `${id}%27%3B--`]) {
      for (const send of [putHide, deleteHide]) {
        const res = await send(app, A.header, bad);
        expect([res.statusCode, JSON.parse(res.body)], bad).toEqual([400, { error: 'invalid' }]);
      }
    }
    for (const method of ['PUT', 'DELETE'] as const) {
      const res = await app.inject({ method, url: `/api/posts/${id}/hide`, headers: { authorization: A.header, 'content-type': 'application/json' }, payload: JSON.stringify({ userId: B.id }) });
      expect(res.statusCode, method).toBe(400);
    }
    expect(await hideRows()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.9 c3] the caller\'s own post', () => {
  it.each([['named', false], ['anonymous', true]] as const)('[F3.9 c3] an own %s post → 409 own_post, 0 rows, no author id in the response', T, async (_label, anon) => {
    const app = await start();
    const id = await seedPost(A, 'everyone', { anon });
    const res = await putHide(app, A.header, id);
    expect([res.statusCode, JSON.parse(res.body)]).toEqual([409, { error: 'own_post' }]);
    expect(res.body).not.toContain(A.id);
    expect(await hideRows()).toBe(0);
    // the post is still the author's, in the feed and on its page
    expect(await feedIds(app, A)).toContain(id);
    expect((await getPost(app, A.header, id)).statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.9 c4] DELETE /posts/:id/hide', () => {
  it('[F3.9 c4] 204; the caller\'s row is gone; the post is back in the feed and on its page; a repeat is 204', T, async () => {
    const app = await start();
    const id = await seedPost(AU);
    await putHide(app, A.header, id);
    expect(await feedIds(app, A)).not.toContain(id);
    const res = await deleteHide(app, A.header, id);
    expect([res.statusCode, res.body]).toEqual([204, '']);
    expect(await hideRows()).toBe(0);
    expect(await feedIds(app, A)).toContain(id);
    expect((await getPost(app, A.header, id)).statusCode).toBe(200);
    expect((await deleteHide(app, A.header, id)).statusCode).toBe(204);
  });

  it('[F3.9 c4] no row, a post never hidden, an unknown uuid and an unreadable post are all 204 (no oracle), changing nothing', T, async () => {
    const app = await start();
    const mine = await seedPost(AU);
    const friendsOnly = await seedPost(AU, 'friends');
    const removed = await seedPost(AU);
    await postStatus(removed, 'removed');
    await seedHide(app, B, mine);
    for (const id of [mine, friendsOnly, removed, NOBODY]) {
      const res = await deleteHide(app, A.header, id);
      expect([res.statusCode, res.body], id).toEqual([204, '']);
    }
    expect(await hideRows(), "B's row is untouched").toBe(1);
  });

  it("[F3.9 c4] user B's DELETE never removes user A's row: A still does not see the post", T, async () => {
    const app = await start();
    const id = await seedPost(AU);
    await putHide(app, A.header, id);
    expect((await deleteHide(app, B.header, id)).statusCode).toBe(204);
    expect(await hideRows()).toBe(1);
    expect(await feedIds(app, A)).not.toContain(id);
    expect((await getPost(app, A.header, id)).statusCode).toBe(404);
  });

  it('[F3.9 c4] after the friendship ended, undoing a hide of a friends-only post still removes the caller\'s row', T, async () => {
    const app = await start();
    const id = await seedPost(F, 'friends');
    await befriend(A, F);
    await putHide(app, A.header, id);
    await side`select tests.fx_fr_purge(${A.id}::uuid)`;
    expect((await deleteHide(app, A.header, id)).statusCode).toBe(204);
    expect(await hideRows()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.9 c5] for oneself only', () => {
  it('[F3.9 c5] another viewer and the author still see the post, in the feed and on its page, with likeCount and commentCount unchanged; no response mentions a hide', T, async () => {
    const app = await start();
    const id = await seedPost(AU, 'everyone', { ago: 2 });
    await seedLike(B, id, 1);
    await seedLike(C, id, 1);
    await seedComment(C, id, 1);
    const before = await Promise.all([B, AU].map((m) => postView(app, m, id)));
    expect(before.map((v) => [v.likeCount, v.commentCount])).toEqual([[2, 1], [2, 1]]);
    const put = await putHide(app, A.header, id);
    expect(put.body).toBe('');
    const after = await Promise.all([B, AU].map((m) => postView(app, m, id)));
    expect(after).toEqual(before);
    for (const who of [B, AU]) {
      const body = await feedBody(app, who);
      const unit = items(body).find((i) => i.id === id);
      expect(unit, `${who.id} still sees it`).toBeDefined();
      expect([unit?.likeCount, unit?.commentCount]).toEqual([2, 1]);
      expect([...keysDeep(JSON.parse(body))].filter((k) => /hid(e|den)/i.test(k)), 'no hide, hide count or hider in the feed').toEqual([]);
    }
    for (const view of after) expect([...keysDeep(view)].filter((k) => /hid(e|den)/i.test(k))).toEqual([]);
    const del = await deleteHide(app, A.header, id);
    expect(del.body).toBe('');
    expect(Object.keys(put.headers).filter((h) => /hid/i.test(h))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.9 c6] a hide is not a ranking signal', () => {
  /** Six named posts by six different authors (no diversity cap binds), friends, comments and likes in the fixture so the key has all its terms. */
  async function fixture(): Promise<{ x: string; rest: string[] }> {
    const x = await seedPost(AU, 'everyone', { ago: 2 });
    const rest = [await seedPost(C, 'everyone', { ago: 3 }), await seedPost(F, 'everyone', { ago: 5 }), await seedPost(Y, 'everyone', { ago: 8 }), await seedPost(O, 'everyone', { ago: 30 }), await seedPost(X, 'everyone', { ago: 400 })];
    await befriend(A, F);
    await befriend(B, C);
    await seedLike(B, x, 1);
    await seedLike(C, rest[0] ?? '', 1);
    await seedComment(AU, rest[1] ?? '', 1);
    await seedComment(Y, x, 1);
    return { x, rest };
  }
  const listOf = async (app: App, who: Member): Promise<string[]> => feedIds(app, who, topCursor());

  it('[F3.9 c6 i] the (tier, score) of every unit other than X is identical before and after A hides X, for A and for B', T, async () => {
    const app = await start();
    const { x, rest } = await fixture();
    const beforeA = await ranking(A);
    const beforeB = await ranking(B);
    expect([...beforeA.keys()].sort()).toEqual([x, ...rest].sort());
    expect((await putHide(app, A.header, x)).statusCode).toBe(204);
    const afterA = await ranking(A);
    const afterB = await ranking(B);
    expect(afterA.has(x), 'X is out of A\'s ranking (RLS)').toBe(false);
    for (const id of rest) expect(afterA.get(id), `A ${id}`).toEqual(beforeA.get(id));
    expect(afterB, 'B\'s whole ranking, X included, is untouched').toEqual(beforeB);
  });

  it('[F3.9 c6 ii] with no cap binding and no share of X, A\'s list is the before-list minus X in the same order, and B\'s list is identical', T, async () => {
    const app = await start();
    const { x } = await fixture();
    const beforeA = await listOf(app, A);
    const beforeB = await listOf(app, B);
    expect(beforeA.length).toBe(6);
    expect(beforeA).toContain(x);
    await putHide(app, A.header, x);
    expect(await listOf(app, A)).toEqual(beforeA.filter((id) => id !== x));
    expect(await listOf(app, B)).toEqual(beforeB);
  });

  it('[F3.9 c6 iii] with a share S of X on the page, S is still listed for A after the hide (not displaced by dedup); every other unit keeps its key; B\'s list is identical', T, async () => {
    const app = await start();
    const { x, rest } = await fixture();
    const s = await seedPost(Y, 'everyone', { ago: 1, shared: x });
    const beforeKeysA = await ranking(A);
    const beforeB = await listOf(app, B);
    expect((await putHide(app, A.header, x)).statusCode).toBe(204);
    const after = await listOf(app, A);
    expect(after, 'S is on A\'s page').toContain(s);
    expect(after).not.toContain(x);
    for (const id of rest) expect(after, id).toContain(id);
    const afterKeys = await ranking(A);
    for (const id of [s, ...rest]) expect(afterKeys.get(id), id).toEqual(beforeKeysA.get(id));
    expect(await listOf(app, B)).toEqual(beforeB);
    // hiding the share hides that share only: the original is still eligible
    const hideShare = await putHide(app, B.header, s);
    expect(hideShare.statusCode).toBe(204);
    expect(await listOf(app, B)).not.toContain(s);
    expect(await listOf(app, B)).toContain(x);
  });

  it('[F3.9 c6] no recommendation-feedback table exists (I10 group_recommendations is a suggestion of a Group to a Friend, not hide feedback), and no log line of a hide, a failed hide or an undo holds a post or user id', T, async () => {
    const [{ n } = { n: -1 }] = await side`select count(*)::int as n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'nestly' and c.relname ~* '(recommend|feedback)' and c.relname !~ '^group_recommendations'`;
    expect(n).toBe(0);
    const log = captureLog();
    const app = await start(log.stream);
    const id = await seedPost(AU);
    await putHide(app, A.header, id);
    await putHide(app, A.header, NOBODY);
    const own = await seedPost(A);
    await putHide(app, A.header, own);
    await deleteHide(app, A.header, id);
    for (const secret of [id, own, NOBODY, A.id, AU.id]) expect(log.text()).not.toContain(secret);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.9 c7] who may hide', () => {
  it('[F3.9 c7] no token → 401; a Professional and a suspended account → 403 not_allowed for PUT and DELETE; no row written or removed', T, async () => {
    const app = await start();
    const id = await seedPost(AU);
    await seedHide(app, B, id);
    for (const send of [putHide, deleteHide]) {
      expect((await send(app, null, id)).statusCode).toBe(401);
      for (const header of [hP, hS]) {
        const res = await send(app, header, id);
        expect([res.statusCode, JSON.parse(res.body)]).toEqual([403, { error: 'not_allowed' }]);
      }
    }
    expect(await hideRows(), "only B's seeded row, nothing written, nothing removed").toBe(1);
  });

  it('[F3.9 c7] an account suspended after hiding cannot undo it: 403, the row stays', T, async () => {
    const app = await start();
    const id = await seedPost(AU);
    await putHide(app, A.header, id);
    await setStatus(A.id, 'suspended');
    const res = await deleteHide(app, A.header, id);
    expect(res.statusCode).toBe(403);
    expect((await putHide(app, A.header, id)).statusCode).toBe(403);
    expect(await hideRows()).toBe(1);
  });
});
