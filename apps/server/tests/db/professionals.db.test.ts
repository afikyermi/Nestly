import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { feedPageResponse, type ProfessionalProfileWrite } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { openThread, sendMessage, startChat } from '../../src/services/chat-service.js';
import { readFeedPage } from '../../src/services/feed-service.js';
import { createPost } from '../../src/services/posts-service.js';
import {
  acceptOutreach,
  changeFollow,
  createArticle,
  declineOutreach,
  editArticle,
  listOutreach,
  listProfessionals,
  offerHelp,
  readAccountKind,
  readProfessional,
  readProfessionalHome,
  registerProfessional,
  removeArticle,
  writeReview,
} from '../../src/services/professionals-service.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';

// Professionals and services (I11) through the services against the real database (CI `db` job, as app_server): a Professional registers
// (FR-PROREG-001/002), the directory filters (FR-SERV-002, AC-009), Follow (FR-FOLLOW-001) and a followers-only post (AC-130), a Regular
// writes to a Professional with no request (FR-SERV-004, AC-010), Offer Help on a post that asks for help, once, accepted into a conversation
// (FR-SERV-005/006/008, AC-011..013), a review on it (FR-SERV-011, AC-093), articles (FR-PRO-003, AC-094) and the Professional's home
// (FR-PRO-001, AC-018). The policies themselves are pgTAP's (file 97). Every account is registered fresh, so earlier runs' rows never meet these.

const T = { timeout: COLD_START_MS };

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let app: App;
let rina = '';
let tal = '';
let doula = '';
let sleeper = '';
const tag = `i11${Date.now().toString(36)}`;

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

const profile = (over: Partial<ProfessionalProfileWrite> = {}): ProfessionalProfileWrite => ({
  fullName: 'Dana Doula',
  businessName: null,
  gender: 'woman',
  field: 'doula',
  fieldOther: null,
  yearsExperience: 9,
  area: 'tel_aviv',
  about: `ליווי לידה ${tag}`,
  priceFrom: 1500,
  ...over,
});

