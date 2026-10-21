import type { Writable } from 'node:stream';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, toRecord, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, captureLog, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';
import { addComment, deleteComment, listComments } from '../helpers/comments-api.js';
import { deletePost, getPost, patchPost } from '../helpers/posts-api.js';
import { postReport, sendReportMethod } from '../helpers/reports-api.js';

// I3 F3.7, POST /api/reports against the real database (CI `db` job, as app_server); criteria c1-c8 of .work/report/spec.md. c16 (the purge
// job, the details CHECK) is pgTAP 84's, not asserted twice. Expected values come from the spec only.

const T = { timeout: COLD_START_MS };
const P = 'd0000000-0000-4000-8000-0000000000d4'; // Professional fixture account
const NOBODY = '99999999-9999-4999-8999-999999999999';
const HOUR = 3_600_000;
const T0 = Date.parse('2026-01-15T12:00:00Z');
const iso = (ms: number): string => new Date(T0 + ms).toISOString().replace('Z', '000Z');
const GONE = { error: 'unavailable' };

interface Member { id: string; header: string }
const NAMES = ['Adi Author', 'Rita Reporter', 'Omer Other', 'Yael Third', 'Xavi Stranger'];
let AU: Member, R: Member, O: Member, Y: Member, X: Member;
let everyone: Member[] = [];
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
const total = (): Promise<number> => text(side.unsafe('select tests.fx_rp_count() as v')).then(Number);
const listOf = (m: Member): Promise<string> => text(side`select tests.fx_rp_list(${m.id}::uuid) as v`);
async function inTx(work: (tx: postgres.TransactionSql) => Promise<void>): Promise<void> {
  await side.begin(async (tx) => {
    await tx`select 1`;
    await work(tx);
  });
}
async function seedPost(by: Member, o: { aud?: 'everyone' | 'friends'; anon?: boolean; ago?: number; shared?: string } = {}): Promise<string> {
  let id = '';
  await inTx(async (tx) => {
    id = await text(tx`select tests.fx_po_add(${by.id}::uuid, ${o.aud ?? 'everyone'}, ${o.anon ?? false}, 'active', 'post body', null, ${o.shared ?? null}::uuid)::text as v`);
    await tx`select tests.fx_fv_at('post', ${id}::uuid, ${iso(-(o.ago ?? 1) * HOUR)}::text::timestamptz)`;
  });
  return id;
}
async function seedComment(by: Member, postId: string, minute: number): Promise<string> {
  let id = '';
  await inTx(async (tx) => {
    id = await text(tx`select tests.fx_cm_add(${by.id}::uuid, ${postId}::uuid, ${`c${minute}`}, null)::text as v`);
    await tx`select tests.fx_fv_at('comment', ${id}::uuid, ${new Date(T0 + minute * 60_000).toISOString()}::text::timestamptz)`;
  });
  return id;
}
/** A report filed straight into the table (the fixture), as `by`: used to make a target "held" (a reported item its author then deletes). */
const seedReport = (by: Member, kind: 'post' | 'comment' | 'user', target: string): Promise<void> =>
  inTx(async (tx) => void (await tx`select tests.fx_rp_add(${by.id}::uuid, ${kind}, ${target}::uuid, 'spam', null)`));
const befriend = (a: Member, b: Member): Promise<void> => inTx(async (tx) => void (await tx`select tests.fx_fr_add(${a.id}::uuid, ${b.id}::uuid, 'accepted', false)`));
const setStatus = (id: string, status: string): Promise<unknown> => side`select tests.set_status(${id}::uuid, ${status})`;
const postStatus = (id: string, status: string): Promise<unknown> => side`select tests.fx_po_status(${id}::uuid, ${status})`;

