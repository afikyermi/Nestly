import type { Writable } from 'node:stream';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { feedUnit } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, toRecord, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, captureLog, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';
import { addComment, listComments } from '../helpers/comments-api.js';
import { deletePost, getPost, jsonObject, patchPost } from '../helpers/posts-api.js';
import { putHide } from '../helpers/post-hides-api.js';
import { putLike } from '../helpers/likes-api.js';
import { createShare } from '../helpers/shares-api.js';

// I3 F3.5 (POST /api/posts/:id/shares, the share view of GET /api/posts/:id, PATCH/DELETE on a share) and F3.6 c6 (Cache-Control on post reads),
// against the real database (CI `db` job, as app_server). Criteria c3-c8 of .work/share-in-feed/spec.md and c6 of .work/share-link/spec.md.
// The refusals' SQLSTATEs are .work/i3-rest-schema/schema.md's (NS002 -> 403 not_shareable, 42501 -> 403 not_allowed, NS005 -> 400 share_not_editable);
// the DB guard itself is pgTAP's (file 82). Expected values come from those documents only.

const T = { timeout: COLD_START_MS };
const S = '50000000-0000-4000-8000-000000000051'; // suspended fixture account
const P = 'd0000000-0000-4000-8000-0000000000d4'; // Professional fixture account
const NOBODY = '99999999-9999-4999-8999-999999999999';
const NOT_SHAREABLE = { error: 'not_shareable' };

interface Member { id: string; header: string; name: string }
const NAMES = ['Sara Sharer', 'Ben Beholder', 'Cora Cosharer', 'Fiona Friend', 'Xavi Stranger', 'Ofer Other', 'Yoni Reporter', 'Rina Restricted'];
let A: Member, B: Member, C: Member, F: Member, X: Member, O: Member, Y: Member, R: Member;
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
const rows = (): Promise<number> => text(side.unsafe('select tests.fx_po_count() as v')).then(Number);
const stateOf = (id: string): Promise<string> => text(side`select tests.fx_po_state(${id}::uuid) as v`);
async function inTx(work: (tx: postgres.TransactionSql) => Promise<void>): Promise<void> {
  await side.begin(async (tx) => {
    await tx`select 1`;
    await work(tx);
  });
}
async function seedPost(by: Member, aud: 'everyone' | 'friends' = 'everyone', extra: { anon?: boolean; shared?: string; body?: string } = {}): Promise<string> {
  let id = '';
  await inTx(async (tx) => {
    id = await text(tx`select tests.fx_po_add(${by.id}::uuid, ${aud}, ${extra.anon ?? false}, 'active', ${extra.body ?? 'original body'}, null, ${extra.shared ?? null}::uuid)::text as v`);
  });
  return id;
}
const report = (by: Member, target: string): Promise<void> => inTx(async (tx) => void (await tx`select tests.fx_rp_add(${by.id}::uuid, 'post', ${target}::uuid, 'spam', null)`));
const befriend = (req: Member, addr: Member): Promise<void> => inTx(async (tx) => void (await tx`select tests.fx_fr_add(${req.id}::uuid, ${addr.id}::uuid, 'accepted', false)`));
const setStatus = (id: string, status: string): Promise<unknown> => side`select tests.set_status(${id}::uuid, ${status})`;
const postStatus = (id: string, status: string): Promise<unknown> => side`select tests.fx_po_status(${id}::uuid, ${status})`;

type Rec = Record<string, unknown>;
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
/** A share made through the route; the 201's body. */
async function share(app: App, by: Member, target: string, payload: Rec = { audience: 'everyone', text: 'שווה לקרוא' }): Promise<Rec> {
  const res = await createShare(app, by.header, target, payload);
  expect(res.statusCode, res.body).toBe(201);
  return jsonObject(res.body);
}
const view = async (app: App, who: Member, id: string): Promise<Rec> => {
  const res = await getPost(app, who.header, id);
  expect(res.statusCode, res.body).toBe(200);
  return jsonObject(res.body);
};
/** What a refusal looks like from outside: status, body and every header but the per-request ones. */
const signature = (res: { statusCode: number; body: string; headers: Record<string, unknown> }): string => {
  const headers = Object.entries(res.headers)
    .filter(([k]) => !/^(date|x-request-id|request-id|content-length)$/i.test(k))
    .map(([k, v]) => `${k.toLowerCase()}=${String(v)}`)
    .sort();
  return JSON.stringify([res.statusCode, res.body, headers]);
};

