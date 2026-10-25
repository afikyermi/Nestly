import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { ACCOUNT_A, ACCOUNT_B, AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { CLOCK_NOW, buildRegisterApp, child, parts, post, validBody } from '../helpers/register-app.js';
import { createPost, deletePost, getPost, jsonObject, patchPost } from '../helpers/posts-api.js';

// I3 F3.1a, the post API against the real database (CI `db` job, as app_server, fixtures of supabase/tests/setup/):
// Criteria c1-c5, c8-c12 of .work/post-create/spec.md; values from spec.md and schema.md/schema-b.md only. A, B active Regulars, S suspended, P Professional.
// Fixture rows are committed through `side.begin`; every test starts and ends with tests.fx_feed_clear().

const T = { timeout: COLD_START_MS };
const S = '50000000-0000-4000-8000-000000000051';
const P = 'd0000000-0000-4000-8000-0000000000d4';
const NOBODY = '99999999-9999-4999-8999-999999999999';

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
  const app = await buildRegisterApp(env(), { database, clock: () => CLOCK_NOW });
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
async function scalar(query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> {
  const rows = await query;
  return String(rows[0]?.v);
}
const stateOf = (id: string) => scalar(side`select coalesce(tests.fx_po_state(${id}::uuid), 'none') as v`);
const postCount = async (): Promise<number> => Number(await scalar(side`select tests.fx_po_count() as v`));
const setStatus = async (who: string, status: 'active' | 'suspended'): Promise<void> => {
  await side`select tests.set_status(${who}::uuid, ${status})`;
};

/** A committed fixture write: the fixtures refuse to run outside a multi-statement transaction. */
async function inTx(work: (tx: postgres.TransactionSql) => Promise<void>): Promise<void> {
  await side.begin(async (tx) => {
    await tx`select 1`;
    await work(tx);
  });
}
async function seedPost(author: string, audience: 'everyone' | 'friends' = 'everyone', body = 'post body'): Promise<string> {
  let id = '';
  await inTx(async (tx) => {
    const rows = await tx`select tests.fx_po_add(${author}::uuid, ${audience}, false, 'active', ${body}, null, null)::text as v`;
    id = String(rows[0]?.v);
  });
  return id;
}
const clearFeed = async (): Promise<void> => {
  await side`select tests.fx_feed_clear()`;
  await side`select tests.fx_fr_purge(${ACCOUNT_A}::uuid)`;
  await side`select tests.fx_fr_purge(${ACCOUNT_B}::uuid)`;
};

async function registered(app: App, fullName: string, over: Record<string, unknown> = {}): Promise<{ id: string; header: string }> {
  const [row] = await side`select tests.fx_new_auth_user()::text as id`;
  const id = String(row?.id);
  const header = await bearerFor(id);
  const res = await post(app, header, validBody({ fullName, ...over }));
  if (res.statusCode !== 201) throw new Error(`could not register a fresh user: ${res.statusCode} ${res.body}`);
  return { id, header };
}

let hA: string;
let hB: string;
let hS: string;
let hP: string;

beforeAll(async () => {
  key = await newKey('posts-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  [hA, hB, hS, hP] = await Promise.all([bearerFor(ACCOUNT_A), bearerFor(ACCOUNT_B), bearerFor(S), bearerFor(P)]);
}, COLD_START_MS);

beforeEach(async () => {
  await setStatus(ACCOUNT_A, 'active');
  await setStatus(ACCOUNT_B, 'active');
  await clearFeed();
});

afterEach(async () => {
  await closeAll();
  await setStatus(ACCOUNT_A, 'active');
  await setStatus(ACCOUNT_B, 'active');
  await clearFeed();
});

afterAll(async () => {
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.1-a c3 FR-FEED-002] POST /posts', () => {
  it('[F3.1-a c3] 201 {id, body, audience, stageTag:null, createdAt}; the stored row is the caller\'s, named, active', T, async () => {
    const app = await start();
    const res = await createPost(app, hA, { body: '  שאלה לכולן 😀  ', audience: 'everyone' });
    expect(res.statusCode, res.body).toBe(201);
    const out = jsonObject(res.body);
    expect(Object.keys(out).sort()).toEqual(['audience', 'body', 'createdAt', 'id', 'isAnonymous', 'stageTag']); // F3.4 c2 amends F3.1 c3: a named post's 201 gains isAnonymous:false
    expect(out).toMatchObject({ body: 'שאלה לכולן 😀', audience: 'everyone', stageTag: null, isAnonymous: false });
    expect(Number.isNaN(Date.parse(String(out.createdAt)))).toBe(false);
    expect(await stateOf(String(out.id))).toBe(`status=active aud=everyone anon=f author=${ACCOUNT_A} tag=null share=f body=שאלה לכולן 😀`);
  });

  it('[F3.1-a c3] audience friends is stored as given; the author is the token\'s whoever the caller is', T, async () => {
    const app = await start();
    const res = await createPost(app, hB, { body: 'x', audience: 'friends' });
    expect(res.statusCode, res.body).toBe(201);
    expect(await stateOf(String(jsonObject(res.body).id))).toBe(`status=active aud=friends anon=f author=${ACCOUNT_B} tag=null share=f body=x`);
  });

  it('[F3.1-a c3] hostile text is stored verbatim, not interpreted', T, async () => {
    const app = await start();
    const text = `'); drop table nestly.posts; -- \${1+1} <script>alert(1)</script> \\0`;
    const res = await createPost(app, hA, { body: text, audience: 'everyone' });
    expect(res.statusCode, res.body).toBe(201);
    expect(jsonObject(res.body).body).toBe(text);
    expect(await postCount()).toBe(1);
  });

  it('[F3.1-a c2] a forbidden key (authorId, status, sharedPostId, id) is a 400 and writes no row', T, async () => {
    const app = await start();
    for (const extra of [{ authorId: ACCOUNT_B }, { status: 'removed' }, { sharedPostId: NOBODY }, { id: NOBODY }]) { // F3.4 c1: isAnonymous is valid on create now
      const res = await createPost(app, hA, { body: 'x', audience: 'everyone', ...extra });
      expect(res.statusCode, `${JSON.stringify(extra)}: ${res.body}`).toBe(400);
    }
    expect(await postCount()).toBe(0);
  });

  it('[F3.1-a c2] a bad audience, a bad stageTag, a non-JSON body and a non-object body are 400/422 and write no row', T, async () => {
    const app = await start();
    const bad: unknown[] = [
      { body: 'x', audience: 'public' },
      { body: 'x' },
      { body: 'x', audience: 'everyone', stageTag: 'topic-x' },
      '{not json',
      '[]',
      'null',
    ];
    for (const payload of bad) {
      const res = await createPost(app, hA, payload);
      expect([400, 422], `${JSON.stringify(payload)}: ${res.statusCode}`).toContain(res.statusCode);
    }
    expect(await postCount()).toBe(0);
  });

  it('[F3.1-a c1] an empty or blank body is 422 and a 2,001-code-point body is 422; 2,000 is stored; no row for the refused', T, async () => {
    const app = await start();
    for (const body of ['', '   ']) expect((await createPost(app, hA, { body, audience: 'everyone' })).statusCode).toBe(422);
    expect((await createPost(app, hA, { body: 'א'.repeat(2001), audience: 'everyone' })).statusCode).toBe(422);
    expect(await postCount()).toBe(0);
    expect((await createPost(app, hA, { body: '😀'.repeat(2000), audience: 'everyone' })).statusCode).toBe(201);
    expect(await postCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.1-a c4 FR-FEED-002] who may post', () => {
  it('[F3.1-a c4] no token → 401, no row (also for read, edit, delete)', T, async () => {
    const app = await start();
    const id = await seedPost(ACCOUNT_A);
    expect((await createPost(app, null, { body: 'x', audience: 'everyone' })).statusCode).toBe(401);
    expect((await getPost(app, null, id)).statusCode).toBe(401);
    expect((await patchPost(app, null, id, { body: 'y', audience: 'everyone' })).statusCode).toBe(401);
    expect((await deletePost(app, null, id)).statusCode).toBe(401);
    expect(await postCount()).toBe(1);
    expect(await stateOf(id)).toContain('body=post body');
  });

  it('[FR-FEED-002 professional-posting c1] a Professional posts a named everyone post with no tag → 201 (supersedes F3.1-a c4)', T, async () => {
    const app = await start();
    const res = await createPost(app, hP, { body: 'x', audience: 'everyone' });
    expect(res.statusCode, res.body).toBe(201);
    expect(jsonObject(res.body)).toMatchObject({ audience: 'everyone', stageTag: null, isAnonymous: false });
    expect(await postCount()).toBe(1);
    expect(await stateOf(String(jsonObject(res.body).id))).toBe(`status=active aud=everyone anon=f author=${P} tag=null share=f body=x`);
  });

  it('[FR-FEED-002 professional-posting c1] a Professional: anonymous, friends or a stage tag → 403, no row', T, async () => {
    const app = await start();
    for (const extra of [{ isAnonymous: true }, { audience: 'friends' }, { stageTag: 'pregnant' }]) {
      const res = await createPost(app, hP, { body: 'x', audience: 'everyone', ...extra });
      expect(res.statusCode, res.body).toBe(403);
    }
    expect(await postCount()).toBe(0);
  });

  it('[F3.1-a c4] a suspended account → 403, no row', T, async () => {
    const app = await start();
    const res = await createPost(app, hS, { body: 'x', audience: 'everyone' });
    expect(res.statusCode, res.body).toBe(403);
    expect(await postCount()).toBe(0);
  });

});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.1-a c5 5א] the stage tag is only what the author chose', () => {
  it('[F3.1-a c5] a user with a pregnancy and a child profile: no stageTag → null; "pregnant" → pregnant', T, async () => {
    const app = await start();
    const c = await registered(app, 'Carmel Shani', { stages: ['pregnant', 'has_child'], dueDate: parts('2026-12-01'), children: [child()] });
    const none = await createPost(app, c.header, { body: 'x', audience: 'everyone' });
    expect(none.statusCode, none.body).toBe(201);
    expect(jsonObject(none.body).stageTag).toBeNull();
    expect(await stateOf(String(jsonObject(none.body).id))).toContain('tag=null');
    const tagged = await createPost(app, c.header, { body: 'x', audience: 'everyone', stageTag: 'pregnant' });
    expect(tagged.statusCode, tagged.body).toBe(201);
    expect(jsonObject(tagged.body).stageTag).toBe('pregnant');
    expect(await stateOf(String(jsonObject(tagged.body).id))).toContain('tag=pregnant');
    const explicitNull = await createPost(app, c.header, { body: 'x', audience: 'everyone', stageTag: null });
    expect(await stateOf(String(jsonObject(explicitNull.body).id))).toContain('tag=null');
  });

});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.1-a c8 c9] PATCH /posts/:id', () => {
  it('[F3.1-a c8] the author updates body, audience, stageTag → 200 with the stored values; null clears the tag', T, async () => {
    const app = await start();
    const made = jsonObject((await createPost(app, hA, { body: 'first', audience: 'everyone', stageTag: 'planning' })).body);
    const id = String(made.id);
    const res = await patchPost(app, hA, id, { body: ' second ', audience: 'friends', stageTag: 'has_child' });
    expect(res.statusCode, res.body).toBe(200);
    expect(jsonObject(res.body)).toMatchObject({ id, body: 'second', audience: 'friends', stageTag: 'has_child' });
    expect(await stateOf(id)).toBe(`status=active aud=friends anon=f author=${ACCOUNT_A} tag=has_child share=f body=second`);
    const cleared = await patchPost(app, hA, id, { body: 'second', audience: 'friends', stageTag: null });
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect(jsonObject(cleared.body).stageTag).toBeNull();
    expect(await stateOf(id)).toContain('tag=null');
  });

  it('[F3.1-a c8] an empty or blank body → 422 and an over-long body → 422; the row is unchanged', T, async () => {
    const app = await start();
    const id = await seedPost(ACCOUNT_A, 'everyone', 'keep me');
    const before = await stateOf(id);
    for (const body of ['', '   ', 'א'.repeat(2001)]) {
      expect((await patchPost(app, hA, id, { body, audience: 'everyone' })).statusCode).toBe(422);
    }
    expect(await stateOf(id)).toBe(before);
  });

  it('[F3.1-a c8 c2] isAnonymous (and every other forbidden key) in the payload → 400; the row is unchanged', T, async () => {
    const app = await start();
    const id = await seedPost(ACCOUNT_A, 'everyone', 'keep me');
    const before = await stateOf(id);
    for (const extra of [{ isAnonymous: true }, { isAnonymous: false }, { authorId: ACCOUNT_B }, { status: 'deleted' }, { sharedPostId: NOBODY }, { id: NOBODY }]) {
      const res = await patchPost(app, hA, id, { body: 'changed', audience: 'friends', ...extra });
      expect(res.statusCode, `${JSON.stringify(extra)}: ${res.body}`).toBe(400);
    }
    expect(await stateOf(id)).toBe(before);
  });

  it('[F3.1-a c9] another active user who can read the post → 404, row unchanged; an unknown id → 404, the same body', T, async () => {
    const app = await start();
    const id = await seedPost(ACCOUNT_A, 'everyone', 'mine');
    const before = await stateOf(id);
    const others = await patchPost(app, hB, id, { body: 'hijack', audience: 'friends', stageTag: 'pregnant' });
    const missing = await patchPost(app, hB, NOBODY, { body: 'hijack', audience: 'friends' });
    expect(others.statusCode, others.body).toBe(404);
    expect(missing.statusCode, missing.body).toBe(404);
    expect(others.body).toBe(missing.body);
    expect(await stateOf(id)).toBe(before);
  });

  it('[F3.1-a c9] a stranger on a friends post and a suspended account get the same 404 body; nothing changes', T, async () => {
    const app = await start();
    const id = await seedPost(ACCOUNT_A, 'friends', 'private');
    const before = await stateOf(id);
    const missing = await patchPost(app, hB, NOBODY, { body: 'z', audience: 'everyone' });
    const stranger = await patchPost(app, hB, id, { body: 'z', audience: 'everyone' });
    const suspended = await patchPost(app, hS, id, { body: 'z', audience: 'everyone' });
    expect(stranger.statusCode).toBe(404);
    expect(stranger.body).toBe(missing.body);
    expect([403, 404]).toContain(suspended.statusCode);
    expect(await stateOf(id)).toBe(before);
  });

  it('[F3.1-a c9] the author of a post that is already deleted (held) gets 404 on edit', T, async () => {
    const app = await start();
    const id = String(jsonObject((await createPost(app, hA, { body: 'x', audience: 'everyone' })).body).id);
    expect((await deletePost(app, hA, id)).statusCode).toBe(204);
    expect((await patchPost(app, hA, id, { body: 'back', audience: 'everyone' })).statusCode).toBe(404);
    expect(await postCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.1-a c10 c11 3א] DELETE /posts/:id', () => {
  it('[F3.1-a c10] the author, no open report → 204; no row remains; its comments, likes and hides are gone; a second DELETE → 404', T, async () => {
    const app = await start();
    const id = await seedPost(ACCOUNT_A, 'everyone', 'doomed');
    await inTx(async (tx) => {
      await tx`select tests.fx_cm_add(${ACCOUNT_B}::uuid, ${id}::uuid, 'a comment', null)`;
      await tx`select tests.fx_rx_add(${ACCOUNT_B}::uuid, ${id}::uuid, null)`;
      await tx`select tests.fx_ph_add(${ACCOUNT_B}::uuid, ${id}::uuid)`;
    });
    expect([await scalar(side`select tests.fx_cm_count() as v`), await scalar(side`select tests.fx_rx_count() as v`), await scalar(side`select tests.fx_ph_count() as v`)]).toEqual(['1', '1', '1']);
    const res = await deletePost(app, hA, id);
    expect(res.statusCode, res.body).toBe(204);
    expect(res.body).toBe('');
    expect(await stateOf(id)).toBe('none');
    expect(await postCount()).toBe(0);
    expect([await scalar(side`select tests.fx_cm_count() as v`), await scalar(side`select tests.fx_rx_count() as v`), await scalar(side`select tests.fx_ph_count() as v`)]).toEqual(['0', '0', '0']);
    expect((await deletePost(app, hA, id)).statusCode).toBe(404);
  });

  it('[F3.1-a c11] a non-author gets 404 and the post remains (everyone and friends posts alike); an unknown id is the same 404', T, async () => {
    const app = await start();
    const open = await seedPost(ACCOUNT_A, 'everyone');
    const closed = await seedPost(ACCOUNT_A, 'friends');
    const missing = await deletePost(app, hB, NOBODY);
    for (const id of [open, closed]) {
      const res = await deletePost(app, hB, id);
      expect(res.statusCode, res.body).toBe(404);
      expect(res.body).toBe(missing.body);
      expect(await stateOf(id)).toContain('author=' + ACCOUNT_A);
    }
    expect(await postCount()).toBe(2);
  });

  it('[F3.1-a c11] the author deletes a post with an open report: the same 204; afterwards GET is 404 for the author and everyone else', T, async () => {
    const app = await start();
    const id = await seedPost(ACCOUNT_A, 'everyone', 'reported');
    const c = await registered(app, 'Carmel Shani');
    await inTx(async (tx) => {
      await tx`select tests.fx_rp_add(${ACCOUNT_B}::uuid, 'post', ${id}::uuid, 'spam', null)`;
    });
    const res = await deletePost(app, hA, id);
    expect(res.statusCode, res.body).toBe(204);
    expect(res.body).toBe('');
    const missing = await getPost(app, hA, NOBODY);
    for (const header of [hA, hB, c.header]) {
      const read = await getPost(app, header, id);
      expect(read.statusCode, read.body).toBe(404);
      expect(read.body).toBe(missing.body);
    }
    expect(await scalar(side`select tests.fx_hold_state('post', ${id}::uuid) as v`)).toMatch(/^status=deleted/);
    expect((await deletePost(app, hA, id)).statusCode).toBe(404);
  });

  it('[F3.1-a c10] two simultaneous deletes: at most one 204, the other 404 (503 allowed); the post is gone', T, async () => {
    const first = await start();
    const second = await start();
    const id = await seedPost(ACCOUNT_A);
    const [x, y] = await Promise.all([deletePost(first, hA, id), deletePost(second, hA, id)]);
    const codes = [x.statusCode, y.statusCode];
    for (const code of codes) expect([204, 404, 503]).toContain(code);
    expect(codes.filter((c) => c === 204).length).toBeLessThanOrEqual(1);
    if (!codes.includes(503)) expect(codes.filter((c) => c === 204).length).toBe(1);
    expect(await postCount()).toBe(codes.includes(204) ? 0 : 1);
  });

  it('[F3.1-a c8 c10] an edit racing a delete ends with the post gone or edited, never a half state', T, async () => {
    const first = await start();
    const second = await start();
    const id = await seedPost(ACCOUNT_A, 'everyone', 'before');
    const [edit, del] = await Promise.all([patchPost(first, hA, id, { body: 'after', audience: 'everyone' }), deletePost(second, hA, id)]);
    for (const code of [edit.statusCode, del.statusCode]) expect([200, 204, 404, 503]).toContain(code);
    const state = await stateOf(id);
    if (del.statusCode === 204) expect(state).toBe('none');
    else expect(state).toContain(edit.statusCode === 200 ? 'body=after' : 'body=before');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.1-a c12] GET /posts/:id', () => {
  it('[F3.1-a c12] an eligible viewer gets the post; isMine is true only for the author', T, async () => {
    const app = await start();
    const id = String(jsonObject((await createPost(app, hA, { body: 'hello', audience: 'everyone', stageTag: 'planning' })).body).id);
    const mine = await getPost(app, hA, id);
    const theirs = await getPost(app, hB, id);
    expect(mine.statusCode, mine.body).toBe(200);
    expect(theirs.statusCode, theirs.body).toBe(200);
    expect(jsonObject(mine.body)).toMatchObject({ id, body: 'hello', audience: 'everyone', stageTag: 'planning', isMine: true });
    expect(jsonObject(theirs.body)).toMatchObject({ id, body: 'hello', audience: 'everyone', stageTag: 'planning', isMine: false });
    expect(JSON.stringify(jsonObject(theirs.body))).not.toContain(ACCOUNT_A);
  });

  it('[F3.1-a c12] a friends post is read by an accepted Friend (isMine false) and by no one else', T, async () => {
    const app = await start();
    const c = await registered(app, 'Carmel Shani');
    const id = await seedPost(ACCOUNT_A, 'friends', 'for friends');
    await inTx(async (tx) => {
      await tx`select tests.fx_fr_add(${ACCOUNT_B}::uuid, ${ACCOUNT_A}::uuid, 'accepted', false)`;
    });
    const friend = await getPost(app, hB, id);
    expect(friend.statusCode, friend.body).toBe(200);
    expect(jsonObject(friend.body).isMine).toBe(false);
    expect((await getPost(app, c.header, id)).statusCode).toBe(404);
    expect((await getPost(app, hA, id)).statusCode).toBe(200);
  });

  it('[F3.1-a c12] a stranger on a friends post, a suspended viewer, a Professional, an unknown, a hidden, a removed and a deleted post → the same 404', T, async () => {
    const app = await start();
    const c = await registered(app, 'Carmel Shani');
    const friendsOnly = await seedPost(ACCOUNT_A, 'friends');
    const visible = await seedPost(ACCOUNT_A, 'everyone');
    const hidden = await seedPost(ACCOUNT_A, 'everyone');
    const removed = await seedPost(ACCOUNT_A, 'everyone');
    const deleted = String(jsonObject((await createPost(app, hA, { body: 'x', audience: 'everyone' })).body).id);
    await inTx(async (tx) => {
      await tx`select tests.fx_po_status(${hidden}::uuid, 'hidden')`;
      await tx`select tests.fx_po_status(${removed}::uuid, 'removed')`;
    });
    expect((await deletePost(app, hA, deleted)).statusCode).toBe(204);
    expect((await getPost(app, hB, visible)).statusCode).toBe(200);

    const reference = await getPost(app, c.header, NOBODY);
    expect(reference.statusCode).toBe(404);
    const cases: Array<[string, string]> = [
      ['stranger, friends post', await getPost(app, c.header, friendsOnly).then((r) => `${r.statusCode}|${r.body}`)],
      ['suspended viewer, public post', await getPost(app, hS, visible).then((r) => `${r.statusCode}|${r.body}`)],
      ['hidden', await getPost(app, hB, hidden).then((r) => `${r.statusCode}|${r.body}`)],
      ['hidden, to the author', await getPost(app, hA, hidden).then((r) => `${r.statusCode}|${r.body}`)],
      ['removed', await getPost(app, hB, removed).then((r) => `${r.statusCode}|${r.body}`)],
      ['deleted', await getPost(app, hB, deleted).then((r) => `${r.statusCode}|${r.body}`)],
    ];
    for (const [label, got] of cases) expect(got, label).toBe(`404|${reference.body}`);
  });

});

// ---------------------------------------------------------------------------------------------------------------------
// professional-posting c2, c3 (.work/professional-posting/spec.md): an active Professional's named, everyone, untagged post.
describe('[professional-posting c2] POST /posts by a Professional', () => {
  it('[professional-posting c2] 201 isAnonymous:false; the response carries no author id; the stored row is the caller\'s and has no post_authors row', T, async () => {
    const app = await start();
    const res = await createPost(app, hP, { body: 'מקצועי', audience: 'everyone' });
    expect(res.statusCode, res.body).toBe(201);
    expect(jsonObject(res.body).isAnonymous).toBe(false);
    expect(res.body).not.toContain(P);
    expect(await scalar(side`select tests.fx_pa_count() as v`)).toBe('0');
  });

  it('[professional-posting c2][AC-076] isAnonymous:true → 403 not_allowed; 0 posts and 0 post_authors', T, async () => {
    const app = await start();
    const res = await createPost(app, hP, { body: 'x', audience: 'everyone', isAnonymous: true });
    expect(res.statusCode, res.body).toBe(403);
    expect(jsonObject(res.body).error).toBe('not_allowed');
    expect(await postCount()).toBe(0);
    expect(await scalar(side`select tests.fx_pa_count() as v`)).toBe('0');
  });

  it('[professional-posting c2 · I11 AC-130] audience friends, any stageTag → 403 and no row; the removed help-request key → 400 (I11-C); "followers" → 201 (AC-130)', T, async () => {
    const app = await start();
    for (const extra of [{ audience: 'friends' }, { stageTag: 'pregnant' }, { stageTag: 'planning' }, { stageTag: 'has_child' }]) {
      const res = await createPost(app, hP, { body: 'x', audience: 'everyone', ...extra });
      expect(res.statusCode, `${JSON.stringify(extra)}: ${res.body}`).toBe(403);
    }
    expect((await createPost(app, hP, { body: 'x', audience: 'everyone', isHelpRequest: true })).statusCode).toBe(400);
    expect(await postCount()).toBe(0);
    expect((await createPost(app, hP, { body: 'x', audience: 'followers' })).statusCode).toBe(201);
    expect(await postCount()).toBe(1);
  });

  it('[professional-posting c2] a suspended Professional is refused: 403 and no row', T, async () => {
    const app = await start();
    await setStatus(P, 'suspended');
    try {
      const res = await createPost(app, hP, { body: 'x', audience: 'everyone' });
      expect(res.statusCode, res.body).toBe(403);
      expect(await postCount()).toBe(0);
    } finally {
      await setStatus(P, 'active');
    }
  });
});

describe('[professional-posting c3 FR-FEED-002 3א] a Professional edits, deletes and reads', () => {
  it('[professional-posting c3] PATCH body → 200; audience friends or a stageTag → 403 and the row is unchanged', T, async () => {
    const app = await start();
    const id = String(jsonObject((await createPost(app, hP, { body: 'first', audience: 'everyone' })).body).id);
    const res = await patchPost(app, hP, id, { body: ' second ', audience: 'everyone' });
    expect(res.statusCode, res.body).toBe(200);
    expect(jsonObject(res.body)).toMatchObject({ id, body: 'second', audience: 'everyone', stageTag: null });
    const before = await stateOf(id);
    expect(before).toBe(`status=active aud=everyone anon=f author=${P} tag=null share=f body=second`);
    for (const extra of [{ audience: 'friends' }, { stageTag: 'pregnant' }]) {
      const refused = await patchPost(app, hP, id, { body: 'changed', audience: 'everyone', ...extra });
      expect(refused.statusCode, `${JSON.stringify(extra)}: ${refused.body}`).toBe(403);
    }
    expect(await stateOf(id)).toBe(before);
  });

  it('[professional-posting c3] DELETE → 204, also with an open report; afterwards GET is 404 for everyone', T, async () => {
    const app = await start();
    const plain = String(jsonObject((await createPost(app, hP, { body: 'a', audience: 'everyone' })).body).id);
    const reported = String(jsonObject((await createPost(app, hP, { body: 'b', audience: 'everyone' })).body).id);
    await inTx(async (tx) => {
      await tx`select tests.fx_rp_add(${ACCOUNT_B}::uuid, 'post', ${reported}::uuid, 'spam', null)`;
    });
    expect((await deletePost(app, hP, plain)).statusCode).toBe(204);
    expect((await deletePost(app, hP, reported)).statusCode).toBe(204);
    for (const id of [plain, reported]) {
      expect((await getPost(app, hP, id)).statusCode).toBe(404);
      expect((await getPost(app, hB, id)).statusCode).toBe(404);
    }
  });

  it('[professional-posting c3] another user\'s PATCH and DELETE of a Professional\'s post → 404, row unchanged; a Professional on a Regular\'s post → 404', T, async () => {
    const app = await start();
    const id = String(jsonObject((await createPost(app, hP, { body: 'mine', audience: 'everyone' })).body).id);
    const before = await stateOf(id);
    expect((await patchPost(app, hB, id, { body: 'hijack', audience: 'everyone' })).statusCode).toBe(404);
    expect((await deletePost(app, hB, id)).statusCode).toBe(404);
    expect(await stateOf(id)).toBe(before);
    const regular = await seedPost(ACCOUNT_A, 'everyone', 'regular');
    expect((await patchPost(app, hP, regular, { body: 'hijack', audience: 'everyone' })).statusCode).toBe(404);
    expect((await deletePost(app, hP, regular)).statusCode).toBe(404);
    expect(await stateOf(regular)).toContain('body=regular');
  });

  it('[professional-posting c3] GET /posts/:id: isMine is true only for the Professional author; a Professional reads a Regular\'s everyone post with isMine false, not a friends one', T, async () => {
    const app = await start();
    const id = String(jsonObject((await createPost(app, hP, { body: 'pro', audience: 'everyone' })).body).id);
    expect(jsonObject((await getPost(app, hP, id)).body).isMine).toBe(true);
    const theirs = await getPost(app, hB, id);
    expect(theirs.statusCode, theirs.body).toBe(200);
    expect(jsonObject(theirs.body).isMine).toBe(false);
    expect(theirs.body).not.toContain(P);
    const regular = await seedPost(ACCOUNT_A, 'everyone', 'regular');
    const friends = await seedPost(ACCOUNT_A, 'friends', 'friends only');
    const read = await getPost(app, hP, regular);
    expect(read.statusCode, read.body).toBe(200);
    expect(jsonObject(read.body).isMine).toBe(false);
    expect((await getPost(app, hP, friends)).statusCode).toBe(404);
  });
});