/** The report rows `who` can read, through the database as that identity (reports_select_reporter): the proof of "only the reporter reads". */
async function rowsSeenBy(who: Member): Promise<Array<Record<string, unknown>>> {
  return side.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: who.id, role: 'authenticated', aud: 'authenticated' })}, true)`;
    const rows = await tx`select reporter_id::text as reporter, target_kind as kind, post_id::text as post, comment_id::text as comment, reported_user_id::text as "user", reason, details, status from nestly.reports order by created_at`;
    return rows.map((r) => toRecord(r));
  });
}
const body = (res: { body: string }): Record<string, unknown> => toRecord(JSON.parse(res.body));
const items = (raw: string): unknown[] => {
  const list = body({ body: raw }).items;
  if (!Array.isArray(list)) throw new Error('items is not an array');
  return list;
};
const feedItems = async (app: App, who: Member): Promise<Array<Record<string, unknown>>> => {
  const res = await app.inject({ method: 'GET', url: '/api/feed', headers: { authorization: who.header } });
  expect(res.statusCode, res.body).toBe(200);
  return items(res.body).map((i) => toRecord(i));
};
const feedIds = async (app: App, who: Member): Promise<string[]> => (await feedItems(app, who)).map((i) => String(i.id));
const asAuthor = (app: App, path: string, who: Member) => app.inject({ method: 'GET', url: path, headers: { authorization: who.header } });
const send = (app: App, who: Member | string, kind: string, targetId: string, reason: unknown = 'harassment', extra: Record<string, unknown> = {}) =>
  postReport(app, typeof who === 'string' ? who : who.header, { targetKind: kind, targetId, reason, ...extra });

beforeAll(async () => {
  key = await newKey('reports-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  hP = await bearerFor(P);
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
  [AU = none, R = none, O = none, Y = none, X = none] = made;
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
describe('[F3.7 c1][FR-MOD-001, UC-26] a signed-in user files a report', () => {
  it('[c1] a post: 201 {received:true} and nothing else; exactly one row, reporter = the caller, open, the post column, reason, trimmed details', T, async () => {
    const app = await start();
    const target = await seedPost(AU);
    const res = await send(app, R, 'post', target, 'harassment', { details: '  הם מציקים לי  ' });
    expect(res.statusCode, res.body).toBe(201);
    expect(JSON.parse(res.body)).toEqual({ received: true });
    expect(await total()).toBe(1);
    expect(await rowsSeenBy(R)).toEqual([{ reporter: R.id, kind: 'post', post: target, comment: null, user: null, reason: 'harassment', details: 'הם מציקים לי', status: 'open' }]);
  });

  it('[c1] a comment, and another account: 201 each, the matching target column only; blank details are null', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const comment = await seedComment(Y, postId, 1);
    expect((await send(app, R, 'comment', comment, 'spam', { details: '   ' })).statusCode).toBe(201);
    expect((await send(app, R, 'user', Y.id, 'impersonation')).statusCode).toBe(201);
    expect(await rowsSeenBy(R)).toEqual([
      { reporter: R.id, kind: 'comment', post: null, comment, user: null, reason: 'spam', details: null, status: 'open' },
      { reporter: R.id, kind: 'user', post: null, comment: null, user: Y.id, reason: 'impersonation', details: null, status: 'open' },
    ]);
  });

  it('[c1] a Professional account may report; every one of the eight reasons is accepted ("other" with details)', T, async () => {
    const app = await start();
    const target = await seedPost(AU);
    const res = await send(app, hP, 'post', target, 'child_safety');
    expect(res.statusCode, res.body).toBe(201);
    const reasons = ['child_safety', 'harassment', 'sexual_violent_hateful', 'personal_information', 'medical_misinformation', 'impersonation', 'spam', 'other'];
    for (const reason of reasons) {
      const comment = await seedComment(AU, target, reasons.indexOf(reason) + 1);
      const out = await send(app, R, 'comment', comment, reason, reason === 'other' ? { details: 'משהו אחר' } : {});
      expect(out.statusCode, `${reason}: ${out.body}`).toBe(201);
    }
    expect((await rowsSeenBy(R)).map((r) => r.reason)).toEqual(reasons);
  });

  it('[c1] hostile text is stored as text: a SQL-shaped string, markup, an RTL mark and an emoji come back byte for byte', T, async () => {
    const app = await start();
    const texts = ["'); drop table nestly.reports; --", '<script>alert(1)</script>', '‮אבג😀', '${process.env.X} {{7*7}} %s $1'];
    for (const [i, details] of texts.entries()) {
      const comment = await seedComment(AU, await seedPost(AU), i + 1);
      expect((await send(app, R, 'comment', comment, 'harassment', { details })).statusCode).toBe(201);
    }
    expect((await rowsSeenBy(R)).map((r) => r.details)).toEqual(texts);
  });

  it('[c1] the log carries no target id, reporter or text', T, async () => {
    const log = captureLog();
    const app = await start(log.stream);
    const target = await seedPost(AU);
    expect((await send(app, R, 'post', target, 'harassment', { details: 'טקסט-סודי-למבחן' })).statusCode).toBe(201);
    expect((await send(app, R, 'post', target, 'harassment', { details: 'טקסט-סודי-למבחן' })).statusCode).toBe(404);
    for (const secret of [target, R.id, AU.id, 'טקסט-סודי-למבחן']) expect(log.text()).not.toContain(secret);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.7 c2][FR-MOD-001] strict body and session', () => {
  it('[c2] any other key, a client-set reporter or status, is 400 and writes nothing', T, async () => {
    const app = await start();
    const target = await seedPost(AU);
    for (const extra of [{ reporterId: Y.id }, { reporter_id: Y.id }, { status: 'closed' }, { postId: target }, { createdAt: '2020-01-01T00:00:00Z' }, { id: NOBODY }]) {
      const res = await send(app, R, 'post', target, 'harassment', extra);
      expect(res.statusCode, JSON.stringify(extra)).toBe(400);
    }
    expect(await total()).toBe(0);
  });

  it('[c2] no session, a malformed header and a garbage token are 401 and write nothing', T, async () => {
    const app = await start();
    const target = await seedPost(AU);
    const valid = { targetKind: 'post', targetId: target, reason: 'spam' };
    for (const header of [null, '', 'Bearer', 'Bearer garbage', 'Basic abc', `Bearer ${(await bearerFor(R.id)).slice(7, -3)}xyz`]) {
      expect((await postReport(app, header, valid)).statusCode, String(header)).toBe(401);
    }
    expect(await total()).toBe(0);
  });

  it('[c2] a body that is not an object, or not JSON, is 400 and writes nothing', T, async () => {
    const app = await start();
    for (const payload of ['null', '[]', '"x"', '5', '{']) expect((await postReport(app, R.header, payload)).statusCode, payload).toBe(400);
    expect(await total()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.7 c3][FR-MOD-001] the shared rule, at the route', () => {
  it('[c3] a reason outside the 8 keys, a target kind outside the 3, an id that is not a uuid: 400 invalid, no row', T, async () => {
    const app = await start();
    const target = await seedPost(AU);
    for (const reason of ['violence', 'Spam', '', 'child-safety', 5, null]) {
      const res = await send(app, R, 'post', target, reason);
      expect([res.statusCode, res.body], String(reason)).toEqual([400, JSON.stringify({ error: 'invalid' })]);
    }
    for (const kind of ['sponsored', 'group', 'Post', '']) expect((await send(app, R, kind, target)).statusCode, kind).toBe(400);
    for (const id of ['', 'nope', `${target}x`, "' or 1=1 --"]) expect((await send(app, R, 'post', id)).statusCode, id).toBe(400);
    expect(await total()).toBe(0);
  });

  it('[c3] "other" without details (absent, empty, blank) is 400 details_required; with details 201', T, async () => {
    const app = await start();
    const target = await seedPost(AU);
    for (const extra of [{}, { details: '' }, { details: '  \n ' }]) {
      const res = await send(app, R, 'post', target, 'other', extra);
      expect([res.statusCode, res.body], JSON.stringify(extra)).toEqual([400, JSON.stringify({ error: 'details_required' })]);
    }
    expect(await total()).toBe(0);
    expect((await send(app, R, 'post', target, 'other', { details: 'סיבה' })).statusCode).toBe(201);
  });

  it('[c3] the details bound: 1,000 code points (emoji count as one) are 201; 1,001, a NUL or a non-string are 400 and write nothing', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const c1 = await seedComment(AU, postId, 1);
    const c2 = await seedComment(AU, postId, 2);
    const c3 = await seedComment(AU, postId, 3);
    expect((await send(app, R, 'comment', c1, 'harassment', { details: '😀'.repeat(1000) })).statusCode).toBe(201);
    expect((await send(app, R, 'comment', c2, 'harassment', { details: 'א'.repeat(1000) })).statusCode).toBe(201);
    expect((await rowsSeenBy(R)).map((r) => String(r.details).length)).toEqual([2000, 1000]);
    for (const details of ['😀'.repeat(1001), 'א'.repeat(1001), 'a\u0000b', 5, true, ['x']]) {
      expect((await send(app, R, 'comment', c3, 'harassment', { details })).statusCode, String(details).slice(0, 12)).toBe(400);
    }
    expect(await total()).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.7 c4][FR-MOD-001, ERR-011] one answer for everything that cannot be reported', () => {
  it('[c4] a post the reporter cannot read, an unknown id, their own post (also anonymous), and one already reported: the same 404 unavailable, no row', T, async () => {
    const app = await start();
    const friendsOnly = await seedPost(AU, { aud: 'friends' });
    const hidden = await seedPost(AU);
    const removed = await seedPost(AU);
    const deleted = await seedPost(AU);
    const held = await seedPost(AU);
    const mine = await seedPost(R);
    const mineAnonymous = await seedPost(R, { anon: true });
    const again = await seedPost(AU);
    await postStatus(hidden, 'hidden');
    await postStatus(removed, 'removed');
    expect((await deletePost(app, AU.header, deleted)).statusCode).toBe(204);
    await seedReport(Y, 'post', held);
    expect((await deletePost(app, AU.header, held)).statusCode).toBe(204);
    expect((await send(app, R, 'post', again)).statusCode).toBe(201);
    const before = await total();
    const reference = await send(app, R, 'post', NOBODY);
    expect([reference.statusCode, JSON.parse(reference.body)]).toEqual([404, GONE]);
    for (const id of [friendsOnly, hidden, removed, deleted, held, mine, mineAnonymous, again]) {
      const res = await send(app, R, 'post', id);
      expect([res.statusCode, res.body], id).toEqual([404, reference.body]);
    }
    expect(await total()).toBe(before);
  });

  it('[c4] a comment the reporter cannot read or wrote: the same 404, no row; and a post id as a comment (or a user id as a post) is also unavailable', T, async () => {
    const app = await start();
    const friendsOnly = await seedPost(AU, { aud: 'friends' });
    const hiddenPost = await seedPost(AU);
    const open = await seedPost(AU);
    const underFriends = await seedComment(AU, friendsOnly, 1);
    const underHidden = await seedComment(AU, hiddenPost, 2);
    const deleted = await seedComment(AU, open, 3);
    const held = await seedComment(AU, open, 4);
    const mine = await seedComment(R, open, 5);
    await postStatus(hiddenPost, 'hidden');
    expect((await deleteComment(app, AU.header, deleted)).statusCode).toBe(204);
    await seedReport(Y, 'comment', held);
    expect((await deleteComment(app, AU.header, held)).statusCode).toBe(204);
    const before = await total();
    const reference = await send(app, R, 'comment', NOBODY);
    expect([reference.statusCode, JSON.parse(reference.body)]).toEqual([404, GONE]);
    const wrong: Array<[string, string]> = [['comment', underFriends], ['comment', underHidden], ['comment', deleted], ['comment', held], ['comment', mine], ['comment', open], ['post', mine], ['post', Y.id], ['user', open]];
    for (const [kind, id] of wrong) {
      const res = await send(app, R, kind, id);
      expect([res.statusCode, res.body], `${kind} ${id}`).toEqual([404, reference.body]);
    }
    expect(await total()).toBe(before);
  });

  it('[c4] a user report on their own id or an id that is no account: the same 404, no row', T, async () => {
    const app = await start();
    const reference = await send(app, R, 'user', NOBODY);
    expect([reference.statusCode, JSON.parse(reference.body)]).toEqual([404, GONE]);
    const own = await send(app, R, 'user', R.id);
    expect([own.statusCode, own.body]).toEqual([404, reference.body]);
    expect((await send(app, R, 'user', R.id.toUpperCase())).statusCode).toBe(404);
    expect(await total()).toBe(0);
  });

  it('[c4] a friends-only post is reportable by a friend (the answer follows readability, not the audience word)', T, async () => {
    const app = await start();
    const target = await seedPost(AU, { aud: 'friends' });
    await befriend(R, AU);
    expect((await send(app, R, 'post', target)).statusCode).toBe(201);
    expect((await send(app, X, 'post', target)).statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.7 c5][F3.0 c15, BR-074] one report per person and target', () => {
  it('[c5] a second report on a comment or an account, any reason: 409 already_reported, the first row unchanged; the post answer is c4\'s 404', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const comment = await seedComment(AU, postId, 1);
    expect((await send(app, R, 'comment', comment, 'spam')).statusCode).toBe(201);
    expect((await send(app, R, 'user', Y.id, 'harassment', { details: 'ראשון' })).statusCode).toBe(201);
    for (const reason of ['spam', 'child_safety', 'other']) {
      const a = await send(app, R, 'comment', comment, reason, { details: 'שני' });
      expect([a.statusCode, a.body], reason).toEqual([409, JSON.stringify({ error: 'already_reported' })]);
      const b = await send(app, R, 'user', Y.id, reason, { details: 'שני' });
      expect([b.statusCode, b.body], reason).toEqual([409, JSON.stringify({ error: 'already_reported' })]);
    }
    expect((await send(app, R, 'post', postId)).statusCode).toBe(201);
    expect((await send(app, R, 'post', postId, 'child_safety')).statusCode).toBe(404);
    expect(await rowsSeenBy(R)).toEqual([
      expect.objectContaining({ kind: 'comment', reason: 'spam', details: null }),
      expect.objectContaining({ kind: 'user', reason: 'harassment', details: 'ראשון' }),
      expect.objectContaining({ kind: 'post', reason: 'harassment' }),
    ]);
  });

  it('[c5] two different users on one target give two rows (post, comment, account)', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const comment = await seedComment(AU, postId, 1);
    for (const who of [R, O]) {
      // The post last: a reported post is out of the reporter's reach, and so are the comments under it.
      expect((await send(app, who, 'comment', comment)).statusCode).toBe(201);
      expect((await send(app, who, 'user', Y.id)).statusCode).toBe(201);
      expect((await send(app, who, 'post', postId)).statusCode).toBe(201);
    }
    expect(await total()).toBe(6);
    expect((await rowsSeenBy(R)).length).toBe(3);
    expect((await rowsSeenBy(O)).length).toBe(3);
  });

  it('[c4][c5] two simultaneous reports of one post by one user: each answer is 201 or 404 (never 409 for a post, a reported post is unreadable), at most one row', T, async () => {
    const app = await start();
    const target = await seedPost(AU);
    const results = await Promise.all([send(app, R, 'post', target), send(app, R, 'post', target)]);
    for (const r of results) expect([201, 404, 503], r.body).toContain(r.statusCode);
    expect(results.filter((r) => r.statusCode === 201).length).toBeLessThanOrEqual(1);
    expect(await total()).toBeLessThanOrEqual(1);
    const again = await send(app, R, 'post', target);
    expect([201, 404]).toContain(again.statusCode);
    expect(await total()).toBe(1);
  });

  it('[c5] five simultaneous reports by one user leave exactly one row (201 once; 409 or 503 for the rest, never a second row)', T, async () => {
    const app = await start();
    const comment = await seedComment(AU, await seedPost(AU), 1);
    const results = await Promise.all(Array.from({ length: 5 }, () => send(app, R, 'comment', comment)));
    for (const r of results) expect([201, 409, 503], r.body).toContain(r.statusCode);
    expect(results.filter((r) => r.statusCode === 201).length).toBeLessThanOrEqual(1);
    expect(await total()).toBeLessThanOrEqual(1);
    const again = await send(app, R, 'comment', comment);
    expect([201, 409]).toContain(again.statusCode);
    expect(await total()).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.7 c6][S-35] no trace for the reported side', () => {
  it('[c6] the author gets the same feed, post, thread, profile, edit and deletes before and after a report on their post and comment', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const other = await seedPost(AU);
    const comment = await seedComment(AU, postId, 1);
    const sibling = await seedComment(AU, postId, 2);
    const twin = await seedPost(AU, { ago: 4 });
    // The edit and delete answers of the same author on unreported targets: what the answers on the reported ones must equal.
    const editBefore = await patchPost(app, AU.header, other, { body: 'post body' });
    const deleteBefore = await deletePost(app, AU.header, twin);
    const commentDeleteBefore = await deleteComment(app, AU.header, sibling);
    expect([editBefore.statusCode, deleteBefore.statusCode, commentDeleteBefore.statusCode]).toEqual([200, 204, 204]);
    const snap = async () => ({
      feed: JSON.stringify(await feedItems(app, AU)),
      post: (await getPost(app, AU.header, postId)).body,
      thread: (await listComments(app, AU.header, postId)).body,
      profile: (await asAuthor(app, '/api/profile', AU)).body,
      me: (await asAuthor(app, '/api/me', AU)).body,
    });
    const before = await snap();

    expect((await send(app, R, 'comment', comment)).statusCode).toBe(201);
    expect((await send(app, R, 'post', postId)).statusCode).toBe(201);
    expect((await send(app, O, 'post', postId, 'child_safety')).statusCode).toBe(201);

    expect(await snap()).toEqual(before);
    const editAfter = await patchPost(app, AU.header, postId, { body: 'post body' });
    expect([editAfter.statusCode, editAfter.body.replace(postId, '')]).toEqual([editBefore.statusCode, editBefore.body.replace(other, '')]);
    const commentDeleteAfter = await deleteComment(app, AU.header, comment);
    expect([commentDeleteAfter.statusCode, commentDeleteAfter.body]).toEqual([commentDeleteBefore.statusCode, commentDeleteBefore.body]);
    const deleteAfter = await deletePost(app, AU.header, postId);
    expect([deleteAfter.statusCode, deleteAfter.body]).toEqual([deleteBefore.statusCode, deleteBefore.body]);
  });

  it('[c6] the reported account sees the same own profile and /api/me, and another viewer sees the same profile view, before and after', T, async () => {
    const app = await start();
    const own = async () => [(await asAuthor(app, '/api/profile', Y)).body, (await asAuthor(app, '/api/me', Y)).body, (await asAuthor(app, `/api/profiles/${Y.id}`, X)).body];
    const before = await own();
    expect((await send(app, R, 'user', Y.id, 'child_safety')).statusCode).toBe(201);
    expect(await own()).toEqual(before);
  });

  it('[c6] every user but the reporter reads 0 report rows (author, reported user, other reporter, stranger, Professional); no endpoint reads, changes or withdraws one', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    expect((await send(app, R, 'post', postId)).statusCode).toBe(201);
    expect((await send(app, R, 'user', Y.id)).statusCode).toBe(201);
    expect((await rowsSeenBy(R)).length).toBe(2);
    for (const who of [AU, O, Y, X]) expect(await rowsSeenBy(who), who.id).toEqual([]);
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE'] as const) {
      for (const path of ['/api/reports', `/api/reports/${postId}`]) {
        const res = await sendReportMethod(app, R.header, method, path);
        expect(res.statusCode, `${method} ${path}`).toBeGreaterThanOrEqual(400);
        expect(res.statusCode, `${method} ${path}`).toBeLessThan(500);
        expect(res.body).not.toContain('"reason"');
      }
    }
    expect(await total()).toBe(2);
    expect(await listOf(R)).toContain('post:open:');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.7 c7][7א, BR-074] what a report changes, and for whom', () => {
  it('[c7] after a post report the post is gone from the reporter\'s feed and GET /posts/:id is 404; everyone else still reads it', T, async () => {
    const app = await start();
    const reported = await seedPost(AU, { ago: 1 });
    const kept = await seedPost(AU, { ago: 2 });
    expect(await feedIds(app, R)).toEqual(expect.arrayContaining([reported, kept]));
    expect((await send(app, R, 'post', reported, 'child_safety')).statusCode).toBe(201);
    expect(await feedIds(app, R)).toEqual([kept]);
    expect((await getPost(app, R.header, reported)).statusCode).toBe(404);
    expect((await getPost(app, R.header, kept)).statusCode).toBe(200);
    for (const who of [AU, O, Y]) {
      expect(await feedIds(app, who), who.id).toEqual(expect.arrayContaining([reported]));
      expect((await getPost(app, who.header, reported)).statusCode).toBe(200);
    }
  });

  it('[c7] a share of the reported post shows the reporter ERR-033 (original unavailable, the sharer\'s own text kept); others see the original', T, async () => {
    const app = await start();
    const original = await seedPost(AU, { ago: 5 });
    const share = await seedPost(Y, { shared: original, ago: 1 });
    expect((await send(app, R, 'post', original)).statusCode).toBe(201);
    const mine = (await feedItems(app, R)).find((i) => i.id === share);
    expect(mine, 'the share stays in the reporter\'s feed').toBeDefined();
    expect(toRecord(mine?.original)).toEqual({ available: false });
    const theirs = (await feedItems(app, O)).find((i) => i.id === share);
    expect(toRecord(theirs?.original).available).toBe(true);
  });

  it('[c7] a comment or an account report changes nothing for anyone, the reporter included, child_safety too', T, async () => {
    const app = await start();
    const postId = await seedPost(AU);
    const comment = await seedComment(Y, postId, 1);
    const views = async () =>
      JSON.stringify(
        await Promise.all([R, O, AU, Y].flatMap((w) => [feedItems(app, w), listComments(app, w.header, postId).then((r) => r.body), getPost(app, w.header, postId).then((r) => r.body), asAuthor(app, `/api/profiles/${Y.id}`, w).then((r) => [r.statusCode, r.body])])),
      );
    const before = await views();
    expect((await send(app, R, 'comment', comment, 'child_safety')).statusCode).toBe(201);
    expect((await send(app, R, 'user', Y.id, 'child_safety')).statusCode).toBe(201);
    expect(await views()).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.7 c8][FR-FEED-005] an anonymous post\'s report stores the post only', () => {
  it('[c8] reporting an anonymous post: 201 {received:true}; the row has the post id and no comment or user; no author id is in any answer', T, async () => {
    const app = await start();
    const anonymous = await seedPost(AU, { anon: true });
    const res = await send(app, R, 'post', anonymous, 'personal_information', { details: 'חושף פרטים' });
    expect([res.statusCode, JSON.parse(res.body)]).toEqual([201, { received: true }]);
    expect(await rowsSeenBy(R)).toEqual([{ reporter: R.id, kind: 'post', post: anonymous, comment: null, user: null, reason: 'personal_information', details: 'חושף פרטים', status: 'open' }]);
    expect(res.body).not.toContain(AU.id);
    expect(JSON.stringify(res.headers)).not.toContain(AU.id);
    for (const row of await rowsSeenBy(R)) expect(JSON.stringify(row)).not.toContain(AU.id);
  });

  it('[c8] the anonymous post\'s author reporting their own post gets the same 404 as any unavailable target', T, async () => {
    const app = await start();
    const anonymous = await seedPost(AU, { anon: true });
    const res = await send(app, AU, 'post', anonymous);
    expect([res.statusCode, JSON.parse(res.body)]).toEqual([404, GONE]);
    expect(await total()).toBe(0);
  });

  it('[c8] a comment by the author of an anonymous post: the report stores the comment only, never the author\'s account', T, async () => {
    const app = await start();
    const anonymous = await seedPost(AU, { anon: true });
    const byAuthor = await addComment(app, AU.header, anonymous, { body: 'תגובת המחבר' });
    expect(byAuthor.statusCode, byAuthor.body).toBe(201);
    const id = toRecord(toRecord(JSON.parse(byAuthor.body)).comment).id;
    const res = await send(app, R, 'comment', String(id));
    expect(res.statusCode, res.body).toBe(201);
    expect(await rowsSeenBy(R)).toEqual([expect.objectContaining({ kind: 'comment', comment: id, post: null, user: null })]);
    expect(res.body).not.toContain(AU.id);
  });
});