beforeAll(async () => {
  key = await newKey('pro-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  app = await buildRegisterApp({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() }, { database, clock: () => CLOCK_NOW });
  const made: string[] = [];
  for (const fullName of ['Rina Regular', 'Tal Regular']) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, `Bearer ${await token({ key, sub: userId })}`, validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  [rina = '', tal = ''] = made;
  doula = await text(side`select tests.fx_new_auth_user()::text as v`);
  sleeper = await text(side`select tests.fx_new_auth_user()::text as v`);
}, COLD_START_MS * 3);

afterAll(async () => {
  await app.close();
  await database.close();
  await side.end();
  await jwks.close();
  restoreEnv();
});

describe('[I11] Professionals and services', () => {
  it('[FR-PROREG-001/002] a Professional registers once, with its profile; the account kind follows', T, async () => {
    expect(await registerProfessional(database, as(doula), profile())).toEqual({ kind: 'created' });
    expect(await registerProfessional(database, as(doula), profile())).toEqual({ kind: 'already_registered' });
    expect(await registerProfessional(database, as(sleeper), profile({ fullName: 'Shai Sleep', field: 'sleep', area: 'haifa', priceFrom: 300, yearsExperience: 2 }))).toEqual({
      kind: 'created',
    });
    expect(await readAccountKind(database, as(doula))).toBe('professional');
    expect(await readAccountKind(database, as(rina))).toBe('regular');
    expect(await registerProfessional(database, as(rina), profile())).toEqual({ kind: 'already_registered' });
  });

  it('[FR-SERV-001/002 AC-009] the directory filters by field, area, price and experience', T, async () => {
    const ids = async (query: Parameters<typeof listProfessionals>[2]) => (await listProfessionals(database, as(rina), query)).map((card) => card.id);
    expect(await ids({ field: 'doula' })).toContain(doula);
    expect(await ids({ field: 'doula' })).not.toContain(sleeper);
    expect(await ids({ area: 'haifa' })).toContain(sleeper);
    expect(await ids({ area: 'haifa' })).not.toContain(doula);
    expect(await ids({ maxPrice: 500 })).toContain(sleeper);
    expect(await ids({ maxPrice: 500 })).not.toContain(doula);
    expect(await ids({ minYears: 5 })).toContain(doula);
    expect(await ids({ minYears: 5 })).not.toContain(sleeper);
    expect(await ids({})).toEqual(expect.arrayContaining([doula, sleeper]));
    expect(await listProfessionals(database, as(doula), {})).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: doula })]));
  });

  it('[FR-FOLLOW-001 AC-035 AC-130] follow, a followers-only post with the "יועץ · תחום" tag, unfollow', T, async () => {
    expect(await changeFollow(database, as(rina), rina, true)).toEqual({ kind: 'invalid' });
    expect(await changeFollow(database, as(doula), tal, true)).toEqual({ kind: 'not_allowed' });
    ok(await changeFollow(database, as(rina), doula, true));
    ok(await changeFollow(database, as(rina), doula, true));
    const page = ok(await readProfessional(database, as(rina), doula)).page;
    expect(page.isFollowing).toBe(true);
    expect(page.canChat).toBe(true);
    const created = await createPost(database, as(doula), { body: `רק לעוקבים ${tag}`, audience: 'followers' });
    expect(created.audience).toBe('followers');
    const feedOf = async (viewer: string) => {
      const outcome = await readFeedPage(database, as(viewer), null);
      if (outcome.kind !== 'page') throw new Error(`no page: ${outcome.kind}`);
      return feedPageResponse.parse(outcome.page).items;
    };
    const mine = (await feedOf(rina)).find((unit) => unit.id === created.id);
    expect(mine).toBeDefined();
    expect(mine !== undefined && !mine.isAnonymous ? mine.author : null).toEqual({ name: 'Dana Doula', tag: 'יועץ · דולה' });
    expect((await feedOf(tal)).some((unit) => unit.id === created.id)).toBe(false);
    const home = ok(await readProfessionalHome(database, as(doula)));
    expect(home.dashboard.followers).toBe(1);
    ok(await changeFollow(database, as(rina), doula, false));
    expect((await feedOf(rina)).some((unit) => unit.id === created.id)).toBe(false);
  });

  it('[FR-SERV-004 AC-010] a Regular writes to a Professional with no request; a Professional cannot start one with a Regular', T, async () => {
    const started = ok(await startChat(database, as(tal), sleeper, 'שלום, אפשר לשאול על שינה?'));
    expect(started.result.kind).toBe('conversation');
    const back = await startChat(database, as(doula), tal, 'היי');
    expect(back.kind).not.toBe('ok');
  });

  it('[FR-SERV-005/006/008 AC-011 AC-012 AC-013 AC-093] Offer Help once, accepted into a conversation, then a review', T, async () => {
    const help = await createPost(database, as(rina), { body: `עזרה בהנקה ${tag}`, audience: 'everyone', isHelpRequest: true });
    const plain = await createPost(database, as(rina), { body: `סתם ${tag}`, audience: 'everyone' });
    expect(await offerHelp(database, as(doula), plain.id, 'אשמח לעזור')).toEqual({ kind: 'not_allowed' });
    expect(await offerHelp(database, as(tal), help.id, 'אשמח לעזור')).toEqual({ kind: 'not_allowed' });
    const offer = ok(await offerHelp(database, as(doula), help.id, 'אשמח לעזור בהנקה'));
    expect(await offerHelp(database, as(doula), help.id, 'שוב')).toEqual({ kind: 'already_done' });
    const second = ok(await offerHelp(database, as(sleeper), help.id, 'גם אני'));
    const received = (await listOutreach(database, as(rina))).received;
    expect(received.map((item) => item.id)).toEqual(expect.arrayContaining([offer.id, second.id]));
    expect((await listOutreach(database, as(doula))).sent.map((item) => item.id)).toContain(offer.id);
    expect((await listOutreach(database, as(tal))).received).toEqual([]);
    expect(ok(await readProfessional(database, as(rina), doula)).page.reviewableConversationId).toBeNull();
    ok(await declineOutreach(database, as(rina), second.id));
    expect(await acceptOutreach(database, as(doula), offer.id)).toEqual({ kind: 'unavailable' });
    const accepted = ok(await acceptOutreach(database, as(rina), offer.id));
    expect(await acceptOutreach(database, as(rina), offer.id)).toEqual({ kind: 'unavailable' });
    const thread = ok(await openThread(database, as(doula), accepted.conversationId)).thread;
    expect(thread.messages[0]).toMatchObject({ text: 'אשמח לעזור בהנקה', isOpening: true, mine: true });
    expect(await writeReview(database, as(rina), doula, { rating: 5, text: 'מצוינת' })).toEqual({ kind: 'not_allowed' });
    ok(await sendMessage(database, as(doula), accepted.conversationId, 'איך אפשר לעזור?'));
    ok(await sendMessage(database, as(rina), accepted.conversationId, 'תודה'));
    ok(await writeReview(database, as(rina), doula, { rating: 4, text: 'מקצועית ונעימה' }));
    expect(await writeReview(database, as(rina), doula, { rating: 5, text: 'שוב' })).toEqual({ kind: 'already_done' });
    const page = ok(await readProfessional(database, as(tal), doula)).page;
    expect(page.rating).toBe(4);
    expect(page.reviewCount).toBe(1);
    expect(page.reviews[0]).toMatchObject({ rating: 4, text: 'מקצועית ונעימה' });
    const home = ok(await readProfessionalHome(database, as(doula)));
    expect(home.dashboard.offersToday).toBe(1);
    expect(home.dashboard.chatStarts30d).toBeGreaterThanOrEqual(1);
    expect(home.helpRequests.find((item) => item.postId === help.id)).toMatchObject({ offered: true });
  });

  it('[FR-PRO-003 AC-094] the owner writes, edits and deletes an article; nobody else edits it', T, async () => {
    const article = ok(await createArticle(database, as(doula), { title: 'שלושה דברים לפני הלידה', body: 'גוף המאמר', field: 'doula', status: 'published' }));
    expect(await createArticle(database, as(rina), { title: 'מאמר', body: 'גוף', field: 'doula', status: 'published' })).toEqual({ kind: 'not_allowed' });
    expect(ok(await readProfessional(database, as(tal), doula)).page.articles.map((item) => item.id)).toContain(article.id);
    expect(await editArticle(database, as(sleeper), article.id, { title: 'נפרץ', body: 'x', field: 'doula', status: 'published' })).toEqual({ kind: 'unavailable' });
    ok(await editArticle(database, as(doula), article.id, { title: 'שלושה דברים', body: 'גוף', field: 'doula', status: 'hidden' }));
    expect(ok(await readProfessional(database, as(tal), doula)).page.articles).toEqual([]);
    expect(await removeArticle(database, as(tal), article.id)).toEqual({ kind: 'unavailable' });
    ok(await removeArticle(database, as(doula), article.id));
  });

  it('[AC-018] a Regular has no Professional home', T, async () => {
    expect(await readProfessionalHome(database, as(rina))).toEqual({ kind: 'not_allowed' });
  });
});
