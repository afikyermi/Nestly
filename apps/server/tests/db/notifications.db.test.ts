import postgres from 'postgres';
import { z } from 'zod';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { ACCOUNT_A, ACCOUNT_B, AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { CLOCK_NOW, buildRegisterApp, captureLog, jsonOf } from '../helpers/register-app.js';
import { createPost } from '../helpers/posts-api.js';
import { addComment } from '../helpers/comments-api.js';
import { act, sendTo } from '../helpers/friends-api.js';
import { addOwnChild, removeOwnChild } from '../../src/services/journeys-service.js';
import { readOwnPrivacy, updateOwnPrivacy } from '../../src/services/privacy-service.js';

// FR-NOTIF-001/002/003 and FR-SEARCH-001 / FR-ALG-008 through the API, against the real database (CI `db` job, as app_server).
// A = Alice Aaron, B = Bella Baruch (10_ fixtures), M the Moderator of 60_ fixtures. Notifications are created by the database's own
// triggers as a side effect of the real actions below; the tests only read them. Every row of A, B is cleared before and after each test.
// What the policies refuse on their own is asserted once in supabase/tests/90_notifications_search.sql.

const T = { timeout: COLD_START_MS };
const M = '60000000-0000-4000-8000-0000000000a1';
const NAME_A = 'Alice Aaron';
const NAME_B = 'Bella Baruch';

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
/** The database of the app started last (a service call shares its pool). */
const database = (): Database => {
  const last = toClose.at(-1);
  if (last === undefined) throw new Error('start() first');
  return last.database;
};
async function start(): Promise<App> {
  const database = createDatabase(url());
  const app = await buildRegisterApp(env(), { database, clock: () => CLOCK_NOW });
  toClose.push({ app, database });
  return app;
}
const bearerFor = async (sub: string): Promise<string> => `Bearer ${await token({ key, sub })}`;
const get = (app: App, header: string, path: string) => app.inject({ method: 'GET', url: path, headers: { authorization: header } });
const post = (app: App, header: string, path: string) => app.inject({ method: 'POST', url: path, headers: { authorization: header } });
const put = (app: App, header: string, path: string, payload: unknown) =>
  app.inject({ method: 'PUT', url: path, headers: { authorization: header, 'content-type': 'application/json' }, payload: JSON.stringify(payload) });

const commentIdOf = (body: string): unknown => z.object({ comment: z.object({ id: z.string() }) }).parse(jsonOf(body)).comment.id;
const listBody = z.object({
  items: z.array(z.object({ id: z.string(), type: z.string(), actorName: z.string().nullable(), targetKind: z.string(), targetId: z.string(), isRead: z.boolean() })),
  unreadCount: z.number(),
});
async function list(app: App, header: string): Promise<z.infer<typeof listBody>> {
  const res = await get(app, header, '/api/notifications');
  expect(res.statusCode, res.body).toBe(200);
  return listBody.parse(JSON.parse(res.body));
}
const clear = async (): Promise<void> => {
  await side`select tests.fx_nt_purge()`;
  for (const who of [ACCOUNT_A, ACCOUNT_B]) {
    await side`select tests.fx_fr_purge(${who}::uuid)`;
    await side`select tests.fx_open_reset(${who}::uuid)`;
  }
  await side`select tests.fx_ns_set_limit(60, 3600)`;
  // a fixture child's birthday (BR-037) must never add a notification to the exact counts below: the birthday test switches it back on
  for (const who of [ACCOUNT_A, ACCOUNT_B]) await side`select tests.fx_nt_pref(${who}::uuid, 'birthdays', false)`;
  for (const who of [ACCOUNT_A, ACCOUNT_B]) {
    // the rolling window forgets searches older than an hour: move any earlier ones out of it (no row yet: nothing to move)
    await side`select tests.fx_ns_age(${who}::uuid, interval '2 hours')`.catch(() => undefined);
  }
};

let hA: string;
let hB: string;
let hM: string;

beforeAll(async () => {
  key = await newKey('notifications-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  hA = await bearerFor(ACCOUNT_A);
  hB = await bearerFor(ACCOUNT_B);
  hM = await bearerFor(M);
}, COLD_START_MS);
beforeEach(clear);
afterEach(async () => {
  for (const { app, database } of toClose.splice(0)) {
    await app.close();
    await database.close();
  }
  await clear();
});
afterAll(async () => {
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

describe('Server-Timing against the real database', () => {
  it('lists each statement of the request (s1..sN) as the request sends it', T, async () => {
    // The app opens its own database from DATABASE_URL, as on a deployment: one module graph for the client and the timing
    // (a database made here would load a second copy of lib/server-timing.ts after buildRegisterApp's module reset).
    const app = await buildRegisterApp(env(), { clock: () => CLOCK_NOW, serverTiming: true });
    let header: string;
    try {
      const res = await get(app, hA, '/api/notifications');
      expect(res.statusCode).toBe(200);
      header = String(res.headers['server-timing']);
    } finally {
      await app.close();
    }
    // the identity entry and the reads are several statements: at least s1 and s2, numbered in order
    expect(header).toMatch(/, s1;dur=[0-9.]+, s2;dur=[0-9.]+/);
  });
});

describe('[FR-NOTIF-001 AC-040] the bell, the list, mark read', () => {
  it('a Friend Request notifies the addressee with the sender\'s name and a link to the sender; Mark as read, then Mark all', T, async () => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    const b = await list(app, hB);
    expect(b.unreadCount).toBe(1);
    expect(b.items).toHaveLength(1);
    expect(b.items[0]).toMatchObject({ type: 'friend_request', actorName: NAME_A, targetKind: 'user', targetId: ACCOUNT_A, isRead: false });
    expect((await list(app, hA)).items, 'the sender is not notified').toHaveLength(0);
    const read = await post(app, hB, `/api/notifications/${b.items[0]?.id}/read`);
    expect(read.statusCode, read.body).toBe(200);
    expect((await list(app, hB)).unreadCount).toBe(0);
    expect((await post(app, hA, `/api/notifications/${b.items[0]?.id}/read`)).statusCode, 'not A\'s notification').toBe(404);
    expect((await post(app, hB, '/api/notifications/read-all')).statusCode).toBe(200);
  });

  it('a comment notifies the post\'s author, a reply the comment\'s author; Mark all as read clears the bell', T, async () => {
    const app = await start();
    const created = await createPost(app, hA, { body: 'שאלה על שינה', audience: 'everyone' });
    expect(created.statusCode, created.body).toBe(201);
    const postId = String(jsonOf(created.body).id);
    const commented = await addComment(app, hB, postId, { body: 'תשובה' });
    expect(commented.statusCode, commented.body).toBe(201);
    const a = await list(app, hA);
    expect(a.items[0]).toMatchObject({ type: 'post_comment', actorName: NAME_B, targetKind: 'post', targetId: postId });
    const replied = await addComment(app, hA, postId, { body: 'תודה', parentId: String(commentIdOf(commented.body)) });
    expect(replied.statusCode, replied.body).toBe(201);
    expect((await list(app, hB)).items.map((i) => i.type)).toEqual(['comment_reply']);
    expect((await post(app, hA, '/api/notifications/read-all')).statusCode).toBe(200);
    expect((await list(app, hA)).unreadCount).toBe(0);
  });

  it('an Admin or Moderator account is refused (403 forbidden); a Guest gets 401 and no query', T, async () => {
    const app = await start();
    const res = await get(app, hM, '/api/notifications');
    expect(res.statusCode).toBe(403);
    expect(jsonOf(res.body).error).toBe('forbidden');
    const guest = await app.inject({ method: 'GET', url: '/api/notifications' });
    expect(guest.statusCode).toBe(401);
  });
});

describe('[FR-NOTIF-002 FR-NOTIF-003 AC-041] preferences', () => {
  it('a category switched off creates no notification; switched on again it does; every category is listed, on by default', T, async () => {
    const app = await start();
    await side`select tests.fx_nt_purge()`; // no stored switch: every category at its default
    const first = await get(app, hA, '/api/notification-preferences');
    expect(first.statusCode, first.body).toBe(200);
    const body = z.object({ categories: z.array(z.object({ category: z.string(), isEnabled: z.boolean() })) }).parse(JSON.parse(first.body));
    expect(body.categories.map((c) => [c.category, c.isEnabled])).toEqual([['friends', true], ['comments', true], ['shares', true], ['friend_posts', true], ['groups', true], ['birthdays', true]]);
    expect((await put(app, hA, '/api/notification-preferences/categories/comments', { isEnabled: false })).statusCode).toBe(200);
    const created = await createPost(app, hA, { body: 'x post', audience: 'everyone' });
    const postId = String(jsonOf(created.body).id);
    await addComment(app, hB, postId, { body: 'muted' });
    expect((await list(app, hA)).items).toHaveLength(0);
    expect((await put(app, hA, '/api/notification-preferences/categories/comments', { isEnabled: true })).statusCode).toBe(200);
    await addComment(app, hB, postId, { body: 'heard' });
    expect((await list(app, hA)).items.map((i) => i.type)).toEqual(['post_comment']);
  });

  it('only a known category with a strict body is accepted (400); the security category does not exist as a switch', T, async () => {
    const app = await start();
    expect((await put(app, hA, '/api/notification-preferences/categories/security', { isEnabled: false })).statusCode).toBe(400);
    expect((await put(app, hA, '/api/notification-preferences/categories/comments', { isEnabled: false, extra: 1 })).statusCode).toBe(400);
    expect((await put(app, hA, '/api/notification-preferences/categories/comments', {})).statusCode).toBe(400);
  });

  it('a new post of a Friend notifies only after the user chose to follow that Friend, and never for an anonymous post', T, async () => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    expect((await post(app, hB, `/api/friend-requests/${ACCOUNT_A}/accept`)).statusCode).toBe(200);
    expect((await list(app, hA)).items.map((i) => i.type)).toEqual(['friend_accepted']);
    const prefs = z.object({ friends: z.array(z.object({ userId: z.string(), fullName: z.string(), isEnabled: z.boolean() })) }).parse(JSON.parse((await get(app, hB, '/api/notification-preferences')).body));
    expect(prefs.friends).toEqual([{ userId: ACCOUNT_A, fullName: NAME_A, isEnabled: false }]);
    await createPost(app, hA, { body: 'before following', audience: 'everyone' });
    expect((await list(app, hB)).items.map((i) => i.type)).toEqual(['friend_request']);
    expect((await put(app, hB, `/api/notification-preferences/friends/${ACCOUNT_A}`, { isEnabled: true })).statusCode).toBe(200);
    await createPost(app, hA, { body: 'after following', audience: 'everyone' });
    await createPost(app, hA, { body: 'anonymous after following', audience: 'everyone', isAnonymous: true });
    expect((await list(app, hB)).items.map((i) => i.type).sort()).toEqual(['friend_post', 'friend_request']);
    expect((await put(app, hA, `/api/notification-preferences/friends/${M}`, { isEnabled: true })).statusCode, 'not a Friend').toBe(404);
  });
});

describe("[FR-NOTIF-003 BR-037 AC-046] a Friend's child's birthday", () => {
  it('a Friend is notified on the birthday, named by the parent and leading to the parent; never when the parent switched it off', T, async () => {
    const app = await start();
    expect((await sendTo(app, hA, ACCOUNT_B)).statusCode).toBe(201);
    expect((await act(app, hB, 'accept', ACCOUNT_A)).statusCode).toBe(200);
    await side`select tests.fx_nt_pref(${ACCOUNT_B}::uuid, 'birthdays', true)`;
    // A's child turns two today (Israel's date)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    const born = `${Number(today.slice(0, 4)) - 2}${today.slice(4)}`;
    const added = await addOwnChild(database(), { userId: ACCOUNT_A }, { name: 'תמר', sex: 'girl', birthDate: born });
    if (added.kind !== 'journeys') throw new Error(`could not add a child: ${added.kind}`);
    const childId = added.journeys.children.find((c) => c.name === 'תמר')?.id;
    const privacy = await readOwnPrivacy(database(), { userId: ACCOUNT_A });
    if (privacy.kind !== 'settings') throw new Error('no privacy settings');
    try {
      const birthdays = (await list(app, hB)).items.filter((item) => item.type === 'child_birthday');
      expect(birthdays).toContainEqual(expect.objectContaining({ actorName: NAME_A, targetKind: 'user', targetId: ACCOUNT_A, isRead: false }));
      expect(JSON.stringify(birthdays)).not.toContain('תמר'); // the child is never named (FR-PRIV-001)
      expect((await list(app, hA)).items.filter((item) => item.type === 'child_birthday'), 'a parent is not told of its own child').toHaveLength(0);
      const again = (await list(app, hB)).items.filter((item) => item.type === 'child_birthday');
      expect(again).toHaveLength(birthdays.length); // once per birthday

      await side`select tests.fx_nt_purge()`;
      expect((await updateOwnPrivacy(database(), { userId: ACCOUNT_A }, { ...privacy.settings, isChildBirthdayShared: false })).kind).toBe('settings');
      expect((await list(app, hB)).items.filter((item) => item.type === 'child_birthday'), 'BR-037: the parent switched it off').toHaveLength(0);
    } finally {
      await updateOwnPrivacy(database(), { userId: ACCOUNT_A }, privacy.settings);
      if (childId !== undefined) await removeOwnChild(database(), { userId: ACCOUNT_A }, childId);
    }
  });
});

describe('[FR-SEARCH-001 AC-039 AC-065 AC-078] search', () => {
  const find = async (app: App, header: string, q: string, type = 'all') =>
    app.inject({ method: 'POST', url: '/api/search', headers: { authorization: header }, payload: { q, type } });

  it('finds a person by name and a post by its words, ranked after authorization; never the caller; groups are empty', T, async () => {
    const app = await start();
    await createPost(app, hA, { body: 'מי מכירה יועצת שינה טובה?', audience: 'everyone' });
    await createPost(app, hA, { body: 'פוסט לחברים בלבד על שינה', audience: 'friends' });
    const res = await find(app, hB, 'שינה');
    expect(res.statusCode, res.body).toBe(200);
    const body = z.object({ groups: z.array(z.unknown()), posts: z.array(z.object({ snippet: z.string(), authorName: z.string().nullable() })) }).parse(JSON.parse(res.body));
    expect(body.posts.map((p) => p.snippet)).toContain('מי מכירה יועצת שינה טובה?');
    expect(body.posts.map((p) => p.snippet), 'a Friends-only post of a non-Friend is not found').not.toContain('פוסט לחברים בלבד על שינה');
    expect(body.posts.every((p) => p.authorName === NAME_A)).toBe(true);
    expect(body.groups).toEqual([]);
    const peopleBody = z.object({ people: z.array(z.object({ userId: z.string(), fullName: z.string() })) });
    const people = peopleBody.parse(JSON.parse((await find(app, hB, 'alice', 'people')).body));
    expect(people.people).toEqual([{ userId: ACCOUNT_A, fullName: NAME_A }]);
    const self = peopleBody.parse(JSON.parse((await find(app, hA, 'alice', 'people')).body));
    expect(self.people).toEqual([]);
  });

  it('[Afik 20.10.2026: the typed text is never stored] no log line of a search, answered, refused or limited, carries the text', T, async () => {
    const database = createDatabase(url());
    const log = captureLog();
    const app = await buildRegisterApp(env(), { database, clock: () => CLOCK_NOW, logStream: log.stream });
    toClose.push({ app, database });
    const marker = 'zqxmarker שינה';
    await createPost(app, hA, { body: `פוסט עם ${marker}`, audience: 'everyone' });
    const send = (payload: unknown) => app.inject({ method: 'POST', url: '/api/search', payload: JSON.stringify(payload), headers: { authorization: hB, 'content-type': 'application/json' } });
    expect((await send({ q: marker })).statusCode).toBe(200);
    expect((await send({ q: marker, type: 'people' })).statusCode).toBe(200);
    expect((await send({ q: marker, extra: 1 })).statusCode).toBe(400);
    await side`select tests.fx_ns_set_limit(1, 3600)`;
    await send({ q: marker, type: 'people' });
    expect((await send({ q: marker, type: 'people' })).statusCode).toBe(429);
    const text = log.text();
    expect(text.length, 'something was logged, so the check is not vacuous').toBeGreaterThan(0);
    expect(text).not.toContain('zqxmarker');
    expect(text).not.toContain(encodeURIComponent('zqxmarker'));
  });

  // B's searches in the earlier tests stored their topics (one per topic and day): start from none, so the ranking and the count are this test's.
  const clearIntents = async (): Promise<void> => {
    await side`select tests.fx_si_age(${ACCOUNT_B}::uuid, interval '31 days')`;
    await side`select tests.fx_si_purge()`;
  };

  it('[FR-ALG-008 Afik 20.10.2026] after a search, a post matching its topic ranks up in the searcher\'s feed (and only theirs)', T, async () => {
    const app = await start();
    await clearIntents();
    const ids = (body: string): string[] => z.object({ items: z.array(z.object({ id: z.string() })) }).parse(JSON.parse(body)).items.map((i) => i.id);
    const sleepPost = String(jsonOf((await createPost(app, hA, { body: 'מחפשת יועצת שינה לתינוק בן חצי שנה', audience: 'everyone' })).body).id);
    const plainPost = String(jsonOf((await createPost(app, hA, { body: 'בוקר טוב לכולן', audience: 'everyone' })).body).id);
    const order = async (header: string): Promise<string[]> => ids((await get(app, header, '/api/feed')).body).filter((id) => id === sleepPost || id === plainPost);
    expect(await order(hB), 'before any search the newer post leads').toEqual([plainPost, sleepPost]);
    expect((await find(app, hB, 'הרדמה')).statusCode).toBe(200);
    expect(await order(hB), 'the searcher now sees the matching post first').toEqual([sleepPost, plainPost]);
    expect(await order(hA), 'another viewer is not affected').toEqual([plainPost, sleepPost]);
  });

  it('no query, a one-character query and another key are 400; nothing is listed without a query (AC-078)', T, async () => {
    const app = await start();
    for (const payload of [{}, { q: '' }, { q: 'a' }, { q: 'alice', x: 1 }, { q: 'alice', type: 'users' }]) {
      const res = await app.inject({ method: 'POST', url: '/api/search', headers: { authorization: hB }, payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect((await get(app, hB, '/api/search?q=alice')).statusCode, 'the text is never accepted in a URL').not.toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/search', payload: { q: 'alice' } })).statusCode).toBe(401);
  });

  it('the People Search limit: over it 429 for people, and "peopleLimited" with the posts still answered for all; one Security event', T, async () => {
    const app = await start();
    await side`select tests.fx_ns_set_limit(2, 3600)`;
    const [before] = await side`select tests.fx_ns_events(${ACCOUNT_B}::uuid) as n`;
    const eventsBefore = Number(before?.n);
    expect((await find(app, hB, 'alice', 'people')).statusCode).toBe(200);
    expect((await find(app, hB, 'alice', 'people')).statusCode).toBe(200);
    const limited = await find(app, hB, 'alice', 'people');
    expect(limited.statusCode).toBe(429);
    expect(jsonOf(limited.body)).toEqual({ error: 'rate_limited' });
    const all = z.object({ peopleLimited: z.boolean(), people: z.array(z.unknown()) }).parse(JSON.parse((await find(app, hB, 'alice')).body));
    expect(all.peopleLimited).toBe(true);
    expect(all.people).toEqual([]);
    const [events] = await side`select tests.fx_ns_events(${ACCOUNT_B}::uuid) as n`;
    expect(Number(events?.n) - eventsBefore).toBe(1);
  });

  it('a Moderator is refused (403); the typed text is never stored, only the detected topic, for 30 days', T, async () => {
    const app = await start();
    expect((await find(app, hM, 'alice')).statusCode).toBe(403);
    await clearIntents();
    const before = await side`select tests.fx_si_count(${ACCOUNT_B}::uuid) as n`;
    await find(app, hB, 'יועצת שינה לתינוק');
    await find(app, hB, 'alice');
    const after = await side`select tests.fx_si_count(${ACCOUNT_B}::uuid) as n`;
    expect(Number(after[0]?.n) - Number(before[0]?.n), 'sleep and baby_health? only the topics found; "alice" has none').toBeGreaterThanOrEqual(1);
    const stored = await side`select tests.fx_si_topics(${ACCOUNT_B}::uuid) as t`;
    expect(String(stored[0]?.t)).toContain('sleep');
    expect(String(stored[0]?.t)).not.toContain('יועצת');
    await side`select tests.fx_si_age(${ACCOUNT_B}::uuid, interval '31 days')`;
    const [purged] = await side`select tests.fx_si_purge() as n`;
    expect(Number(purged?.n)).toBeGreaterThanOrEqual(1);
  });
});