beforeAll(async () => {
  key = await newKey('shares-db-key');
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
  [A = none, B = none, C = none, F = none, X = none, O = none, Y = none, R = none] = made;
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
describe('[F3.5 c3][FR-FEED-006][BR-065] POST /posts/:id/shares', () => {
  it('[F3.5 c3] A shares B\'s everyone post → 201 share view; the stored row is A\'s share of exactly that post and holds nothing of B\'s', T, async () => {
    const app = await start();
    const o = await seedPost(B, 'everyone', { body: 'סוד של בן 123' });
    const before = await stateOf(o);
    const res = await createShare(app, A.header, o, { text: '  תודה רבה  ', audience: 'friends' });
    expect(res.statusCode, res.body).toBe(201);
    const out = jsonObject(res.body);
    const id = String(out.id);
    expect(out.kind).toBe('share');
    expect(out.sharerText).toBe('תודה רבה');
    expect(out.audience).toBe('friends');
    expect(out.isMine).toBe(true);
    expect(toRecord(out.author).name).toBe(A.name);
    const orig = toRecord(out.original);
    expect(orig.available).toBe(true);
    expect(orig.id).toBe(o);
    expect(orig.body).toBe('סוד של בן 123');
    expect(toRecord(orig.author).name).toBe(B.name);

    // the stored row: author A, is_share, shared_post_id = o, body = the trimmed text, audience as sent, no tag, not anonymous
    const state = await stateOf(id);
    expect(state).toBe(`status=active aud=friends anon=f author=${A.id} tag=null share=t:${o} body=תודה רבה`);
    expect(state).not.toContain('סוד של בן');
    expect(await stateOf(o), "B's row is unchanged").toBe(before);
    expect(await rows()).toBe(2);
    // the 201 is the share view a later read gives the sharer (c7)
    expect(await view(app, A, id)).toEqual(out);
  });

  it('[F3.5 c3] no text → body null; audience as sent (everyone); the response has no sharerText content and the row copies nothing', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    for (const payload of [{ audience: 'everyone' }, { audience: 'everyone', text: '' }, { audience: 'everyone', text: '   ' }]) {
      const out = await share(app, A, o, payload);
      expect(out.sharerText).toBeNull();
      expect(await stateOf(String(out.id))).toBe(`status=active aud=everyone anon=f author=${A.id} tag=null share=t:${o} body=null`);
    }
  });

  it('[F3.5 c3] the share row never carries the original\'s stage tag', T, async () => {
    const app = await start();
    let o = '';
    await inTx(async (tx) => void (o = await text(tx`select tests.fx_po_add(${B.id}::uuid, 'everyone', false, 'active', 'tagged', 'pregnant', null)::text as v`)));
    const out = await share(app, A, o);
    expect(out.stageTag).toBeNull();
    expect(await stateOf(String(out.id))).toContain('tag=null');
  });

  it('[F3.5 c3] the response names no user id of A or B', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    const res = await createShare(app, A.header, o, { audience: 'everyone' });
    expect(res.body).not.toContain(A.id);
    expect(res.body).not.toContain(B.id);
    const keys = keysDeep(JSON.parse(res.body));
    for (const k of ['authorId', 'author_id', 'userId', 'sharedPostId', 'shared_post_id']) expect(keys.has(k), k).toBe(false);
  });

  it('[F3.5 c3][VAL-038] boundaries: 2,000 code points → 201; 2,001 → body_too_long and no row; hostile text is stored as text', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    expect((await createShare(app, A.header, o, { audience: 'everyone', text: '😀'.repeat(2000) })).statusCode).toBe(201);
    const before = await rows();
    const over = await createShare(app, A.header, o, { audience: 'everyone', text: '😀'.repeat(2001) });
    expect(over.statusCode).toBe(422);
    expect(JSON.parse(over.body)).toEqual({ error: 'body_too_long' });
    expect(await rows()).toBe(before);
    const hostile = `'); drop table nestly.posts;-- <script>alert(1)</script> \${x} {{y}}`;
    const out = await share(app, A, o, { audience: 'everyone', text: hostile });
    expect(out.sharerText).toBe(hostile);
    expect(await stateOf(String(out.id))).toContain(`body=${hostile}`);
  });

  it('[F3.5 c3][VAL-038] a bad body → 400 invalid and no row: unknown or forbidden keys, missing or wrong audience, wrong text type, NUL, not JSON', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    const before = await rows();
    const bad: unknown[] = [
      {},
      { text: 'x' },
      { audience: 'private' },
      { audience: null },
      { audience: 'everyone', text: 5 },
      { audience: 'everyone', text: 'a\u0000b' },
      { audience: 'everyone', sharedPostId: NOBODY },
      { audience: 'everyone', authorId: B.id },
      { audience: 'everyone', isAnonymous: true },
      { audience: 'everyone', stageTag: 'pregnant' },
      { audience: 'everyone', status: 'removed' },
      { audience: 'everyone', id: NOBODY },
      '{"audience":',
      'null',
      '[]',
    ];
    for (const payload of bad) {
      const res = await createShare(app, A.header, o, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(await rows()).toBe(before);
  });

  it('[F3.5 c3] six simultaneous shares by one user: each answer is 201 or 503 (never a 5xx other than 503), and the rows are exactly the 201s', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    const before = await rows();
    const results = await Promise.all(Array.from({ length: 6 }, () => createShare(app, A.header, o, { audience: 'everyone', text: 'פעמיים' })));
    for (const r of results) expect([201, 503], r.body).toContain(r.statusCode);
    const made = results.filter((r) => r.statusCode === 201).length;
    expect(await rows()).toBe(before + made);
    // sharing the same post twice is allowed (spec Open questions): a later share still works
    expect((await createShare(app, A.header, o, { audience: 'everyone' })).statusCode).toBe(201);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.5 c4][BR-066] sharing a share shares the original', () => {
  it('[F3.5 c4] :id is C\'s share S of O → A\'s row points at O; the 201 and every later read name only O\'s author and hold neither S\'s id nor C\'s name', T, async () => {
    const app = await start();
    const o = await seedPost(B, 'everyone', { body: 'המקור' });
    const s = String((await share(app, C, o, { audience: 'everyone', text: 'שיתוף של קורה' })).id);
    const res = await createShare(app, A.header, s, { audience: 'everyone', text: 'שלי' });
    expect(res.statusCode, res.body).toBe(201);
    const out = jsonObject(res.body);
    const id = String(out.id);
    expect(toRecord(out.original).id).toBe(o);
    expect(await stateOf(id)).toContain(`share=t:${o}`);
    for (const body of [res.body, JSON.stringify(await view(app, A, id)), JSON.stringify(await view(app, X, id))]) {
      expect(body).not.toContain(s);
      expect(body).not.toContain(C.name);
      expect(body).not.toContain('שיתוף של קורה');
      expect(body).toContain(B.name);
    }
  });

  it('[F3.5 c4] a share whose original is deleted or unreadable → refused exactly as c5 (403 not_shareable), no row', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    const s = String((await share(app, C, o)).id);
    const before = await rows();
    await postStatus(o, 'removed');
    const res = await createShare(app, A.header, s, { audience: 'everyone' });
    expect([res.statusCode, JSON.parse(res.body)]).toEqual([403, NOT_SHAREABLE]);
    expect(await rows()).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.5 c5][ERR-034][AC-080][BR-064] one identical refusal', () => {
  it('[F3.5 c5] every unshareable original gives the same 403 {"error":"not_shareable"} as an unknown uuid — same body and headers — and writes 0 rows', T, async () => {
    const log = captureLog();
    const app = await start(log.stream);
    const friendsOnly = await seedPost(B, 'friends');
    const friendsOnlyFriendCaller = await seedPost(F, 'friends');
    await befriend(A, F);
    const anon = await seedPost(B, 'everyone', { anon: true });
    const own = await seedPost(A);
    const ownShare = await seedPost(C, 'everyone', { shared: own });
    const deleted = await seedPost(B);
    const held = await seedPost(B);
    const hidden = await seedPost(B);
    const removed = await seedPost(B);
    const suspendedAuthor = await seedPost(O);
    const bannedAuthor = await seedPost(Y);
    const reportedByCaller = await seedPost(B);
    await report(Y, held);
    expect((await app.inject({ method: 'DELETE', url: `/api/posts/${held}`, headers: { authorization: B.header } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/api/posts/${deleted}`, headers: { authorization: B.header } })).statusCode).toBe(204);
    await postStatus(hidden, 'hidden');
    await postStatus(removed, 'removed');
    await report(A, reportedByCaller);
    await setStatus(O.id, 'suspended');
    await setStatus(Y.id, 'banned');
    const before = await rows();

    const reference = await createShare(app, A.header, NOBODY, { audience: 'everyone' });
    expect([reference.statusCode, JSON.parse(reference.body)]).toEqual([403, NOT_SHAREABLE]);
    const fixtures = { friendsOnly, friendsOnlyFriendCaller, anon, own, ownShare, deleted, held, hidden, removed, suspendedAuthor, bannedAuthor, reportedByCaller };
    for (const [label, id] of Object.entries(fixtures)) {
      const res = await createShare(app, A.header, id, { audience: 'everyone', text: 'x' });
      expect(res.statusCode, `${label}: ${res.body}`).toBe(403);
      expect(signature(res), label).toBe(signature(reference));
    }
    expect(await rows()).toBe(before);
    const logged = log.text().toLowerCase();
    for (const word of ['ns002', 'friends-only', 'own post', 'anonymous', 'suspended', 'banned', 'removed', 'held']) expect(logged, word).not.toContain(word);
  });

  it('[F3.5 c5] a post of a Friend is shareable only when everyone: A is B\'s Friend and still cannot share B\'s friends-only post', T, async () => {
    const app = await start();
    await befriend(A, B);
    const f = await seedPost(B, 'friends');
    const res = await createShare(app, A.header, f, { audience: 'everyone' });
    expect([res.statusCode, JSON.parse(res.body)]).toEqual([403, NOT_SHAREABLE]);
    expect(await rows()).toBe(1);
  });

  it('[F3.5 c5][Afik 18.10] the original\'s author has a restricted profile → 201 (Restricted has no relation to sharing)', T, async () => {
    const app = await start();
    const o = await seedPost(R);
    expect((await createShare(app, A.header, o, { audience: 'everyone' })).statusCode).toBe(201);
  });

  it('[F3.5 c5] a malformed id → 400, never 403 or 5xx, and no row', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    const before = await rows();
    for (const bad of ['not-a-uuid', '123', `${o}x`, `${o}%27%3B--`, '00000000-0000-0000-0000-00000000000g']) {
      const res = await createShare(app, A.header, bad, { audience: 'everyone' });
      expect(res.statusCode, bad).toBe(400);
    }
    expect(await rows()).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.5 c6][FR-AUTH][ERR-004] who may share', () => {
  it('[F3.5 c6] no token, a garbage token → 401; 0 rows', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    const before = await rows();
    expect((await createShare(app, null, o, { audience: 'everyone' })).statusCode).toBe(401);
    expect((await createShare(app, 'Bearer not.a.jwt', o, { audience: 'everyone' })).statusCode).toBe(401);
    expect(await rows()).toBe(before);
  });

  it('[F3.5 c6] a Professional and a suspended Regular → 403 not_allowed (not not_shareable), on a shareable post and on an unknown uuid; 0 rows', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    const before = await rows();
    for (const [label, header] of [['professional', hP], ['suspended', hS]] as const) {
      for (const target of [o, NOBODY]) {
        const res = await createShare(app, header, target, { audience: 'everyone' });
        expect([res.statusCode, JSON.parse(res.body)], `${label} → ${target}`).toEqual([403, { error: 'not_allowed' }]);
      }
    }
    expect(await rows()).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.5 c7][AC-079][AC-081][ERR-033] GET /posts/:id on a share', () => {
  it('[F3.5 c7] a share the viewer can read → kind share, sharerText, the sharer as author, the original by the feed unit\'s Zod (with original.isMine); a plain post stays kind post', T, async () => {
    const app = await start();
    const o = await seedPost(B, 'everyone', { body: 'גוף המקור' });
    const s = String((await share(app, A, o, { audience: 'everyone', text: 'תודה' })).id);
    for (const [who, mine, origMine] of [[A, true, false], [X, false, false], [B, false, true]] as const) {
      const v = await view(app, who, s);
      expect(v.kind, who.name).toBe('share');
      expect(v.sharerText).toBe('תודה');
      expect(v.isMine).toBe(mine);
      expect(toRecord(v.author).name).toBe(A.name);
      const orig = toRecord(v.original);
      expect(orig.isMine, who.name).toBe(origMine);
      // the original must satisfy the feed unit's original schema (strict: no extra key, no author id)
      const parsed = feedUnit.safeParse({
        id: s, kind: 'share', source: 'organic', audience: 'everyone', stageTag: null, createdAt: v.createdAt, likeCount: 0, commentCount: 0, likedByMe: false,
        body: null, sharerText: 'תודה', isMine: mine, isAnonymous: false, author: { name: A.name }, original: orig,
      });
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
    const plain = await view(app, X, o);
    expect(plain.kind).toBe('post');
    expect(plain.body).toBe('גוף המקור');
    expect('original' in plain).toBe(false);
    expect('sharerText' in plain).toBe(false);
  });

  const CHANGES: Array<[string, (o: string, app: App) => Promise<void>]> = [
    ['deleted', async (o, app) => void (await deletePost(app, B.header, o))],
    ['held', async (o, app) => {
      await report(Y, o);
      await deletePost(app, B.header, o);
    }],
    ['its author suspended', async () => void (await setStatus(B.id, 'suspended'))],
    ['edited to friends (viewer not a Friend)', async (o, app) => void (await patchPost(app, B.header, o, { audience: 'friends' }))],
    ['hidden by the viewer', async (o, app) => void (await putHide(app, X.header, o))],
  ];
  it.each(CHANGES)('[F3.5 c7][AC-081] original %s → {"available":false} and no original content anywhere in the response', T, async (_label, change) => {
    const app = await start();
    const o = await seedPost(B, 'everyone', { body: 'תוכן-סודי-של-המקור' });
    const s = String((await share(app, A, o, { audience: 'everyone', text: 'תודה' })).id);
    await change(o, app);
    const res = await getPost(app, X.header, s);
    expect(res.statusCode, res.body).toBe(200);
    const v = jsonObject(res.body);
    expect(v.original).toEqual({ available: false });
    expect(res.body).not.toContain('תוכן-סודי');
    expect(res.body).not.toContain(B.name);
    expect(res.body).not.toContain(o);
  });

  it('[F3.5 c7] after the original author\'s reactivation the original returns (loaded per viewer at every read)', T, async () => {
    const app = await start();
    const o = await seedPost(B, 'everyone', { body: 'חוזר' });
    const s = String((await share(app, A, o)).id);
    await setStatus(B.id, 'suspended');
    expect((await view(app, X, s)).original).toEqual({ available: false });
    await setStatus(B.id, 'active');
    const back = toRecord((await view(app, X, s)).original);
    expect([back.available, back.id, back.body]).toEqual([true, o, 'חוזר']);
  });

  it('[F3.5 c7] an unreadable share (a friends-only share, viewer not a Friend) → 404 identical to an unknown id', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    const s = String((await share(app, A, o, { audience: 'friends' })).id);
    const unknown = await getPost(app, X.header, NOBODY);
    const res = await getPost(app, X.header, s);
    expect(res.statusCode).toBe(404);
    expect(signature(res)).toBe(signature(unknown));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.5 c8] share lifecycle', () => {
  it('[F3.5 c8] the sharer deletes → 204, the share is gone; the original and another sharer\'s share are unchanged', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    const mine = String((await share(app, A, o, { audience: 'everyone', text: 'שלי' })).id);
    const others = String((await share(app, C, o, { audience: 'everyone', text: 'של קורה' })).id);
    const [oBefore, othersBefore] = [await stateOf(o), await stateOf(others)];
    const res = await deletePost(app, A.header, mine);
    expect([res.statusCode, res.body]).toEqual([204, '']);
    expect((await getPost(app, A.header, mine)).statusCode).toBe(404);
    expect(await stateOf(o)).toBe(oBefore);
    expect(await stateOf(others)).toBe(othersBefore);
    expect((await getPost(app, X.header, others)).statusCode).toBe(200);
  });

  it('[F3.5 c8] the original\'s author deleting someone\'s share → 404 and the share is unchanged', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    const s = String((await share(app, A, o)).id);
    const before = await stateOf(s);
    expect((await deletePost(app, B.header, s)).statusCode).toBe(404);
    expect(await stateOf(s)).toBe(before);
    expect((await getPost(app, A.header, s)).statusCode).toBe(200);
  });

  it('[F3.5 c8][F3.3] the original deleted → the share is still 200 with available:false, and its own comments and likes are kept', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    const s = String((await share(app, A, o, { audience: 'everyone', text: 'נשאר' })).id);
    expect((await addComment(app, C.header, s, { body: 'תגובה על השיתוף' })).statusCode).toBe(201);
    expect((await putLike(app, C.header, 'post', s)).statusCode).toBe(204);
    expect((await deletePost(app, B.header, o)).statusCode).toBe(204);
    const v = await view(app, X, s);
    expect(v.original).toEqual({ available: false });
    expect(v.commentCount).toBe(1);
    expect(v.likeCount).toBe(1);
    const thread = toRecord(JSON.parse((await listComments(app, X.header, s)).body)).items;
    expect(Array.isArray(thread) && thread.length).toBe(1);
  });

  it('[F3.5 c8] PATCH on a share → 400 share_not_editable for every field, and the row is unchanged; the sharer\'s DELETE still works afterwards', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    const s = String((await share(app, A, o, { audience: 'everyone', text: 'לא לשינוי' })).id);
    const before = await stateOf(s);
    for (const patch of [{ body: 'new' }, { audience: 'friends' }, { stageTag: 'pregnant' }, { body: 'x', audience: 'friends' }]) {
      const res = await patchPost(app, A.header, s, patch);
      expect([res.statusCode, JSON.parse(res.body)], JSON.stringify(patch)).toEqual([400, { error: 'share_not_editable' }]);
    }
    expect(await stateOf(s)).toBe(before);
    expect((await deletePost(app, A.header, s)).statusCode).toBe(204);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.6 c6][NFR-SEC-005] post reads are never cached', () => {
  it('[F3.6 c6] GET /posts/:id answers 200 and 404 with Cache-Control "private, no-store"', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    const ok = await getPost(app, X.header, o);
    const missing = await getPost(app, X.header, NOBODY);
    expect([ok.statusCode, missing.statusCode]).toEqual([200, 404]);
    for (const res of [ok, missing]) expect(String(res.headers['cache-control']).toLowerCase().replace(/\s+/g, '')).toBe('private,no-store');
  });

  it('[F3.6 c6] after the author edits the audience to friends, the same non-Friend\'s next open → 404', T, async () => {
    const app = await start();
    const o = await seedPost(B);
    expect((await getPost(app, X.header, o)).statusCode).toBe(200);
    expect((await patchPost(app, B.header, o, { audience: 'friends' })).statusCode).toBe(200);
    const after = await getPost(app, X.header, o);
    expect(after.statusCode).toBe(404);
    expect(String(after.headers['cache-control']).toLowerCase()).toContain('no-store');
  });
});
