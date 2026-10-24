import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { feedPageResponse, professionalHomeResponse, type FeedUnit, type ProfessionalProfileWrite } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { readDatabaseFault } from '../../src/lib/pg-error.js';
import { blockUser } from '../../src/services/blocks-service.js';
import { openThread, sendMessage } from '../../src/services/chat-service.js';
import { createComment } from '../../src/services/comments-service.js';
import { readFeedPage } from '../../src/services/feed-service.js';
import { createGroup } from '../../src/services/groups-service.js';
import { likeTarget } from '../../src/services/likes-service.js';
import { createPost, readPostById } from '../../src/services/posts-service.js';
import {
  acceptOutreach,
  editReview,
  listOutreach,
  offerHelp,
  readProfessional,
  readProfessionalHome,
  registerProfessional,
  removeReview,
  writeReview,
} from '../../src/services/professionals-service.js';
import { fileReport } from '../../src/services/reports-service.js';
import { activeReportReasons } from '../../src/services/team-service.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';

// I11 completion C (decisions-in-force §13.1-13.4, §11.10, §11.20-11.22; migration 20261024000000) through the services against the real
// database (CI `db` job, as app_server): Offer Help on any post the Professional may read (named, anonymous, loss), never a Friends-only post,
// a Private Group it is not in, a Professional's post, a share, or across a block; one per post and 100 a day; the feed and the post page tell
// a Professional where it may offer; it comments and likes like anyone; "בקשות עזרה" by its field; reviews one per parent, edited ("נערכה")
// and deleted by the writer; the reviewed Professional's four report reasons. The policies themselves are pgTAP's (file 108).

const T = { timeout: COLD_START_MS };
const LONG = { timeout: COLD_START_MS * 4 };

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let app: App;
let mia = '';
let noa = '';
let gil = '';
let doula = '';
let sleeper = '';
let busy = '';
const tag = `i11c${Date.now().toString(36)}`;

const url = (): string => {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
};
const text = async (query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> => String((await query)[0]?.v);
const as = (userId: string) => ({ userId });
const isOk = <T extends { kind: string }>(outcome: T): outcome is Extract<T, { kind: 'ok' }> => outcome.kind === 'ok';
function ok<T extends { kind: string }>(outcome: T): Extract<T, { kind: 'ok' }> {
  expect(outcome.kind).toBe('ok');
  if (!isOk(outcome)) throw new Error(`expected ok, got ${outcome.kind}`);
  return outcome;
}
const sqlstate = (work: Promise<unknown>): Promise<string | undefined> =>
  work.then(
    () => undefined,
    (error: unknown) => readDatabaseFault(error)?.code,
  );

const profile = (over: Partial<ProfessionalProfileWrite> = {}): ProfessionalProfileWrite => ({
  fullName: 'Dafna Doula',
  businessName: null,
  gender: 'woman',
  field: 'doula',
  fieldOther: null,
  yearsExperience: 5,
  area: 'center',
  about: null,
  priceFrom: null,
  ...over,
});

const feedOf = async (viewer: string): Promise<FeedUnit[]> => {
  const outcome = await readFeedPage(database, as(viewer), null);
  if (outcome.kind !== 'page') throw new Error(`no page: ${outcome.kind}`);
  return feedPageResponse.parse(outcome.page).items;
};
const pageOf = async (viewer: string, postId: string) => {
  const outcome = await readPostById(database, as(viewer), postId);
  if (outcome.kind !== 'post') throw new Error(`no post: ${outcome.kind}`);
  return outcome.post;
};

beforeAll(async () => {
  key = await newKey('i11c-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  app = await buildRegisterApp({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() }, { database, clock: () => CLOCK_NOW });
  const made: string[] = [];
  for (const fullName of ['Mia Regular', 'Noa Regular', 'Gil Regular']) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, `Bearer ${await token({ key, sub: userId })}`, validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  [mia = '', noa = '', gil = ''] = made;
  doula = await text(side`select tests.fx_new_auth_user()::text as v`);
  sleeper = await text(side`select tests.fx_new_auth_user()::text as v`);
  busy = await text(side`select tests.fx_new_auth_user()::text as v`);
  expect(await registerProfessional(database, as(doula), profile())).toEqual({ kind: 'created' });
  expect(await registerProfessional(database, as(sleeper), profile({ fullName: 'Shir Sleep', field: 'sleep' }))).toEqual({ kind: 'created' });
  expect(await registerProfessional(database, as(busy), profile({ fullName: 'Bat Busy', field: 'other', fieldOther: 'ליווי' }))).toEqual({ kind: 'created' });
}, COLD_START_MS * 3);

afterAll(async () => {
  await app.close();
  await database.close();
  await side.end();
  await jwks.close();
  restoreEnv();
});

describe('[I11-C] Offer Help on any post the Professional may see', () => {
  it('[FR-SERV-005 AC-014 AC-169] offers on a plain, an anonymous and a loss post; never Friends-only, a Private Group, a Professional post or across a block', LONG, async () => {
    const plain = await createPost(database, as(mia), { body: `שאלה על לידה ${tag}`, audience: 'everyone' });
    const anonymous = await createPost(database, as(noa), { body: `פוסט אנונימי על הריון ${tag}`, audience: 'everyone', isAnonymous: true });
    const loss = await createPost(database, as(mia), { body: `איבדנו את ההריון ${tag}`, audience: 'everyone', stageTag: 'pregnant' });
    const friendsOnly = await createPost(database, as(mia), { body: `רק לחברים ${tag}`, audience: 'friends' });
    const professionalPost = await createPost(database, as(sleeper), { body: `טיפ על שינה ${tag}`, audience: 'everyone' });
    const group = ok(await createGroup(database, as(gil), { name: `קבוצה סגורה ${tag}`, privacy: 'private' })).value;
    const inGroup = await createPost(database, as(gil), { body: `בקבוצה ${tag}`, audience: 'everyone', groupId: group.id });

    ok(await offerHelp(database, as(doula), plain.id, 'אשמח לעזור'));
    ok(await offerHelp(database, as(doula), anonymous.id, 'אשמח לעזור גם כאן'));
    ok(await offerHelp(database, as(doula), loss.id, 'אני כאן אם צריך'));
    expect(await offerHelp(database, as(doula), plain.id, 'שוב')).toEqual({ kind: 'already_done' });
    for (const refused of [friendsOnly.id, professionalPost.id, inGroup.id]) expect(await offerHelp(database, as(doula), refused, 'הצעה')).toEqual({ kind: 'not_allowed' });
    expect(await offerHelp(database, as(noa), plain.id, 'לא בעלת מקצוע')).toEqual({ kind: 'not_allowed' });

    // a named post across a block is refused; the anonymous one of the same author is not (its author is not known to the Professional)
    expect((await blockUser(database, as(noa), sleeper)).kind).toBe('done');
    const noaNamed = await createPost(database, as(noa), { body: `שאלה של נועה ${tag}`, audience: 'everyone' });
    expect(await offerHelp(database, as(sleeper), noaNamed.id, 'הצעה')).toEqual({ kind: 'not_allowed' });
    ok(await offerHelp(database, as(sleeper), anonymous.id, 'הצעה על פוסט אנונימי'));

    // AC-147: the author of the anonymous post sees the offers; nobody learns who she is
    const received = (await listOutreach(database, as(noa))).received.filter((item) => item.postId === anonymous.id);
    expect(received).toHaveLength(2);
    const sent = (await listOutreach(database, as(doula))).sent.find((item) => item.postId === anonymous.id);
    expect(sent?.conversationId ?? null).toBeNull();
    expect(JSON.stringify(sent)).not.toContain(noa);
  });

  it('[FR-SERV-005 AC-169] the feed and the post page tell only a Professional where it may offer, and that it already did', T, async () => {
    const fresh = await createPost(database, as(mia), { body: `פוסט חדש על לידה ${tag}`, audience: 'everyone' });
    const proPost = await createPost(database, as(sleeper), { body: `עוד טיפ ${tag}`, audience: 'everyone' });
    expect((await feedOf(doula)).find((unit) => unit.id === fresh.id)).toMatchObject({ offerHelp: 'available' });
    expect((await feedOf(doula)).find((unit) => unit.id === proPost.id)).not.toHaveProperty('offerHelp');
    expect(await pageOf(doula, fresh.id)).toMatchObject({ offerHelp: 'available' });
    expect((await feedOf(noa)).find((unit) => unit.id === fresh.id)).not.toHaveProperty('offerHelp');
    expect(await pageOf(noa, fresh.id)).not.toHaveProperty('offerHelp');
    ok(await offerHelp(database, as(doula), fresh.id, 'אשמח לעזור'));
    expect((await feedOf(doula)).find((unit) => unit.id === fresh.id)).toMatchObject({ offerHelp: 'sent' });
    expect(await pageOf(doula, fresh.id)).toMatchObject({ offerHelp: 'sent' });
    // another Professional still may: one per post per Professional
    expect(await pageOf(busy, fresh.id)).toMatchObject({ offerHelp: 'available' });
  });

  it('[FR-SERV-008 BR-009 AC-014] 100 Offer Help a day: the 100th passes, the 101st is refused (429); the home counts X of 100', LONG, async () => {
    const ids: string[] = [];
    for (let i = 0; i < 101; i += 1) ids.push((await createPost(database, as(gil), { body: `פוסט ${i} ${tag}`, audience: 'everyone' })).id);
    for (const [i, id] of ids.slice(0, 100).entries()) expect((await offerHelp(database, as(busy), id, `הצעה ${i}`)).kind, `offer ${i + 1}`).toBe('ok');
    expect(await offerHelp(database, as(busy), ids[100] ?? '', 'הצעה 101')).toEqual({ kind: 'rate_limited' });
    const home = ok(await readProfessionalHome(database, as(busy))).dashboard;
    expect(home).toMatchObject({ offersToday: 100, offersPerDay: 100 });
  });

  it('[FR-FEED-002 FR-FEED-003 AC-061 AC-170] a Professional comments and likes a Regular post, an anonymous one too', T, async () => {
    const anonymous = await createPost(database, as(mia), { body: `שאלה אנונימית ${tag}`, audience: 'everyone', isAnonymous: true });
    const named = await createPost(database, as(mia), { body: `שאלה גלויה ${tag}`, audience: 'everyone' });
    for (const target of [anonymous.id, named.id]) {
      expect((await createComment(database, as(doula), target, { body: 'תגובה מקצועית' })).kind).toBe('comment');
      expect((await likeTarget(database, as(doula), 'post', target)).kind).toBe('done');
      expect(await pageOf(gil, target)).toMatchObject({ likeCount: 1, commentCount: 1 });
    }
  });
});

describe('[I11-C] "בקשות עזרה" by the Professional field (§13.4)', () => {
  it('[FR-SERV-005 FR-PRO-001 PG-057 AC-018 AC-171] a post on sleep reaches the sleep consultant, not the doula; "other" sees every field', T, async () => {
    const onSleep = await createPost(database, as(noa), { body: `בעיות שינה בלילה ${tag}`, audience: 'everyone' });
    const onBirth = await createPost(database, as(gil), { body: `מתי מתחילים צירים? ${tag}`, audience: 'everyone' });
    const helpOf = async (who: string) => {
      const res = await app.inject({ method: 'GET', url: '/api/professional/home?path=professional%2Fhome', headers: { authorization: `Bearer ${await token({ key, sub: who })}` } });
      expect(res.statusCode, res.body).toBe(200);
      return professionalHomeResponse.parse(JSON.parse(res.body)).helpRequests.map((item) => item.postId);
    };
    // noa blocked the sleep consultant: her named post is not for it; gil's post is about birth
    const sleepNoBlock = await createPost(database, as(gil), { body: `קשיי הרדמה ${tag}`, audience: 'everyone' });
    const sleepList = await helpOf(sleeper);
    expect(sleepList).toContain(sleepNoBlock.id);
    expect(sleepList).not.toContain(onSleep.id);
    expect(sleepList).not.toContain(onBirth.id);
    const doulaList = await helpOf(doula);
    expect(doulaList).toContain(onBirth.id);
    expect(doulaList).not.toContain(sleepNoBlock.id);
    expect(await helpOf(busy)).toEqual(expect.arrayContaining([onBirth.id, sleepNoBlock.id]));
  });
});

describe('[I11-C] reviews: one per parent, edited and deleted by the writer (§11.21)', () => {
  it('[FR-SERV-011 BR-072 AC-093 AC-172] write, a second is 409, edit shows editedAt and moves the average, others cannot edit, the writer deletes', LONG, async () => {
    const asked = await createPost(database, as(gil), { body: `צריכה ליווי ללידה ${tag}`, audience: 'everyone' });
    const offer = ok(await offerHelp(database, as(doula), asked.id, 'אשמח ללוות'));
    const conversationId = ok(await acceptOutreach(database, as(gil), offer.id)).conversationId;
    expect(ok(await readProfessional(database, as(gil), doula)).page.reviewableConversationId).toBeNull(); // the Professional has not replied yet
    ok(await sendMessage(database, as(doula), conversationId, 'בשמחה, מתי נוח?'));
    expect(ok(await openThread(database, as(gil), conversationId)).thread.messages.length).toBeGreaterThanOrEqual(2);

    ok(await writeReview(database, as(gil), doula, { rating: 3, text: `סבירה ${tag}` }));
    expect(await writeReview(database, as(gil), doula, { rating: 5, text: 'שנייה' })).toEqual({ kind: 'already_done' });
    const mine = ok(await readProfessional(database, as(gil), doula)).page;
    expect(mine.myReview).toMatchObject({ rating: 3, text: `סבירה ${tag}`, editedAt: null });
    expect(ok(await readProfessional(database, as(noa), doula)).page.myReview).toBeNull();
    expect(ok(await readProfessional(database, as(doula), doula)).page.myReview).toBeNull();

    ok(await editReview(database, as(gil), doula, { rating: 5, text: `מצוינת אחרי הכול ${tag}` }));
    const edited = ok(await readProfessional(database, as(noa), doula)).page;
    const review = edited.reviews.find((item) => item.text === `מצוינת אחרי הכול ${tag}`);
    expect(review).toMatchObject({ rating: 5 });
    expect(review?.editedAt).not.toBeNull();
    expect(edited.rating).toBe(5);
    expect(edited.reviews.some((item) => item.text === `סבירה ${tag}`)).toBe(false);

    expect(await editReview(database, as(noa), doula, { rating: 1, text: 'לא שלי' })).toEqual({ kind: 'unavailable' });
    expect(await removeReview(database, as(noa), doula)).toEqual({ kind: 'unavailable' });
    expect(await editReview(database, as(doula), doula, { rating: 1, text: 'עריכה עצמית' })).toEqual({ kind: 'unavailable' });

    ok(await removeReview(database, as(gil), doula));
    const after = ok(await readProfessional(database, as(noa), doula)).page;
    expect(after.reviews.some((item) => item.id === review?.id)).toBe(false);
    expect(ok(await readProfessional(database, as(gil), doula)).page.myReview).toBeNull();
    expect(await removeReview(database, as(gil), doula)).toEqual({ kind: 'unavailable' });
    // a new one may be written after deleting (the conversation still stands)
    ok(await writeReview(database, as(gil), doula, { rating: 4, text: `שוב ${tag}` }));
  });

  it('[FR-MOD-001 AC-150 AC-174] the reviewed Professional reports with the four review reasons; anyone else is refused them', T, async () => {
    const review = ok(await readProfessional(database, as(noa), doula)).page.reviews.find((item) => item.text === `שוב ${tag}`);
    if (review === undefined) throw new Error('no review');
    expect(await fileReport(database, as(doula), { targetKind: 'review', targetId: review.id, reason: 'review_false', details: null })).toEqual({ kind: 'received' });
    expect(await sqlstate(fileReport(database, as(noa), { targetKind: 'review', targetId: review.id, reason: 'review_offensive', details: null }))).toBe('23514');
    expect(await sqlstate(fileReport(database, as(sleeper), { targetKind: 'review', targetId: review.id, reason: 'review_personal_info', details: null }))).toBe('23514');
    expect(await fileReport(database, as(noa), { targetKind: 'review', targetId: review.id, reason: 'harassment', details: null })).toEqual({ kind: 'received' });
    // the community list a reporter reads never offers the four
    const keys = (await activeReportReasons(database, as(noa))).map((item) => item.key);
    expect(keys).toContain('other');
    expect(keys.some((item) => item.startsWith('review_'))).toBe(false);
  });
});
